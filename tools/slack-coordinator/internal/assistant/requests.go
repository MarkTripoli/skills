package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/slack-go/slack/slackevents"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// noAgentReply answers a DM request when config.yaml configures no agent.
const noAgentReply = "No agent is configured; set agent.command in config.yaml"

// maxRunningRuns is how many assistant runs execute at once; a request that
// arrives with that many running is acknowledged as queued.
const maxRunningRuns = 3

// newRequest records the owner's top-level DM msg as a request with one queued
// run, then acknowledges it in the message's thread: an `eyes` reaction plus
// `Working on it` or `Queued behind <n>`. A redelivered envelope, whose root
// is already stored, changes nothing and posts nothing. Without a configured
// agent the DM is refused in its thread and no row is written.
func (s *Service) newRequest(ctx context.Context, msg *slackevents.MessageEvent) error {
	if s.Agent == nil {
		_, err := s.Slack.PostMessage(ctx, msg.Channel, msg.TimeStamp, noAgentReply)
		return err
	}
	now := stamp(s.Now())
	rootTS := msg.TimeStamp
	inserted := false
	err := s.DB.Transact(ctx, func(tx *db.DB) error {
		var err error
		inserted, err = tx.InsertDMRequest(ctx, db.DMRequest{RootTS: rootTS, ChannelID: msg.Channel, ReceivedAt: now, LastMessageAt: now})
		if err != nil || !inserted {
			return err
		}
		if err := tx.InsertDMMessage(ctx, db.DMMessage{RootTS: rootTS, TS: rootTS, Author: db.AuthorOwner, Text: msg.Text}); err != nil {
			return err
		}
		return tx.InsertAssistantRun(ctx, db.AssistantRun{
			RunID:    ulid.Make().String(),
			Kind:     db.RunKindDM,
			RootTS:   sql.NullString{String: rootTS, Valid: true},
			State:    db.RunQueued,
			QueuedAt: now,
		})
	})
	if err != nil || !inserted {
		return err
	}
	// The run is queued whatever Slack does next; the runner must hear of it.
	defer s.signalWake()

	reacted := s.Slack.AddReaction(ctx, msg.Channel, rootTS, "eyes")
	ack, err := s.ackText(ctx, now)
	if err != nil {
		return errors.Join(reacted, err)
	}
	ackTS, err := s.Slack.PostMessage(ctx, msg.Channel, rootTS, ack)
	if err != nil {
		return errors.Join(reacted, err)
	}
	err = s.DB.Transact(ctx, func(tx *db.DB) error {
		if err := tx.SetAckTS(ctx, rootTS, ackTS); err != nil {
			return err
		}
		return tx.InsertDMMessage(ctx, db.DMMessage{RootTS: rootTS, TS: ackTS, Author: db.AuthorBot, Text: ack})
	})
	return errors.Join(reacted, err)
}

// ackText is the acknowledgement for a run queued at queuedAt: `Working on it`
// when a slot is free and nothing was queued earlier, else `Queued behind <n>`
// with the count of earlier queued runs.
func (s *Service) ackText(ctx context.Context, queuedAt string) (string, error) {
	running, err := s.DB.CountRunsByState(ctx, db.RunRunning)
	if err != nil {
		return "", err
	}
	ahead, err := s.DB.CountQueuedBefore(ctx, queuedAt)
	if err != nil {
		return "", err
	}
	if running < maxRunningRuns && ahead == 0 {
		return "Working on it", nil
	}
	return fmt.Sprintf("Queued behind %d", ahead), nil
}

