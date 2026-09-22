package assistant

import (
	"context"
	"database/sql"
	"fmt"
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

func TestFailureEditsAckAndPostsReply(t *testing.T) {
	cases := []struct {
		name      string
		out       agent.RunOutcome
		wantCause string
		wantFence bool
	}{
		{
			name:      "non-zero exit with stderr",
			out:       agent.RunOutcome{ExitCode: 3, StderrTail: buildStderr(20), ResultSource: "stdout"},
			wantCause: "exit 3",
			wantFence: true,
		},
		{
			name:      "timed out",
			out:       agent.RunOutcome{ExitCode: -1, TimedOut: true},
			wantCause: "timed out after 1m0s",
			wantFence: false,
		},
		{
			name:      "empty result",
			out:       agent.RunOutcome{ExitCode: 0},
			wantCause: "agent wrote no result",
			wantFence: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, slack, clock, runner := newDispatchService(t)
			id := deliverOne(t, s, clock, runner, tc.out)

			const root, ackTS = "1700000000.001000", "1700000000.900001"
			if len(slack.updates) != 1 || slack.updates[0] != (slackUpdate{"D1", ackTS, "Failed"}) {
				t.Fatalf("updates = %+v; want one edit to Failed", slack.updates)
			}
			if len(slack.posts) != 2 {
				t.Fatalf("posts = %d; want ack then reply", len(slack.posts))
			}
			reply := slack.posts[1]
			if reply.channel != "D1" || reply.thread != root {
				t.Fatalf("reply = %+v; want D1 / root", reply)
			}
			if !strings.HasPrefix(reply.text, tc.wantCause) {
				t.Fatalf("reply text = %q; want prefix %q", reply.text, tc.wantCause)
			}
			hasFence := strings.Contains(reply.text, "```")
			if hasFence != tc.wantFence {
				t.Fatalf("fence present = %t; want %t in %q", hasFence, tc.wantFence, reply.text)
			}
			if tc.wantFence {
				lines := strings.Split(strings.TrimSuffix(strings.TrimPrefix(reply.text, tc.wantCause+"\n\n```\n"), "\n```"), "\n")
				if len(lines) != 20 {
					t.Fatalf("fence holds %d lines; want 20", len(lines))
				}
			}

			run := getRun(t, s, id)
			if run.State != db.RunFailed || run.Failure.String != tc.wantCause {
				t.Fatalf("row = %+v; want failed with %q", run, tc.wantCause)
			}

			msgs, err := s.DB.ListDMMessages(context.Background(), root)
			if err != nil {
				t.Fatal(err)
			}
			if len(msgs) < 3 {
				t.Fatalf("dm_messages = %d rows; want root, ack, bot reply", len(msgs))
			}
			bot := msgs[len(msgs)-1]
			if bot.Author != db.AuthorBot || bot.RunID.String != id || !bot.RunID.Valid {
				t.Fatalf("last dm_messages row = %+v; want bot row bound to run", bot)
			}
			if !strings.HasPrefix(bot.Text, tc.wantCause) {
				t.Fatalf("bot text = %q; want prefix %q", bot.Text, tc.wantCause)
			}
		})
	}
}

// buildStderr returns n newline-joined lines numbered from 1.
func buildStderr(n int) string {
	parts := make([]string, n)
	for i := range parts {
		parts[i] = fmt.Sprintf("line %d", i+1)
	}
	return strings.Join(parts, "\n")
}

func TestErrBinaryMissingPostsReplyWithNoFence(t *testing.T) {
	s, slack, clock, _ := newDispatchService(t)
	runner := &fakeRunner{startErr: agent.ErrBinaryMissing{Name: "codex"}}
	s.Runner = runner
	roots := queueRequests(t, s, clock, "build me something")
	root := roots[0]
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}

	const wantCause = `agent binary "codex" not found on PATH`
	if len(slack.updates) != 1 || slack.updates[0].text != "Failed" {
		t.Fatalf("updates = %+v; want one edit to Failed", slack.updates)
	}
	if len(slack.posts) < 2 {
		t.Fatalf("posts = %d; want ack then reply", len(slack.posts))
	}
	reply := slack.posts[len(slack.posts)-1]
	if reply.text != wantCause {
		t.Fatalf("reply text = %q; want %q", reply.text, wantCause)
	}
	if strings.Contains(reply.text, "```") {
		t.Fatalf("reply %q must not contain a fence", reply.text)
	}

	msgs, err := s.DB.ListDMMessages(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	var botRow db.DMMessage
	for _, m := range msgs {
		if m.Author == db.AuthorBot && m.Text == wantCause {
			botRow = m
		}
	}
	if botRow.Author != db.AuthorBot || !botRow.RunID.Valid {
		t.Fatalf("no bot dm_messages row with cause; msgs = %+v", msgs)
	}
}
