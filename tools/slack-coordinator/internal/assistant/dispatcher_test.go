package assistant

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

// fakeRunner records every RunSpec and gives each run a Handle whose Wait
// blocks until finish releases it with an outcome. Outcomes scripted before a
// start release that run at once, in start order. startErr fails every Start.
type fakeRunner struct {
	mu       sync.Mutex
	specs    []agent.RunSpec
	waits    []chan agent.RunOutcome
	scripted []agent.RunOutcome
	startErr error
}

func (r *fakeRunner) Start(_ context.Context, spec agent.RunSpec) (*agent.Handle, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.startErr != nil {
		return nil, r.startErr
	}
	done := make(chan agent.RunOutcome, 1)
	if len(r.scripted) > 0 {
		done <- r.scripted[0]
		r.scripted = r.scripted[1:]
	}
	r.specs = append(r.specs, spec)
	r.waits = append(r.waits, done)
	pid := 1000 + len(r.specs)
	return &agent.Handle{Pid: pid, Pgid: pid, Wait: func() agent.RunOutcome { return <-done }, Kill: func() {}}, nil
}

// finish releases the i-th started run with out.
func (r *fakeRunner) finish(i int, out agent.RunOutcome) {
	r.mu.Lock()
	done := r.waits[i]
	r.mu.Unlock()
	done <- out
}

func (r *fakeRunner) started() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.specs)
}

// runID is the id of the i-th started run, read from its run directory.
func (r *fakeRunner) runID(i int) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return filepath.Base(r.specs[i].RunDir)
}

// newDispatchService is newTestService with a fakeRunner and a one-minute
// agent timeout.
func newDispatchService(t *testing.T) (*Service, *fakeSlack, *testClock, *fakeRunner) {
	t.Helper()
	s, slack, clock := newTestService(t)
	runner := &fakeRunner{}
	s.Runner = runner
	s.Agent.Timeout = time.Minute
	return s, slack, clock, runner
}

// queueRequests routes one owner DM per text, a second apart, and returns
// their roots. The wake each one signals is drained.
func queueRequests(t *testing.T, s *Service, clock *testClock, texts ...string) []string {
	t.Helper()
	roots := make([]string, 0, len(texts))
	for i, text := range texts {
		root := fmt.Sprintf("1700000000.%06d", 1000+i)
		routeDMEvent(t, s, dm("U1", root, "", text))
		<-s.Wake()
		clock.at = clock.at.Add(time.Second)
		roots = append(roots, root)
	}
	return roots
}

func getRun(t *testing.T, s *Service, id string) db.AssistantRun {
	t.Helper()
	run, ok, err := s.DB.GetAssistantRun(context.Background(), id)
	if err != nil || !ok {
		t.Fatalf("GetAssistantRun(%s) = %+v, %t, %v", id, run, ok, err)
	}
	return run
}

