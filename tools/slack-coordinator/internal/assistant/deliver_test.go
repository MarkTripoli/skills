package assistant

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"
	"time"
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

	// Failure notification posted to the DM target.
	if len(slack.opened) != 1 || slack.opened[0] != "U1" {
		t.Fatalf("opened = %v, want owner DM opened once", slack.opened)
	}
	wantText := "Failed: t1 · #general\nexit 1"
	if len(slack.posts) != 1 || slack.posts[0] != (slackPost{"D1", "", wantText}) {
		t.Fatalf("posts = %+v, want one failure post %q", slack.posts, wantText)
	}
}

func TestTaskRunFailurePostsExitWithStderr(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}
	stderr := buildStderr(20)
	_, runID := deliverOneTask(t, s, slack, clock, runner, raw,
		agent.RunOutcome{ExitCode: 2, StderrTail: stderr, ResultSource: "result.md"}, 2)
	if runID == "" {
		t.Fatal("no run started")
	}

	// DM opened, one failure post.
	if len(slack.opened) != 1 || slack.opened[0] != "U1" {
		t.Fatalf("opened = %v, want owner DM", slack.opened)
	}
	if len(slack.posts) != 1 {
		t.Fatalf("posts = %d, want 1 failure post", len(slack.posts))
	}
	post := slack.posts[0]
	if post.channel != "D1" || post.thread != "" {
		t.Fatalf("post target = {%q, %q}, want {D1, }", post.channel, post.thread)
	}
	wantPrefix := "Failed: t1 · #general\nexit 2"
	if !strings.HasPrefix(post.text, wantPrefix) {
		t.Fatalf("post text = %q, want prefix %q", post.text, wantPrefix)
	}
	if !strings.Contains(post.text, "```") {
		t.Fatalf("post text = %q, want stderr fence", post.text)
	}
	lines := strings.Split(strings.TrimSuffix(strings.TrimPrefix(post.text, wantPrefix+"\n\n```\n"), "\n```"), "\n")
	if len(lines) != 20 {
		t.Fatalf("fence holds %d lines, want 20", len(lines))
	}

	// task_messages.run_id is NULL.
	var bound int
	if err := raw.QueryRow(`SELECT COUNT(*) FROM task_messages WHERE run_id IS NOT NULL`).Scan(&bound); err != nil {
		t.Fatal(err)
	}
	if bound != 0 {
		t.Fatalf("bound task_messages = %d, want 0 after failure", bound)
	}
}

func TestTaskRunFailurePostsTimeoutCause(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	s.Agent.Timeout = 10 * time.Minute
	slack.channels = map[string]string{"C1": "general"}
	_, runID := deliverOneTask(t, s, slack, clock, runner, raw,
		agent.RunOutcome{ExitCode: -1, TimedOut: true}, 1)
	if runID == "" {
		t.Fatal("no run started")
	}

	if len(slack.posts) != 1 {
		t.Fatalf("posts = %d, want 1", len(slack.posts))
	}
	wantText := "Failed: t1 · #general\ntimed out after 10m0s"
	if slack.posts[0].text != wantText {
		t.Fatalf("post text = %q, want %q", slack.posts[0].text, wantText)
	}
}

func TestTaskRunFailurePostsEmptyResultCause(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}
	_, runID := deliverOneTask(t, s, slack, clock, runner, raw,
		agent.RunOutcome{ExitCode: 0, Result: ""}, 1)
	if runID == "" {
		t.Fatal("no run started")
	}

	if len(slack.posts) != 1 {
		t.Fatalf("posts = %d, want 1", len(slack.posts))
	}
	wantText := "Failed: t1 · #general\nagent wrote no result"
	if slack.posts[0].text != wantText {
		t.Fatalf("post text = %q, want %q", slack.posts[0].text, wantText)
	}
}

func TestTaskRunFailureChannelThreadDelivery(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}
	dueAt := clock.at.Add(-time.Minute).UTC().Format(time.RFC3339)
	deliverTo := `{"channel_id":"C2","thread_ts":"1700000000.555000"}`
	taskID := insertScheduleTaskFull(t, raw, dueAt, "watch", `{"every_hours":1}`, deliverTo, "C1")
	bindMsg(t, raw, taskID, "C1", "1700000001.000001", "U2", "hi")

	runner.scripted = []agent.RunOutcome{{ExitCode: 3, ResultSource: "result.md"}}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()

	if len(slack.opened) != 0 {
		t.Fatalf("opened = %v, want no DM opened for channel-thread delivery", slack.opened)
	}
	if len(slack.posts) != 1 {
		t.Fatalf("posts = %d, want 1 failure post", len(slack.posts))
	}
	want := slackPost{"C2", "1700000000.555000", "Failed: t1 · #general\nexit 3"}
	if slack.posts[0] != want {
		t.Fatalf("post = %+v, want %+v", slack.posts[0], want)
	}
}

