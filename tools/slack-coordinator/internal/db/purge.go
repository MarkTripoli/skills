package db

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// PurgeRetention deletes stale records in one transaction and returns the
// run_id of every assistant_runs row removed. now is the reference clock;
// days is the retention window for runs, tasks, and DM threads;
// consumedDays is the shorter window for runs whose collected messages have
// already been consumed by the owner.
func (d *DB) PurgeRetention(ctx context.Context, now time.Time, days, consumedDays int) ([]string, error) {
	var deleted []string
	err := d.Transact(ctx, func(tx *DB) error {
		var err error
		deleted, err = doPurge(ctx, tx, now, days, consumedDays)
		return err
	})
	return deleted, err
}

func doPurge(ctx context.Context, tx *DB, now time.Time, days, consumedDays int) ([]string, error) {
	consumedCutoff := now.UTC().AddDate(0, 0, -consumedDays).Format(time.RFC3339)
	daysCutoff := now.UTC().AddDate(0, 0, -days).Format(time.RFC3339)

	var allDeleted []string

	// ── Step 1: consumed message cleanup ─────────────────────────────────────
	// Delete task_messages whose run finished before consumedCutoff.  Only rows
	// with a non-NULL run_id referencing an old-enough run are removed; rows
	// with run_id IS NULL (not yet consumed) are never touched.
	if _, err := tx.sql.ExecContext(ctx, `
DELETE FROM task_messages
WHERE run_id IN (
  SELECT run_id FROM assistant_runs
  WHERE finished_at IS NOT NULL AND finished_at < ?
)`, consumedCutoff); err != nil {
		return nil, fmt.Errorf("purge consumed task_messages: %w", err)
	}
	if err := deleteOrphanedCollectedMessages(ctx, tx); err != nil {
		return nil, fmt.Errorf("purge orphaned collected_messages (step 1): %w", err)
	}

	// ── Step 2: stale run cleanup ─────────────────────────────────────────────
	// Within every group (task_id for task runs, root_ts for DM runs), rank
	// runs newest-first.  Any run ranked beyond 20 AND finished before
	// daysCutoff is eligible for deletion.
	const staleRunQuery = `
SELECT run_id FROM (
  SELECT run_id, finished_at,
         ROW_NUMBER() OVER (
           PARTITION BY CASE WHEN kind = 'task' THEN CAST(task_id AS TEXT)
                             ELSE root_ts END
           ORDER BY finished_at DESC, run_id DESC
         ) AS rn
  FROM assistant_runs
  WHERE finished_at IS NOT NULL
) sub
WHERE rn > 20 AND finished_at < ?`

	staleRunIDs, err := queryStringColumn(ctx, tx, staleRunQuery, daysCutoff)
	if err != nil {
		return nil, fmt.Errorf("purge stale runs query: %w", err)
	}
	if len(staleRunIDs) > 0 {
		inSQL := inPlaceholders(len(staleRunIDs))
		args := strsToAnys(staleRunIDs)
		if _, err := tx.sql.ExecContext(ctx,
			`DELETE FROM task_messages WHERE run_id IN (`+inSQL+`)`, args...); err != nil {
			return nil, fmt.Errorf("purge stale run task_messages: %w", err)
		}
		if _, err := tx.sql.ExecContext(ctx,
			`DELETE FROM assistant_runs WHERE run_id IN (`+inSQL+`)`, args...); err != nil {
			return nil, fmt.Errorf("purge stale assistant_runs: %w", err)
		}
		allDeleted = append(allDeleted, staleRunIDs...)
	}

	// ── Step 3: stale task cleanup ────────────────────────────────────────────
	// Collect the run_ids first so they appear in the returned list.
	taskRunIDs, err := queryStringColumn(ctx, tx, `
SELECT run_id FROM assistant_runs
WHERE task_id IN (
  SELECT task_id FROM tasks
  WHERE state IN ('cancelled','completed') AND ended_at IS NOT NULL AND ended_at < ?
)`, daysCutoff)
	if err != nil {
		return nil, fmt.Errorf("purge stale task runs query: %w", err)
	}
	// Remove child rows before the tasks row itself.
	for _, stmt := range []string{
		`DELETE FROM task_messages WHERE task_id IN (
           SELECT task_id FROM tasks
           WHERE state IN ('cancelled','completed') AND ended_at IS NOT NULL AND ended_at < ?)`,
		`DELETE FROM task_channels WHERE task_id IN (
           SELECT task_id FROM tasks
           WHERE state IN ('cancelled','completed') AND ended_at IS NOT NULL AND ended_at < ?)`,
		`DELETE FROM assistant_runs WHERE task_id IN (
           SELECT task_id FROM tasks
           WHERE state IN ('cancelled','completed') AND ended_at IS NOT NULL AND ended_at < ?)`,
		`DELETE FROM tasks
         WHERE state IN ('cancelled','completed') AND ended_at IS NOT NULL AND ended_at < ?`,
	} {
		if _, err := tx.sql.ExecContext(ctx, stmt, daysCutoff); err != nil {
			return nil, fmt.Errorf("purge stale tasks: %w", err)
		}
	}
	if err := deleteOrphanedCollectedMessages(ctx, tx); err != nil {
		return nil, fmt.Errorf("purge orphaned collected_messages (step 3): %w", err)
	}
	allDeleted = append(allDeleted, taskRunIDs...)

	// ── Step 4: stale DM thread cleanup ──────────────────────────────────────
	dmRunIDs, err := queryStringColumn(ctx, tx, `
SELECT run_id FROM assistant_runs
WHERE root_ts IN (
  SELECT root_ts FROM dm_requests WHERE last_message_at < ?
)`, daysCutoff)
	if err != nil {
		return nil, fmt.Errorf("purge stale dm runs query: %w", err)
	}
	for _, stmt := range []string{
		`DELETE FROM dm_messages WHERE root_ts IN (
           SELECT root_ts FROM dm_requests WHERE last_message_at < ?)`,
		`DELETE FROM assistant_runs WHERE root_ts IN (
           SELECT root_ts FROM dm_requests WHERE last_message_at < ?)`,
		`DELETE FROM dm_requests WHERE last_message_at < ?`,
	} {
		if _, err := tx.sql.ExecContext(ctx, stmt, daysCutoff); err != nil {
			return nil, fmt.Errorf("purge stale dm_requests: %w", err)
		}
	}
	allDeleted = append(allDeleted, dmRunIDs...)

	return allDeleted, nil
}

// deleteOrphanedCollectedMessages removes collected_messages rows that have no
// remaining task_messages reference.  A row with a NULL-run_id task_messages
// sibling is not orphaned and survives.
func deleteOrphanedCollectedMessages(ctx context.Context, tx *DB) error {
	_, err := tx.sql.ExecContext(ctx, `
DELETE FROM collected_messages
WHERE NOT EXISTS (
  SELECT 1 FROM task_messages tm
  WHERE tm.channel_id = collected_messages.channel_id
    AND tm.ts         = collected_messages.ts
)`)
	return err
}

// queryStringColumn runs query with args and returns the first column of every
// row as a []string.
func queryStringColumn(ctx context.Context, tx *DB, query string, args ...any) ([]string, error) {
	rows, err := tx.sql.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// inPlaceholders returns n comma-separated "?" for use inside an IN(…) clause.
func inPlaceholders(n int) string {
	return strings.Repeat("?,", n-1) + "?"
}

// strsToAnys converts []string to []any for variadic ExecContext.
func strsToAnys(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}
