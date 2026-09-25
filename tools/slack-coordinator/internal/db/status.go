package db

import (
	"context"
	"errors"
	"fmt"
)

// ErrRunNotActive reports a write that only an active run accepts.
var ErrRunNotActive = errors.New("run is not active")

// SetStatus records the most recent agent event and when its root edit is due.
func (d *DB) SetStatus(ctx context.Context, runID, lastStatusJSON, nextDue string) error {
	res, err := d.sql.ExecContext(ctx, `UPDATE runs SET last_status = ?, next_status_due = ? WHERE run_id = ?`, lastStatusJSON, nextDue, runID)
	if err != nil {
		return fmt.Errorf("set status %s: %w", runID, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("%w: %s", ErrRunNotFound, runID)
	}
	return nil
}

// ClearStatusDue removes a legacy timer when no event exists to render.
func (d *DB) ClearStatusDue(ctx context.Context, runID string) error {
	_, err := d.sql.ExecContext(ctx, `UPDATE runs SET next_status_due = NULL WHERE run_id = ? AND last_status IS NULL`, runID)
	return err
}

// MarkStatusRendered clears a pending edit only if the rendered event is still
// current. A concurrent newer event retains its scheduled edit.
func (d *DB) MarkStatusRendered(ctx context.Context, runID, renderedJSON, at string) error {
	_, err := d.sql.ExecContext(ctx, `UPDATE runs SET last_root_update = ?, next_status_due = NULL WHERE run_id = ? AND last_status = ? AND lifecycle = 'active'`, at, runID, renderedJSON)
	return err
}

// SetStatusInterval changes one active run's cadence. A pending edit keeps its
// deadline, recalculated by the caller from the last successful root edit.
func (d *DB) SetStatusInterval(ctx context.Context, runID string, seconds int64, nextDue string) error {
	res, err := d.sql.ExecContext(ctx, `UPDATE runs SET status_interval_seconds = ?, next_status_due = CASE WHEN next_status_due IS NOT NULL THEN ? ELSE NULL END WHERE run_id = ? AND lifecycle = 'active'`, seconds, nextDue, runID)
	if err != nil {
		return fmt.Errorf("set status interval %s: %w", runID, err)
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	r, err := d.GetRun(ctx, runID)
	if err != nil {
		return err
	}
	return fmt.Errorf("%w: %s is %s", ErrRunNotActive, runID, r.Lifecycle)
}

// FinishRun closes an active run with a terminal lifecycle and stops its
// status timer. A run that is not active fails with ErrRunNotActive.
func (d *DB) FinishRun(ctx context.Context, runID, lifecycle, finishedAt string) error {
	res, err := d.sql.ExecContext(ctx, `
UPDATE runs SET lifecycle = ?, finished_at = ?, next_status_due = NULL
WHERE run_id = ? AND lifecycle = 'active'`, lifecycle, finishedAt, runID)
	if err != nil {
		return fmt.Errorf("finish run %s: %w", runID, err)
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	r, err := d.GetRun(ctx, runID)
	if err != nil {
		return err
	}
	return fmt.Errorf("%w: %s is %s", ErrRunNotActive, runID, r.Lifecycle)
}

// DueStatusRuns lists the Slack-enabled active runs whose next_status_due is
// at or before now (an RFC 3339 UTC string).
func (d *DB) DueStatusRuns(ctx context.Context, now string) ([]Run, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT `+runColumns+` FROM runs
WHERE lifecycle = 'active' AND slack_mode = 'enabled' AND next_status_due IS NOT NULL AND next_status_due <= ?
ORDER BY next_status_due, run_id`, now)
	if err != nil {
		return nil, fmt.Errorf("due status runs: %w", err)
	}
	defer rows.Close()
	var due []Run
	for rows.Next() {
		r, err := scanRun(rows)
		if err != nil {
			return nil, fmt.Errorf("due status runs: %w", err)
		}
		due = append(due, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("due status runs: %w", err)
	}
	return due, nil
}