func countState(t *testing.T, s *Service, state string) int {
	t.Helper()
	n, err := s.DB.CountRunsByState(context.Background(), state)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

// waitState polls until run id reaches state; two other deliveries may still
// be blocked on their fake agents, so the in-flight group cannot be waited on.
func waitState(t *testing.T, s *Service, id, state string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for getRun(t, s, id).State != state {
		if time.Now().After(deadline) {
			t.Fatalf("run %s never reached %s", id, state)
		}
		time.Sleep(time.Millisecond)
	}
}

func TestTickFillsThreeSlotsAndBackfillsAfterADelivery(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	ctx := context.Background()
	roots := queueRequests(t, s, clock, "first", "second", "third", "fourth")
	// Acks: the first request found a free slot, the rest queued behind it.
	ackTS := make([]string, 4)
	for i := range roots {
		ackTS[i] = fmt.Sprintf("1700000000.%06d", 900001+i)
	}
	if want := []string{"Working on it", "Queued behind 1", "Queued behind 2", "Queued behind 3"}; len(slack.posts) != 4 || slack.posts[3].text != want[3] || slack.posts[1].text != want[1] {
		t.Fatalf("acks = %+v, want %v", slack.posts, want)
	}

	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if running, queued := countState(t, s, db.RunRunning), countState(t, s, db.RunQueued); running != 3 || queued != 1 || runner.started() != 3 {
		t.Fatalf("after one tick: %d running, %d queued, %d started; want 3, 1, 3", running, queued, runner.started())
	}
	first := runner.runID(0)
	wantSpec := agent.RunSpec{RunDir: s.Paths.RunDir(first), Approval: "edits", Timeout: time.Minute}
	if runner.specs[0].RunDir != wantSpec.RunDir || runner.specs[0].Approval != wantSpec.Approval || runner.specs[0].Timeout != wantSpec.Timeout || runner.specs[0].ExtraDirs != nil {
		t.Fatalf("RunSpec = %+v, want %+v", runner.specs[0], wantSpec)
	}
	run := getRun(t, s, first)
	if run.State != db.RunRunning || run.PID.Int64 != 1001 || run.PGID.Int64 != 1001 || run.DaemonPID.Int64 != int64(os.Getpid()) || run.StartedAt.String != "2026-09-21T10:00:04Z" {
		t.Fatalf("running row = %+v, want pid 1001, pgid 1001, this daemon, started at the tick", run)
	}

	prompt, err := os.ReadFile(filepath.Join(wantSpec.RunDir, "prompt.md"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"# Assistant run " + first + "\n\nkind: dm request · approval: edits\n",
		"Never contact Slack, directly or through a tool.",
		"## Request\n\nfirst\n",
		"## Thread so far\n\nowner: first\nbot: Working on it\n",
		"## Collected messages\n\n0 messages in messages.jsonl\n",
	} {
		if !strings.Contains(string(prompt), want) {
			t.Errorf("prompt.md lacks %q:\n%s", want, prompt)
		}
	}
	for _, name := range []string{"prompt.md", "messages.jsonl"} {
		info, err := os.Stat(filepath.Join(wantSpec.RunDir, name))
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0o600 {
			t.Errorf("%s mode = %o, want 600", name, info.Mode().Perm())
		}
	}
	if info, _ := os.Stat(filepath.Join(wantSpec.RunDir, "messages.jsonl")); info.Size() != 0 {
		t.Errorf("messages.jsonl has %d bytes, want an empty file", info.Size())
	}
	// The two runs that had been acked as queued were told they started.
	if want := []slackUpdate{{"D1", ackTS[1], "Working on it"}, {"D1", ackTS[2], "Working on it"}}; len(slack.updates) != 2 || slack.updates[0] != want[0] || slack.updates[1] != want[1] {
		t.Fatalf("updates = %+v, want %+v", slack.updates, want)
	}

	// Full slots: another tick spawns nothing.
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if runner.started() != 3 {
		t.Fatalf("a tick with three running started %d runs", runner.started()-3)
	}

	runner.finish(0, agent.RunOutcome{ExitCode: 0, Result: "Two pull requests are open.", ResultSource: "result.md"})
	waitState(t, s, first, db.RunDone)
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if running, queued := countState(t, s, db.RunRunning), countState(t, s, db.RunQueued); running != 3 || queued != 0 || runner.started() != 4 {
		t.Fatalf("after the backfill tick: %d running, %d queued, %d started; want 3, 0, 4", running, queued, runner.started())
	}
	if last := slack.updates[len(slack.updates)-1]; last != (slackUpdate{"D1", ackTS[3], "Working on it"}) {
		t.Fatalf("last update = %+v, want the fourth ack edited to Working on it", last)
	}
	fourth := getRun(t, s, runner.runID(3))
	if fourth.RootTS.String != roots[3] || fourth.State != db.RunRunning {
		t.Fatalf("fourth started run = %+v, want the fourth request running", fourth)
	}
}

func TestTickRecordsARunThatCannotStartAsFailed(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	runner.startErr = agent.ErrBinaryMissing{Name: "omp"}
	queueRequests(t, s, clock, "first", "second")

	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if failed, queued := countState(t, s, db.RunFailed), countState(t, s, db.RunQueued); failed != 2 || queued != 0 {
		t.Fatalf("%d failed, %d queued; want both requests failed", failed, queued)
	}
	oldest, ok, err := s.DB.OldestQueued(context.Background())
	if err != nil || ok {
		t.Fatalf("OldestQueued = %+v, %t, %v; want none", oldest, ok, err)
	}
	if len(slack.updates) != 0 {
		t.Fatalf("updates = %+v, want the acks untouched", slack.updates)
	}
	// The run directory holds the inputs even though nothing ran.
	entries, err := os.ReadDir(filepath.Join(s.Paths.Workspace(), "runs"))
	if err != nil || len(entries) != 2 {
		t.Fatalf("run directories = %v, %v; want one per request", entries, err)
	}
	run := getRun(t, s, entries[0].Name())
	if run.State != db.RunFailed || run.Failure.String != `agent binary "omp" not found on PATH` || run.ExitCode.Int64 != -1 || run.FinishedAt.String == "" {
		t.Fatalf("failed row = %+v, want the start error as failure, exit -1, finished_at set", run)
	}
}

func TestWakeTicksTheDispatcherBeforeItsPeriod(t *testing.T) {
	s, _, _, runner := newDispatchService(t)
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		s.RunDispatcher(ctx, 10*time.Second)
	}()

	routeDMEvent(t, s, dm("U1", "1700000000.001000", "", "first"))
	deadline := time.Now().Add(50 * time.Millisecond)
	for runner.started() == 0 {
		if time.Now().After(deadline) {
			cancel()
			t.Fatal("the dispatcher did not spawn within 50 ms of the wake")
		}
		time.Sleep(time.Millisecond)
	}
	// The whole request answers through the woken dispatcher, then the
	// dispatcher stops once ctx ends.
	runner.finish(0, agent.RunOutcome{ExitCode: 0, Result: "done", ResultSource: "result.md"})
	waitState(t, s, runner.runID(0), db.RunDone)
	cancel()
	<-stopped
}

func TestShutdownRecordsCancelledRunAsFailed(t *testing.T) {
	s, _, clock, runner := newDispatchService(t)
	queueRequests(t, s, clock, "first")
	ctx, cancel := context.WithCancel(context.Background())
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	id := runner.runID(0)
	cancel()
	runner.finish(0, agent.RunOutcome{ExitCode: -1, TimedOut: true})
	s.inflight.Wait()

	run := getRun(t, s, id)
	if run.State != db.RunFailed || run.Failure.String != "daemon shutdown" || run.FinishedAt.String == "" {
		t.Fatalf("row = %+v, want failed with daemon shutdown and finished_at", run)
	}
}

// --- helpers for task-run tests ---

// newTaskDispatchService is newDispatchService with a raw SQL connection for
// inserting and reading task-related rows directly.
func newTaskDispatchService(t *testing.T) (*Service, *fakeSlack, *testClock, *fakeRunner, *sql.DB) {
	t.Helper()
	p := paths.WithRoot(t.TempDir())
	s, slack, clock := newTestServiceAt(t, p)
	runner := &fakeRunner{}
	s.Runner = runner
	s.Agent.Timeout = time.Minute
	raw, err := sql.Open("sqlite", p.DB()+"?_pragma=foreign_keys(on)&_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { raw.Close() })
	return s, slack, clock, runner, raw
}

// insertScheduleTaskFull inserts an active schedule task and returns its id.
func insertScheduleTaskFull(t *testing.T, raw *sql.DB, dueAt, instruction, scheduleJSON, deliverTo string, channels ...string) int64 {
	t.Helper()
	res, err := raw.Exec(`
INSERT INTO tasks (state, instruction, trigger, schedule, deliver_to, request_root_ts, created_at, due_at)
VALUES ('active', ?, 'schedule', ?, ?, '1700000000.000001', '2026-09-21T09:00:00Z', ?)`,
		instruction, scheduleJSON, deliverTo, dueAt)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	for _, ch := range channels {
		if _, err := raw.Exec(`INSERT INTO task_channels (task_id, channel_id) VALUES (?, ?)`, id, ch); err != nil {
			t.Fatal(err)
		}
	}
	return id
}

// insertWindowEndTask inserts an active window_end task with the given due_at.
func insertWindowEndTask(t *testing.T, raw *sql.DB, dueAt, instruction, deliverTo string, channels ...string) int64 {
	t.Helper()
	res, err := raw.Exec(`
INSERT INTO tasks (state, instruction, trigger, deliver_to, request_root_ts, created_at, due_at)
VALUES ('active', ?, 'window_end', ?, '1700000000.000001', '2026-09-21T09:00:00Z', ?)`,
		instruction, deliverTo, dueAt)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	for _, ch := range channels {
		if _, err := raw.Exec(`INSERT INTO task_channels (task_id, channel_id) VALUES (?, ?)`, id, ch); err != nil {
			t.Fatal(err)
		}
	}
	return id
}

// bindMsg inserts a collected_message and a task_message for taskID.
func bindMsg(t *testing.T, raw *sql.DB, taskID int64, channelID, ts, userID, text string) {
	t.Helper()
	if _, err := raw.Exec(`INSERT OR IGNORE INTO collected_messages (channel_id, ts, user_id, text, permalink, received_at)
VALUES (?, ?, ?, ?, ?, '2026-09-21T09:01:00Z')`, channelID, ts, userID, text, "https://t.slack.com/p"+ts); err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(`INSERT OR IGNORE INTO task_messages (task_id, channel_id, ts) VALUES (?, ?, ?)`, taskID, channelID, ts); err != nil {
		t.Fatal(err)
	}
}

// readTaskCols reads a few key columns from tasks for taskID.
func readTaskCols(t *testing.T, raw *sql.DB, taskID int64) (state string, dueAt sql.NullString, endedAt sql.NullString, lastStarted sql.NullString, failures int) {
	t.Helper()
	err := raw.QueryRow(`SELECT state, due_at, ended_at, last_run_started_at, consecutive_failures FROM tasks WHERE task_id = ?`, taskID).
		Scan(&state, &dueAt, &endedAt, &lastStarted, &failures)
	if err != nil {
		t.Fatal(err)
	}
	return
}

func TestEnqueueDueScheduleTaskWithMessages(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}
	dueAt := clock.at.Add(-time.Minute).UTC().Format(time.RFC3339)
	taskID := insertScheduleTaskFull(t, raw, dueAt, "watch #general", `{"every_hours":1}`, `{"dm":true}`, "C1")
	bindMsg(t, raw, taskID, "C1", "1700000001.000001", "U2", "alpha")
	bindMsg(t, raw, taskID, "C1", "1700000001.000002", "U2", "beta")
	bindMsg(t, raw, taskID, "C1", "1700000001.000003", "U2", "gamma")

	// Don't finish the run automatically so we can inspect files before delivery.
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if runner.started() != 1 {
		t.Fatalf("started = %d, want 1 task run", runner.started())
	}

	// One bound run, three bound task_messages rows.
	n, err := s.DB.CountRunsByState(context.Background(), db.RunRunning)
	if err != nil || n != 1 {
		t.Fatalf("running runs = %d, %v; want 1", n, err)
	}
	var bound int
	if err := raw.QueryRow(`SELECT COUNT(*) FROM task_messages WHERE run_id IS NOT NULL`).Scan(&bound); err != nil {
		t.Fatal(err)
	}
	if bound != 3 {
		t.Fatalf("bound task_messages = %d, want 3", bound)
	}

	// messages.jsonl has three lines in ts order.
	runDir := runner.specs[0].RunDir
	jsonlBytes, err := os.ReadFile(filepath.Join(runDir, messagesFile))
	if err != nil {
		t.Fatal(err)
	}
	sc := bufio.NewScanner(bytes.NewReader(jsonlBytes))
	var lines []string
	for sc.Scan() {
		if sc.Text() != "" {
			lines = append(lines, sc.Text())
		}
	}
	if len(lines) != 3 {
		t.Fatalf("messages.jsonl has %d lines, want 3:\n%s", len(lines), jsonlBytes)
	}
	if !strings.Contains(lines[0], `"ts":"1700000001.000001"`) || !strings.Contains(lines[2], `"ts":"1700000001.000003"`) {
		t.Fatalf("messages.jsonl lines not in ts order:\n%s", jsonlBytes)
	}

	// prompt.md has the instruction and the message count.
	promptBytes, err := os.ReadFile(filepath.Join(runDir, promptFile))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"## Instruction", "watch #general", "3 messages in " + messagesFile} {
		if !strings.Contains(string(promptBytes), want) {
			t.Errorf("prompt.md lacks %q:\n%s", want, promptBytes)
		}
	}

	// last_run_started_at is set.
	_, _, _, lastStarted, _ := readTaskCols(t, raw, taskID)
	if !lastStarted.Valid {
		t.Fatal("tasks.last_run_started_at should be set after spawn")
	}
}

