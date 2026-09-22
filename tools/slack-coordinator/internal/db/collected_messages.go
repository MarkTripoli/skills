package db

import (
	"context"
	"fmt"
)

// CountCollectedMessages counts every collected_messages row.
func (d *DB) CountCollectedMessages(ctx context.Context) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM collected_messages`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count collected messages: %w", err)
	}
	return n, nil
}
