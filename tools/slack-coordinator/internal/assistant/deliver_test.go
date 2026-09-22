package assistant

import (
	"context"
	"database/sql"
	"strings"
	"testing"

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
