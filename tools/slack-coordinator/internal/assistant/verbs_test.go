package assistant

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// verbReply sends text as an owner top-level DM and returns the one message
// posted in answer, failing unless exactly one top-level post was added.
func verbReply(t *testing.T, s *Service, slack *fakeSlack, ts, text string) string {
	t.Helper()
	before := len(slack.posts)
	routeDMEvent(t, s, dm("U1", ts, "", text))
	if len(slack.posts) != before+1 {
		t.Fatalf("%q produced %d posts, want one", text, len(slack.posts)-before)
	}
	post := slack.posts[before]
	if post.channel != "D1" || post.thread != "" {
		t.Fatalf("%q was answered in %s thread %q, want the top level of D1", text, post.channel, post.thread)
	}
	return post.text
}

// wantHelp fails unless reply is the help table naming all eight verbs.
func wantHelp(t *testing.T, reply string) {
	t.Helper()
	for _, verb := range []string{"!help", "!status", "!tasks", "!show <id>", "!runs", "!pause <id>", "!resume <id>", "!cancel <id>"} {
		if !strings.Contains(reply, verb) {
			t.Errorf("help does not list %s:\n%s", verb, reply)
		}
	}
	if !strings.HasSuffix(reply, "Anything else sent here goes to the assistant.") {
		t.Errorf("help does not end with the assistant pointer:\n%s", reply)
	}
}

func TestHelpListsEveryVerb(t *testing.T) {
	s, slack, _ := newTestService(t)
	wantHelp(t, verbReply(t, s, slack, "1700000000.001000", "!help"))
}

func TestUnknownVerbAndBareBangAnswerWithHelp(t *testing.T) {
	s, slack, _ := newTestService(t)
	wantHelp(t, verbReply(t, s, slack, "1700000000.001000", "!bogus now"))
	wantHelp(t, verbReply(t, s, slack, "1700000000.002000", "!"))
}

func TestVerbDispatchIgnoresCase(t *testing.T) {
	s, slack, _ := newTestService(t)
	if reply := verbReply(t, s, slack, "1700000000.001000", "!Help"); reply != helpText {
		t.Fatalf("!Help answered %q, want the help table", reply)
	}
	if reply := verbReply(t, s, slack, "1700000000.002000", "!RUNS"); reply != noActiveRunsReply {
		t.Fatalf("!RUNS answered %q, want %q", reply, noActiveRunsReply)
	}
}

