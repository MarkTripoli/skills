package assistant

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/oklog/ulid/v2"
	"github.com/slack-go/slack/slackevents"

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
