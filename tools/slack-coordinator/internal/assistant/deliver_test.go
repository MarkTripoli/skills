package assistant

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// deliverOne queues one request, runs it with out scripted, and waits for
// its delivery; it returns the run id.
func deliverOne(t *testing.T, s *Service, clock *testClock, runner *fakeRunner, out agent.RunOutcome) string {
	t.Helper()
	runner.scripted = []agent.RunOutcome{out}
	queueRequests(t, s, clock, "summarize the open pull requests")
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()
	return runner.runID(0)
}

func TestShortAnswerReplacesTheAckAndIsRecorded(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	logged := captureLog(t)
	const answer = "Two pull requests are open: #12 and #14."
	id := deliverOne(t, s, clock, runner, agent.RunOutcome{ExitCode: 0, Result: answer, ResultSource: "result.md"})

	const root, ackTS = "1700000000.001000", "1700000000.900001"
	if len(slack.updates) != 1 || slack.updates[0] != (slackUpdate{"D1", ackTS, answer}) || len(slack.posts) != 1 {
		t.Fatalf("updates %+v posts %+v; want the ack edited into the answer and no new post", slack.updates, slack.posts)
	}
	msgs, err := s.DB.ListDMMessages(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	want := db.DMMessage{RootTS: root, TS: ackTS, Author: db.AuthorBot, Text: answer, RunID: sql.NullString{String: id, Valid: true}}
	if len(msgs) != 2 || msgs[1] != want {
		t.Fatalf("dm_messages = %+v, want the owner root then the answer at the ack ts bound to the run", msgs)
	}
	run := getRun(t, s, id)
	if run.State != db.RunDone || run.ExitCode.Int64 != 0 || !run.ExitCode.Valid || run.TimedOut || run.ResultSource.String != "result.md" || run.FinishedAt.String != "2026-09-21T10:00:01Z" || run.Failure.Valid {
		t.Fatalf("done row = %+v, want done, exit 0, result.md, finished at the clock", run)
	}
	if strings.Contains(logged.String(), "answered from stdout") {
		t.Fatalf("log %q mentions stdout for a result.md answer", logged.String())
	}
}

func TestLongAnswerIsPostedUnderADoneAck(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	answer := strings.Repeat("é", maxAnswerRunes+1)
	id := deliverOne(t, s, clock, runner, agent.RunOutcome{ExitCode: 0, Result: answer, ResultSource: "stdout"})

	const root, ackTS = "1700000000.001000", "1700000000.900001"
	if len(slack.updates) != 1 || slack.updates[0] != (slackUpdate{"D1", ackTS, "Done"}) {
		t.Fatalf("updates = %+v, want the ack set to Done", slack.updates)
	}
	if len(slack.posts) != 2 || slack.posts[1] != (slackPost{"D1", root, answer}) {
		t.Fatalf("posts = %d, want the ack then the full answer in the thread", len(slack.posts))
	}
	msgs, _ := s.DB.ListDMMessages(context.Background(), root)
	want := db.DMMessage{RootTS: root, TS: "1700000000.900002", Author: db.AuthorBot, Text: answer, RunID: sql.NullString{String: id, Valid: true}}
	if len(msgs) != 3 || msgs[1].Text != "Working on it" || msgs[2] != want {
		t.Fatalf("dm_messages has %d rows; want the root, the untouched ack, and the answer at the new ts", len(msgs))
	}
	if run := getRun(t, s, id); run.State != db.RunDone || run.ResultSource.String != "stdout" {
		t.Fatalf("done row = %+v, want done from stdout", run)
	}
}

func TestOtherOutcomesFailTheRunWithoutTouchingSlack(t *testing.T) {
	cases := []struct {
		name    string
		out     agent.RunOutcome
		failure string
	}{
		{"non-zero exit", agent.RunOutcome{ExitCode: 3, Result: "partial", ResultSource: "stdout"}, "exit 3"},
		{"timed out", agent.RunOutcome{ExitCode: -1, TimedOut: true}, "timed out after 1m0s"},
		{"no result", agent.RunOutcome{ExitCode: 0}, "agent wrote no result"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, slack, clock, runner := newDispatchService(t)
			logged := captureLog(t)
			id := deliverOne(t, s, clock, runner, tc.out)

			run := getRun(t, s, id)
			if run.State != db.RunFailed || run.Failure.String != tc.failure || run.ExitCode.Int64 != int64(tc.out.ExitCode) || run.TimedOut != tc.out.TimedOut || run.FinishedAt.String != "2026-09-21T10:00:01Z" {
				t.Fatalf("row = %+v, want failed with %q, exit %d, timed_out %t", run, tc.failure, tc.out.ExitCode, tc.out.TimedOut)
			}
			if run.ResultSource.Valid != (tc.out.ResultSource != "") || run.ResultSource.String != tc.out.ResultSource {
				t.Fatalf("result_source = %+v, want %q", run.ResultSource, tc.out.ResultSource)
			}
			if len(slack.updates) != 0 || len(slack.posts) != 1 {
				t.Fatalf("updates %+v posts %+v; want the ack left alone and nothing posted", slack.updates, slack.posts)
			}
			msgs, _ := s.DB.ListDMMessages(context.Background(), "1700000000.001000")
			if len(msgs) != 2 || msgs[1].Text != "Working on it" {
				t.Fatalf("dm_messages = %+v, want only the root and the ack", msgs)
			}
			if got, want := strings.Contains(logged.String(), "run "+id+": result.md missing, answered from stdout"), tc.out.ResultSource == "stdout"; got != want {
				t.Fatalf("stdout log present = %t, want %t in %q", got, want, logged.String())
			}
		})
	}
}

// --- task-run delivery tests ---