func TestStatusReportsTheDaemon(t *testing.T) {
	s, slack, clock := newTestService(t)
	ctx := context.Background()
	s.Coord.Health = func() string { return slackapi.SocketConnected }
	startTestRun(t, s.Coord, "RUN1")
	startTestRun(t, s.Coord, "RUN2")
	if err := s.Coord.FinishRun(ctx, coordinator.FinishRunInput{RunID: "RUN2", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"A1", "A2"} {
		if err := s.DB.InsertAssistantRun(ctx, db.AssistantRun{RunID: id, Kind: db.RunKindDM, State: db.RunDone, QueuedAt: "2026-09-21T09:00:00Z"}); err != nil {
			t.Fatal(err)
		}
	}
	runDir := s.Paths.RunDir("A1")
	if err := os.MkdirAll(runDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(runDir, "out.log"), make([]byte, 2048), 0o600); err != nil {
		t.Fatal(err)
	}
	clock.at = clock.at.Add(90 * time.Minute)

	reply := verbReply(t, s, slack, "1700000000.001000", "!status")

	lines := strings.Split(reply, "\n")
	want := []string{
		"up 1h30m0s",
		"socket mode: connected",
		"active runs: 1",
		"tasks: active 0 · paused 0 · completed 0 · cancelled 0",
		"agent: omp (approval: edits)",
		"messages: 0 · runs: 2",
	}
	if len(lines) != len(want)+1 {
		t.Fatalf("status has %d lines, want %d:\n%s", len(lines), len(want)+1, reply)
	}
	for i, line := range want {
		if lines[i] != line {
			t.Errorf("status line %d = %q, want %q", i+1, lines[i], line)
		}
	}
	// SQLite's file sizes vary; the database is non-zero and the workspace is
	// exactly the 2048-byte file written above.
	if disk := regexp.MustCompile(`^disk: [1-9][0-9.]* [KMGT]?B db · 2\.0 KB runs$`); !disk.MatchString(lines[6]) {
		t.Errorf("disk line = %q, want non-zero db bytes and 2.0 KB runs", lines[6])
	}
}

func TestStatusWithoutAgentOrWorkspace(t *testing.T) {
	s, slack, _ := newTestService(t)
	s.Agent = nil

	reply := verbReply(t, s, slack, "1700000000.001000", "!status")

	if !strings.Contains(reply, "\nagent: none\n") {
		t.Errorf("status without an agent:\n%s", reply)
	}
	if !strings.HasSuffix(reply, " db · 0 B runs") {
		t.Errorf("status without a workspace should report 0 B runs:\n%s", reply)
	}
}

func TestRunsListsActiveRunsOnly(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	if reply := verbReply(t, s, slack, "1700000000.001000", "!runs"); reply != noActiveRunsReply {
		t.Fatalf("!runs with no runs answered %q, want %q", reply, noActiveRunsReply)
	}

	startTestRun(t, s.Coord, "RUN1")
	startTestRun(t, s.Coord, "RUN2")
	if err := s.Coord.FinishRun(ctx, coordinator.FinishRunInput{RunID: "RUN2", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	run, err := s.DB.GetRun(ctx, "RUN1")
	if err != nil {
		t.Fatal(err)
	}

	reply := verbReply(t, s, slack, "1700000000.002000", "!runs")

	want := "RUN1 · C1 · started 2026-09-21T10:00:00Z · " + run.Permalink
	if reply != want {
		t.Fatalf("!runs answered %q, want %q", reply, want)
	}
}

func TestVerbsWriteNoRows(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	for i, text := range []string{"!help", "!status", "!runs", "!tasks", "!show 1", "!pause 1", "!resume 1", "!cancel 1", "!bogus", "!", "  !status"} {
		ts := "1700000000.00" + string(rune('a'+i)) + "000"
		routeDMEvent(t, s, dm("U1", ts, "", text))
		if _, ok, _ := s.DB.GetDMRequest(ctx, ts); ok {
			t.Errorf("%q opened a dm_requests row", text)
		}
	}
	if n, _ := s.DB.CountAssistantRuns(ctx); n != 0 {
		t.Errorf("assistant_runs has %d rows after verbs, want 0", n)
	}
	if len(slack.reactions) != 0 {
		t.Errorf("verbs reacted %+v, want no reactions", slack.reactions)
	}
	wantWake(t, s, false)
	if slack.posts[3].text != noTasksReply {
		t.Errorf("!tasks answered %q, want %q", slack.posts[3].text, noTasksReply)
	}
	for i := 4; i < 8; i++ {
		if slack.posts[i].text != "unknown id, known: none" {
			t.Errorf("task verb answered %q, want the unknown-id reply with no known tasks", slack.posts[i].text)
		}
	}
}

// taskRow is the part of a tasks row the task verbs read or change.
type taskRow struct {
	state, instruction, trigger string
	schedule                    string // "" is NULL
	debounce                    sql.NullInt64
	dueAt, lastResultAt         string // "" is NULL
	failures                    int
}

func nullable(s string) sql.NullString { return sql.NullString{String: s, Valid: s != ""} }

// insertTaskRow stores row and the channels it watches, returning its id.
func insertTaskRow(t *testing.T, raw *sql.DB, row taskRow, channels ...string) int64 {
	t.Helper()
	res, err := raw.Exec(`
INSERT INTO tasks (state, instruction, trigger, schedule, debounce_seconds, deliver_to, request_root_ts, created_at, due_at, last_result_at, consecutive_failures)
VALUES (?, ?, ?, ?, ?, '{"dm":true}', '1700000000.000001', '2026-09-20T09:00:00Z', ?, ?, ?)`,
		row.state, row.instruction, row.trigger, nullable(row.schedule), row.debounce, nullable(row.dueAt), nullable(row.lastResultAt), row.failures)
	if err != nil {
		t.Fatal(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	for _, ch := range channels {
		if _, err := raw.Exec(`INSERT INTO task_channels (task_id, channel_id) VALUES (?, ?)`, id, ch); err != nil {
			t.Fatal(err)
		}
	}
	return id
}

// taskState reads back the columns the verbs transition.
func taskState(t *testing.T, raw *sql.DB, id int64) (state string, dueAt, endedAt sql.NullString, failures int) {
	t.Helper()
	if err := raw.QueryRow(`SELECT state, due_at, ended_at, consecutive_failures FROM tasks WHERE task_id = ?`, id).Scan(&state, &dueAt, &endedAt, &failures); err != nil {
		t.Fatal(err)
	}
	return state, dueAt, endedAt, failures
}

// wantTask fails unless task id is in state with the given due_at and ended_at
// ("" for NULL).
func wantTask(t *testing.T, raw *sql.DB, id int64, state, dueAt, endedAt string) {
	t.Helper()
	gotState, gotDue, gotEnded, _ := taskState(t, raw, id)
	if gotState != state || gotDue != nullable(dueAt) || gotEnded != nullable(endedAt) {
		t.Errorf("task %d = %s due %+v ended %+v; want %s due %q ended %q", id, gotState, gotDue, gotEnded, state, dueAt, endedAt)
	}
}

func TestTasksListsActiveAndPausedTasks(t *testing.T) {
	s, slack, _, raw := newCollectService(t)
	slack.channels = map[string]string{"C1": "general", "C3": "ops"}
	if reply := verbReply(t, s, slack, "1700000000.001000", "!tasks"); reply != noTasksReply {
		t.Fatalf("!tasks with no rows answered %q, want %q", reply, noTasksReply)
	}

	insertTaskRow(t, raw, taskRow{state: db.TaskActive, instruction: "morning digest", trigger: db.TriggerSchedule, schedule: `{"daily":"09:00","tz":"Europe/Berlin"}`, dueAt: "2026-09-22T07:00:00Z", lastResultAt: "2026-09-21T07:00:00Z"}, "C1", "C2")
	insertTaskRow(t, raw, taskRow{state: db.TaskPaused, instruction: "watch", trigger: db.TriggerEachMessage, debounce: sql.NullInt64{Int64: 300, Valid: true}}, "C1")
	insertTaskRow(t, raw, taskRow{state: db.TaskCompleted, instruction: "done", trigger: db.TriggerWindowEnd, schedule: `{"at":"2026-09-01T00:00:00Z"}`}, "C1")
	insertTaskRow(t, raw, taskRow{state: db.TaskCancelled, instruction: "gone", trigger: db.TriggerSchedule, schedule: `{"every_hours":1}`}, "C1")
	insertTaskRow(t, raw, taskRow{state: db.TaskActive, instruction: "poll", trigger: db.TriggerSchedule, schedule: `{"every_hours":6}`, dueAt: "2026-09-21T16:00:00Z"})
	insertTaskRow(t, raw, taskRow{state: db.TaskActive, instruction: "one-off", trigger: db.TriggerWindowEnd, schedule: `{"at":"2026-09-25T12:00:00Z"}`, dueAt: "2026-09-25T12:00:00Z"}, "C3")

	want := strings.Join([]string{
		"t1 · active · watches #general, C2 · daily 09:00 Europe/Berlin · next 2026-09-22T09:00:00+02:00 · last result 2026-09-21T07:00:00Z",
		"t2 · paused · watches #general · each message (debounce 300s) · next waiting for messages · last result none",
		"t5 · active · watches none · every 6 hours · next 2026-09-21T16:00:00Z · last result none",
		"t6 · active · watches #ops · once at 2026-09-25T12:00:00Z · next 2026-09-25T12:00:00Z · last result none",
	}, "\n")
	if reply := verbReply(t, s, slack, "1700000000.002000", "!tasks"); reply != want {
		t.Fatalf("!tasks answered:\n%s\nwant:\n%s", reply, want)
	}
	if reply := verbReply(t, s, slack, "1700000000.003000", "!tasks"); reply != want {
		t.Fatalf("second !tasks answered:\n%s\nwant:\n%s", reply, want)
	}
	// Two listings: C1 and C3 resolve once and are cached; C2 is unknown and
	// is asked again each time.
	if slack.infoCalls != 4 {
		t.Errorf("conversations.info called %d times, want 4 (C1 and C3 once, C2 twice)", slack.infoCalls)
	}
}

// insertTaskRun stores one assistant_runs row for task; "" timestamps are NULL,
// exit < 0 is NULL.
func insertTaskRun(t *testing.T, raw *sql.DB, runID string, task int64, state, queued, started, finished string, exit int, failure string) {
	t.Helper()
	exitCode := sql.NullInt64{Int64: int64(exit), Valid: exit >= 0}
	if _, err := raw.Exec(`
INSERT INTO assistant_runs (run_id, kind, task_id, state, queued_at, started_at, finished_at, exit_code, failure)
VALUES (?, 'task', ?, ?, ?, ?, ?, ?, ?)`, runID, task, state, queued, nullable(started), nullable(finished), exitCode, nullable(failure)); err != nil {
		t.Fatal(err)
	}
}

func TestShowPrintsInstructionAndNewestRunsWithResults(t *testing.T) {
	s, slack, _, raw := newCollectService(t)
	task := insertTaskRow(t, raw, taskRow{state: db.TaskCancelled, instruction: "Summarize #general every morning\nand DM me the result.", trigger: db.TriggerSchedule, schedule: `{"daily":"09:00","tz":"Europe/Berlin"}`})
	other := insertTaskRow(t, raw, taskRow{state: db.TaskActive, instruction: "other", trigger: db.TriggerSchedule, schedule: `{"every_hours":6}`})
	insertTaskRun(t, raw, "R1", task, db.RunDone, "2026-09-21T09:01:00Z", "2026-09-21T09:01:10Z", "2026-09-21T09:01:50Z", 0, "")
	insertTaskRun(t, raw, "R2", task, db.RunDone, "2026-09-21T09:02:00Z", "2026-09-21T09:02:10Z", "2026-09-21T09:02:50Z", 1, "")
	insertTaskRun(t, raw, "R3", task, db.RunQueued, "2026-09-21T09:03:00Z", "", "", -1, "")
	insertTaskRun(t, raw, "R4", task, db.RunRunning, "2026-09-21T09:04:00Z", "2026-09-21T09:04:10Z", "", -1, "")
	insertTaskRun(t, raw, "R5", task, db.RunFailed, "2026-09-21T09:05:00Z", "2026-09-21T09:05:10Z", "2026-09-21T09:05:50Z", -1, "timed out after 30m")
	insertTaskRun(t, raw, "R6", task, db.RunDone, "2026-09-21T09:06:00Z", "2026-09-21T09:06:10Z", "2026-09-21T09:06:50Z", 0, "")
	insertTaskRun(t, raw, "X1", other, db.RunDone, "2026-09-21T09:07:00Z", "2026-09-21T09:07:10Z", "2026-09-21T09:07:50Z", 0, "")
	long := strings.Repeat("0123456789", 60)
	for id, text := range map[string]string{"R6": "All quiet in #general.\n", "R2": long, "R1": "excluded: sixth newest", "X1": "excluded: other task"} {
		dir := s.Paths.RunDir(id)
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "result.md"), []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	want := strings.Join([]string{
		"t1 · cancelled",
		"Summarize #general every morning",
		"and DM me the result.",
		"2026-09-21T09:06:50Z · done · exit 0",
		"All quiet in #general.",
		"2026-09-21T09:05:50Z · failed · timed out after 30m",
		"2026-09-21T09:04:10Z · running",
		"2026-09-21T09:03:00Z · queued",
		"2026-09-21T09:02:50Z · done · exit 1",
		long[:500],
	}, "\n")
	if reply := verbReply(t, s, slack, "1700000000.001000", "!show t1"); reply != want {
		t.Fatalf("!show answered:\n%s\nwant:\n%s", reply, want)
	}
	if reply := verbReply(t, s, slack, "1700000000.002000", "!show 2"); reply != "t2 · active\nother\n2026-09-21T09:07:50Z · done · exit 0\nexcluded: other task" {
		t.Fatalf("!show 2 answered:\n%s", reply)
	}
}

func TestPauseResumeCancelTransitions(t *testing.T) {
	s, slack, clock, raw := newCollectService(t)
	daily := insertTaskRow(t, raw, taskRow{state: db.TaskActive, instruction: "d", trigger: db.TriggerSchedule, schedule: `{"daily":"09:00","tz":"Europe/Berlin"}`, dueAt: "2026-09-22T07:00:00Z", failures: 2}, "C1")
	passed := insertTaskRow(t, raw, taskRow{state: db.TaskPaused, instruction: "w", trigger: db.TriggerWindowEnd, schedule: `{"at":"2026-09-20T00:00:00Z"}`}, "C1")
	each := insertTaskRow(t, raw, taskRow{state: db.TaskPaused, instruction: "e", trigger: db.TriggerEachMessage, debounce: sql.NullInt64{Int64: 60, Valid: true}, failures: 1}, "C1")
	hourly := insertTaskRow(t, raw, taskRow{state: db.TaskPaused, instruction: "h", trigger: db.TriggerSchedule, schedule: `{"every_hours":6}`}, "C1")
	completed := insertTaskRow(t, raw, taskRow{state: db.TaskCompleted, instruction: "c", trigger: db.TriggerSchedule, schedule: `{"every_hours":6}`})
	ts := 0
	reply := func(text string) string {
		ts++
		return verbReply(t, s, slack, fmt.Sprintf("1700000000.%06d", ts), text)
	}
	want := func(text, wantReply string) {
		t.Helper()
		if got := reply(text); got != wantReply {
			t.Errorf("%q answered %q, want %q", text, got, wantReply)
		}
	}

	want("!pause t1", "t1 paused")
	wantTask(t, raw, daily, db.TaskPaused, "", "")
	want("!pause 1", "t1 is paused")

	want("!resume 1", "t1 resumed · next due 2026-09-22T09:00:00+02:00")
	wantTask(t, raw, daily, db.TaskActive, "2026-09-22T07:00:00Z", "")
	if _, _, _, failures := taskState(t, raw, daily); failures != 0 {
		t.Errorf("resumed task has %d consecutive failures, want 0", failures)
	}
	want("!resume T1", "t1 is active")

	want("!resume 2", "t2 resumed · window already passed")
	wantTask(t, raw, passed, db.TaskActive, "", "")

	want("!resume t3", "t3 resumed · waiting for messages")
	wantTask(t, raw, each, db.TaskActive, "", "")
	if _, _, _, failures := taskState(t, raw, each); failures != 0 {
		t.Errorf("resumed each_message task has %d consecutive failures, want 0", failures)
	}

	want("!resume 4", "t4 resumed · next due 2026-09-21T16:00:00Z")
	wantTask(t, raw, hourly, db.TaskActive, "2026-09-21T16:00:00Z", "")

	clock.at = clock.at.Add(time.Minute)
	want("!cancel t1", "t1 cancelled")
	wantTask(t, raw, daily, db.TaskCancelled, "", "2026-09-21T10:01:00Z")
	want("!cancel 1", "t1 is cancelled")
	want("!resume 1", "t1 is cancelled")
	want("!pause 1", "t1 is cancelled")

	want("!pause 3", "t3 paused")
	want("!cancel 3", "t3 cancelled")
	wantTask(t, raw, each, db.TaskCancelled, "", "2026-09-21T10:01:00Z")

	want("!pause 5", "t5 is completed")
	want("!resume 5", "t5 is completed")
	want("!cancel 5", "t5 is completed")
	wantTask(t, raw, completed, db.TaskCompleted, "", "")
}

func TestTaskVerbsRejectUnknownAndMalformedIds(t *testing.T) {
	s, slack, _, raw := newCollectService(t)
	insertTaskRow(t, raw, taskRow{state: db.TaskCancelled, instruction: "gone", trigger: db.TriggerSchedule, schedule: `{"every_hours":6}`})
	insertTaskRow(t, raw, taskRow{state: db.TaskActive, instruction: "a", trigger: db.TriggerSchedule, schedule: `{"every_hours":6}`})
	insertTaskRow(t, raw, taskRow{state: db.TaskCompleted, instruction: "c", trigger: db.TriggerSchedule, schedule: `{"every_hours":6}`})
	insertTaskRow(t, raw, taskRow{state: db.TaskPaused, instruction: "p", trigger: db.TriggerEachMessage, debounce: sql.NullInt64{Int64: 60, Valid: true}})
	const unknown = "unknown id, known: t2 t4"
	for i, text := range []string{"!show", "!show 9", "!show t9", "!show 0", "!show -1", "!show t", "!show x2", "!show 2a", "!pause 9", "!resume t9", "!cancel 9"} {
		ts := "1700000000.00" + string(rune('a'+i)) + "000"
		if reply := verbReply(t, s, slack, ts, text); reply != unknown {
			t.Errorf("%q answered %q, want %q", text, reply, unknown)
		}
	}
	// A cancelled row is known to !show; the verbs that transition it name
	// its state instead of calling it unknown.
	if reply := verbReply(t, s, slack, "1700000000.100000", "!show 1"); reply != "t1 · cancelled\ngone" {
		t.Errorf("!show on a cancelled task answered %q", reply)
	}
	if reply := verbReply(t, s, slack, "1700000000.200000", "!cancel 1"); reply != "t1 is cancelled" {
		t.Errorf("!cancel on a cancelled task answered %q", reply)
	}
}

func TestResumeEachMessageWithPendingMessagesSetsEachMessageDueAt(t *testing.T) {
	s, slack, clock, raw := newCollectService(t)
	debounce := sql.NullInt64{Int64: 60, Valid: true}
	id := insertTaskRow(t, raw, taskRow{
		state: db.TaskPaused, instruction: "w", trigger: db.TriggerEachMessage, debounce: debounce, failures: 3,
	}, "C1")
	// Insert unconsumed task_messages directly (no collected_message FK needed; use OR IGNORE).
	if _, err := raw.Exec(`INSERT OR IGNORE INTO collected_messages (channel_id, ts, user_id, text, permalink, received_at)
VALUES ('C1', '1700000200.000001', 'U2', 'hi', 'https://t.slack.com/p1', '2026-09-21T09:01:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(`INSERT INTO task_messages (task_id, channel_id, ts) VALUES (?, 'C1', '1700000200.000001')`, id); err != nil {
		t.Fatal(err)
	}

	wantDue := stamp(clock.at.Add(60 * time.Second))
	reply := verbReply(t, s, slack, "1700000000.001001", fmt.Sprintf("!resume t%d", id))
	wantReply := fmt.Sprintf("t%d resumed · next due %s", id, wantDue)
	if reply != wantReply {
		t.Errorf("!resume answered %q, want %q", reply, wantReply)
	}

	// Task is active, due_at = now + 60s, failures = 0.
	state, dueAt, _, failures := taskState(t, raw, id)
	if state != db.TaskActive {
		t.Errorf("state = %q, want active", state)
	}
	if !dueAt.Valid || dueAt.String != wantDue {
		t.Errorf("due_at = %v, want %q", dueAt, wantDue)
	}
	if failures != 0 {
		t.Errorf("consecutive_failures = %d, want 0", failures)
	}
}
