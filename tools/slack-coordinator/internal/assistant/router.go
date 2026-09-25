package assistant

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// refusalText answers the first DM from anyone but the owner; %s is the
// owner's Slack user id.
const refusalText = "This assistant only takes instructions from the member named by slack.owner_user_id (<@%s>). That is a member ID, not the person who created the Slack app."

// ConsumeInbound persists owner input for an active run before acknowledging
// its envelope. Other events retain the existing ack-before-routing behavior.
func (s *Service) ConsumeInbound(ctx context.Context, events <-chan socketmode.Event, ack coordinator.Acker) {
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-events:
			if !ok {
				return
			}
			msg, matched, err := s.activeRunInput(ctx, evt)
			if err != nil {
				slog.Error("run thread lookup failed", "error", err)
				continue
			}
			if matched {
				if err := s.Coord.RecordOwnerInput(ctx, msg); err != nil {
					slog.Error("owner input not recorded", "error", err)
					continue
				}
				if evt.Request != nil && ack != nil {
					ack.Ack(*evt.Request)
				}
				if appMention(evt) == nil && (msg.Channel[0] == 'C' || msg.Channel[0] == 'G') {
					if err := s.collect(ctx, msg); err != nil {
						slog.Error("run thread message not collected", "error", err)
					}
				}
				continue
			}
			if msg := userMessage(evt); msg != nil && msg.User == s.Owner && msg.ThreadTimeStamp == "" &&
				len(msg.Channel) > 0 && msg.Channel[0] == 'D' && isToRun(msg.Text) {
				if err := s.toRun(ctx, msg); err != nil {
					slog.Error("directed owner input not recorded", "error", err)
					continue
				}
				if evt.Request != nil && ack != nil {
					ack.Ack(*evt.Request)
				}
				continue
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

// userMention matches one Slack user mention, including an optional |label.
var userMention = regexp.MustCompile(`<@[UW][A-Z0-9]+(?:\|[^>\n]*)?>`)

// route dispatches evt by the channel its message arrived in. An app_mention
// goes to routeMention. A direct message goes to routeDM. A public or private
// channel message records run-thread steering, continues an assistant request
// when the thread is one, and is collected for watches. Subtyped and bot
// messages are dropped before routing.
func (s *Service) route(ctx context.Context, evt socketmode.Event) error {
	if mention := appMention(evt); mention != nil {
		return s.routeMention(ctx, mention)
	}
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
			run, found, err := s.DB.ActiveRunByThread(ctx, msg.Channel, msg.ThreadTimeStamp)
			if err != nil {
				return err
			}
			if found && msg.User == run.OwnerUserID {
				recorded = s.Coord.RecordOwnerInput(ctx, msg)
			} else if !found && msg.User == s.Owner {
				finished, exists, err := s.DB.RunByThread(ctx, msg.Channel, msg.ThreadTimeStamp)
				if err != nil {
					return err
				}
				if exists && finished.Lifecycle != "active" {
					recorded = s.terminalNotice(ctx, msg, finished.RunID)
				} else if msg.TimeStamp != msg.ThreadTimeStamp {
					recorded = s.followUpIfRequest(ctx, msg)
				}
			}
		}
		return errors.Join(recorded, s.collect(ctx, msg))
	default:
		return nil
	}
}

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

// routeMention handles an @mention of this bot. Only the configured owner can
// start work, and only in a public or private channel; every other sender is
// ignored with no reply and no run. A mention in an active coordinator run
// is steering. A mention in an existing assistant thread is a follow-up.
// Anything else opens a request, with the acknowledgement posted in that
// thread. `!` commands are not recognized here; they stay direct-message-only.
func (s *Service) routeMention(ctx context.Context, ev *slackevents.AppMentionEvent) error {
	if ev.User != s.Owner {
		return nil
	}
	if ev.Channel[0] != 'C' && ev.Channel[0] != 'G' {
		return nil
	}
	text := stripBotMention(ev.Text)
	if text == "" {
		return nil
	}
	msg := &slackevents.MessageEvent{
		Type:            "message",
		User:            ev.User,
		Text:            text,
		TimeStamp:       ev.TimeStamp,
		ThreadTimeStamp: ev.ThreadTimeStamp,
		Channel:         ev.Channel,
	}
	if ev.ThreadTimeStamp == "" {
		return s.newRequest(ctx, msg)
	}
	run, found, err := s.DB.ActiveRunByThread(ctx, ev.Channel, ev.ThreadTimeStamp)
	if err != nil {
		return err
	}
	if found && run.OwnerUserID == ev.User {
		return s.Coord.RecordOwnerInput(ctx, msg)
	}
	finished, exists, err := s.DB.RunByThread(ctx, ev.Channel, ev.ThreadTimeStamp)
	if err != nil {
		return err
	}
	if exists && finished.Lifecycle != "active" {
		return s.terminalNotice(ctx, msg, finished.RunID)
	}
	req, ok, err := s.DB.GetDMRequest(ctx, ev.ThreadTimeStamp)
	if err != nil {
		return err
	}
	if ok && req.ChannelID == ev.Channel {
		stored, err := s.DB.HasDMMessage(ctx, req.RootTS, ev.TimeStamp)
		if err != nil || stored {
			return err
		}
		return s.followUp(ctx, msg)
	}
	return s.newRequest(ctx, msg)
}

