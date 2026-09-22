package coordinator

import (
	"context"
	"fmt"
)

// FinishRun posts the completion message and closes the run with Outcome as
// its lifecycle. A run that is not active is refused before posting; a failed
// post is a *DeliveryError and leaves the run active for a retry.
func (c *Coordinator) FinishRun(ctx context.Context, in FinishRunInput) error {
	switch in.Outcome {
	case "completed", "failed", "cancelled":
	default:
		return fmt.Errorf("outcome %q must be completed, failed, or cancelled", in.Outcome)
	}
	run, err := c.activeRun(ctx, in.RunID)
	if err != nil {
		return err
	}
	finishedAt := stamp(c.Now())
	if err := c.post(ctx, run, RenderCompletion(in, finishedAt)); err != nil {
		return fmt.Errorf("post completion message: %w", err)
	}
	return c.DB.FinishRun(ctx, in.RunID, in.Outcome, finishedAt)
}
