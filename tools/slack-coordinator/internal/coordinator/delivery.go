package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// DeliveryError is a failed Slack post or reaction. The IPC layer maps it to
// ipc.ErrUnavailable and the CLI to exit 11, so agents pause instead of
// treating the refusal as bad input.
type DeliveryError struct {
	Err error
}

func (e *DeliveryError) Error() string { return "slack delivery failed: " + e.Err.Error() }
func (e *DeliveryError) Unwrap() error { return e.Err }

// updateRoot edits structured roots in place. Legacy runs have no saved root
// details, so updates are posted in the thread instead of replacing the root.
func (c *Coordinator) updateRoot(ctx context.Context, run db.Run, status *WorkEvent, finish *FinishRunInput, finishedAt string) error {
	if !run.RootMessage.Valid {
		// Legacy rows predate persisted root details. Posting an update in the
		// thread preserves their original root instead of replacing it with a
		// synthetic root that cannot recover the user's work, goal, or scope.
		if status != nil {
			return c.post(ctx, run, BuildStatusMessage(*status))
		}
		if finish != nil {
			return c.post(ctx, run, BuildCompletionMessage(*finish, finishedAt))
		}
		return nil
	}

	var root RootMessage
	if err := json.Unmarshal([]byte(run.RootMessage.String), &root); err != nil {
		return fmt.Errorf("decode root message: %w", err)
	}
	message := BuildRunRoot(root, status, finish, finishedAt)
	if err := c.Slack.UpdateBlocksMessage(ctx, run.ChannelID, run.ThreadTS, message.Text, message.Blocks); err != nil {
		delivery := &DeliveryError{Err: err}
		if dbErr := c.DB.SetDeliveryError(ctx, run.RunID, err.Error()); dbErr != nil {
			return errors.Join(delivery, fmt.Errorf("record delivery error: %w", dbErr))
		}
		return delivery
	}
	if run.LastDeliveryError.Valid && !strings.HasPrefix(run.LastDeliveryError.String, db.UploadOutcomeUncertainPrefix) {
		return c.DB.SetDeliveryError(ctx, run.RunID, "")
	}
	return nil
}

// post sends one message in run's thread. Delivery failures are persisted;
// successful messages clear ordinary errors but not uncertain uploads.
func (c *Coordinator) post(ctx context.Context, run db.Run, message SlackMessage) error {
	if _, err := c.Slack.PostBlocksMessage(ctx, run.ChannelID, run.ThreadTS, message.Text, message.Blocks); err != nil {
		delivery := &DeliveryError{Err: err}
		if dbErr := c.DB.SetDeliveryError(ctx, run.RunID, err.Error()); dbErr != nil {
			return errors.Join(delivery, fmt.Errorf("record delivery error: %w", dbErr))
		}
		return delivery
	}
	if run.LastDeliveryError.Valid && !strings.HasPrefix(run.LastDeliveryError.String, db.UploadOutcomeUncertainPrefix) {
		return c.DB.SetDeliveryError(ctx, run.RunID, "")
	}
	return nil
}
