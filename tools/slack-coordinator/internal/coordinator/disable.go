package coordinator

import (
	"context"
	"errors"
)

// DisableSlackForRun is the per-run break-glass: the run keeps recording
// status and lifecycle in SQLite, but posts nothing more to Slack and run
// check answers slack_disabled. Sibling runs are untouched. The CLI collects
// the typed confirmation before calling this.
func (c *Coordinator) DisableSlackForRun(ctx context.Context, runID string) error {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	if runID == "" {
		return errors.New("run_id is required")
	}
	return c.DB.DisableSlack(ctx, runID)
}
