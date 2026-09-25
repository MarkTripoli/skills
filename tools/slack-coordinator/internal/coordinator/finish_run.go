package coordinator

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// FinishRun updates the root with the completion details and closes the run.
// A failed edit leaves the run active for a retry; disabled runs close locally.
func (c *Coordinator) FinishRun(ctx context.Context, in FinishRunInput) error {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	switch in.Outcome {
	case "completed", "failed", "cancelled":
	default:
		return fmt.Errorf("outcome %q must be completed, failed, or cancelled", in.Outcome)
	}
	emoji := in.Emoji
	if emoji == "" {
		switch in.Outcome {
		case "completed":
			emoji = "white_check_mark"
		case "failed":
			emoji = "x"
		case "cancelled":
			emoji = "black_square_for_stop"
		}
	}
	name, err := emojiName(emoji)
	if err != nil {
		return err
	}
	run, err := c.activeRun(ctx, in.RunID)
	if err != nil {
		return err
	}
	finishedAt := stamp(c.Now())
	if run.SlackMode != db.SlackDisabled {
		if err := c.updateRoot(ctx, run, nil, &in, finishedAt); err != nil {
			return fmt.Errorf("update completion message: %w", err)
		}
		if name != "none" {
			if err := c.react(ctx, run, name); err != nil {
				if dbErr := c.DB.SetDeliveryError(ctx, run.RunID, err.Error()); dbErr != nil {
					slog.Warn("record finish reaction failure", "run_id", run.RunID, "error", dbErr)
				}
			}
		}
	}
	return c.DB.FinishRun(ctx, in.RunID, in.Outcome, finishedAt)
}