// deliverOneTask sets up a schedule task with msgCount collected messages,
// ticks to enqueue+spawn with the scripted outcome, waits for delivery, and
// returns the task id and the run id.
func deliverOneTask(t *testing.T, s *Service, slack *fakeSlack, clock *testClock, runner *fakeRunner, raw *sql.DB, out agent.RunOutcome, msgCount int) (taskID int64, runID string) {
	t.Helper()
	slack.channels = map[string]string{"C1": "general"}
	dueAt := clock.at.Add(-time.Minute).UTC().Format(time.RFC3339)
	taskID = insertScheduleTaskFull(t, raw, dueAt, "watch #general", `{"every_hours":1}`, `{"dm":true}`, "C1")
	for i := range msgCount {
		ts := fmt.Sprintf("1700000001.%06d", i+1)
		bindMsg(t, raw, taskID, "C1", ts, "U2", fmt.Sprintf("item%d", i))
	}
	runner.scripted = []agent.RunOutcome{out}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()
	if runner.started() == 0 {
		return taskID, ""
	}
	return taskID, runner.runID(0)
}

func TestTaskRunSuccessPostsDMHeaderAndAdvancesDueAt(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	taskID, runID := deliverOneTask(t, s, slack, clock, runner, raw,
		agent.RunOutcome{ExitCode: 0, Result: "summary here", ResultSource: "result.md"}, 3)
	if runID == "" {
		t.Fatal("no run was started")
	}

	// DM opened for owner, one post with header + result.
	if len(slack.opened) != 1 || slack.opened[0] != "U1" {
		t.Fatalf("opened = %v, want owner's DM opened once", slack.opened)
	}
	wantText := "t1 · #general · 3 new items\nsummary here"
	if len(slack.posts) != 1 || slack.posts[0] != (slackPost{"D1", "", wantText}) {
		t.Fatalf("posts = %+v, want one DM post %q", slack.posts, wantText)
	}

	// Run is done.
	run := getRun(t, s, runID)
	if run.State != db.RunDone || run.ExitCode.Int64 != 0 {
		t.Fatalf("run = %+v, want done exit 0", run)
	}

	// due_at advanced, consecutive_failures = 0, last_result_at set.
	state, dueAt, _, _, failures := readTaskCols(t, raw, taskID)
	if state != "active" || !dueAt.Valid || failures != 0 {
		t.Fatalf("task: state=%s due_at=%v failures=%d; want active, due_at set, 0 failures", state, dueAt, failures)
	}
}

func TestWindowEndSuccessCompletesTask(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}
	dueAt := clock.at.Add(-time.Minute).UTC().Format(time.RFC3339)
	taskID := insertWindowEndTask(t, raw, dueAt, "summarise window", `{"dm":true}`, "C1")

	runner.scripted = []agent.RunOutcome{{ExitCode: 0, Result: "done", ResultSource: "result.md"}}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()

	taskState, taskDueAt, taskEndedAt, _, _ := readTaskCols(t, raw, taskID)
	if taskState != "completed" {
		t.Fatalf("task state = %q, want completed", taskState)
	}
	if taskDueAt.Valid {
		t.Fatalf("due_at = %v, want NULL after window_end completion", taskDueAt)
	}
	if !taskEndedAt.Valid {
		t.Fatal("ended_at should be set after window_end success")
	}
}

func TestTaskRunSuccessChannelThreadDelivery(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}
	dueAt := clock.at.Add(-time.Minute).UTC().Format(time.RFC3339)
	deliverTo := `{"channel_id":"C2","thread_ts":"1700000000.555000"}`
	taskID := insertScheduleTaskFull(t, raw, dueAt, "watch", `{"every_hours":1}`, deliverTo, "C1")
	bindMsg(t, raw, taskID, "C1", "1700000001.000001", "U2", "hi")

	runner.scripted = []agent.RunOutcome{{ExitCode: 0, Result: "result", ResultSource: "result.md"}}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()

	wantPost := slackPost{"C2", "1700000000.555000", "t1 · #general · 1 new items\nresult"}
	if len(slack.posts) != 1 || slack.posts[0] != wantPost {
		t.Fatalf("posts = %+v, want channel-thread post %+v", slack.posts, wantPost)
	}
	if len(slack.opened) != 0 {
		t.Fatalf("opened = %v, want no DM opened for channel-thread delivery", slack.opened)
	}
}

func TestTaskRunFailureUnbindsMessagesAndIncrementsFailures(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	taskID, runID := deliverOneTask(t, s, slack, clock, runner, raw,
		agent.RunOutcome{ExitCode: 1, ResultSource: "result.md"}, 3)
	if runID == "" {
		t.Fatal("no run started")
	}

	// Run is failed.
	run := getRun(t, s, runID)
	if run.State != db.RunFailed {
		t.Fatalf("run state = %q, want failed", run.State)
	}

	// task_messages unbound.
	var bound int
	if err := raw.QueryRow(`SELECT COUNT(*) FROM task_messages WHERE run_id IS NOT NULL`).Scan(&bound); err != nil {
		t.Fatal(err)
	}
	if bound != 0 {
		t.Fatalf("bound task_messages = %d, want 0 after failure", bound)
	}

	// consecutive_failures = 1, due_at advanced.
	_, dueAt, _, _, failures := readTaskCols(t, raw, taskID)
	if failures != 1 {
		t.Fatalf("consecutive_failures = %d, want 1", failures)
	}
	if !dueAt.Valid {
		t.Fatal("due_at should be advanced after schedule failure")
	}

	// No Slack call was made.
	if len(slack.posts) != 0 || len(slack.opened) != 0 {
		t.Fatal("no Slack post should be made after a task run failure")
	}
}
