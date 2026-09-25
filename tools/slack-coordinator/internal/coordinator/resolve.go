package coordinator

import (
	"context"
	"errors"
	"github.com/slack-go/slack"

	"fmt"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// ErrResolveUnavailable means Slack may have received the reply but the
// coordinator could not confirm the outcome. The claimed input needs manual
// reconciliation; retrying the post could send the same answer twice.
var ErrResolveUnavailable = errors.New("owner input resolution unavailable")

// ResolveOwnerInput claims one pending input before posting its answer. Slack
// API rejections release the claim for a retry. An ambiguous delivery or a
// failed DB completion leaves it claimed and stops the run.
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
	run, err := c.activeRun(ctx, in.RunID)
	if err != nil {
		return err
	}
	claimedAt := stamp(c.Now())
	claimed, err := c.DB.ClaimOwnerInput(ctx, in.RunID, in.MessageTS, claimedAt)
	if err != nil {
		return err
	}
	if !claimed {
		messageTS, err := c.DB.ClaimedOwnerInput(ctx, in.RunID)
		if err != nil {
			return err
		}
		if messageTS == in.MessageTS {
			return fmt.Errorf("%w: %s/%s is already being delivered or needs reconciliation", ErrResolveUnavailable, in.RunID, in.MessageTS)
		}
		return fmt.Errorf("%w: %s/%s", db.ErrOwnerInputNotPending, in.RunID, in.MessageTS)
	}
	if err := c.post(ctx, run, SlackMessage{Text: in.Reply}); err != nil {
		var rejected slack.SlackErrorResponse
		if errors.As(err, &rejected) {
			if releaseErr := c.DB.ReleaseOwnerInput(ctx, in.RunID, in.MessageTS, claimedAt); releaseErr != nil {
				return fmt.Errorf("%w: Slack rejected the reply but its claim could not be released: %w", ErrResolveUnavailable, releaseErr)
			}
			return err
		}
		return fmt.Errorf("%w: reply delivery is uncertain; input remains claimed for manual reconciliation: %w", ErrResolveUnavailable, err)
	}
	if err := c.DB.ResolveOwnerInput(ctx, in.RunID, in.MessageTS, in.Outcome, stamp(c.Now())); err != nil {
		return fmt.Errorf("%w: reply posted but input remains claimed for manual reconciliation: %w", ErrResolveUnavailable, err)
	}
	return nil
}