// followUp records the owner's reply msg under a request root as a pending
// follow-up (run_id NULL) and moves the request's last_message_at. If no run
// for the thread is queued or running, a new queued run is inserted, the
// runner is woken, and a "Working on it" ack is posted and stored. If a run
// is already active, the message is coalesced into the next run. A reply
// under a thread that is not a request is dropped.
func (s *Service) followUp(ctx context.Context, msg *slackevents.MessageEvent) error {
	if s.Agent == nil {
		return nil
	}
	req, ok, err := s.DB.GetDMRequest(ctx, msg.ThreadTimeStamp)
	if err != nil || !ok {
		return err
	}

	// Before recording a normal follow-up, check whether this message
	// confirms (or refuses) a pending proposal.
	if handled, err := s.confirmProposal(ctx, req, msg); handled || err != nil {
		return err
	}
	now := stamp(s.Now())
	rootTS := msg.ThreadTimeStamp

	var newRunID string
	err = s.DB.Transact(ctx, func(tx *db.DB) error {
		if err := tx.InsertDMMessage(ctx, db.DMMessage{RootTS: rootTS, TS: msg.TimeStamp, Author: db.AuthorOwner, Text: msg.Text}); err != nil {
			return err
		}
		if err := tx.TouchDMRequest(ctx, rootTS, now); err != nil {
			return err
		}
		active, err := tx.HasActiveRunForRoot(ctx, rootTS)
		if err != nil {
			return err
		}
		if active {
			return nil
		}
		newRunID = ulid.Make().String()
		return tx.InsertAssistantRun(ctx, db.AssistantRun{
			RunID:    newRunID,
			Kind:     db.RunKindDM,
			RootTS:   sql.NullString{String: rootTS, Valid: true},
			State:    db.RunQueued,
			QueuedAt: now,
		})
	})
	if err != nil || newRunID == "" {
		return err
	}
	defer s.signalWake()

	ackTS, err := s.Slack.PostMessage(ctx, req.ChannelID, rootTS, workingAck)
	if err != nil {
		return err
	}
	return s.DB.Transact(ctx, func(tx *db.DB) error {
		if err := tx.SetAckTS(ctx, rootTS, ackTS); err != nil {
			return err
		}
		return tx.InsertDMMessage(ctx, db.DMMessage{RootTS: rootTS, TS: ackTS, Author: db.AuthorBot, Text: workingAck})
	})
}

// confirmWords is the set of normalized texts that confirm a pending proposal.
var confirmWords = map[string]bool{
	"yes": true, "y": true, "confirm": true, "confirmed": true,
	"ok": true, "okay": true, "go": true, "do it": true,
	"👍": true, ":+1:": true,
}

// isConfirmText reports whether text, after lowercasing, trimming space, and
// stripping trailing punctuation, is a confirm word.
func isConfirmText(text string) bool {
	t := strings.ToLower(strings.TrimSpace(text))
	t = strings.TrimRight(t, ".!,")
	return confirmWords[t]
}

// confirmProposal checks whether msg is a confirm reply for a pending proposal
// on req and handles it. Returns handled=true when the message was consumed
// (either recorded or refused with an invite), so the caller must not enqueue
// a normal follow-up.
func (s *Service) confirmProposal(ctx context.Context, req db.DMRequest, msg *slackevents.MessageEvent) (bool, error) {
	if !req.PendingProposal.Valid || req.PendingProposal.String == "" {
		return false, nil
	}
	if !isConfirmText(msg.Text) {
		return false, nil
	}

	var p pendingProposal
	if err := json.Unmarshal([]byte(req.PendingProposal.String), &p); err != nil {
		return false, fmt.Errorf("parse pending proposal: %w", err)
	}

	runID := sql.NullString{String: p.RunID, Valid: p.RunID != ""}
	rootTS := msg.ThreadTimeStamp
	now := stamp(s.Now())

	if !p.Confirmable {
		// Build invite reply listing unresolved channels.
		var names []string
		for _, n := range p.Unresolved {
			names = append(names, "#"+n)
		}
		reply := "Invite the bot to " + strings.Join(names, ", ") + ", then ask again."

		replyTS, err := s.Slack.PostMessage(ctx, req.ChannelID, rootTS, reply)
		if err != nil {
			return true, err
		}
		return true, s.DB.Transact(ctx, func(tx *db.DB) error {
			if err := tx.InsertDMMessage(ctx, db.DMMessage{
				RootTS: rootTS, TS: msg.TimeStamp, Author: db.AuthorOwner, Text: msg.Text, RunID: runID,
			}); err != nil {
				return err
			}
			if err := tx.TouchDMRequest(ctx, rootTS, now); err != nil {
				return err
			}
			return tx.InsertDMMessage(ctx, db.DMMessage{
				RootTS: rootTS, TS: replyTS, Author: db.AuthorBot, Text: reply, RunID: runID,
			})
		})
	}

	// Build schedule JSON and due_at from the proposal trigger.
	schedJSON, dueAt, err := proposalSchedule(p.Proposal.Trigger, s.Now())
	if err != nil {
		return true, fmt.Errorf("confirm proposal: %w", err)
	}

	deliverToJSON, err := json.Marshal(p.Proposal.DeliverTo)
	if err != nil {
		return true, fmt.Errorf("confirm proposal marshal deliver_to: %w", err)
	}

	debounce := sql.NullInt64{}
	if p.Proposal.Trigger.Kind == agent.TriggerEachMessage {
		d := int64(p.Proposal.Trigger.DebounceSeconds)
		if d == 0 {
			d = 300
		}
		debounce = sql.NullInt64{Int64: d, Valid: true}
	}

	var taskID int64
	err = s.DB.Transact(ctx, func(tx *db.DB) error {
		var err error
		taskID, err = tx.InsertTask(ctx, db.InsertTaskInput{
			State:           db.TaskActive,
			Instruction:     p.Proposal.Instruction,
			Trigger:         p.Proposal.Trigger.Kind,
			Schedule:        schedJSON,
			DebounceSeconds: debounce,
			DeliverTo:       string(deliverToJSON),
			RequestRootTS:   rootTS,
			CreatedAt:       now,
			DueAt:           dueAt,
		})
		if err != nil {
			return err
		}
		if err := tx.InsertTaskChannels(ctx, taskID, p.Proposal.Watch); err != nil {
			return err
		}
		if err := tx.ClearPendingProposal(ctx, rootTS); err != nil {
			return err
		}
		if err := tx.InsertDMMessage(ctx, db.DMMessage{
			RootTS: rootTS, TS: msg.TimeStamp, Author: db.AuthorOwner, Text: msg.Text, RunID: runID,
		}); err != nil {
			return err
		}
		return tx.TouchDMRequest(ctx, rootTS, now)
	})
	if err != nil {
		return true, err
	}

	reply := proposalRecordedText(taskID, p.Proposal.Trigger, dueAt)
	replyTS, err := s.Slack.PostMessage(ctx, req.ChannelID, rootTS, reply)
	if err != nil {
		return true, err
	}
	return true, s.DB.InsertDMMessage(ctx, db.DMMessage{
		RootTS: rootTS, TS: replyTS, Author: db.AuthorBot, Text: reply, RunID: runID,
	})
}

