package coordinator

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// Acker acknowledges a Socket Mode envelope so Slack does not redeliver it.
type Acker interface {
	Ack(req socketmode.Request)
}

// RecordOwnerInput stores msg as a pending owner input when it is the run
// owner's reply in an active run's thread. Any other message, including a
// reply in an unknown thread or from another user, is dropped without a row.
func (c *Coordinator) RecordOwnerInput(ctx context.Context, msg *slackevents.MessageEvent) error {
	run, found, err := c.DB.ActiveRunByThread(ctx, msg.Channel, msg.ThreadTimeStamp)
	if err != nil {
		return err
	}
	if !found || msg.User != run.OwnerUserID {
		return nil
	}
	_, err = c.DB.InsertOwnerInput(ctx, db.OwnerInput{
		RunID:      run.RunID,
		MessageTS:  msg.TimeStamp,
		Text:       msg.Text,
		ReceivedAt: stamp(c.Now()),
	})
	return err
}

// ConsumeInbound records run-owner steering before acknowledging its envelope.
// Unrelated messages never start work; a finished run reply receives guidance.
func (c *Coordinator) ConsumeInbound(ctx context.Context, events <-chan socketmode.Event, ack Acker) {
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-events:
			if !ok {
				return
			}
			msg, run, err := c.activeRunInput(ctx, evt)
			if err != nil {
				slog.Error("run thread lookup failed", "error", err)
				continue
			}
			if run != nil {
				if err := c.RecordOwnerInput(ctx, msg); err != nil {
					slog.Error("owner input not recorded", "error", err)
					continue
				}
			} else if direct := userMessage(evt); direct != nil && direct.User == c.OwnerUserID && direct.ThreadTimeStamp == "" && strings.HasPrefix(direct.Channel, "D") && isToRun(direct.Text) {
				if err := c.toRun(ctx, direct); err != nil {
					slog.Error("directed owner input not recorded", "error", err)
					continue
				}
			}
			if evt.Request != nil && ack != nil {
				ack.Ack(*evt.Request)
			}
			if run != nil {
				if run.SlackMode == db.SlackEnabled {
					c.markReceived(ctx, msg)
				}
				continue
			}
			if direct := userMessage(evt); direct != nil && direct.User == c.OwnerUserID && direct.ThreadTimeStamp == "" && strings.HasPrefix(direct.Channel, "D") && strings.EqualFold(strings.TrimSpace(direct.Text), "!runs") {
				if err := c.listRuns(ctx, direct.Channel); err != nil {
					slog.Error("active runs not listed", "error", err)
				}
			}
			if msg == nil || msg.ThreadTimeStamp == "" {
				continue
			}
			finished, found, err := c.DB.RunByThread(ctx, msg.Channel, msg.ThreadTimeStamp)
			if err != nil {
				slog.Error("finished run lookup failed", "error", err)
			} else if found && finished.Lifecycle != "active" && finished.OwnerUserID == msg.User {
				if err := c.terminalNotice(ctx, msg, finished.RunID); err != nil {
					slog.Error("finished run notice failed", "error", err)
				}
			}
		}
	}
}

var userMention = regexp.MustCompile(`<@[UW][A-Z0-9]+(?:\|[^>\n]*)?>`)

// appMention returns the app_mention inside evt, or nil when evt is a different
// envelope, a bot mention, or an edit of an earlier mention.
func appMention(evt socketmode.Event) *slackevents.AppMentionEvent {
	if evt.Type != socketmode.EventTypeEventsAPI {
		return nil
	}
	outer, ok := evt.Data.(slackevents.EventsAPIEvent)
	if !ok {
		return nil
	}
	ev, ok := outer.InnerEvent.Data.(*slackevents.AppMentionEvent)
	if !ok || ev == nil || ev.BotID != "" || ev.Edited != nil || ev.User == "" || ev.Channel == "" || ev.TimeStamp == "" {
		return nil
	}
	return ev
}

// stripBotMention removes the first user mention and the extra space it
// leaves, so an owner @mention is stored as the instruction itself.
func stripBotMention(text string) string {
	loc := userMention.FindStringIndex(text)
	if loc == nil {
		return strings.TrimSpace(text)
	}
	left := strings.TrimRight(text[:loc[0]], " \t")
	right := strings.TrimLeft(text[loc[1]:], " \t")
	switch {
	case left == "":
		return strings.TrimSpace(right)
	case right == "":
		return strings.TrimSpace(left)
	default:
		return left + " " + right
	}
}

// userMessage extracts the Events API message from evt, or nil when evt is not
// a plain user message: another envelope type, malformed data, a subtyped
// message, or one posted by a bot.
func userMessage(evt socketmode.Event) *slackevents.MessageEvent {
	if evt.Type != socketmode.EventTypeEventsAPI {
		return nil
	}
	outer, ok := evt.Data.(slackevents.EventsAPIEvent)
	if !ok {
		return nil
	}
	msg, ok := outer.InnerEvent.Data.(*slackevents.MessageEvent)
	if !ok || msg == nil {
		return nil
	}
	if msg.SubType != "" || msg.BotID != "" {
		return nil
	}
	return msg
}

