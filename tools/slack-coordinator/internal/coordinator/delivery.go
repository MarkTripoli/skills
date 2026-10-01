package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// DeliveryError is a failed Slack post, edit, or reaction. The IPC layer maps it to
// ipc.ErrUnavailable and the CLI to exit 11, so agents pause instead of
// treating the refusal as bad input.
type DeliveryError struct {
	Err error
}

func (e *DeliveryError) Error() string { return "slack delivery failed: " + e.Err.Error() }
func (e *DeliveryError) Unwrap() error { return e.Err }

func (c *Coordinator) updateStatusCard(ctx context.Context, run db.Run, event WorkEvent) error {
	root, err := rootMessage(run)
	if err != nil {
		return err
	}
	if run.StatusMessageTS.Valid && run.StatusMessageTS.String != "" {
		return c.updateMessage(ctx, run, run.StatusMessageTS.String, BuildProgressMessage(root, event))
	}
	if !run.RootMessage.Valid {
		return c.post(ctx, run, buildLegacyMessage("Run update", legacyStatusFields(event), RenderLegacyStatus(event)))
	}
	// Runs with persisted roots keep their pre-upgrade root-edit behavior.
	return c.updateMessage(ctx, run, run.ThreadTS, BuildRunRoot(root, &event, nil, ""))
}

func (c *Coordinator) updateCompletionCard(ctx context.Context, run db.Run, in FinishRunInput, finishedAt string) error {
	root, err := rootMessage(run)
	if err != nil {
		return err
	}
	if run.StatusMessageTS.Valid && run.StatusMessageTS.String != "" {
		return c.updateMessage(ctx, run, run.StatusMessageTS.String, BuildCompletionMessage(root, in))
	}
	if !run.RootMessage.Valid {
		fields := legacyCompletionFields(in, finishedAt)
		return c.post(ctx, run, buildLegacyMessage("Run finished", fields, strings.Join(fields, "\n")))
	}
	// Preserve root-edit behavior for active runs upgraded before card support.
	return c.updateMessage(ctx, run, run.ThreadTS, BuildRunRoot(root, nil, &in, finishedAt))
}

func rootMessage(run db.Run) (RootMessage, error) {
	root := RootMessage{Work: "Run"}
	if run.RootMessage.Valid {
		if err := json.Unmarshal([]byte(run.RootMessage.String), &root); err != nil {
			return RootMessage{}, fmt.Errorf("decode root message: %w", err)
		}
	}
	return root, nil
}

func (c *Coordinator) updateMessage(ctx context.Context, run db.Run, messageTS string, message SlackMessage) error {
	if err := c.Slack.UpdateBlocksMessage(ctx, run.ChannelID, messageTS, message.Text, message.Blocks); err != nil {
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

// post sends one message in run's thread and records the outcome: a failure
// becomes the run's last_delivery_error until a later delivery succeeds.
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
