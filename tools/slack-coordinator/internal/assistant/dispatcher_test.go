package assistant

import (
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
