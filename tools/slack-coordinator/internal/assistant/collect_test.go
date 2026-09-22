package assistant

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

// newCollectService is newTestService plus a second connection to the same
// database file, through which tests insert task rows directly and read the
// rows collect wrote.
func newCollectService(t *testing.T) (*Service, *fakeSlack, *testClock, *sql.DB) {
	t.Helper()
	p := paths.WithRoot(t.TempDir())
	s, slack, clock := newTestServiceAt(t, p)
	raw, err := sql.Open("sqlite", p.DB()+"?_pragma=foreign_keys(on)&_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { raw.Close() })
	return s, slack, clock, raw
}

// insertTask stores a task in state with trigger, debounce (NULL when not
// valid), and the channels it watches, and returns its id.
func insertTask(t *testing.T, raw *sql.DB, state, trigger string, debounce sql.NullInt64, channels ...string) int64 {
	t.Helper()
	res, err := raw.Exec(`
INSERT INTO tasks (state, instruction, trigger, debounce_seconds, deliver_to, request_root_ts, created_at)
VALUES (?, 'watch', ?, ?, '{"dm":true}', '1700000000.000001', '2026-09-21T09:00:00Z')`, state, trigger, debounce)
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

// count returns the number of rows query selects.
func count(t *testing.T, raw *sql.DB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := raw.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// dueAt returns taskID's due_at.
func dueAt(t *testing.T, raw *sql.DB, taskID int64) sql.NullString {
	t.Helper()
	var due sql.NullString
	if err := raw.QueryRow(`SELECT due_at FROM tasks WHERE task_id = ?`, taskID).Scan(&due); err != nil {
		t.Fatal(err)
	}
	return due
}

// channelMessage is a message from user in channel; threadTS "" makes it top level.
func channelMessage(channel, user, ts, threadTS, text string) *slackevents.MessageEvent {
	return &slackevents.MessageEvent{Type: "message", User: user, Text: text, TimeStamp: ts, ThreadTimeStamp: threadTS, Channel: channel}
}

func TestCollectStoresWatchedMessageOnceAndBindsEveryActiveTask(t *testing.T) {
	s, _, _, raw := newCollectService(t)
	first := insertTask(t, raw, db.TaskActive, db.TriggerSchedule, sql.NullInt64{}, "C1")
	second := insertTask(t, raw, db.TaskActive, db.TriggerWindowEnd, sql.NullInt64{}, "C1", "C2")
	msg := channelMessage("C1", "U7", "1700000000.002000", "", "the deploy failed again")

	routeDMEvent(t, s, msg)
	routeDMEvent(t, s, msg) // redelivered
	routeDMEvent(t, s, channelMessage("C9", "U7", "1700000000.002100", "", "unwatched channel"))

	var stored db.CollectedMessage
	err := raw.QueryRow(`SELECT channel_id, ts, thread_ts, user_id, text, permalink, received_at FROM collected_messages`).
		Scan(&stored.ChannelID, &stored.TS, &stored.ThreadTS, &stored.UserID, &stored.Text, &stored.Permalink, &stored.ReceivedAt)
	if err != nil {
		t.Fatal(err)
	}
	want := db.CollectedMessage{
		ChannelID: "C1", TS: "1700000000.002000", UserID: "U7", Text: "the deploy failed again",
		Permalink: "https://t.slack.com/archives/C1/p1700000000.002000", ReceivedAt: "2026-09-21T10:00:00Z",
	}
	if stored != want {
		t.Fatalf("collected message = %+v, want %+v", stored, want)
	}
	if n := count(t, raw, `SELECT COUNT(*) FROM collected_messages`); n != 1 {
		t.Fatalf("%d collected_messages rows, want the watched message stored once", n)
	}
	if n := count(t, raw, `SELECT COUNT(*) FROM task_messages WHERE channel_id = 'C1' AND ts = '1700000000.002000' AND run_id IS NULL`); n != 2 {
		t.Fatalf("%d unconsumed task_messages rows, want one per watching task", n)
	}
	for _, id := range []int64{first, second} {
		if n := count(t, raw, `SELECT COUNT(*) FROM task_messages WHERE task_id = ?`, id); n != 1 {
			t.Fatalf("task %d has %d bound messages, want 1", id, n)
		}
		if due := dueAt(t, raw, id); due.Valid {
			t.Fatalf("task %d due_at = %q; only each_message tasks close a window on a message", id, due.String)
		}
	}
}

func TestCollectIgnoresChannelsWatchedOnlyByInactiveTasks(t *testing.T) {
	s, _, _, raw := newCollectService(t)
	insertTask(t, raw, db.TaskPaused, db.TriggerEachMessage, sql.NullInt64{Int64: 300, Valid: true}, "C1")
	insertTask(t, raw, db.TaskCompleted, db.TriggerWindowEnd, sql.NullInt64{}, "C1")
	insertTask(t, raw, db.TaskCancelled, db.TriggerSchedule, sql.NullInt64{}, "C1")

	routeDMEvent(t, s, channelMessage("C1", "U7", "1700000000.003000", "", "nobody active is listening"))

	if n := count(t, raw, `SELECT COUNT(*) FROM collected_messages`); n != 0 {
		t.Fatalf("%d collected_messages rows, want none for a channel no active task watches", n)
	}
	if n := count(t, raw, `SELECT COUNT(*) FROM task_messages`); n != 0 {
		t.Fatalf("%d task_messages rows, want none", n)
	}
	if n := count(t, raw, `SELECT COUNT(*) FROM tasks WHERE due_at IS NOT NULL`); n != 0 {
		t.Fatalf("%d tasks gained a due_at, want none", n)
	}
}

func TestCollectClosesEachMessageWindowAtNowPlusDebounce(t *testing.T) {
	s, _, clock, raw := newCollectService(t)
	task := insertTask(t, raw, db.TaskActive, db.TriggerEachMessage, sql.NullInt64{Int64: 300, Valid: true}, "C1")
	msg := channelMessage("C1", "U7", "1700000000.004000", "", "first")

	routeDMEvent(t, s, msg)
	if due := dueAt(t, raw, task); due.String != "2026-09-21T10:05:00Z" {
		t.Fatalf("due_at after the first message = %+v, want now + 300s", due)
	}

	clock.at = clock.at.Add(2 * time.Minute)
	routeDMEvent(t, s, msg) // redelivered: not a new message, so the window stays put
	if due := dueAt(t, raw, task); due.String != "2026-09-21T10:05:00Z" {
		t.Fatalf("due_at after a redelivery = %+v, want it unchanged", due)
	}

	routeDMEvent(t, s, channelMessage("C1", "U8", "1700000000.004100", "1700000000.004000", "second, in the thread"))
	if due := dueAt(t, raw, task); due.String != "2026-09-21T10:07:00Z" {
		t.Fatalf("due_at after a second message = %+v, want the window moved to its arrival + 300s", due)
	}
	if n := count(t, raw, `SELECT COUNT(*) FROM task_messages WHERE task_id = ? AND run_id IS NULL`, task); n != 2 {
		t.Fatalf("%d unconsumed messages bound, want both", n)
	}
	if n := count(t, raw, `SELECT COUNT(*) FROM collected_messages WHERE thread_ts = '1700000000.004000'`); n != 1 {
		t.Fatalf("%d thread replies stored with their thread_ts, want 1", n)
	}
}

func TestCollectAlsoRecordsOwnerReplyInWatchedRunThread(t *testing.T) {
	s, slack, _, raw := newCollectService(t)
	ctx := context.Background()
	const thread = "1700000000.000100"
	slack.fixedTS = thread
	startTestRun(t, s.Coord, "RUN1") // owner U1, channel C1, thread 1700000000.000100
	task := insertTask(t, raw, db.TaskActive, db.TriggerSchedule, sql.NullInt64{}, "C1")

	routeDMEvent(t, s, channelMessage("C1", "U1", "1700000000.000200", thread, "please stop"))

	in, ok, err := s.DB.OldestUnhandledInput(ctx, "RUN1")
	if err != nil || !ok || in.MessageTS != "1700000000.000200" || in.Text != "please stop" {
		t.Fatalf("owner input for RUN1 = %+v, %t, %v; want the reply recorded for the run", in, ok, err)
	}
	if n := count(t, raw, `SELECT COUNT(*) FROM collected_messages WHERE channel_id = 'C1' AND ts = '1700000000.000200' AND thread_ts = ?`, thread); n != 1 {
		t.Fatalf("%d collected_messages rows for the reply, want it collected for the watching task too", n)
	}
	if n := count(t, raw, `SELECT COUNT(*) FROM task_messages WHERE task_id = ? AND ts = '1700000000.000200'`, task); n != 1 {
		t.Fatalf("%d task_messages rows, want 1", n)
	}
}
