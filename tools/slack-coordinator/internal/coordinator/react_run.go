package coordinator

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// ErrRunSlackDisabled refuses a reaction without contacting Slack.
var ErrRunSlackDisabled = errors.New("slack disabled for this run")

// emojiName accepts a Slack emoji name with or without surrounding colons.
func emojiName(value string) (string, error) {
	name := strings.Trim(strings.TrimSpace(value), ":")
	if name == "" {
		return "", errors.New("emoji name is required")
	}
	return name, nil
}

// react adds one emoji to a run's root message; duplicate reactions are successful.
func (c *Coordinator) react(ctx context.Context, run db.Run, name string) error {
	err := c.Slack.AddReaction(ctx, run.ChannelID, run.ThreadTS, name)
	switch {
	case err == nil, err.Error() == "already_reacted":
		return nil
	case err.Error() == "invalid_name":
		return fmt.Errorf("emoji %q does not exist in the workspace: %w", name, err)
	default:
		return &DeliveryError{Err: fmt.Errorf("add reaction %q: %w", name, err)}
	}
}

// ReactRun marks the root message of an active or finished run.
func (c *Coordinator) ReactRun(ctx context.Context, in ReactRunInput) error {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()

	name, err := emojiName(in.Emoji)
	if err != nil {
		return err
	}
	run, err := c.DB.GetRun(ctx, in.RunID)
	if err != nil {
		return err
	}
	if run.SlackMode == db.SlackDisabled {
		return fmt.Errorf("%w: %s", ErrRunSlackDisabled, in.RunID)
	}
	return c.react(ctx, run, name)
}
