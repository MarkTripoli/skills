package coordinator

import (
	"context"
	"errors"
	"fmt"
)

// ResolveOwnerInput answers one pending owner input: the reply is posted in
// the run's thread, then the input is marked handled with the outcome. The
// input must still be pending before anything is posted, so a repeated resolve
// posts nothing. A failed post is a *DeliveryError and leaves the input pending.
func (c *Coordinator) ResolveOwnerInput(ctx context.Context, in OwnerInputResolution) error {
	switch in.Outcome {
	case "applied", "rejected", "answered":
	default:
		return fmt.Errorf("outcome %q must be applied, rejected, or answered", in.Outcome)
	}
	switch {
	case in.RunID == "":
		return errors.New("run_id is required")
	case in.MessageTS == "":
		return errors.New("message_ts is required")
	case in.Reply == "":
		return errors.New("reply is required")
	}
	run, err := c.DB.GetRun(ctx, in.RunID)
	if err != nil {
		return err
	}
	if _, err := c.DB.PendingOwnerInput(ctx, in.RunID, in.MessageTS); err != nil {
		return err
	}
	if err := c.post(ctx, run, in.Reply); err != nil {
		return fmt.Errorf("post owner reply: %w", err)
	}
	return c.DB.ResolveOwnerInput(ctx, in.RunID, in.MessageTS, in.Outcome, stamp(c.Now()))
}
