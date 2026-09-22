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
	// deliverFailure edits each ack to Failed and posts a reply.
	if len(slack.updates) != 2 {
		t.Fatalf("updates = %+v, want two acks edited to Failed", slack.updates)
	}
	for _, u := range slack.updates {
		if u.text != "Failed" {
			t.Fatalf("update text = %q; want Failed", u.text)
		}
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

func TestFollowUpRunPromptContainsAllPriorMessages(t *testing.T) {
	s, _, clock, runner := newDispatchService(t)
	ctx := context.Background()
	const root = "1700000000.001000"

	// Open the request and drain the initial run's wake.
	routeDMEvent(t, s, dm("U1", root, "", "first question"))
	<-s.Wake()

	// Mark the initial queued run done.
	r, ok, err := s.DB.OldestQueuedSpawnable(ctx)
	if err != nil || !ok {
		t.Fatalf("OldestQueuedSpawnable: %v %v", ok, err)
	}
	if err := s.DB.FinishAssistantRun(ctx, r.RunID, db.RunDone, 0, false, "result.md", "", stamp(clock.at)); err != nil {
		t.Fatal(err)
	}

	// Send a follow-up; it queues a new run and wakes the dispatcher.
	clock.at = clock.at.Add(time.Minute)
	routeDMEvent(t, s, dm("U1", "1700000001.000000", root, "follow-up question"))
	<-s.Wake()

	// Spawn the follow-up run.
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if runner.started() != 1 {
		t.Fatalf("started = %d, want 1 run spawned for the follow-up", runner.started())
	}

	// Prompt must list every dm_messages row in order.
	runID := runner.runID(0)
	prompt, err := os.ReadFile(filepath.Join(s.Paths.RunDir(runID), promptFile))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"## Thread so far\n\n",
		"owner: first question\n",
		"owner: follow-up question\n",
	} {
		if !strings.Contains(string(prompt), want) {
			t.Errorf("prompt.md lacks %q:\n%s", want, prompt)
		}
	}
	// The thread ordering: owner root, bot ack (from initial), owner follow-up, bot ack (from follow-up).
	if idx := strings.Index(string(prompt), "owner: first question"); idx == -1 {
		t.Error("prompt.md missing first question before follow-up")
	}
}

func TestTwoRepliesDuringRunningRunAreClaimedWhenNextSpawns(t *testing.T) {
	s, _, clock, runner := newDispatchService(t)
	ctx := context.Background()
	const root = "1700000000.001000"

	// Open the request and spawn the first run.
	routeDMEvent(t, s, dm("U1", root, "", "initial"))
	<-s.Wake()
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if runner.started() != 1 {
		t.Fatalf("started = %d, want 1 run spawned for initial", runner.started())
	}
	firstRunID := runner.runID(0)

	// Send two replies while the run is running; both must be stored with run_id NULL,
	// and no new assistant_runs row must be inserted.
	clock.at = clock.at.Add(time.Second)
	routeDMEvent(t, s, dm("U1", "1700000001.000000", root, "first follow-up"))
	clock.at = clock.at.Add(time.Second)
	routeDMEvent(t, s, dm("U1", "1700000002.000000", root, "second follow-up"))
	if n, _ := s.DB.CountAssistantRuns(ctx); n != 1 {
		t.Fatalf("total runs = %d, want exactly 1 (no second run while running)", n)
	}

	// Finish the first run.
	runner.finish(0, agent.RunOutcome{ExitCode: 0, Result: "done", ResultSource: "result.md"})
	waitState(t, s, firstRunID, db.RunDone)

	// Owner sends a third reply after the run is done; this queues a new run.
	clock.at = clock.at.Add(time.Second)
	routeDMEvent(t, s, dm("U1", "1700000003.000000", root, "third follow-up after done"))
	<-s.Wake()

	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if runner.started() != 2 {
		t.Fatalf("started = %d, want 2 runs total", runner.started())
	}

	// All owner follow-up rows must now have run_id set (claimed by the second run).
	msgs, _ := s.DB.ListDMMessages(ctx, root)
	for _, m := range msgs {
		if m.Author == db.AuthorOwner && m.TS != root && !m.RunID.Valid {
			t.Errorf("owner message ts=%s still has run_id NULL after second run spawned", m.TS)
		}
	}
}

