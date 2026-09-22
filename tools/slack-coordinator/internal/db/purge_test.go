package db

import (
	"context"
	"fmt"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

// openPurgeDB opens a fresh test database and returns it with a cleanup
// registered on t.
func openPurgeDB(t *testing.T) *DB {
	t.Helper()
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

// insertTask inserts a minimal task row and returns its auto-assigned task_id.
func insertTask(t *testing.T, d *DB, state, endedAt string) int64 {
	t.Helper()
	res, err := d.root.Exec(
		`INSERT INTO tasks (state, instruction, trigger, deliver_to, request_root_ts, created_at, ended_at)
		 VALUES (?, 'do it', 'schedule', '{"dm":true}', '1.0', '2026-01-01T00:00:00Z', ?)`,
		state, nullStrPtr(endedAt))
	if err != nil {
		t.Fatalf("insert task: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

// insertRun inserts an assistant_runs row with the given kind and finished_at
// (empty string → NULL).
func insertRun(t *testing.T, d *DB, runID, kind string, taskID int64, rootTS, finishedAt string) {
	t.Helper()
	_, err := d.root.Exec(
		`INSERT INTO assistant_runs (run_id, kind, task_id, root_ts, state, queued_at, finished_at)
		 VALUES (?, ?, ?, ?, 'done', '2026-01-01T00:00:00Z', ?)`,
		runID, kind, nullInt(taskID), nullStrPtr(rootTS), nullStrPtr(finishedAt))
	if err != nil {
		t.Fatalf("insert run %s: %v", runID, err)
	}
}

// insertCollectedMessage inserts one collected_messages row.
func insertCollectedMessage(t *testing.T, d *DB, channelID, ts string) {
	t.Helper()
	_, err := d.root.Exec(
		`INSERT INTO collected_messages (channel_id, ts, user_id, text, permalink, received_at)
		 VALUES (?, ?, 'U1', 'hello', 'https://x', '2026-01-01T00:00:00Z')`,
		channelID, ts)
	if err != nil {
		t.Fatalf("insert collected_message (%s,%s): %v", channelID, ts, err)
	}
}

// bindMessage inserts a task_messages row; runID "" stores NULL.
func bindMessage(t *testing.T, d *DB, taskID int64, channelID, ts, runID string) {
	t.Helper()
	_, err := d.root.Exec(
		`INSERT INTO task_messages (task_id, channel_id, ts, run_id) VALUES (?, ?, ?, ?)`,
		taskID, channelID, ts, nullStrPtr(runID))
	if err != nil {
		t.Fatalf("bind message: %v", err)
	}
}

// insertDMRequest inserts one dm_requests row.
func insertDMRequest(t *testing.T, d *DB, rootTS, lastMessageAt string) {
	t.Helper()
	_, err := d.root.Exec(
		`INSERT INTO dm_requests (root_ts, channel_id, received_at, last_message_at)
		 VALUES (?, 'D1', '2026-01-01T00:00:00Z', ?)`,
		rootTS, lastMessageAt)
	if err != nil {
		t.Fatalf("insert dm_request %s: %v", rootTS, err)
	}
}

// insertDMMessage inserts one dm_messages row.
func insertDMMessage(t *testing.T, d *DB, rootTS, ts string) {
	t.Helper()
	_, err := d.root.Exec(
		`INSERT INTO dm_messages (root_ts, ts, author, text) VALUES (?, ?, 'owner', 'hi')`,
		rootTS, ts)
	if err != nil {
		t.Fatalf("insert dm_message (%s,%s): %v", rootTS, ts, err)
	}
}

// countTable returns the number of rows in table optionally filtered by a
// WHERE clause (pass "" for no filter).
func countTable(t *testing.T, d *DB, table, where string) int {
	t.Helper()
	q := "SELECT COUNT(*) FROM " + table
	if where != "" {
		q += " WHERE " + where
	}
	var n int
	if err := d.root.QueryRow(q).Scan(&n); err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return n
}

func nullStrPtr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullInt(n int64) any {
	if n == 0 {
		return nil
	}
	return n
}

// ago returns an RFC 3339 UTC string for now minus the given number of days.
func ago(now time.Time, days int) string {
	return now.UTC().AddDate(0, 0, -days).Format(time.RFC3339)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

// TestPurgeConsumedMessages checks that collected_messages consumed by a run
// older than consumedDays are deleted and those consumed by a younger run are kept.
func TestPurgeConsumedMessages(t *testing.T) {
	d := openPurgeDB(t)
	ctx := context.Background()
	now := time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)
	const (
		days         = 30
		consumedDays = 7
	)

	// Task needed for FK on task_messages.task_id.
	taskID := insertTask(t, d, "active", "")

	// Message consumed by a run finished 8 days ago → should be deleted.
	insertCollectedMessage(t, d, "C1", "1.0")
	insertRun(t, d, "OLD", RunKindTask, taskID, "", ago(now, 8))
	bindMessage(t, d, taskID, "C1", "1.0", "OLD")

	// Message consumed by a run finished 6 days ago → should be kept.
	insertCollectedMessage(t, d, "C1", "2.0")
	insertRun(t, d, "NEW", RunKindTask, taskID, "", ago(now, 6))
	bindMessage(t, d, taskID, "C1", "2.0", "NEW")

	ids, err := d.PurgeRetention(ctx, now, days, consumedDays)
	if err != nil {
		t.Fatal(err)
	}

	// PurgeRetention returns run_ids of deleted assistant_runs, not collected_messages.
	// No assistant_runs are deleted here (neither is beyond days=30).
	if len(ids) != 0 {
		t.Fatalf("deleted run ids = %v, want none", ids)
	}

	if n := countTable(t, d, "collected_messages", "ts = '1.0'"); n != 0 {
		t.Fatalf("old consumed collected_message still present")
	}
	if n := countTable(t, d, "collected_messages", "ts = '2.0'"); n != 1 {
		t.Fatalf("recent consumed collected_message was deleted")
	}
	if n := countTable(t, d, "task_messages", "run_id = 'OLD'"); n != 0 {
		t.Fatalf("task_messages for OLD run still present")
	}
	if n := countTable(t, d, "task_messages", "run_id = 'NEW'"); n != 1 {
		t.Fatalf("task_messages for NEW run was deleted")
	}
}

// TestPurgeUnconsumedMessageIsKept checks that a collected_messages row is
// not deleted while it has a task_messages row with run_id IS NULL, even when
// a sibling task_messages row for an old run is purged.
func TestPurgeUnconsumedMessageIsKept(t *testing.T) {
	d := openPurgeDB(t)
	ctx := context.Background()
	now := time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)
	const (
		days         = 30
		consumedDays = 7
	)

	task1 := insertTask(t, d, "active", "")
	task2 := insertTask(t, d, "active", "")

	// One collected_message seen by both tasks.
	insertCollectedMessage(t, d, "C1", "1.0")

	// Task1 consumed it via a run that finished 100 days ago.
	insertRun(t, d, "OLDRUN", RunKindTask, task1, "", ago(now, 100))
	bindMessage(t, d, task1, "C1", "1.0", "OLDRUN")

	// Task2 has not consumed it yet (run_id NULL).
	bindMessage(t, d, task2, "C1", "1.0", "")

	ids, err := d.PurgeRetention(ctx, now, days, consumedDays)
	if err != nil {
		t.Fatal(err)
	}
	// No assistant_runs deleted beyond the rank-20 rule (only 1 run here).
	_ = ids

	// The collected_message must survive because task2's task_messages has run_id NULL.
	if n := countTable(t, d, "collected_messages", "ts = '1.0'"); n != 1 {
		t.Fatal("collected_message with unconsumed sibling was deleted")
	}
	// task1's task_messages row should be gone (consumed by an old run).
	if got := countTable(t, d, "task_messages", "run_id = 'OLDRUN'"); got != 0 {
		t.Fatalf("task_messages for OLDRUN still present: %d", got)
	}
	// task2's unconsumed task_messages row must still exist.
	if n := countTable(t, d, "task_messages", fmt.Sprintf("task_id = %d AND run_id IS NULL", task2)); n != 1 {
		t.Fatalf("unconsumed task_messages for task2 missing")
	}
}

// TestPurgeStaleRunsKeepsNewest20 inserts 25 runs for one task all finished 40
// days ago and asserts that the 5 oldest (by run_id) are deleted and 20 are kept.
func TestPurgeStaleRunsKeepsNewest20(t *testing.T) {
	d := openPurgeDB(t)
	ctx := context.Background()
	now := time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)
	const days = 30

	taskID := insertTask(t, d, "active", "")
	finAt := ago(now, 40)

	var allIDs []string
	for i := 1; i <= 25; i++ {
		id := fmt.Sprintf("RUN%02d", i)
		allIDs = append(allIDs, id)
		insertRun(t, d, id, RunKindTask, taskID, "", finAt)
	}

	ids, err := d.PurgeRetention(ctx, now, days, 7)
	if err != nil {
		t.Fatal(err)
	}

	// 25 runs, keep newest 20 (highest run_id by lexicographic order), delete 5.
	if len(ids) != 5 {
		t.Fatalf("deleted %d run ids, want 5: %v", len(ids), ids)
	}
	// The 5 deleted must be RUN01–RUN05 (lowest lexicographic run_ids).
	wantDeleted := []string{"RUN01", "RUN02", "RUN03", "RUN04", "RUN05"}
	slices.Sort(ids)
	for i, want := range wantDeleted {
		if ids[i] != want {
			t.Fatalf("deleted[%d] = %s, want %s", i, ids[i], want)
		}
	}
	if n := countTable(t, d, "assistant_runs", ""); n != 20 {
		t.Fatalf("remaining assistant_runs = %d, want 20", n)
	}
}

// TestPurgeCancelledTask checks that a cancelled task ended 31 days ago is
// removed with its child rows, and one ended 29 days ago is kept.
func TestPurgeCancelledTask(t *testing.T) {
	d := openPurgeDB(t)
	ctx := context.Background()
	now := time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)
	const days = 30

	// Old cancelled task (ended 31 days ago) → should be deleted.
	oldTask := insertTask(t, d, "cancelled", ago(now, 31))
	_, err := d.root.Exec(
		`INSERT INTO task_channels (task_id, channel_id) VALUES (?, 'C1')`, oldTask)
	if err != nil {
		t.Fatal(err)
	}
	insertCollectedMessage(t, d, "C1", "msg1.0")
	insertRun(t, d, "OLDTASKRUN", RunKindTask, oldTask, "", ago(now, 31))
	bindMessage(t, d, oldTask, "C1", "msg1.0", "OLDTASKRUN")

	// Recent cancelled task (ended 29 days ago) → should be kept.
	newTask := insertTask(t, d, "cancelled", ago(now, 29))

	ids, err := d.PurgeRetention(ctx, now, days, 7)
	if err != nil {
		t.Fatal(err)
	}

	// OLDTASKRUN should appear in deleted ids.
	if !slices.Contains(ids, "OLDTASKRUN") {
		t.Fatalf("deleted ids %v missing OLDTASKRUN", ids)
	}

	// Old task and all its rows must be gone.
	if n := countTable(t, d, "tasks", fmt.Sprintf("task_id = %d", oldTask)); n != 0 {
		t.Fatal("old cancelled task still present")
	}
	if n := countTable(t, d, "task_channels", fmt.Sprintf("task_id = %d", oldTask)); n != 0 {
		t.Fatal("old task_channels still present")
	}
	if n := countTable(t, d, "assistant_runs", "run_id = 'OLDTASKRUN'"); n != 0 {
		t.Fatal("old task run still present")
	}
	if n := countTable(t, d, "collected_messages", "ts = 'msg1.0'"); n != 0 {
		t.Fatal("old collected_message still present")
	}

	// Recent task must survive.
	if n := countTable(t, d, "tasks", fmt.Sprintf("task_id = %d", newTask)); n != 1 {
		t.Fatal("recent cancelled task was deleted")
	}
}

// TestPurgeDMThread checks that a quiet DM thread with last_message_at 31 days
// ago is removed along with its runs, and refused_users rows are not touched.
func TestPurgeDMThread(t *testing.T) {
	d := openPurgeDB(t)
	ctx := context.Background()
	now := time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)
	const days = 30

	staleRoot := "1700000000.000001"
	insertDMRequest(t, d, staleRoot, ago(now, 31))
	insertDMMessage(t, d, staleRoot, "1700000000.000002")
	insertRun(t, d, "DMRUN1", RunKindDM, 0, staleRoot, ago(now, 31))
	insertRun(t, d, "DMRUN2", RunKindDM, 0, staleRoot, ago(now, 31))

	// A dm_request that is still fresh.
	freshRoot := "1700000000.000010"
	insertDMRequest(t, d, freshRoot, ago(now, 5))

	// A refused_users row that must never be touched.
	if _, err := d.InsertRefusedUser(ctx, "UBADGUY", ago(now, 100)); err != nil {
		t.Fatal(err)
	}

	ids, err := d.PurgeRetention(ctx, now, days, 7)
	if err != nil {
		t.Fatal(err)
	}

	// Both DM runs should be in deleted ids.
	slices.Sort(ids)
	if !slices.Contains(ids, "DMRUN1") || !slices.Contains(ids, "DMRUN2") {
		t.Fatalf("deleted ids %v missing DM runs", ids)
	}

	if n := countTable(t, d, "dm_requests", fmt.Sprintf("root_ts = '%s'", staleRoot)); n != 0 {
		t.Fatal("stale dm_request still present")
	}
	if n := countTable(t, d, "dm_messages", fmt.Sprintf("root_ts = '%s'", staleRoot)); n != 0 {
		t.Fatal("stale dm_messages still present")
	}
	if n := countTable(t, d, "assistant_runs", "run_id IN ('DMRUN1','DMRUN2')"); n != 0 {
		t.Fatal("stale DM runs still present")
	}

	// Fresh dm_request must survive.
	if n := countTable(t, d, "dm_requests", fmt.Sprintf("root_ts = '%s'", freshRoot)); n != 1 {
		t.Fatal("fresh dm_request was deleted")
	}

	// refused_users must be untouched.
	if n := countTable(t, d, "refused_users", "user_id = 'UBADGUY'"); n != 1 {
		t.Fatal("refused_users row was deleted")
	}
}
