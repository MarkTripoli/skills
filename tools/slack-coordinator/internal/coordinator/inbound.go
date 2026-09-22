package coordinator

import (
	"context"

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
