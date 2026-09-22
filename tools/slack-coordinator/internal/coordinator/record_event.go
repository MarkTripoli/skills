package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

// RecordWorkEvent posts one status message as a thread reply on an active run
// and restarts the run's quiet interval.
func (c *Coordinator) RecordWorkEvent(ctx context.Context, e WorkEvent) error {
	run, err := c.activeRun(ctx, e.RunID)
	if err != nil {
		return err
	}
	if _, err := c.Slack.PostMessage(ctx, run.ChannelID, run.ThreadTS, RenderStatus(e)); err != nil {
		return fmt.Errorf("post status message: %w", err)
	}
	return c.storeStatus(ctx, e, c.Now())
}

// storeStatus records e as the run's last status and schedules the next
// quiet-interval repost from now.
func (c *Coordinator) storeStatus(ctx context.Context, e WorkEvent, now time.Time) error {
	raw, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("encode status: %w", err)
	}
	return c.DB.SetStatus(ctx, e.RunID, string(raw), c.nextDue(now).String)
}
