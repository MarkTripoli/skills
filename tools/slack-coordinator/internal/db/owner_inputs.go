package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ErrOwnerInputNotPending reports a resolve of an owner input that does not
// exist or was already handled.
var ErrOwnerInputNotPending = errors.New("owner input is not pending")

// OwnerInput is one row of the owner_inputs table: an owner's reply in a run's
// thread that the agent has not yet answered while HandledAt is NULL.
type OwnerInput struct {
	RunID      string
	MessageTS  string
	Text       string
	ReceivedAt string
	HandledAt  sql.NullString
	Outcome    sql.NullString // applied | rejected | answered once handled
}

const ownerInputColumns = `run_id, message_ts, text, received_at, handled_at, outcome`

func scanOwnerInput(s scanner) (OwnerInput, error) {
	var in OwnerInput
	err := s.Scan(&in.RunID, &in.MessageTS, &in.Text, &in.ReceivedAt, &in.HandledAt, &in.Outcome)
	return in, err
}

// InsertOwnerInput stores a new pending input and reports whether a row was
// inserted; a (run_id, message_ts) already stored is ignored so a redelivered
// Slack envelope adds nothing.
func (d *DB) InsertOwnerInput(ctx context.Context, in OwnerInput) (bool, error) {
	res, err := d.sql.ExecContext(ctx, `
INSERT OR IGNORE INTO owner_inputs (run_id, message_ts, text, received_at)
VALUES (?, ?, ?, ?)`, in.RunID, in.MessageTS, in.Text, in.ReceivedAt)
	if err != nil {
		return false, fmt.Errorf("insert owner input %s/%s: %w", in.RunID, in.MessageTS, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("insert owner input %s/%s: %w", in.RunID, in.MessageTS, err)
	}
	return n > 0, nil
}

// OldestUnhandledInput returns runID's earliest pending input, if any.
func (d *DB) OldestUnhandledInput(ctx context.Context, runID string) (OwnerInput, bool, error) {
	in, err := scanOwnerInput(d.sql.QueryRowContext(ctx, `
SELECT `+ownerInputColumns+` FROM owner_inputs
WHERE run_id = ? AND handled_at IS NULL AND claimed_at IS NULL
ORDER BY message_ts LIMIT 1`, runID))
	if errors.Is(err, sql.ErrNoRows) {
		return OwnerInput{}, false, nil
	}
	if err != nil {
		return OwnerInput{}, false, fmt.Errorf("oldest unhandled input %s: %w", runID, err)
	}
	return in, true, nil
}

// PendingOwnerInput returns the input (runID, messageTS) while it is still
// unhandled, or ErrOwnerInputNotPending.
func (d *DB) PendingOwnerInput(ctx context.Context, runID, messageTS string) (OwnerInput, error) {
	in, err := scanOwnerInput(d.sql.QueryRowContext(ctx, `
SELECT `+ownerInputColumns+` FROM owner_inputs
WHERE run_id = ? AND message_ts = ? AND handled_at IS NULL AND claimed_at IS NULL`, runID, messageTS))
	if errors.Is(err, sql.ErrNoRows) {
		return OwnerInput{}, fmt.Errorf("%w: %s/%s", ErrOwnerInputNotPending, runID, messageTS)
	}
	if err != nil {
		return OwnerInput{}, fmt.Errorf("pending owner input %s/%s: %w", runID, messageTS, err)
	}
	return in, nil
}

// ResolveOwnerInput marks (runID, messageTS) handled with outcome. An input
// that is missing or already handled fails with ErrOwnerInputNotPending.
func (d *DB) ResolveOwnerInput(ctx context.Context, runID, messageTS, outcome, handledAt string) error {
	res, err := d.sql.ExecContext(ctx, `
UPDATE owner_inputs SET handled_at = ?, outcome = ?, claimed_at = NULL
WHERE run_id = ? AND message_ts = ? AND handled_at IS NULL AND claimed_at IS NOT NULL`, handledAt, outcome, runID, messageTS)
	if err != nil {
		return fmt.Errorf("resolve owner input %s/%s: %w", runID, messageTS, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("%w: %s/%s", ErrOwnerInputNotPending, runID, messageTS)
	}
	return nil
}

// ClaimOwnerInput atomically reserves an unhandled input before posting its answer.
func (d *DB) ClaimOwnerInput(ctx context.Context, runID, messageTS, claimedAt string) (bool, error) {
	res, err := d.sql.ExecContext(ctx, `
UPDATE owner_inputs SET claimed_at = ?
WHERE run_id = ? AND message_ts = ? AND handled_at IS NULL AND claimed_at IS NULL`,
		claimedAt, runID, messageTS)
	if err != nil {
		return false, fmt.Errorf("claim owner input %s/%s: %w", runID, messageTS, err)
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// ClaimedOwnerInput identifies an unresolved answer whose Slack delivery needs
// reconciliation. Do not offer later inputs to the agent while one is claimed.
func (d *DB) ClaimedOwnerInput(ctx context.Context, runID string) (string, error) {
	var messageTS string
	err := d.sql.QueryRowContext(ctx, `
SELECT message_ts FROM owner_inputs
WHERE run_id = ? AND handled_at IS NULL AND claimed_at IS NOT NULL
ORDER BY message_ts LIMIT 1`, runID).Scan(&messageTS)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("claimed owner input %s: %w", runID, err)
	}
	return messageTS, nil
}

// ReleaseOwnerInput permits a retry only after Slack explicitly rejected the
// post. The claim timestamp prevents releasing a different attempt's claim.
func (d *DB) ReleaseOwnerInput(ctx context.Context, runID, messageTS, claimedAt string) error {
	_, err := d.sql.ExecContext(ctx, `
UPDATE owner_inputs SET claimed_at = NULL
WHERE run_id = ? AND message_ts = ? AND claimed_at = ? AND handled_at IS NULL`,
		runID, messageTS, claimedAt)
	if err != nil {
		return fmt.Errorf("release owner input %s/%s: %w", runID, messageTS, err)
	}
	return nil
}

// StaleOwnerInput is an unread input and the thread of the run it belongs to.
type StaleOwnerInput struct {
	RunID     string
	MessageTS string
	ChannelID string
	ThreadTS  string
}

// StaleOwnerInputs lists inputs on Slack-enabled active runs that are still
// unhandled and unclaimed, were received at or before receivedBefore, and
// have no unread-reply notice yet.
func (d *DB) StaleOwnerInputs(ctx context.Context, receivedBefore string) ([]StaleOwnerInput, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT o.run_id, o.message_ts, r.channel_id, r.thread_ts
FROM owner_inputs o JOIN runs r ON r.run_id = o.run_id
WHERE r.lifecycle = 'active' AND r.slack_mode = 'enabled'
  AND o.handled_at IS NULL AND o.claimed_at IS NULL AND o.stale_notice_at IS NULL
  AND o.received_at <= ?
ORDER BY o.run_id, o.message_ts`, receivedBefore)
	if err != nil {
		return nil, fmt.Errorf("stale owner inputs: %w", err)
	}
	defer rows.Close()
	var stale []StaleOwnerInput
	for rows.Next() {
		var in StaleOwnerInput
		if err := rows.Scan(&in.RunID, &in.MessageTS, &in.ChannelID, &in.ThreadTS); err != nil {
			return nil, fmt.Errorf("stale owner inputs: %w", err)
		}
		stale = append(stale, in)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("stale owner inputs: %w", err)
	}
	return stale, nil
}

// MarkStaleNotice records that the unread-reply notice for (runID, messageTS)
// was posted, so it is never posted again.
func (d *DB) MarkStaleNotice(ctx context.Context, runID, messageTS, noticedAt string) error {
	if _, err := d.sql.ExecContext(ctx, `
UPDATE owner_inputs SET stale_notice_at = ? WHERE run_id = ? AND message_ts = ?`,
		noticedAt, runID, messageTS); err != nil {
		return fmt.Errorf("mark stale notice %s/%s: %w", runID, messageTS, err)
	}
	return nil
}

// ActiveRunByThread finds the active run whose thread is (channelID, threadTS).
func (d *DB) ActiveRunByThread(ctx context.Context, channelID, threadTS string) (Run, bool, error) {
	r, err := scanRun(d.sql.QueryRowContext(ctx, `
SELECT `+runColumns+` FROM runs
WHERE channel_id = ? AND thread_ts = ? AND lifecycle = 'active'`, channelID, threadTS))
	if errors.Is(err, sql.ErrNoRows) {
		return Run{}, false, nil
	}
	if err != nil {
		return Run{}, false, fmt.Errorf("active run by thread %s/%s: %w", channelID, threadTS, err)
	}
	return r, true, nil
}
