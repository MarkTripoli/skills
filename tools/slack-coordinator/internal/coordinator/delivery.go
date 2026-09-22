package coordinator

import (
	"context"
	"errors"
	"fmt"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// DeliveryError is a Slack post that failed. The IPC layer maps it to
// ipc.ErrUnavailable and the CLI to exit 11, so agents pause instead of
// treating the refusal as bad input.
type DeliveryError struct {
	Err error
}

func (e *DeliveryError) Error() string { return "slack delivery failed: " + e.Err.Error() }
func (e *DeliveryError) Unwrap() error { return e.Err }

// post sends mrkdwn as a reply in run's thread and records the outcome: a
// failure becomes the run's last_delivery_error, which run check reports as
// unavailable until a later post succeeds and clears it.
func (c *Coordinator) post(ctx context.Context, run db.Run, mrkdwn string) error {
	if _, err := c.Slack.PostMessage(ctx, run.ChannelID, run.ThreadTS, mrkdwn); err != nil {
		delivery := &DeliveryError{Err: err}
		if dbErr := c.DB.SetDeliveryError(ctx, run.RunID, err.Error()); dbErr != nil {
			return errors.Join(delivery, fmt.Errorf("record delivery error: %w", dbErr))
		}
		return delivery
	}
	if run.LastDeliveryError.Valid {
		return c.DB.SetDeliveryError(ctx, run.RunID, "")
	}
	return nil
}