func TestRunningTaskIsNotReenqueued(t *testing.T) {
	s, _, clock, _, raw := newTaskDispatchService(t)
	dueAt := clock.at.Add(-time.Minute).UTC().Format(time.RFC3339)
	taskID := insertScheduleTaskFull(t, raw, dueAt, "watch", `{"every_hours":1}`, `{"dm":true}`, "C1")

	// Manually insert a running run for the task.
	existing := db.AssistantRun{
		RunID:    "RUNNING01",
		Kind:     db.RunKindTask,
		TaskID:   sql.NullInt64{Int64: taskID, Valid: true},
		State:    db.RunRunning,
		QueuedAt: "2026-09-21T09:55:00Z",
	}
	if err := s.DB.InsertAssistantRun(context.Background(), existing); err != nil {
		t.Fatal(err)
	}

	if err := s.enqueueDueTasks(context.Background()); err != nil {
		t.Fatal(err)
	}
	n, _ := s.DB.CountRunsByState(context.Background(), db.RunQueued)
	if n != 0 {
		t.Fatalf("queued runs = %d, want 0 (task already has a running run)", n)
	}
}

func TestZeroMessageTaskSpawns(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}
	dueAt := clock.at.Add(-time.Minute).UTC().Format(time.RFC3339)
	insertScheduleTaskFull(t, raw, dueAt, "watch", `{"every_hours":1}`, `{"dm":true}`, "C1")

	// No collected messages.
	runner.scripted = []agent.RunOutcome{{ExitCode: 0, Result: "nothing", ResultSource: "result.md"}}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if runner.started() != 1 {
		t.Fatalf("started = %d, want the zero-message task still spawned", runner.started())
	}
	// messages.jsonl is empty.
	runDir := runner.specs[0].RunDir
	info, err := os.Stat(filepath.Join(runDir, messagesFile))
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() != 0 {
		t.Fatalf("messages.jsonl has %d bytes, want empty for zero-message task", info.Size())
	}
	// prompt.md says "0 messages".
	promptBytes, _ := os.ReadFile(filepath.Join(runDir, promptFile))
	if !strings.Contains(string(promptBytes), "0 messages in "+messagesFile) {
		t.Fatalf("prompt.md lacks '0 messages in messages.jsonl':\n%s", promptBytes)
	}
	// Wait for delivery.
	s.inflight.Wait()
	// Header should say "0 new items".
	if len(slack.posts) != 1 || !strings.Contains(slack.posts[0].text, "0 new items") {
		t.Fatalf("posts = %+v, want one post with '0 new items'", slack.posts)
	}
}
