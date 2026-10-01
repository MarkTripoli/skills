package coordinator

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/slack-go/slack"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// Poster is the Slack surface the use cases need.
type Poster interface {
	PostBlocksMessage(ctx context.Context, channelID, threadTS, fallback string, blocks []slack.Block) (string, error)
	UpdateBlocksMessage(ctx context.Context, channelID, ts, fallback string, blocks []slack.Block) error
	OpenConversation(ctx context.Context, userID string) (string, error)
	AddReaction(ctx context.Context, channelID, ts, name string) error
	Permalink(ctx context.Context, channelID, ts string) (string, error)
}

// Coordinator runs the use cases against the daemon's database and Slack client.
type Coordinator struct {
	statusMu sync.Mutex // serialize status writes, card edits, cadence changes, and finish
	DB       *db.DB
	Slack    Poster
	Content  ContentClient
	Now      func() time.Time
	// OwnerUserID is the configured owner (slack.owner_user_id) stamped on
	// every run this daemon opens; only that user's thread replies are input.
	OwnerUserID string
	// Health reports the Socket Mode connection state (a slackapi.Socket*
	// constant). Nil reads as not_started, so run check fails closed.
	Health func() string
	// Jira writes thread permalinks to issue fields. Nil when Jira is not
	// configured; StartRun then refuses a JiraIssue before posting.
	Jira BacklinkWriter
}

// stamp formats t as the RFC 3339 UTC string every timestamp column holds.
func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }

// StartRun posts the compact root and initial thread status card, then stores
// the run as active. A duplicate run_id is refused before anything is posted.
func (c *Coordinator) StartRun(ctx context.Context, in StartRunInput) (SlackRunRef, error) {
	switch {
	case in.RunID == "":
		return SlackRunRef{}, errors.New("run_id is required")
	case in.DM && in.ChannelID != "":
		return SlackRunRef{}, errors.New("dm and channel_id are mutually exclusive")
	case !in.DM && in.ChannelID == "":
		return SlackRunRef{}, errors.New("channel_id is required unless dm is true")
	case in.DM && in.JiraIssue != "":
		return SlackRunRef{}, errors.New("jira_issue cannot be used with dm")
	case in.JiraIssue != "" && c.Jira == nil:
		return SlackRunRef{}, errors.New("jira_issue given but jira is not configured")
	}
	if _, err := c.DB.GetRun(ctx, in.RunID); err == nil {
		return SlackRunRef{}, fmt.Errorf("run %s already exists", in.RunID)
	} else if !errors.Is(err, db.ErrRunNotFound) {
		return SlackRunRef{}, err
	}

	channelID := in.ChannelID
	if in.DM {
		var err error
		channelID, err = c.Slack.OpenConversation(ctx, c.OwnerUserID)
		if err != nil {
			return SlackRunRef{}, &DeliveryError{Err: fmt.Errorf("open owner DM: %w", err)}
		}
	}

	now := c.Now()
	startedAt := stamp(now)
	root := RootMessage{
		Work:        in.Work,
		Goal:        in.Goal,
		Scope:       in.Scope,
		Links:       in.Links,
		OwnerUserID: c.OwnerUserID,
		StartedAt:   startedAt,
	}
	rootJSON, err := json.Marshal(root)
	if err != nil {
		return SlackRunRef{}, fmt.Errorf("encode root message: %w", err)
	}
	message := BuildRootMessage(root)
	ts, err := c.Slack.PostBlocksMessage(ctx, channelID, "", message.Text, message.Blocks)
	if err != nil {
		return SlackRunRef{}, &DeliveryError{Err: fmt.Errorf("post root message: %w", err)}
	}
	permalink, err := c.Slack.Permalink(ctx, channelID, ts)
	if err != nil {
		return SlackRunRef{}, fmt.Errorf("get permalink: %w", err)
	}
	initialStatus := BuildProgressMessage(root, WorkEvent{Current: "Starting"})
	statusTS, err := c.Slack.PostBlocksMessage(ctx, channelID, ts, initialStatus.Text, initialStatus.Blocks)
	if err != nil {
		return SlackRunRef{}, &DeliveryError{Err: fmt.Errorf("post initial status card: %w", err)}
	}
	if statusTS == "" {
		return SlackRunRef{}, &DeliveryError{Err: errors.New("Slack returned no timestamp for the initial status card")}
	}
	if err := c.DB.InsertRun(ctx, db.Run{
		RunID:           in.RunID,
		OwnerUserID:     c.OwnerUserID,
		ChannelID:       channelID,
		ThreadTS:        ts,
		Permalink:       permalink,
		Lifecycle:       "active",
		SlackMode:       db.SlackEnabled,
		StartedAt:       startedAt,
		RootMessage:     sql.NullString{String: string(rootJSON), Valid: true},
		LastRootUpdate:  sql.NullString{String: startedAt, Valid: true},
		StatusMessageTS: sql.NullString{String: statusTS, Valid: statusTS != ""},
	}); err != nil {
		return SlackRunRef{}, err
	}
	if in.JiraIssue != "" {
		if err := c.DB.InsertBacklink(ctx, in.RunID, in.JiraIssue, permalink, startedAt); err != nil {
			return SlackRunRef{}, err
		}
		// One immediate try; a failure stays pending for the scheduler and
		// never fails the start.
		if err := c.attemptBacklink(ctx, db.Backlink{RunID: in.RunID, IssueKey: in.JiraIssue, ThreadURL: permalink}, now); err != nil {
			slog.Warn("jira backlink deferred", "run_id", in.RunID, "issue", in.JiraIssue, "error", err)
		}
	}
	return SlackRunRef{RunID: in.RunID, ChannelID: channelID, ThreadTS: ts, Permalink: permalink}, nil
}
