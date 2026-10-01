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

// RecordWorkEvent updates the thread's one status card on cadence. New blockers
// get their own immediate reply; a failed card edit is retried by the scheduler.
func (c *Coordinator) RecordWorkEvent(ctx context.Context, e WorkEvent) error {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	run, err := c.activeRun(ctx, e.RunID)
	if err != nil {
		return err
	}
	legacyRoot := !run.StatusMessageTS.Valid || run.StatusMessageTS.String == ""
	var prev WorkEvent
	if run.LastStatus.Valid {
		if err := json.Unmarshal([]byte(run.LastStatus.String), &prev); err != nil {
			return fmt.Errorf("decode last status: %w", err)
		}
		unchanged := sameStatus(prev, e)
		if legacyRoot {
			unchanged = RenderLegacyStatus(prev) == RenderLegacyStatus(e) && slices.Equal(prev.Blockers, e.Blockers)
		}
		if unchanged && !run.LastDeliveryError.Valid {
			return nil
		}
	}
	if run.SlackMode != db.SlackDisabled {
		for _, blocker := range e.Blockers {
			if !contains(prev.Blockers, blocker) {
				if err := c.post(ctx, run, BuildBlockerMessage(blocker, run.OwnerUserID)); err != nil {
					// A status-card edit cannot recover a missed blocker reply.
					if dbErr := c.DB.SetDeliveryError(ctx, run.RunID, "blocker notification: "+err.Error()); dbErr != nil {
						return errors.Join(err, dbErr)
					}
					return fmt.Errorf("notify blocker: %w", err)
				}
			}
		}
	}
	progressChanged := RenderStatus(prev) != RenderStatus(e)
	blockersChanged := !slices.Equal(prev.Blockers, e.Blockers)
	if legacyRoot {
		progressChanged = RenderLegacyStatus(prev) != RenderLegacyStatus(e)
	}
	nextDue := ""
	if run.NextStatusDue.Valid {
		nextDue = run.NextStatusDue.String
	}
	if progressChanged {
		nextDue = stamp(statusDue(run))
	}
	// Save before editing so a failed edit can be retried against the same card.
	// For new runs, blocker-only changes keep any pending progress deadline
	// without editing the card. Legacy runs retain their immediate root edit.
	// Disabled runs still record their latest event.
	if err := c.storeStatus(ctx, e, nextDue); err != nil {
		return err
	}
	if run.SlackMode == db.SlackDisabled {
		return nil
	}
	if !run.LastDeliveryError.Valid {
		if !progressChanged && nextDue == "" {
			return nil
		}
		if !(legacyRoot && blockersChanged) && nextDue != "" && isBeforeDue(c.Now(), nextDue) {
			return nil
		}
	}
	return c.renderStatus(ctx, run, e)
}

// sameStatus reports whether two events produce the same visible card and
// blocker notifications.
func sameStatus(a, b WorkEvent) bool {
	return RenderStatus(a) == RenderStatus(b) && slices.Equal(a.Blockers, b.Blockers)
}

func contains(items []string, item string) bool {
	for _, candidate := range items {
		if candidate == item {
			return true
		}
	}
	return false
}

// statusDue measures the cadence from the most recent root post or card edit.
func statusDue(run db.Run) time.Time {
	last := run.StartedAt
	if run.LastRootUpdate.Valid {
		last = run.LastRootUpdate.String
	}
	at, _ := time.Parse(time.RFC3339, last)
	return at.Add(time.Duration(run.StatusIntervalSeconds) * time.Second)
}

func isBeforeDue(now time.Time, due string) bool {
	at, err := time.Parse(time.RFC3339, due)
	return err == nil && now.Before(at)
}

func (c *Coordinator) renderStatus(ctx context.Context, run db.Run, e WorkEvent) error {
	if err := c.updateStatusCard(ctx, run, e); err != nil {
		return err
	}
	raw, err := json.Marshal(e)
	if err != nil {
		return err
	}
	return c.DB.MarkStatusRendered(ctx, run.RunID, string(raw), stamp(c.Now()))
}

// storeStatus records e and an optional deadline for its next card edit.
func (c *Coordinator) storeStatus(ctx context.Context, e WorkEvent, nextDue string) error {
	raw, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("encode status: %w", err)
	}
	return c.DB.SetStatus(ctx, e.RunID, string(raw), nextDue)
}