// proposalSchedule builds the schedule JSON (NullString) and due_at
// (NullString) for a new task from the proposal trigger and the current time.
func proposalSchedule(t agent.Trigger, now time.Time) (sql.NullString, sql.NullString, error) {
	switch t.Kind {
	case agent.TriggerSchedule:
		var raw []byte
		var err error
		if t.Daily != "" {
			type daily struct {
				Daily string `json:"daily"`
				TZ    string `json:"tz,omitempty"`
			}
			raw, err = json.Marshal(daily{Daily: t.Daily, TZ: t.TZ})
		} else if t.EveryHours > 0 {
			type every struct {
				EveryHours int `json:"every_hours"`
			}
			raw, err = json.Marshal(every{EveryHours: t.EveryHours})
		} else {
			return sql.NullString{}, sql.NullString{}, fmt.Errorf("schedule trigger with no daily or every_hours")
		}
		if err != nil {
			return sql.NullString{}, sql.NullString{}, err
		}
		schedJSON := sql.NullString{String: string(raw), Valid: true}
		next, err := NextDue(string(raw), now)
		if err != nil {
			return sql.NullString{}, sql.NullString{}, fmt.Errorf("next due: %w", err)
		}
		dueAt := sql.NullString{String: next.UTC().Format(time.RFC3339), Valid: true}
		return schedJSON, dueAt, nil

	case agent.TriggerWindowEnd:
		type atJ struct {
			At string `json:"at"`
		}
		raw, err := json.Marshal(atJ{At: t.At})
		if err != nil {
			return sql.NullString{}, sql.NullString{}, err
		}
		schedJSON := sql.NullString{String: string(raw), Valid: true}
		dueAt := sql.NullString{String: t.At, Valid: t.At != ""}
		return schedJSON, dueAt, nil

	case agent.TriggerEachMessage:
		return sql.NullString{}, sql.NullString{}, nil

	default:
		return sql.NullString{}, sql.NullString{}, fmt.Errorf("unknown trigger kind %q", t.Kind)
	}
}

// proposalRecordedText builds the confirmation reply for a recorded task.
func proposalRecordedText(taskID int64, t agent.Trigger, dueAt sql.NullString) string {
	if t.Kind == agent.TriggerEachMessage {
		return fmt.Sprintf("Recorded as t%d · waiting for messages", taskID)
	}
	due := dueAt.String
	if t.TZ != "" && due != "" {
		loc, err := time.LoadLocation(t.TZ)
		if err == nil {
			at, err := time.Parse(time.RFC3339, due)
			if err == nil {
				due = at.In(loc).Format(time.RFC3339)
			}
		}
	}
	return fmt.Sprintf("Recorded as t%d · next due %s", taskID, due)
}
