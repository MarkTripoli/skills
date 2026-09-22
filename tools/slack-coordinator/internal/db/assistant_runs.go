package db

import (
	"context"
	"database/sql"
	"fmt"
)

// Values of assistant_runs.kind.
const (
	RunKindDM   = "dm"
	RunKindTask = "task"
)

// Values of assistant_runs.state.
const (
	RunQueued  = "queued"
	RunRunning = "running"
	RunDone    = "done"
	RunFailed  = "failed"
)

// AssistantRun is the queued form of one assistant_runs row: the columns set
// when a request or task is queued. The runner fills the rest as it executes.
type AssistantRun struct {
	RunID    string
	Kind     string
	RootTS   sql.NullString // dm runs: the request root
	TaskID   sql.NullInt64  // task runs: the task
	State    string
	QueuedAt string
}

// InsertAssistantRun queues a new run; a duplicate run_id fails.
func (d *DB) InsertAssistantRun(ctx context.Context, r AssistantRun) error {
	if _, err := d.sql.ExecContext(ctx, `
INSERT INTO assistant_runs (run_id, kind, root_ts, task_id, state, queued_at)
VALUES (?, ?, ?, ?, ?, ?)`, r.RunID, r.Kind, r.RootTS, r.TaskID, r.State, r.QueuedAt); err != nil {
		return fmt.Errorf("insert assistant run %s: %w", r.RunID, err)
	}
	return nil
}

// TaskRun is what `!show` reports about one assistant_runs row: when it ran,
// its state, and how it ended. ExitCode and Failure are NULL until the runner
// records an outcome.
type TaskRun struct {
	RunID      string
	State      string
	QueuedAt   string
	StartedAt  sql.NullString
	FinishedAt sql.NullString
	ExitCode   sql.NullInt64
	Failure    sql.NullString
}

// RecentRunsForTask lists at most limit of taskID's runs, newest queued first.
func (d *DB) RecentRunsForTask(ctx context.Context, taskID int64, limit int) ([]TaskRun, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT run_id, state, queued_at, started_at, finished_at, exit_code, failure
FROM assistant_runs WHERE task_id = ?
ORDER BY queued_at DESC, run_id DESC LIMIT ?`, taskID, limit)
	if err != nil {
		return nil, fmt.Errorf("recent runs for task %d: %w", taskID, err)
	}
	defer rows.Close()
	var runs []TaskRun
	for rows.Next() {
		var r TaskRun
		if err := rows.Scan(&r.RunID, &r.State, &r.QueuedAt, &r.StartedAt, &r.FinishedAt, &r.ExitCode, &r.Failure); err != nil {
			return nil, fmt.Errorf("recent runs for task %d: %w", taskID, err)
		}
		runs = append(runs, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("recent runs for task %d: %w", taskID, err)
	}
	return runs, nil
}

// CountRunsByState counts the assistant runs in state.
func (d *DB) CountRunsByState(ctx context.Context, state string) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM assistant_runs WHERE state = ?`, state).Scan(&n); err != nil {
		return 0, fmt.Errorf("count runs %s: %w", state, err)
	}
	return n, nil
}

// CountAssistantRuns counts every assistant_runs row, whatever its state.
func (d *DB) CountAssistantRuns(ctx context.Context) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM assistant_runs`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count assistant runs: %w", err)
	}
	return n, nil
}

// CountQueuedBefore counts the queued runs whose queued_at is earlier than
// queuedAt: the runs ahead of one queued at that instant.
func (d *DB) CountQueuedBefore(ctx context.Context, queuedAt string) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx, `
SELECT COUNT(*) FROM assistant_runs WHERE state = 'queued' AND queued_at < ?`, queuedAt).Scan(&n); err != nil {
		return 0, fmt.Errorf("count queued before %s: %w", queuedAt, err)
	}
	return n, nil
}
