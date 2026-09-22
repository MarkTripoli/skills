package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ErrRunNotFound reports a run_id with no row.
var ErrRunNotFound = errors.New("run not found")

// Values of runs.slack_mode.
const (
	SlackEnabled  = "enabled"
	SlackDisabled = "slack_disabled"
)

// Run is one row of the runs table. Timestamps are RFC 3339 UTC strings.
type Run struct {
	RunID         string
	OwnerUserID   string
	ChannelID     string
	ThreadTS      string
	Permalink     string
	Lifecycle     string
	SlackMode     string
	StartedAt     string
	FinishedAt    sql.NullString
	NextStatusDue sql.NullString
	LastStatus    sql.NullString // JSON of the last status message posted
	// LastDeliveryError is the error of the newest failed Slack post; it is
	// NULL while every post has succeeded and gates run check as unavailable.
	LastDeliveryError sql.NullString
}

const runColumns = `run_id, owner_user_id, channel_id, thread_ts, permalink, lifecycle, slack_mode, started_at, finished_at, next_status_due, last_status, last_delivery_error`

type scanner interface {
	Scan(dest ...any) error
}

func scanRun(s scanner) (Run, error) {
	var r Run
	err := s.Scan(&r.RunID, &r.OwnerUserID, &r.ChannelID, &r.ThreadTS, &r.Permalink, &r.Lifecycle, &r.SlackMode, &r.StartedAt, &r.FinishedAt, &r.NextStatusDue, &r.LastStatus, &r.LastDeliveryError)
	return r, err
}

// InsertRun stores a new run; a duplicate run_id fails.
func (d *DB) InsertRun(ctx context.Context, r Run) error {
	_, err := d.sql.ExecContext(ctx, `
INSERT INTO runs (`+runColumns+`)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.RunID, r.OwnerUserID, r.ChannelID, r.ThreadTS, r.Permalink, r.Lifecycle, r.SlackMode, r.StartedAt, r.FinishedAt, r.NextStatusDue, r.LastStatus, r.LastDeliveryError)
	if err != nil {
		return fmt.Errorf("insert run %s: %w", r.RunID, err)
	}
	return nil
}

// GetRun returns the run with runID, or ErrRunNotFound.
func (d *DB) GetRun(ctx context.Context, runID string) (Run, error) {
	r, err := scanRun(d.sql.QueryRowContext(ctx, `SELECT `+runColumns+` FROM runs WHERE run_id = ?`, runID))
	if errors.Is(err, sql.ErrNoRows) {
		return Run{}, fmt.Errorf("%w: %s", ErrRunNotFound, runID)
	}
	if err != nil {
		return Run{}, fmt.Errorf("get run %s: %w", runID, err)
	}
	return r, nil
}

// SetDeliveryError records msg as runID's newest failed post; an empty msg
// clears the error after a post succeeds.
func (d *DB) SetDeliveryError(ctx context.Context, runID, msg string) error {
	res, err := d.sql.ExecContext(ctx, `UPDATE runs SET last_delivery_error = ? WHERE run_id = ?`,
		sql.NullString{String: msg, Valid: msg != ""}, runID)
	if err != nil {
		return fmt.Errorf("set delivery error %s: %w", runID, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("%w: %s", ErrRunNotFound, runID)
	}
	return nil
}

// DisableSlack marks an active run slack_disabled so its posts stop and run
// check reports the break-glass. A missing run is ErrRunNotFound; a finished
// run is ErrRunNotActive. Disabling twice is a no-op.
func (d *DB) DisableSlack(ctx context.Context, runID string) error {
	res, err := d.sql.ExecContext(ctx, `UPDATE runs SET slack_mode = ? WHERE run_id = ? AND lifecycle = 'active'`, SlackDisabled, runID)
	if err != nil {
		return fmt.Errorf("disable slack %s: %w", runID, err)
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

// RunsWithDeliveryError lists the Slack-enabled active runs whose last post
// failed, for the scheduler to retry.
func (d *DB) RunsWithDeliveryError(ctx context.Context) ([]Run, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT `+runColumns+` FROM runs
WHERE lifecycle = 'active' AND slack_mode = 'enabled' AND last_delivery_error IS NOT NULL
ORDER BY run_id`)
	if err != nil {
		return nil, fmt.Errorf("runs with delivery error: %w", err)
	}
	defer rows.Close()
	var failed []Run
	for rows.Next() {
		r, err := scanRun(rows)
		if err != nil {
			return nil, fmt.Errorf("runs with delivery error: %w", err)
		}
		failed = append(failed, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("runs with delivery error: %w", err)
	}
	return failed, nil
}