func TestDispatcherSkipsThreadWithRunningRun(t *testing.T) {
	s, _, clock, runner := newDispatchService(t)
	ctx := context.Background()

	// Queue two separate requests. queueRequests drains the wake each time.
	roots := queueRequests(t, s, clock, "alpha", "beta")
	rootA, rootB := roots[0], roots[1]

	// Mark rootA's queued run as running directly (bypass the fakeRunner so
	// runner.started() stays 0).
	rA, ok, err := s.DB.OldestQueuedSpawnable(ctx)
	if err != nil || !ok {
		t.Fatalf("OldestQueuedSpawnable: %v %v", ok, err)
	}
	if rA.RootTS.String != rootA {
		t.Fatalf("oldest queued = %s, want rootA %s", rA.RootTS.String, rootA)
	}
	if err := s.DB.MarkRunning(ctx, rA.RunID, 9001, 9001, 9001, stamp(clock.at)); err != nil {
		t.Fatal(err)
	}

	// Also insert a second queued run for rootA (as if a follow-up was queued
	// while A1 was running — e.g. injected directly) to give rootA both a
	// running row and a queued row simultaneously.
	clock.at = clock.at.Add(time.Second)
	if err := s.DB.InsertAssistantRun(ctx, db.AssistantRun{
		RunID:    "FOLLOWUP-A",
		Kind:     db.RunKindDM,
		RootTS:   sql.NullString{String: rootA, Valid: true},
		State:    db.RunQueued,
		QueuedAt: stamp(clock.at),
	}); err != nil {
		t.Fatal(err)
	}

	// rootA: running(A1) + queued(FOLLOWUP-A); rootB: queued(B1).
	// A tick must spawn rootB and skip rootA's queued row.
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if runner.started() != 1 {
		t.Fatalf("started = %d, want 1 (rootB spawned, rootA's queued skipped)", runner.started())
	}
	spawned := getRun(t, s, runner.runID(0))
	if spawned.RootTS.String != rootB {
		t.Fatalf("spawned run root = %s, want rootB %s", spawned.RootTS.String, rootB)
	}
}

