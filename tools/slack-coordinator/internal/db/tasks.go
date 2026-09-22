package db

import (
	"context"
	"database/sql"
	"fmt"
)

// Values of tasks.state.
const (
	TaskActive    = "active"
	TaskPaused    = "paused"
	TaskCompleted = "completed"
	TaskCancelled = "cancelled"
)

// Values of tasks.trigger.
const (
	TriggerSchedule    = "schedule"
	TriggerWindowEnd   = "window_end"
	TriggerEachMessage = "each_message"
)

// WatchingTask is what the collector needs from an active task watching a
// channel: its id, its trigger, and the debounce an each_message task closes
// its window with (NULL for the other triggers).
type WatchingTask struct {
	TaskID          int64
	Trigger         string
	DebounceSeconds sql.NullInt64
}

// WatchingTasks lists the active tasks watching channelID in task_id order.
// Paused, completed, and cancelled tasks watch nothing.
func (d *DB) WatchingTasks(ctx context.Context, channelID string) ([]WatchingTask, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT t.task_id, t.trigger, t.debounce_seconds
FROM task_channels c JOIN tasks t ON t.task_id = c.task_id
WHERE c.channel_id = ? AND t.state = 'active'
ORDER BY t.task_id`, channelID)
	if err != nil {
		return nil, fmt.Errorf("watching tasks %s: %w", channelID, err)
	}
	defer rows.Close()
	var tasks []WatchingTask
	for rows.Next() {
		var t WatchingTask
		if err := rows.Scan(&t.TaskID, &t.Trigger, &t.DebounceSeconds); err != nil {
			return nil, fmt.Errorf("watching tasks %s: %w", channelID, err)
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("watching tasks %s: %w", channelID, err)
	}
	return tasks, nil
}

// SetTaskDue moves taskID's due_at to dueAt.
func (d *DB) SetTaskDue(ctx context.Context, taskID int64, dueAt string) error {
	if _, err := d.sql.ExecContext(ctx, `UPDATE tasks SET due_at = ? WHERE task_id = ?`, dueAt, taskID); err != nil {
		return fmt.Errorf("set task due %d: %w", taskID, err)
	}
	return nil
}
