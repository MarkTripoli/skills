package db

import (
	"context"
	"database/sql"
	"errors"
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

// AssistantRun is one assistant_runs row. Insert stores the queued columns
// (RunID through QueuedAt); the dispatcher fills the rest as the run starts
// and finishes, so they are NULL on a queued row.
type AssistantRun struct {
	RunID    string
	Kind     string
	RootTS   sql.NullString // dm runs: the request root
	TaskID   sql.NullInt64  // task runs: the task
	State    string
	QueuedAt string

	StartedAt    sql.NullString
	FinishedAt   sql.NullString
	PID          sql.NullInt64
	PGID         sql.NullInt64
	DaemonPID    sql.NullInt64
	ExitCode     sql.NullInt64
	TimedOut     bool
	ResultSource sql.NullString
	Failure      sql.NullString
}

const assistantRunColumns = `run_id, kind, root_ts, task_id, state, queued_at,
started_at, finished_at, pid, pgid, daemon_pid, exit_code, timed_out, result_source, failure`

func scanAssistantRun(row interface{ Scan(dest ...any) error }) (AssistantRun, error) {
	var r AssistantRun
	err := row.Scan(&r.RunID, &r.Kind, &r.RootTS, &r.TaskID, &r.State, &r.QueuedAt,
		&r.StartedAt, &r.FinishedAt, &r.PID, &r.PGID, &r.DaemonPID, &r.ExitCode, &r.TimedOut, &r.ResultSource, &r.Failure)
	return r, err
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

// GetAssistantRun returns the run with runID, if any.
func (d *DB) GetAssistantRun(ctx context.Context, runID string) (AssistantRun, bool, error) {
	r, err := scanAssistantRun(d.sql.QueryRowContext(ctx, `
SELECT `+assistantRunColumns+` FROM assistant_runs WHERE run_id = ?`, runID))
	if errors.Is(err, sql.ErrNoRows) {
		return AssistantRun{}, false, nil
	}
	if err != nil {
		return AssistantRun{}, false, fmt.Errorf("get assistant run %s: %w", runID, err)
	}
	return r, true, nil
}

// OldestQueued returns the queued run with the earliest queued_at, if any;
// runs queued at the same instant order by run_id, which ULIDs make the
// insertion order.
func (d *DB) OldestQueued(ctx context.Context) (AssistantRun, bool, error) {
	r, err := scanAssistantRun(d.sql.QueryRowContext(ctx, `
SELECT `+assistantRunColumns+` FROM assistant_runs
WHERE state = 'queued' ORDER BY queued_at, run_id LIMIT 1`))
	if errors.Is(err, sql.ErrNoRows) {
		return AssistantRun{}, false, nil
	}
	if err != nil {
		return AssistantRun{}, false, fmt.Errorf("oldest queued run: %w", err)
	}
	return r, true, nil
}

// MarkRunning moves runID to running under the agent process pid in group
// pgid, spawned by the daemon daemonPID at startedAt.
func (d *DB) MarkRunning(ctx context.Context, runID string, pid, pgid, daemonPID int, startedAt string) error {
	if _, err := d.sql.ExecContext(ctx, `
UPDATE assistant_runs SET state = 'running', pid = ?, pgid = ?, daemon_pid = ?, started_at = ?
WHERE run_id = ?`, pid, pgid, daemonPID, startedAt, runID); err != nil {
		return fmt.Errorf("mark run %s running: %w", runID, err)
	}
	return nil
}

// FinishAssistantRun moves runID to state (done or failed) at finishedAt with the
// process outcome: exitCode (-1 when no process exited), timedOut, where the
// result came from, and the failure text; empty resultSource and failure
// store NULL.
func (d *DB) FinishAssistantRun(ctx context.Context, runID, state string, exitCode int, timedOut bool, resultSource, failure, finishedAt string) error {
	if _, err := d.sql.ExecContext(ctx, `
UPDATE assistant_runs SET state = ?, exit_code = ?, timed_out = ?, result_source = ?, failure = ?, finished_at = ?
WHERE run_id = ?`, state, exitCode, timedOut, nullString(resultSource), nullString(failure), finishedAt, runID); err != nil {
		return fmt.Errorf("finish run %s as %s: %w", runID, state, err)
	}
	return nil
}

// CountStartedSince counts the assistant_runs whose started_at is >= ts
// (RFC 3339 string comparison).
func (d *DB) CountStartedSince(ctx context.Context, ts string) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM assistant_runs WHERE started_at >= ?`, ts).Scan(&n); err != nil {
		return 0, fmt.Errorf("count started since %s: %w", ts, err)
	}
	return n, nil
}

// CountTaskMessagesForRun counts the task_messages rows whose run_id equals runID.
func (d *DB) CountTaskMessagesForRun(ctx context.Context, runID string) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM task_messages WHERE run_id = ?`, runID).Scan(&n); err != nil {
		return 0, fmt.Errorf("count task messages for run %s: %w", runID, err)
	}
	return n, nil
}

// nullString is s as a NULL-when-empty column value.
func nullString(s string) sql.NullString { return sql.NullString{String: s, Valid: s != ""} }
