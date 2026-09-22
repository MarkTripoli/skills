package assistant

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"unicode/utf8"

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
	answer := strings.Repeat("é", answerEditLimit+1)
	id := deliverOne(t, s, clock, runner, agent.RunOutcome{ExitCode: 0, Result: answer, ResultSource: "stdout"})

	const root, ackTS = "1700000000.001000", "1700000000.900001"
	if len(slack.updates) != 1 || slack.updates[0] != (slackUpdate{"D1", ackTS, "Done"}) {
		t.Fatalf("updates = %+v, want the ack set to Done", slack.updates)
	}
	// 4001 runes in a single line splits into two chunks: 4000 + 1.
	if len(slack.posts) != 3 || slack.posts[1] != (slackPost{"D1", root, strings.Repeat("é", answerEditLimit)}) || slack.posts[2] != (slackPost{"D1", root, "é"}) {
		t.Fatalf("posts = %+v, want the ack then two chunk replies", slack.posts)
	}
	msgs, _ := s.DB.ListDMMessages(context.Background(), root)
	want := db.DMMessage{RootTS: root, TS: "1700000000.900002", Author: db.AuthorBot, Text: answer, RunID: sql.NullString{String: id, Valid: true}}
	if len(msgs) != 3 || msgs[1].Text != "Working on it" || msgs[2] != want {
		t.Fatalf("dm_messages has %d rows; want root, ack, and one answer row with full text", len(msgs))
	}
	if run := getRun(t, s, id); run.State != db.RunDone || run.ResultSource.String != "stdout" {
		t.Fatalf("done row = %+v, want done from stdout", run)
	}
}

func TestExactLimitAnswerEditsAckAndPostsNoReply(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	answer := strings.Repeat("x", answerEditLimit)
	deliverOne(t, s, clock, runner, agent.RunOutcome{ExitCode: 0, Result: answer, ResultSource: "result.md"})

	const ackTS = "1700000000.900001"
	if len(slack.updates) != 1 || slack.updates[0] != (slackUpdate{"D1", ackTS, answer}) {
		t.Fatalf("updates = %+v, want the ack edited to the full answer", slack.updates)
	}
	if len(slack.posts) != 1 {
		t.Fatalf("posts = %d, want only the initial ack and no extra reply", len(slack.posts))
	}
}

func TestLongAnswerTwoLinesChunked(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	line1 := strings.Repeat("a", 2000)
	line2 := strings.Repeat("b", 2001)
	answer := line1 + "\n" + line2 // 4002 runes total, over two lines
	id := deliverOne(t, s, clock, runner, agent.RunOutcome{ExitCode: 0, Result: answer, ResultSource: "result.md"})

	const root, ackTS = "1700000000.001000", "1700000000.900001"
	if len(slack.updates) != 1 || slack.updates[0] != (slackUpdate{"D1", ackTS, "Done"}) {
		t.Fatalf("updates = %+v, want the ack set to Done", slack.updates)
	}
	if len(slack.posts) != 3 {
		t.Fatalf("posts count = %d, want 3 (ack + 2 chunks)", len(slack.posts))
	}
	if slack.posts[1] != (slackPost{"D1", root, line1 + "\n"}) || slack.posts[2] != (slackPost{"D1", root, line2}) {
		t.Fatalf("posts[1]=%+v posts[2]=%+v, want line1+newline then line2", slack.posts[1], slack.posts[2])
	}
	msgs, _ := s.DB.ListDMMessages(context.Background(), root)
	want := db.DMMessage{RootTS: root, TS: "1700000000.900002", Author: db.AuthorBot, Text: answer, RunID: sql.NullString{String: id, Valid: true}}
	if len(msgs) != 3 || msgs[2] != want {
		t.Fatalf("dm_messages = %+v, want root, ack, one full-text answer row", msgs)
	}
	if run := getRun(t, s, id); run.State != db.RunDone {
		t.Fatalf("run state = %s, want done", run.State)
	}
}

func TestLongAnswerSingleLineManyChunks(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	answer := strings.Repeat("z", 9000) // single line, 9000 runes → 3 chunks of ≤4000
	id := deliverOne(t, s, clock, runner, agent.RunOutcome{ExitCode: 0, Result: answer, ResultSource: "result.md"})

	const root, ackTS = "1700000000.001000", "1700000000.900001"
	if len(slack.updates) != 1 || slack.updates[0] != (slackUpdate{"D1", ackTS, "Done"}) {
		t.Fatalf("updates = %+v, want Done", slack.updates)
	}
	// posts: ack + 3 chunks
	if len(slack.posts) != 4 {
		t.Fatalf("posts count = %d, want 4 (ack + 3 chunks)", len(slack.posts))
	}
	for i, p := range slack.posts[1:] {
		if utf8.RuneCountInString(p.text) > answerEditLimit {
			t.Fatalf("chunk[%d] has %d runes, exceeds %d", i, utf8.RuneCountInString(p.text), answerEditLimit)
		}
	}
	msgs, _ := s.DB.ListDMMessages(context.Background(), root)
	want := db.DMMessage{RootTS: root, TS: "1700000000.900002", Author: db.AuthorBot, Text: answer, RunID: sql.NullString{String: id, Valid: true}}
	if len(msgs) != 3 || msgs[2] != want {
		t.Fatalf("dm_messages = %+v, want root, ack, one full-text answer row", msgs)
	}
	if run := getRun(t, s, id); run.State != db.RunDone {
		t.Fatalf("run state = %s, want done", run.State)
	}
}

func TestChunk(t *testing.T) {
	cases := []struct {
		name  string
		text  string
		limit int
		want  []string
	}{
		{"empty", "", 10, nil},
		{"fits exactly", "abc", 3, []string{"abc"}},
		{"fits under limit", "abc", 10, []string{"abc"}},
		{"hard split single line", "abcdef", 3, []string{"abc", "def"}},
		{"split at newline", "ab\ncd", 4, []string{"ab\n", "cd"}},
		{"multi-line fits one chunk", "ab\ncd", 10, []string{"ab\ncd"}},
		{"split before second line overflows", "abc\nde", 4, []string{"abc\n", "de"}},
		{"trailing newline no empty piece", "abc\n", 10, []string{"abc\n"}},
		{"multibyte rune counted correctly", strings.Repeat("é", 5), 3, []string{"ééé", "éé"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := chunk(tc.text, tc.limit)
			if len(got) != len(tc.want) {
				t.Fatalf("chunk(%q, %d) = %q, want %q", tc.text, tc.limit, got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("chunk(%q, %d)[%d] = %q, want %q", tc.text, tc.limit, i, got[i], tc.want[i])
				}
			}
		})
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
