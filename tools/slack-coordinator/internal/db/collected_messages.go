package db

import (
	"context"
	"database/sql"
	"fmt"
)

// CollectedMessage is one row of collected_messages: a channel message seen
// by at least one watching task, stored once however many tasks watch the
// channel. ThreadTS is NULL for a top-level message.
type CollectedMessage struct {
	ChannelID  string
	TS         string
	ThreadTS   sql.NullString
	UserID     string
	Text       string
	Permalink  string
	ReceivedAt string
}

// InsertCollectedMessage stores m; a (channel_id, ts) already stored is
// ignored so a redelivered envelope adds nothing.
func (d *DB) InsertCollectedMessage(ctx context.Context, m CollectedMessage) error {
	if _, err := d.sql.ExecContext(ctx, `
INSERT OR IGNORE INTO collected_messages (channel_id, ts, thread_ts, user_id, text, permalink, received_at)
VALUES (?, ?, ?, ?, ?, ?, ?)`, m.ChannelID, m.TS, m.ThreadTS, m.UserID, m.Text, m.Permalink, m.ReceivedAt); err != nil {
		return fmt.Errorf("insert collected message %s/%s: %w", m.ChannelID, m.TS, err)
	}
	return nil
}

// BindMessageToTask records that taskID saw the collected message
// (channelID, ts) and no run has consumed it yet (run_id NULL). It reports
// whether the binding is new; an existing binding, consumed or not, is left
// as it is so a redelivered envelope changes nothing.
func (d *DB) BindMessageToTask(ctx context.Context, taskID int64, channelID, ts string) (bool, error) {
	res, err := d.sql.ExecContext(ctx, `
INSERT OR IGNORE INTO task_messages (task_id, channel_id, ts, run_id)
VALUES (?, ?, ?, NULL)`, taskID, channelID, ts)
	if err != nil {
		return false, fmt.Errorf("bind message %s/%s to task %d: %w", channelID, ts, taskID, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("bind message %s/%s to task %d: %w", channelID, ts, taskID, err)
	}
	return n > 0, nil
}

// CountCollectedMessages counts every collected_messages row.
func (d *DB) CountCollectedMessages(ctx context.Context) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM collected_messages`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count collected messages: %w", err)
	}
	return n, nil
}

// TaskMessage is one collected message bound to a task run via task_messages.
type TaskMessage struct {
	Author    string // user_id from collected_messages
	ChannelID string
	TS        string
	Text      string
	Permalink string
}

// BindUnconsumedToRun sets run_id on every unconsumed task_messages row for
// taskID. It returns the count of rows that were updated.
func (d *DB) BindUnconsumedToRun(ctx context.Context, taskID int64, runID string) (int64, error) {
	res, err := d.sql.ExecContext(ctx,
		`UPDATE task_messages SET run_id = ? WHERE task_id = ? AND run_id IS NULL`,
		runID, taskID)
	if err != nil {
		return 0, fmt.Errorf("bind unconsumed to run %s: %w", runID, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("bind unconsumed to run %s: %w", runID, err)
	}
	return n, nil
}

// MessagesForRun returns the collected messages bound to runID, joined from
// task_messages and collected_messages, in ts order.
func (d *DB) MessagesForRun(ctx context.Context, runID string) ([]TaskMessage, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT c.user_id, tm.channel_id, tm.ts, c.text, c.permalink
FROM task_messages tm
JOIN collected_messages c ON c.channel_id = tm.channel_id AND c.ts = tm.ts
WHERE tm.run_id = ?
ORDER BY tm.ts`, runID)
	if err != nil {
		return nil, fmt.Errorf("messages for run %s: %w", runID, err)
	}
	defer rows.Close()
	var msgs []TaskMessage
	for rows.Next() {
		var m TaskMessage
		if err := rows.Scan(&m.Author, &m.ChannelID, &m.TS, &m.Text, &m.Permalink); err != nil {
			return nil, fmt.Errorf("messages for run %s: %w", runID, err)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// UnbindRunMessages sets run_id = NULL for every task_messages row bound to runID.
func (d *DB) UnbindRunMessages(ctx context.Context, runID string) error {
	if _, err := d.sql.ExecContext(ctx,
		`UPDATE task_messages SET run_id = NULL WHERE run_id = ?`, runID); err != nil {
		return fmt.Errorf("unbind run %s messages: %w", runID, err)
	}
	return nil
}

// HasUnconsumedMessages reports whether taskID has at least one task_messages
// row with run_id NULL (collected but not yet bound to a run).
func (d *DB) HasUnconsumedMessages(ctx context.Context, taskID int64) (bool, error) {
	var n int
	err := d.sql.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM task_messages WHERE task_id = ? AND run_id IS NULL`, taskID).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("has unconsumed messages %d: %w", taskID, err)
	}
	return n > 0, nil
}
