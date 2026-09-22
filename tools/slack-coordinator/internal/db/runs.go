package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ErrRunNotFound reports a run_id with no row.
var ErrRunNotFound = errors.New("run not found")

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
}

const runColumns = `run_id, owner_user_id, channel_id, thread_ts, permalink, lifecycle, slack_mode, started_at, finished_at, next_status_due, last_status`

type scanner interface {
	Scan(dest ...any) error
}

func scanRun(s scanner) (Run, error) {
	var r Run
	err := s.Scan(&r.RunID, &r.OwnerUserID, &r.ChannelID, &r.ThreadTS, &r.Permalink, &r.Lifecycle, &r.SlackMode, &r.StartedAt, &r.FinishedAt, &r.NextStatusDue, &r.LastStatus)
	return r, err
}

// InsertRun stores a new run; a duplicate run_id fails.
func (d *DB) InsertRun(ctx context.Context, r Run) error {
	_, err := d.sql.ExecContext(ctx, `
INSERT INTO runs (`+runColumns+`)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.RunID, r.OwnerUserID, r.ChannelID, r.ThreadTS, r.Permalink, r.Lifecycle, r.SlackMode, r.StartedAt, r.FinishedAt, r.NextStatusDue, r.LastStatus)
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
