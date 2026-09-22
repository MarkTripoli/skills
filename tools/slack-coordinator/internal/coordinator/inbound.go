package coordinator

import (
	"context"
	"log/slog"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// Acker acknowledges a Socket Mode envelope so Slack does not redeliver it.
type Acker interface {
	Ack(req socketmode.Request)
}

// ConsumeInbound reads Socket Mode envelopes until events closes or ctx ends.
// Every envelope carrying a Request is acked first; a nil ack drops the acks
// (tests). Only an Events API message that is a thread reply from the run
// owner, with no subtype and no bot_id, in an active run's thread becomes a
// pending owner input. Everything else is dropped without a row.
func (c *Coordinator) ConsumeInbound(ctx context.Context, events <-chan socketmode.Event, ack Acker) {
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-events:
			if !ok {
				return
			}
			if evt.Request != nil && ack != nil {
				ack.Ack(*evt.Request)
			}
			if err := c.recordInbound(ctx, evt); err != nil {
				slog.Error("owner input not recorded", "error", err)
			}
		}
	}
}

// ownerReply extracts the thread reply from evt, or nil when evt is not a plain
// user message posted in a thread.
func ownerReply(evt socketmode.Event) *slackevents.MessageEvent {
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
	if msg.ThreadTimeStamp == "" || msg.SubType != "" || msg.BotID != "" {
		return nil
	}
	return msg
}

// recordInbound stores evt as a pending owner input when it is the owner's
// reply in an active run's thread.
func (c *Coordinator) recordInbound(ctx context.Context, evt socketmode.Event) error {
	msg := ownerReply(evt)
	if msg == nil {
		return nil
	}
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
