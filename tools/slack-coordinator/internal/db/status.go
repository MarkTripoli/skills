package db

import (
	"context"
	"errors"
	"fmt"
)

// ErrRunNotActive reports a write that only an active run accepts.
var ErrRunNotActive = errors.New("run is not active")

// SetStatus records the last status message posted for runID and when the
// next quiet-interval repost is due.
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
