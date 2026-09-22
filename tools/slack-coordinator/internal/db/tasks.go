package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// ErrTaskNotFound reports a task_id with no row.
var ErrTaskNotFound = errors.New("task not found")

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

// Task is one row of the tasks table. Timestamps are RFC 3339 UTC strings;
// Schedule is the JSON schemaSQL documents, NULL for each_message tasks.
type Task struct {
	TaskID              int64
	State               string
	Instruction         string
	Trigger             string
	Schedule            sql.NullString
	DebounceSeconds     sql.NullInt64
	DeliverTo           string
	RequestRootTS       string
	CreatedAt           string
	DueAt               sql.NullString
	LastRunStartedAt    sql.NullString
	LastResultAt        sql.NullString
	ConsecutiveFailures int
	EndedAt             sql.NullString
}

const taskColumns = `task_id, state, instruction, trigger, schedule, debounce_seconds, deliver_to, request_root_ts, created_at, due_at, last_run_started_at, last_result_at, consecutive_failures, ended_at`

func scanTask(s scanner) (Task, error) {
	var t Task
	err := s.Scan(&t.TaskID, &t.State, &t.Instruction, &t.Trigger, &t.Schedule, &t.DebounceSeconds, &t.DeliverTo, &t.RequestRootTS, &t.CreatedAt, &t.DueAt, &t.LastRunStartedAt, &t.LastResultAt, &t.ConsecutiveFailures, &t.EndedAt)
	return t, err
}

// ListTasks lists the tasks in any of states, ascending by task_id; with no
// states it lists every task.
func (d *DB) ListTasks(ctx context.Context, states ...string) ([]Task, error) {
	query := `SELECT ` + taskColumns + ` FROM tasks`
	args := make([]any, len(states))
	if len(states) > 0 {
		query += ` WHERE state IN (?` + strings.Repeat(",?", len(states)-1) + `)`
		for i, s := range states {
			args[i] = s
		}
	}
	rows, err := d.sql.QueryContext(ctx, query+` ORDER BY task_id`, args...)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()
	var tasks []Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, fmt.Errorf("list tasks: %w", err)
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	return tasks, nil
}

// GetTask returns the task with taskID, or ErrTaskNotFound.
func (d *DB) GetTask(ctx context.Context, taskID int64) (Task, error) {
	t, err := scanTask(d.sql.QueryRowContext(ctx, `SELECT `+taskColumns+` FROM tasks WHERE task_id = ?`, taskID))
	if errors.Is(err, sql.ErrNoRows) {
		return Task{}, ErrTaskNotFound
	}
	if err != nil {
		return Task{}, fmt.Errorf("get task %d: %w", taskID, err)
	}
	return t, nil
}

// TaskChannels lists the channel ids taskID watches, ascending.
func (d *DB) TaskChannels(ctx context.Context, taskID int64) ([]string, error) {
	rows, err := d.sql.QueryContext(ctx, `SELECT channel_id FROM task_channels WHERE task_id = ? ORDER BY channel_id`, taskID)
	if err != nil {
		return nil, fmt.Errorf("task channels %d: %w", taskID, err)
	}
	defer rows.Close()
	var channels []string
	for rows.Next() {
		var ch string
		if err := rows.Scan(&ch); err != nil {
			return nil, fmt.Errorf("task channels %d: %w", taskID, err)
		}
		channels = append(channels, ch)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("task channels %d: %w", taskID, err)
	}
	return channels, nil
}

// SetTaskState moves taskID to state with due_at and ended_at set to dueAt
// and endedAt, NULL for a nil pointer.
func (d *DB) SetTaskState(ctx context.Context, taskID int64, state string, dueAt, endedAt *string) error {
	if _, err := d.sql.ExecContext(ctx, `UPDATE tasks SET state = ?, due_at = ?, ended_at = ? WHERE task_id = ?`, state, dueAt, endedAt, taskID); err != nil {
		return fmt.Errorf("set task state %d: %w", taskID, err)
	}
	return nil
}

// ResetTaskFailures zeroes taskID's consecutive_failures.
func (d *DB) ResetTaskFailures(ctx context.Context, taskID int64) error {
	if _, err := d.sql.ExecContext(ctx, `UPDATE tasks SET consecutive_failures = 0 WHERE task_id = ?`, taskID); err != nil {
		return fmt.Errorf("reset task failures %d: %w", taskID, err)
	}
	return nil
}

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

// CountTasksByState counts the tasks in state.
func (d *DB) CountTasksByState(ctx context.Context, state string) (int, error) {
	var n int
	if err := d.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE state = ?`, state).Scan(&n); err != nil {
		return 0, fmt.Errorf("count tasks %s: %w", state, err)
	}
	return n, nil
}

// DueTasks returns active tasks with trigger schedule or window_end whose
// due_at is at or before now and which have no queued or running run.
func (d *DB) DueTasks(ctx context.Context, now string) ([]Task, error) {
	rows, err := d.sql.QueryContext(ctx, `
SELECT `+taskColumns+` FROM tasks
WHERE state = 'active'
  AND trigger IN ('schedule','window_end')
  AND due_at IS NOT NULL AND due_at <= ?
  AND task_id NOT IN (
    SELECT task_id FROM assistant_runs
    WHERE state IN ('queued','running') AND task_id IS NOT NULL
  )
ORDER BY task_id`, now)
	if err != nil {
		return nil, fmt.Errorf("due tasks: %w", err)
	}
	defer rows.Close()
	var tasks []Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, fmt.Errorf("due tasks: %w", err)
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// MarkTaskRunStarted sets last_run_started_at for taskID.
func (d *DB) MarkTaskRunStarted(ctx context.Context, taskID int64, at string) error {
	if _, err := d.sql.ExecContext(ctx,
		`UPDATE tasks SET last_run_started_at = ? WHERE task_id = ?`, at, taskID); err != nil {
		return fmt.Errorf("mark task %d run started: %w", taskID, err)
	}
	return nil
}

// RecordTaskSuccess updates the task after a successful run: sets last_result_at
// and resets consecutive_failures. For schedule tasks nextDue advances due_at;
// for window_end tasks endedAt is non-nil and the state is set to completed.
func (d *DB) RecordTaskSuccess(ctx context.Context, taskID int64, nextDue, endedAt *string, resultAt string) error {
	state := TaskActive
	if endedAt != nil {
		state = TaskCompleted
	}
	if _, err := d.sql.ExecContext(ctx, `
UPDATE tasks SET last_result_at = ?, consecutive_failures = 0, due_at = ?, state = ?, ended_at = ?
WHERE task_id = ?`, resultAt, nextDue, state, endedAt, taskID); err != nil {
		return fmt.Errorf("record task %d success: %w", taskID, err)
	}
	return nil
}

// RecordTaskFailure increments consecutive_failures. For schedule tasks
// nextDue (non-nil) advances due_at; for window_end tasks nextDue is nil and
// due_at is left unchanged.
func (d *DB) RecordTaskFailure(ctx context.Context, taskID int64, nextDue *string) error {
	if _, err := d.sql.ExecContext(ctx, `
UPDATE tasks SET consecutive_failures = consecutive_failures + 1, due_at = COALESCE(?, due_at)
WHERE task_id = ?`, nextDue, taskID); err != nil {
		return fmt.Errorf("record task %d failure: %w", taskID, err)
	}
	return nil
}
