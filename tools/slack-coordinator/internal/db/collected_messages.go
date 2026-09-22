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
