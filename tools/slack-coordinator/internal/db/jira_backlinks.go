package db

import (
	"context"
	"database/sql"
	"fmt"
)

// Values of jira_backlinks.state.
const (
	BacklinkPending   = "pending"
	BacklinkDelivered = "delivered"
)

// Backlink is one row of the jira_backlinks table: the thread URL a run owes
// to a Jira issue's custom field. It stays pending until one write succeeds.
type Backlink struct {
	RunID         string
	IssueKey      string
	ThreadURL     string
	State         string
	Attempts      int
	LastError     sql.NullString
	NextAttemptAt string
}

const backlinkColumns = `run_id, issue_key, thread_url, state, attempts, last_error, next_attempt_at`

func scanBacklink(s scanner) (Backlink, error) {
	var b Backlink
	err := s.Scan(&b.RunID, &b.IssueKey, &b.ThreadURL, &b.State, &b.Attempts, &b.LastError, &b.NextAttemptAt)
	return b, err
}

// InsertBacklink stores a pending backlink for runID, first due at nextAttemptAt.
func (d *DB) InsertBacklink(ctx context.Context, runID, issueKey, threadURL, nextAttemptAt string) error {
	_, err := d.sql.ExecContext(ctx, `
INSERT INTO jira_backlinks (run_id, issue_key, thread_url, next_attempt_at)
VALUES (?, ?, ?, ?)`, runID, issueKey, threadURL, nextAttemptAt)
	if err != nil {
		return fmt.Errorf("insert backlink %s: %w", runID, err)
	}
	return nil
}

// GetBacklink returns runID's backlink row, or sql.ErrNoRows.
func (d *DB) GetBacklink(ctx context.Context, runID string) (Backlink, error) {
	b, err := scanBacklink(d.sql.QueryRowContext(ctx, `
SELECT `+backlinkColumns+` FROM jira_backlinks WHERE run_id = ?`, runID))
	if err != nil {
		return Backlink{}, fmt.Errorf("get backlink %s: %w", runID, err)
	}
	return b, nil
}

// DueBacklinks lists the pending backlinks whose next attempt is at or before now.
func (d *DB) DueBacklinks(ctx context.Context, now string) ([]Backlink, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT `+backlinkColumns+` FROM jira_backlinks
WHERE state = 'pending' AND next_attempt_at <= ?
ORDER BY next_attempt_at, run_id`, now)
	if err != nil {
		return nil, fmt.Errorf("due backlinks: %w", err)
	}
	defer rows.Close()
	var due []Backlink
	for rows.Next() {
		b, err := scanBacklink(rows)
		if err != nil {
			return nil, fmt.Errorf("due backlinks: %w", err)
		}
		due = append(due, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("due backlinks: %w", err)
	}
	return due, nil
}

// MarkBacklinkDelivered records that runID's field write succeeded and clears
// the last error.
func (d *DB) MarkBacklinkDelivered(ctx context.Context, runID string) error {
	res, err := d.sql.ExecContext(ctx, `
UPDATE jira_backlinks SET state = ?, attempts = attempts + 1, last_error = NULL
WHERE run_id = ?`, BacklinkDelivered, runID)
	if err != nil {
		return fmt.Errorf("mark backlink delivered %s: %w", runID, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("mark backlink delivered %s: %w", runID, sql.ErrNoRows)
	}
	return nil
}

// MarkBacklinkFailed counts one failed attempt for runID, keeps it pending,
// and schedules the next attempt at nextAttemptAt.
func (d *DB) MarkBacklinkFailed(ctx context.Context, runID, lastError, nextAttemptAt string) error {
	res, err := d.sql.ExecContext(ctx, `
UPDATE jira_backlinks SET attempts = attempts + 1, last_error = ?, next_attempt_at = ?
WHERE run_id = ?`, lastError, nextAttemptAt, runID)
	if err != nil {
		return fmt.Errorf("mark backlink failed %s: %w", runID, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("mark backlink failed %s: %w", runID, sql.ErrNoRows)
	}
	return nil
}