func TestHourlyRunCapHoldsAndReleasesQueued(t *testing.T) {
	s, _, clock, runner := newDispatchService(t)
	s.Agent.MaxRunsPerHour = 2
	ctx := context.Background()

	// Queue three DM requests.
	queueRequests(t, s, clock, "first", "second", "third")

	// First tick: two spawn (cap = 2), third is held.
	logged := captureLog(t)
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if started := runner.started(); started != 2 {
		t.Fatalf("after first tick: %d started, want 2", started)
	}
	if queued := countState(t, s, db.RunQueued); queued != 1 {
		t.Fatalf("after first tick: %d queued, want 1", queued)
	}

	// Get the held run's ID.
	held, ok, err := s.DB.OldestQueued(ctx)
	if err != nil || !ok {
		t.Fatalf("OldestQueued = %+v, %t, %v; want one queued run", held, ok, err)
	}

	// Log line must contain "cap reached: run <id> held (dm)".
	wantLog := fmt.Sprintf("cap reached: run %s held (dm)", held.RunID)
	if !strings.Contains(logged.String(), wantLog) {
		t.Fatalf("log = %q, want it to contain %q", logged.String(), wantLog)
	}

	// Another tick while cap still holds: still 2 started, held row unchanged.
	logged.Reset()
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if started := runner.started(); started != 2 {
		t.Fatalf("second tick spawned more runs: %d started, still want 2", started)
	}
	if !strings.Contains(logged.String(), wantLog) {
		t.Fatalf("second tick log = %q, want cap-reached line again", logged.String())
	}
	// Queued state and run ID unchanged.
	stillHeld := held
	if h, ok2, err2 := s.DB.OldestQueued(ctx); err2 != nil || !ok2 || h.RunID != stillHeld.RunID || h.State != db.RunQueued {
		t.Fatalf("held run changed or missing: %+v %t %v", h, ok2, err2)
	}

	// Advance clock 61 minutes: oldest started_at falls out of the rolling hour.
	clock.at = clock.at.Add(61 * time.Minute)
	runner.scripted = nil // no scripted outcome; let the third spawn block
	if err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if started := runner.started(); started != 3 {
		t.Fatalf("after clock advance: %d started, want 3", started)
	}
	if queued := countState(t, s, db.RunQueued); queued != 0 {
		t.Fatalf("after clock advance: %d queued, want 0", queued)
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

// --- each_message task tests ---

// insertEachMessageTask inserts an active each_message task with debounce and
// optional due_at and last_run_started_at (empty string = NULL).
func insertEachMessageTask(t *testing.T, raw *sql.DB, dueAt, lastStarted string, debounceSeconds int64, channels ...string) int64 {
	t.Helper()
	var debounce sql.NullInt64
	if debounceSeconds > 0 {
		debounce = sql.NullInt64{Int64: debounceSeconds, Valid: true}
	}
	res, err := raw.Exec(`
INSERT INTO tasks (state, instruction, trigger, debounce_seconds, deliver_to, request_root_ts, created_at, due_at, last_run_started_at)
VALUES ('active', 'watch', 'each_message', ?, '{"dm":true}', '1700000000.000001', '2026-09-21T09:00:00Z', NULLIF(?, ''), NULLIF(?, ''))`,
		debounce, dueAt, lastStarted)
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

// TestEachMessageBeforeDueAtIsHeld checks that a tick before due_at does
// nothing, while a tick at due_at (with no prior run) enqueues and clears due_at.
func TestEachMessageBeforeDueAtIsHeld(t *testing.T) {
	s, _, clock, _, raw := newTaskDispatchService(t)
	// T0 = clock.at; due_at = T0+5m
	T0 := clock.at
	dueAt := T0.Add(5 * time.Minute).UTC().Format(time.RFC3339)
	taskID := insertEachMessageTask(t, raw, dueAt, "", 300, "C1")
	bindMsg(t, raw, taskID, "C1", "1700000001.000001", "U2", "hello")

	// Tick at T0+4m: nothing enqueued (not yet due).
	clock.at = T0.Add(4 * time.Minute)
	if err := s.enqueueDueTasks(context.Background()); err != nil {
		t.Fatal(err)
	}
	n, _ := s.DB.CountRunsByState(context.Background(), db.RunQueued)
	if n != 0 {
		t.Fatalf("queued = %d at T0+4m, want 0 (not yet due)", n)
	}

	// Tick at T0+5m: enqueued and due_at cleared.
	clock.at = T0.Add(5 * time.Minute)
	if err := s.enqueueDueTasks(context.Background()); err != nil {
		t.Fatal(err)
	}
	n, _ = s.DB.CountRunsByState(context.Background(), db.RunQueued)
	if n != 1 {
		t.Fatalf("queued = %d at T0+5m, want 1", n)
	}
	_, dueAtCol, _, _, _ := readTaskCols(t, raw, taskID)
	if dueAtCol.Valid {
		t.Fatalf("due_at = %q, want NULL after enqueue", dueAtCol.String)
	}
}

// TestEachMessageFloorHoldsAndThenReleases verifies the 10-minute floor:
// a second message arrives at T0+6m while last_run_started_at=T0+5m, the
// collector sets due_at=T0+11m (simulated), tick at T0+11m is held by the
// floor (floor expires at T0+15m), tick at T0+15m enqueues both messages.
func TestEachMessageFloorHoldsAndThenReleases(t *testing.T) {
	s, _, clock, _, raw := newTaskDispatchService(t)
	T0 := clock.at

	// Simulate state after the first run started at T0+5m:
	// last_run_started_at=T0+5m, due_at=T0+11m (6m arrival + 5m debounce).
	lastStarted := T0.Add(5 * time.Minute).UTC().Format(time.RFC3339)
	dueAt := T0.Add(11 * time.Minute).UTC().Format(time.RFC3339)
	taskID := insertEachMessageTask(t, raw, dueAt, lastStarted, 300, "C1")
	bindMsg(t, raw, taskID, "C1", "1700000002.000001", "U2", "second")

	// Tick at T0+11m: due_at passed but floor (T0+5m + 10m = T0+15m) not reached.
	clock.at = T0.Add(11 * time.Minute)
	if err := s.enqueueDueTasks(context.Background()); err != nil {
		t.Fatal(err)
	}
	n, _ := s.DB.CountRunsByState(context.Background(), db.RunQueued)
	if n != 0 {
		t.Fatalf("queued = %d at T0+11m, want 0 (inside floor)", n)
	}

	// Tick at T0+15m: floor crossed, run enqueued.
	clock.at = T0.Add(15 * time.Minute)
	if err := s.enqueueDueTasks(context.Background()); err != nil {
		t.Fatal(err)
	}
	n, _ = s.DB.CountRunsByState(context.Background(), db.RunQueued)
	if n != 1 {
		t.Fatalf("queued = %d at T0+15m, want 1", n)
	}

	// Message is bound to the run.
	var bound int
	if err := raw.QueryRow(`SELECT COUNT(*) FROM task_messages WHERE run_id IS NOT NULL`).Scan(&bound); err != nil {
		t.Fatal(err)
	}
	if bound != 1 {
		t.Fatalf("bound task_messages = %d, want 1", bound)
	}
	_, dueAtCol, _, _, _ := readTaskCols(t, raw, taskID)
	if dueAtCol.Valid {
		t.Fatalf("due_at = %q, want NULL after enqueue", dueAtCol.String)
	}
}

// TestEachMessageDebounceSecondsHonored verifies that due_at computed from a
// custom debounce_seconds=60 is respected (enqueue fires exactly when due_at <= now).
func TestEachMessageDebounceSecondsHonored(t *testing.T) {
	s, _, clock, _, raw := newTaskDispatchService(t)
	T0 := clock.at
	// due_at = T0+60s (debounce=60 applied externally by collector).
	dueAt := T0.Add(60 * time.Second).UTC().Format(time.RFC3339)
	taskID := insertEachMessageTask(t, raw, dueAt, "", 60, "C1")
	bindMsg(t, raw, taskID, "C1", "1700000001.000001", "U2", "ping")

	// Tick at T0+59s: not yet due.
	clock.at = T0.Add(59 * time.Second)
	if err := s.enqueueDueTasks(context.Background()); err != nil {
		t.Fatal(err)
	}
	n, _ := s.DB.CountRunsByState(context.Background(), db.RunQueued)
	if n != 0 {
		t.Fatalf("queued = %d at T0+59s, want 0", n)
	}

	// Tick at T0+60s: due.
	clock.at = T0.Add(60 * time.Second)
	if err := s.enqueueDueTasks(context.Background()); err != nil {
		t.Fatal(err)
	}
	n, _ = s.DB.CountRunsByState(context.Background(), db.RunQueued)
	if n != 1 {
		t.Fatalf("queued = %d at T0+60s, want 1", n)
	}
}

// TestEachMessageSuccessLeavesTaskActive verifies that after a successful run
// the task stays active with due_at NULL and ended_at NULL.
func TestEachMessageSuccessLeavesTaskActive(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}
	T0 := clock.at
	dueAt := T0.Add(-time.Minute).UTC().Format(time.RFC3339)
	taskID := insertEachMessageTask(t, raw, dueAt, "", 300, "C1")
	bindMsg(t, raw, taskID, "C1", "1700000001.000001", "U2", "hello")

	runner.scripted = []agent.RunOutcome{{ExitCode: 0, Result: "done", ResultSource: "result.md"}}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()

	state, dueAtCol, endedAt, _, failures := readTaskCols(t, raw, taskID)
	if state != "active" {
		t.Fatalf("task state = %q, want active", state)
	}
	if dueAtCol.Valid {
		t.Fatalf("due_at = %q, want NULL after each_message success", dueAtCol.String)
	}
	if endedAt.Valid {
		t.Fatalf("ended_at = %q, want NULL (task not completed)", endedAt.String)
	}
	if failures != 0 {
		t.Fatalf("consecutive_failures = %d, want 0", failures)
	}
}

// TestEachMessageFailureUnbindsMessagesAndLeavesTaskActive verifies that after
// a failed run the messages are unbound, due_at remains NULL, and the task
// stays active with incremented consecutive_failures.
func TestEachMessageFailureUnbindsMessagesAndLeavesTaskActive(t *testing.T) {
	s, _, clock, runner, raw := newTaskDispatchService(t)
	T0 := clock.at
	dueAt := T0.Add(-time.Minute).UTC().Format(time.RFC3339)
	taskID := insertEachMessageTask(t, raw, dueAt, "", 300, "C1")
	bindMsg(t, raw, taskID, "C1", "1700000001.000001", "U2", "hello")
	bindMsg(t, raw, taskID, "C1", "1700000001.000002", "U2", "world")

	runner.scripted = []agent.RunOutcome{{ExitCode: 1, ResultSource: "result.md"}}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()

	// Messages unbound.
	var bound int
	if err := raw.QueryRow(`SELECT COUNT(*) FROM task_messages WHERE run_id IS NOT NULL`).Scan(&bound); err != nil {
		t.Fatal(err)
	}
	if bound != 0 {
		t.Fatalf("bound task_messages = %d, want 0 after failure", bound)
	}

	state, dueAtCol, endedAt, _, failures := readTaskCols(t, raw, taskID)
	if state != "active" {
		t.Fatalf("task state = %q, want active", state)
	}
	if dueAtCol.Valid {
		t.Fatalf("due_at = %q, want NULL (unchanged after failure)", dueAtCol.String)
	}
	if endedAt.Valid {
		t.Fatalf("ended_at = %q, want NULL", endedAt.String)
	}
	if failures != 1 {
		t.Fatalf("consecutive_failures = %d, want 1", failures)
	}
}
