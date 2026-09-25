package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// activeRun loads runID and refuses a run whose lifecycle is terminal.
func (c *Coordinator) activeRun(ctx context.Context, runID string) (db.Run, error) {
	if runID == "" {
		return db.Run{}, errors.New("run_id is required")
	}
	run, err := c.DB.GetRun(ctx, runID)
	if err != nil {
		return db.Run{}, err
	}
	if run.Lifecycle != "active" {
		return db.Run{}, fmt.Errorf("%w: %s is %s", db.ErrRunNotActive, runID, run.Lifecycle)
	}
	return run, nil
}

// RecordWorkEvent edits the root with the latest status. New blockers get one
// thread reply so they can notify the owner; routine updates stay on the root.
// A failed edit is retried by the scheduler using the saved status.
func (c *Coordinator) RecordWorkEvent(ctx context.Context, e WorkEvent) error {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	run, err := c.activeRun(ctx, e.RunID)
	if err != nil {
		return err
	}
	var prev WorkEvent
	if run.LastStatus.Valid {
		if err := json.Unmarshal([]byte(run.LastStatus.String), &prev); err != nil {
			return fmt.Errorf("decode last status: %w", err)
		}
		if sameStatus(prev, e) && !run.LastDeliveryError.Valid {
			return nil
		}
	}
	if run.SlackMode != db.SlackDisabled {
		for _, blocker := range e.Blockers {
			if !contains(prev.Blockers, blocker) {
				if err := c.post(ctx, run, SlackMessage{Text: "Blocked: " + blocker}); err != nil {
					// A root edit cannot recover a missed action-required reply.
					if dbErr := c.DB.SetDeliveryError(ctx, run.RunID, "blocker notification: "+err.Error()); dbErr != nil {
						return errors.Join(err, dbErr)
					}
					return fmt.Errorf("notify blocker: %w", err)
				}
			}
		}
	}
	// Save before editing so a failed edit can be retried without another
	// owner notification. Disabled runs still record their latest status.
	if err := c.storeStatus(ctx, e); err != nil {
		return err
	}
	if run.SlackMode == db.SlackDisabled {
		return nil
	}
	if slices.Equal(prev.Blockers, e.Blockers) && c.Now().Before(statusDue(run)) && !run.LastDeliveryError.Valid {
		return nil
	}
	return c.renderStatus(ctx, run, e)
}

// sameStatus reports that two events would show the reader the same update.
func sameStatus(a, b WorkEvent) bool {
	if a.Note != "" || b.Note != "" {
		return a.Note == b.Note
	}
	return RenderStatus(a) == RenderStatus(b)
}

func contains(items []string, item string) bool {
	for _, candidate := range items {
		if candidate == item {
			return true
		}
	}
	return false
}

// statusDue measures the run's cadence from the most recent root edit.
func statusDue(run db.Run) time.Time {
	last := run.StartedAt
	if run.LastRootUpdate.Valid {
		last = run.LastRootUpdate.String
	}
	at, _ := time.Parse(time.RFC3339, last)
	return at.Add(time.Duration(run.StatusIntervalSeconds) * time.Second)
}

func (c *Coordinator) renderStatus(ctx context.Context, run db.Run, e WorkEvent) error {
	if err := c.updateRoot(ctx, run, &e, nil, ""); err != nil {
		return err
	}
	raw, err := json.Marshal(e)
	if err != nil {
		return err
	}
	return c.DB.MarkStatusRendered(ctx, run.RunID, string(raw), stamp(c.Now()))
}

// storeStatus records e as the run's latest status and schedules its root edit.
func (c *Coordinator) storeStatus(ctx context.Context, e WorkEvent) error {
	raw, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("encode status: %w", err)
	}
	run, err := c.DB.GetRun(ctx, e.RunID)
	if err != nil {
		return err
	}
	return c.DB.SetStatus(ctx, e.RunID, string(raw), stamp(statusDue(run)))
}