func (c *Coordinator) terminalNotice(ctx context.Context, msg *slackevents.MessageEvent, runID string) error {
	inserted, err := c.DB.RecordTerminalNotice(ctx, runID, msg.TimeStamp)
	if err != nil || !inserted {
		return err
	}
	text := "This run has already finished; this message was not applied."
	_, err = c.Slack.PostBlocksMessage(ctx, msg.Channel, msg.ThreadTimeStamp, text, nil)
	return err
}

// activeRunInput routes an owner message or app_mention in an active coordinator run's
// thread to the run owner. Other events are left for normal routing.
func (c *Coordinator) activeRunInput(ctx context.Context, evt socketmode.Event) (*slackevents.MessageEvent, *db.Run, error) {
	msg := userMessage(evt)
	if mention := appMention(evt); mention != nil {
		// Store the instruction without the bot mention.
		text := stripBotMention(mention.Text)
		if text == "" || mention.ThreadTimeStamp == "" || (mention.Channel == "" || mention.Channel[0] != 'C' && mention.Channel[0] != 'G') {
			return nil, nil, nil
		}
		msg = &slackevents.MessageEvent{
			Type:            "message",
			User:            mention.User,
			Text:            text,
			TimeStamp:       mention.TimeStamp,
			ThreadTimeStamp: mention.ThreadTimeStamp,
			Channel:         mention.Channel,
		}
	} else if msg == nil || msg.ThreadTimeStamp == "" || (msg.Channel == "" || msg.Channel[0] != 'C' && msg.Channel[0] != 'G' && msg.Channel[0] != 'D') {
		return nil, nil, nil
	}
	run, found, err := c.DB.ActiveRunByThread(ctx, msg.Channel, msg.ThreadTimeStamp)
	if err != nil || !found || msg.User != run.OwnerUserID {
		return msg, nil, err
	}
	return msg, &run, nil
}

// isToRun recognizes a !to command while ignoring case in its command token.
func isToRun(text string) bool {
	fields := strings.Fields(text)
	return len(fields) > 0 && strings.EqualFold(fields[0], "!to")
}

// toRun records owner-directed input in the named active run's thread. The
// message remains attributed to its original Slack DM timestamp, while the
// coordinator receives the run's channel/thread identity.
func (c *Coordinator) toRun(ctx context.Context, msg *slackevents.MessageEvent) error {
	fields := strings.Fields(msg.Text)
	if len(fields) < 3 {
		_, err := c.Slack.PostBlocksMessage(ctx, msg.Channel, "", "Usage: !to <run-id> <message>", nil)
		return err
	}
	runID := fields[1]
	run, err := c.DB.GetRun(ctx, runID)
	if errors.Is(err, db.ErrRunNotFound) {
		_, postErr := c.Slack.PostBlocksMessage(ctx, msg.Channel, "", "No active run found for "+runID+".", nil)
		return postErr
	}
	if err != nil {
		return err
	}
	if run.Lifecycle != "active" || run.SlackMode != db.SlackEnabled || run.OwnerUserID != msg.User {
		_, err := c.Slack.PostBlocksMessage(ctx, msg.Channel, "", "That run is not active or is not yours.", nil)
		return err
	}
	commandStart := strings.Index(msg.Text, fields[0])
	runStart := commandStart + len(fields[0])
	runOffset := strings.Index(msg.Text[runStart:], fields[1])
	messageStart := runStart + runOffset + len(fields[1])
	input := &slackevents.MessageEvent{
		Type:            "message",
		User:            msg.User,
		Text:            strings.TrimSpace(msg.Text[messageStart:]),
		TimeStamp:       msg.TimeStamp,
		ThreadTimeStamp: run.ThreadTS,
		Channel:         run.ChannelID,
	}
	if err := c.RecordOwnerInput(ctx, input); err != nil {
		return err
	}
	c.markReceived(ctx, msg)
	_, err = c.Slack.PostBlocksMessage(ctx, msg.Channel, "", "Sent input to run "+runID+".", nil)
	return err
}

// markReceived acknowledges durable owner input with an eyes reaction. A
// receipt failure never discards stored input or changes the run's write gate.
func (c *Coordinator) markReceived(ctx context.Context, msg *slackevents.MessageEvent) {
	if err := c.Slack.AddReaction(ctx, msg.Channel, msg.TimeStamp, "eyes"); err != nil && err.Error() != "already_reacted" {
		slog.Error("owner input receipt not marked", "channel", msg.Channel, "ts", msg.TimeStamp, "error", err)
	}
}

// listRuns reports active coordinator runs owned by the configured owner.
func (c *Coordinator) listRuns(ctx context.Context, channel string) error {
	runs, err := c.DB.ActiveRuns(ctx)
	if err != nil {
		return err
	}
	var lines []string
	for _, run := range runs {
		if run.OwnerUserID == c.OwnerUserID {
			lines = append(lines, fmt.Sprintf("%s · %s · started %s · %s", run.RunID, run.ChannelID, run.StartedAt, run.Permalink))
		}
	}
	text := strings.Join(lines, "\n")
	if text == "" {
		text = "No active runs."
	}
	_, err = c.Slack.PostBlocksMessage(ctx, channel, "", text, nil)
	return err
}
