package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// Values of dm_messages.author.
const (
	AuthorOwner = "owner"
	AuthorBot   = "bot"
)

// DMRequest is one row of dm_requests: an owner's top-level DM and the thread
// of follow-ups and answers under it, keyed by the DM's message ts.
type DMRequest struct {
	RootTS          string
	ChannelID       string
	ReceivedAt      string
	AckTS           sql.NullString
	PendingProposal sql.NullString
	LastMessageAt   string
}

// DMMessage is one row of dm_messages: an owner or bot message in a request
// thread. RunID is NULL on an owner row while no run has consumed it.
type DMMessage struct {
	RootTS string
	TS     string
	Author string
	Text   string
	RunID  sql.NullString
}

const dmMessageColumns = `root_ts, ts, author, text, run_id`

// InsertDMRequest stores a new request and reports whether a row was inserted;
// a root_ts already stored is ignored so a redelivered envelope adds nothing.
func (d *DB) InsertDMRequest(ctx context.Context, r DMRequest) (bool, error) {
	res, err := d.sql.ExecContext(ctx, `
INSERT OR IGNORE INTO dm_requests (root_ts, channel_id, received_at, last_message_at)
VALUES (?, ?, ?, ?)`, r.RootTS, r.ChannelID, r.ReceivedAt, r.LastMessageAt)
	if err != nil {
		return false, fmt.Errorf("insert dm request %s: %w", r.RootTS, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("insert dm request %s: %w", r.RootTS, err)
	}
	return n > 0, nil
}

// GetDMRequest returns the request rooted at rootTS, if any.
func (d *DB) GetDMRequest(ctx context.Context, rootTS string) (DMRequest, bool, error) {
	var r DMRequest
	err := d.sql.QueryRowContext(ctx, `
SELECT root_ts, channel_id, received_at, ack_ts, pending_proposal, last_message_at
FROM dm_requests WHERE root_ts = ?`, rootTS).Scan(&r.RootTS, &r.ChannelID, &r.ReceivedAt, &r.AckTS, &r.PendingProposal, &r.LastMessageAt)
	if errors.Is(err, sql.ErrNoRows) {
		return DMRequest{}, false, nil
	}
	if err != nil {
		return DMRequest{}, false, fmt.Errorf("get dm request %s: %w", rootTS, err)
	}
	return r, true, nil
}

// HasDMMessage reports whether rootTS already has a message stored at ts.
func (d *DB) HasDMMessage(ctx context.Context, rootTS, ts string) (bool, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM dm_messages WHERE root_ts = ? AND ts = ?`, rootTS, ts).Scan(&n); err != nil {
		return false, fmt.Errorf("has dm message %s/%s: %w", rootTS, ts, err)
	}
	return n > 0, nil
}

// SetAckTS records the ts of the acknowledgement posted under rootTS.
func (d *DB) SetAckTS(ctx context.Context, rootTS, ackTS string) error {
	if _, err := d.sql.ExecContext(ctx, `UPDATE dm_requests SET ack_ts = ? WHERE root_ts = ?`, ackTS, rootTS); err != nil {
		return fmt.Errorf("set ack ts %s: %w", rootTS, err)
	}
	return nil
}

// TouchDMRequest moves rootTS's last_message_at to at.
func (d *DB) TouchDMRequest(ctx context.Context, rootTS, at string) error {
	if _, err := d.sql.ExecContext(ctx, `UPDATE dm_requests SET last_message_at = ? WHERE root_ts = ?`, at, rootTS); err != nil {
		return fmt.Errorf("touch dm request %s: %w", rootTS, err)
	}
	return nil
}

// InsertDMMessage stores one thread message; a (root_ts, ts) already stored
// is ignored so a redelivered envelope adds nothing.
func (d *DB) InsertDMMessage(ctx context.Context, m DMMessage) error {
	if _, err := d.sql.ExecContext(ctx, `
INSERT OR IGNORE INTO dm_messages (`+dmMessageColumns+`)
VALUES (?, ?, ?, ?, ?)`, m.RootTS, m.TS, m.Author, m.Text, m.RunID); err != nil {
		return fmt.Errorf("insert dm message %s/%s: %w", m.RootTS, m.TS, err)
	}
	return nil
}

// UpsertDMMessage stores one thread message, replacing the author, text, and
// run_id of a (root_ts, ts) already stored: the row of an ack whose Slack
// message was edited into the answer.
func (d *DB) UpsertDMMessage(ctx context.Context, m DMMessage) error {
	if _, err := d.sql.ExecContext(ctx, `
INSERT INTO dm_messages (`+dmMessageColumns+`)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT (root_ts, ts) DO UPDATE SET author = excluded.author, text = excluded.text, run_id = excluded.run_id`,
		m.RootTS, m.TS, m.Author, m.Text, m.RunID); err != nil {
		return fmt.Errorf("upsert dm message %s/%s: %w", m.RootTS, m.TS, err)
	}
	return nil
}

// ListDMMessages returns the messages under rootTS in ts order.
func (d *DB) ListDMMessages(ctx context.Context, rootTS string) ([]DMMessage, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT `+dmMessageColumns+` FROM dm_messages WHERE root_ts = ? ORDER BY ts`, rootTS)
	if err != nil {
		return nil, fmt.Errorf("list dm messages %s: %w", rootTS, err)
	}
	defer rows.Close()
	var msgs []DMMessage
	for rows.Next() {
		var m DMMessage
		if err := rows.Scan(&m.RootTS, &m.TS, &m.Author, &m.Text, &m.RunID); err != nil {
			return nil, fmt.Errorf("list dm messages %s: %w", rootTS, err)
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list dm messages %s: %w", rootTS, err)
	}
	return msgs, nil
}

// SetPendingProposal stores the JSON-encoded pending proposal for rootTS.
func (d *DB) SetPendingProposal(ctx context.Context, rootTS, proposalJSON string) error {
	if _, err := d.sql.ExecContext(ctx, `UPDATE dm_requests SET pending_proposal = ? WHERE root_ts = ?`, proposalJSON, rootTS); err != nil {
		return fmt.Errorf("set pending_proposal %s: %w", rootTS, err)
	}
	return nil
}

// ClearPendingProposal sets pending_proposal to NULL for rootTS.
func (d *DB) ClearPendingProposal(ctx context.Context, rootTS string) error {
	if _, err := d.sql.ExecContext(ctx,
		`UPDATE dm_requests SET pending_proposal = NULL WHERE root_ts = ?`, rootTS); err != nil {
		return fmt.Errorf("clear pending_proposal %s: %w", rootTS, err)
	}
	return nil
}
