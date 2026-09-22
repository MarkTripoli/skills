package db

import (
	"context"
	"fmt"
)

// InsertRefusedUser records that userID was refused at `at` and reports
// whether a row was inserted; a user already stored is ignored, so the
// refusal is posted once per sender.
func (d *DB) InsertRefusedUser(ctx context.Context, userID, at string) (bool, error) {
	res, err := d.sql.ExecContext(ctx, `
INSERT OR IGNORE INTO refused_users (user_id, refused_at) VALUES (?, ?)`, userID, at)
	if err != nil {
		return false, fmt.Errorf("insert refused user %s: %w", userID, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("insert refused user %s: %w", userID, err)
	}
	return n > 0, nil
}
