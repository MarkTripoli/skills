package assistant

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// refusalText answers the first DM from anyone but the owner; %s is the
// owner's Slack user id.
const refusalText = "This assistant only takes instructions from its owner, <@%s>."

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

// routeDM handles a message in a direct-message channel. A sender other than
// the owner is refused once (see refuse). From the owner, a top-level DM
// starting with `!` is answered by its verb, any other top-level DM opens a
// request, and a reply under a request root is recorded as a follow-up. Every
// other DM, including a `!` reply in a thread, is dropped.
func (s *Service) routeDM(ctx context.Context, msg *slackevents.MessageEvent) error {
	if msg.User != s.Owner {
		return s.refuse(ctx, msg)
	}
	text := strings.TrimSpace(msg.Text)
	switch {
	case strings.HasPrefix(text, "!"):
		if msg.ThreadTimeStamp != "" {
			return nil
		}
		return s.runVerb(ctx, msg.Channel, text)
	case msg.ThreadTimeStamp == "":
		return s.newRequest(ctx, msg)
	default:
		return s.followUp(ctx, msg)
	}
}

// refuse answers a DM from anyone but the owner: the sender's first DM stores
// a refused_users row and posts the refusal at the top level of that DM; every
// later DM from a stored sender is dropped without a post. A failed post is
// logged and keeps the row, so the sender is never told twice.
func (s *Service) refuse(ctx context.Context, msg *slackevents.MessageEvent) error {
	inserted, err := s.DB.InsertRefusedUser(ctx, msg.User, stamp(s.Now()))
	if err != nil || !inserted {
		return err
	}
	if _, err := s.Slack.PostMessage(ctx, msg.Channel, "", fmt.Sprintf(refusalText, s.Owner)); err != nil {
		slog.Error("refusal not posted", "user", msg.User, "channel", msg.Channel, "error", err)
	}
	return nil
}

// collect records a public or private channel message, top level or thread
// reply and from any user, for the active tasks watching its channel. The
// message is stored once with its permalink and bound unconsumed to every
// watching task in one transaction; each each_message task whose binding is
// new has its window closed at now + debounce_seconds. A channel no active
// task watches costs one query and no Slack call, and a redelivered envelope
// changes no row and moves no due_at.
func (s *Service) collect(ctx context.Context, msg *slackevents.MessageEvent) error {
	tasks, err := s.DB.WatchingTasks(ctx, msg.Channel)
	if err != nil || len(tasks) == 0 {
		return err
	}
	permalink, err := s.Slack.Permalink(ctx, msg.Channel, msg.TimeStamp)
	if err != nil {
		return err
	}
	now := s.Now()
	return s.DB.Transact(ctx, func(tx *db.DB) error {
		if err := tx.InsertCollectedMessage(ctx, db.CollectedMessage{
			ChannelID:  msg.Channel,
			TS:         msg.TimeStamp,
			ThreadTS:   sql.NullString{String: msg.ThreadTimeStamp, Valid: msg.ThreadTimeStamp != ""},
			UserID:     msg.User,
			Text:       msg.Text,
			Permalink:  permalink,
			ReceivedAt: stamp(now),
		}); err != nil {
			return err
		}
		for _, t := range tasks {
			bound, err := tx.BindMessageToTask(ctx, t.TaskID, msg.Channel, msg.TimeStamp)
			if err != nil {
				return err
			}
			if !bound || t.Trigger != db.TriggerEachMessage {
				continue
			}
			due := now.Add(time.Duration(t.DebounceSeconds.Int64) * time.Second)
			if err := tx.SetTaskDue(ctx, t.TaskID, stamp(due)); err != nil {
				return err
			}
		}
		return nil
	})
}
