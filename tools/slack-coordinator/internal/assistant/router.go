package assistant

import (
	"context"
	"errors"
	"log/slog"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
)

// ConsumeInbound reads Socket Mode envelopes until events closes or ctx ends.
// Every envelope carrying a Request is acked first; a nil ack drops the acks
// (tests). Each Events API message is then routed by channel; an envelope that
// is not a plain user message is dropped without a row.
func (s *Service) ConsumeInbound(ctx context.Context, events <-chan socketmode.Event, ack coordinator.Acker) {
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
			if err := s.route(ctx, evt); err != nil {
				slog.Error("inbound not recorded", "error", err)
			}
		}
	}
}

// route dispatches evt by the channel its message arrived in: DMs to routeDM,
// run-thread replies in public or private channels to the coordinator, and
// every public or private channel message to collect. Subtyped and bot
// messages are dropped before routing.
func (s *Service) route(ctx context.Context, evt socketmode.Event) error {
	msg := userMessage(evt)
	if msg == nil {
		return nil
	}
	switch {
	case msg.Channel == "":
		return nil
	case msg.Channel[0] == 'D':
		return s.routeDM(ctx, msg)
	case msg.Channel[0] == 'C', msg.Channel[0] == 'G':
		var recorded error
		if msg.ThreadTimeStamp != "" {
			recorded = s.Coord.RecordOwnerInput(ctx, msg)
		}
		return errors.Join(recorded, s.collect(ctx, msg))
	default:
		return nil
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

// routeDM handles a message in a direct-message channel. DMs are not yet
// consumed; every one is dropped.
func (s *Service) routeDM(context.Context, *slackevents.MessageEvent) error { return nil }

// collect records a public or private channel message for the tasks watching
// its channel. No task watches channels yet; every message is dropped.
func (s *Service) collect(context.Context, *slackevents.MessageEvent) error { return nil }
