package db

import (
	"context"
	"fmt"
)

// Values of tasks.state.
const (
	TaskActive    = "active"
	TaskPaused    = "paused"
	TaskCompleted = "completed"
	TaskCancelled = "cancelled"
)

// CountTasksByState counts the tasks in state.
func (d *DB) CountTasksByState(ctx context.Context, state string) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE state = ?`, state).Scan(&n); err != nil {
		return 0, fmt.Errorf("count tasks %s: %w", state, err)
	}
	return n, nil
}
