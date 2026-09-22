package coordinator

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// Poster is the Slack surface the use cases need.
type Poster interface {
	PostMessage(ctx context.Context, channelID, threadTS, mrkdwn string) (string, error)
	Permalink(ctx context.Context, channelID, ts string) (string, error)
}

// Coordinator runs the use cases against the daemon's database and Slack client.
type Coordinator struct {
	DB    *db.DB
	Slack Poster
	Now   func() time.Time
}

// StartRun posts the root message and stores the run as active. A duplicate
// run_id is refused before anything is posted.
func (c *Coordinator) StartRun(ctx context.Context, in StartRunInput) (SlackRunRef, error) {
	switch {
	case in.RunID == "":
		return SlackRunRef{}, errors.New("run_id is required")
	case in.OwnerUserID == "":
		return SlackRunRef{}, errors.New("owner_user_id is required")
	case in.ChannelID == "":
		return SlackRunRef{}, errors.New("channel_id is required")
	}
	if _, err := c.DB.GetRun(ctx, in.RunID); err == nil {
		return SlackRunRef{}, fmt.Errorf("run %s already exists", in.RunID)
	} else if !errors.Is(err, db.ErrRunNotFound) {
		return SlackRunRef{}, err
	}

	startedAt := c.Now().UTC().Format(time.RFC3339)
	text := RenderRoot(RootMessage{
		Work:        in.Work,
		Goal:        in.Goal,
		Scope:       in.Scope,
		OwnerUserID: in.OwnerUserID,
		Links:       in.Links,
		StartedAt:   startedAt,
	})
	ts, err := c.Slack.PostMessage(ctx, in.ChannelID, "", text)
	if err != nil {
		return SlackRunRef{}, fmt.Errorf("post root message: %w", err)
	}
	permalink, err := c.Slack.Permalink(ctx, in.ChannelID, ts)
	if err != nil {
		return SlackRunRef{}, fmt.Errorf("get permalink: %w", err)
	}
	if err := c.DB.InsertRun(ctx, db.Run{
		RunID:       in.RunID,
		OwnerUserID: in.OwnerUserID,
		ChannelID:   in.ChannelID,
		ThreadTS:    ts,
		Permalink:   permalink,
		Lifecycle:   "active",
		SlackMode:   "enabled",
		StartedAt:   startedAt,
	}); err != nil {
		return SlackRunRef{}, err
	}
	return SlackRunRef{RunID: in.RunID, ChannelID: in.ChannelID, ThreadTS: ts, Permalink: permalink}, nil
}