// followUpIfRequest records an owner channel reply whose thread is already an
// assistant request in that channel. A thread that is not a request, or a
// message the app_mention path already stored, is left alone.
func (s *Service) followUpIfRequest(ctx context.Context, msg *slackevents.MessageEvent) error {
	req, ok, err := s.DB.GetDMRequest(ctx, msg.ThreadTimeStamp)
	if err != nil || !ok || req.ChannelID != msg.Channel {
		return err
	}
	stored, err := s.DB.HasDMMessage(ctx, req.RootTS, msg.TimeStamp)
	if err != nil || stored {
		return err
	}
	return s.followUp(ctx, msg)
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

// routeDM handles a message in a direct-message channel. A sender other than
// the owner is refused once (see refuse). From the owner, a top-level DM
// starting with `!` is answered by its verb; while a setup verification is
// pending, the DM that answers it (see resolveVerify) is consumed without a
// row; any other top-level DM opens a request, and a reply under a request
// root is recorded as a follow-up. Every other DM, including a `!` reply in a
// thread, is dropped.
func (s *Service) routeDM(ctx context.Context, msg *slackevents.MessageEvent) error {
	if msg.User != s.Owner {
		return s.refuse(ctx, msg)
	}
	if msg.ThreadTimeStamp != "" {
		run, found, err := s.DB.ActiveRunByThread(ctx, msg.Channel, msg.ThreadTimeStamp)
		if err != nil {
			return err
		}
		if found && run.OwnerUserID == msg.User {
			return s.Coord.RecordOwnerInput(ctx, msg)
		}
		finished, exists, err := s.DB.RunByThread(ctx, msg.Channel, msg.ThreadTimeStamp)
		if err != nil {
			return err
		}
		if exists && finished.Lifecycle != "active" {
			return s.terminalNotice(ctx, msg, finished.RunID)
		}
	}
	text := strings.TrimSpace(msg.Text)
	switch {
	case strings.HasPrefix(text, "!"):
		if msg.ThreadTimeStamp != "" {
			return nil
		}
		fields := strings.Fields(text)
		if len(fields) > 0 && strings.EqualFold(fields[0], "!to") {
			return s.toRun(ctx, msg)
		}
		return s.runVerb(ctx, msg.Channel, text)
	case s.resolveVerify(msg):
		return nil
	case msg.ThreadTimeStamp == "":
		return s.newRequest(ctx, msg)
	default:
		return s.followUp(ctx, msg)
	}
}

func (s *Service) terminalNotice(ctx context.Context, msg *slackevents.MessageEvent, runID string) error {
	inserted, err := s.DB.RecordTerminalNotice(ctx, runID, msg.TimeStamp)
	if err != nil || !inserted {
		return err
	}
	text := "This run has already finished; this message was not applied."
	_, err = s.Slack.PostMessage(ctx, msg.Channel, msg.ThreadTimeStamp, text)
	return err
}

// activeRunInput routes an owner message or app_mention in an active coding run's
// thread to the run owner. Other events are left for normal routing.
func (s *Service) activeRunInput(ctx context.Context, evt socketmode.Event) (*slackevents.MessageEvent, bool, error) {
	msg := userMessage(evt)
	if mention := appMention(evt); mention != nil {
		// routeMention stores the text after removing the bot mention; use the
		// same normalization on the pre-ack path.
		text := stripBotMention(mention.Text)
		if text == "" || mention.ThreadTimeStamp == "" || (mention.Channel == "" || mention.Channel[0] != 'C' && mention.Channel[0] != 'G') {
			return nil, false, nil
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
		return nil, false, nil
	}
	run, found, err := s.DB.ActiveRunByThread(ctx, msg.Channel, msg.ThreadTimeStamp)
	if err != nil || !found || msg.User != run.OwnerUserID {
		return msg, false, err
	}
	return msg, true, nil
}

// isToRun recognizes a !to command while ignoring case in its command token.
func isToRun(text string) bool {
	fields := strings.Fields(text)
	return len(fields) > 0 && strings.EqualFold(fields[0], "!to")
}

// toRun records owner-directed input in the named active run's thread. The
// message remains attributed to its original Slack DM timestamp, while the
// coordinator receives the run's channel/thread identity.
func (s *Service) toRun(ctx context.Context, msg *slackevents.MessageEvent) error {
	fields := strings.Fields(msg.Text)
	if len(fields) < 3 {
		_, err := s.Slack.PostMessage(ctx, msg.Channel, "", "Usage: !to <run-id> <message>")
		return err
	}
	runID := fields[1]
	run, err := s.DB.GetRun(ctx, runID)
	if errors.Is(err, db.ErrRunNotFound) {
		_, postErr := s.Slack.PostMessage(ctx, msg.Channel, "", "No active run found for "+runID+".")
		return postErr
	}
	if err != nil {
		return err
	}
	if run.Lifecycle != "active" || run.OwnerUserID != msg.User {
		_, err := s.Slack.PostMessage(ctx, msg.Channel, "", "That run is not active or is not yours.")
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
	if err := s.Coord.RecordOwnerInput(ctx, input); err != nil {
		return err
	}
	_, err = s.Slack.PostMessage(ctx, msg.Channel, "", "Sent input to run "+runID+".")
	return err
}

// refuse answers a DM from anyone but the owner only once. A failed post
// keeps the refused_users row so the sender is not told repeatedly.
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

// collect stores channel messages once and binds them to each active task
// watching the channel. New each_message bindings restart the debounce window.
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
		for _, task := range tasks {
			bound, err := tx.BindMessageToTask(ctx, task.TaskID, msg.Channel, msg.TimeStamp)
			if err != nil {
				return err
			}
			if !bound || task.Trigger != db.TriggerEachMessage {
				continue
			}
			due := now.Add(time.Duration(task.DebounceSeconds.Int64) * time.Second)
			if err := tx.SetTaskDue(ctx, task.TaskID, stamp(due)); err != nil {
				return err
			}
		}
		return nil
	})
}
