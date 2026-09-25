package db

import (
	"context"
	"fmt"
)

// RecordTerminalNotice records the Slack message associated with a run's terminal notice once.
func (d *DB) RecordTerminalNotice(ctx context.Context, runID, messageTS string) (bool, error) {
	res, err := d.sql.ExecContext(ctx, `INSERT OR IGNORE INTO terminal_notices (run_id, message_ts) VALUES (?, ?)`, runID, messageTS)
	if err != nil {
		return false, fmt.Errorf("record terminal notice %s: %w", runID, err)
	}
	n, err := res.RowsAffected()
	return n > 0, err
}