func TestShowIncludesExitCodeForFailedRun(t *testing.T) {
	s, slack, _, raw := newCollectService(t)
	task := insertTaskRow(t, raw, taskRow{state: db.TaskActive, instruction: "watch", trigger: db.TriggerSchedule, schedule: `{"every_hours":1}`})
	insertTaskRun(t, raw, "R1", task, db.RunFailed, "2026-09-21T10:00:00Z", "2026-09-21T10:00:10Z", "2026-09-21T10:01:00Z", 2, "exit 2")

	reply := verbReply(t, s, slack, "1700000000.001000", fmt.Sprintf("!show t%d", task))
	if !strings.Contains(reply, "exit 2") {
		t.Fatalf("!show output %q does not contain exit 2", reply)
	}
}

// failTask runs one tick with a scripted failure and waits for delivery.
func failTask(t *testing.T, s *Service, runner *fakeRunner) {
	t.Helper()
	runner.scripted = []agent.RunOutcome{{ExitCode: 1, ResultSource: "result.md"}}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()
}

func TestThreeConsecutiveFailuresPausesTaskAndPostsDM(t *testing.T) {
	s, slack, clock, runner, raw := newTaskDispatchService(t)
	slack.channels = map[string]string{"C1": "general"}

	dueAt := clock.at.Add(-time.Minute).UTC().Format(time.RFC3339)
	taskID := insertScheduleTaskFull(t, raw, dueAt, "watch", `{"every_hours":1}`, `{"dm":true}`, "C1")

	// Failure 1: task stays active.
	failTask(t, s, runner)
	state, _, _, _, failures := readTaskCols(t, raw, taskID)
	if state != "active" || failures != 1 {
		t.Fatalf("after failure 1: state=%s failures=%d; want active, 1", state, failures)
	}

	// Failure 2: advance clock past advanced due_at, task stays active.
	clock.at = clock.at.Add(61 * time.Minute)
	failTask(t, s, runner)
	state, _, _, _, failures = readTaskCols(t, raw, taskID)
	if state != "active" || failures != 2 {
		t.Fatalf("after failure 2: state=%s failures=%d; want active, 2", state, failures)
	}

	// Failure 3: task must be paused, due_at NULL, pause DM posted.
	clock.at = clock.at.Add(61 * time.Minute)
	failTask(t, s, runner)

	state, dueAtCol, _, _, failures := readTaskCols(t, raw, taskID)
	if state != "paused" {
		t.Fatalf("after failure 3: state=%s, want paused", state)
	}
	if dueAtCol.Valid {
		t.Fatalf("after failure 3: due_at=%q, want NULL", dueAtCol.String)
	}
	if failures != 3 {
		t.Fatalf("after failure 3: consecutive_failures=%d, want 3", failures)
	}

	// Posts: 3 failure notices (one per run) + 1 pause DM.
	if len(slack.posts) != 4 {
		t.Fatalf("posts count = %d, want 4 (3 failure + 1 pause)", len(slack.posts))
	}
	pausePost := slack.posts[3]
	wantPause := fmt.Sprintf("t%d paused after 3 failed runs: exit 1. Fix the cause, then send !resume t%d.", taskID, taskID)
	if pausePost.text != wantPause || pausePost.channel != "D1" || pausePost.thread != "" {
		t.Fatalf("pause DM = %+v, want top-level D1 post %q", pausePost, wantPause)
	}

	// Fourth tick: paused task must not be enqueued.
	clock.at = clock.at.Add(61 * time.Minute)
	prevStarted := runner.started()
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	s.inflight.Wait()
	if runner.started() != prevStarted {
		t.Fatalf("tick after pause started %d runs, want 0", runner.started()-prevStarted)
	}
}

func TestPausedTaskChannelMessageNotCollected(t *testing.T) {
	s, _, _, raw := newCollectService(t)
	insertTask(t, raw, db.TaskPaused, db.TriggerEachMessage, sql.NullInt64{Int64: 300, Valid: true}, "C1")

	routeDMEvent(t, s, channelMessage("C1", "U7", "1700000100.000001", "", "message to paused task"))

	if n := count(t, raw, `SELECT COUNT(*) FROM task_messages`); n != 0 {
		t.Fatalf("task_messages count = %d, want 0 for paused task", n)
	}
}
