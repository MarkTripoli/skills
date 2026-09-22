// Package assistant owns the daemon's inbound Slack surface: it consumes
// Socket Mode envelopes and routes each message to the use case that handles
// it, delegating run-thread owner replies to the coordinator.
package assistant

import (
	"context"
	"sync"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
	"github.com/slack-go/slack"
)

// SlackSurface is the Slack client surface the assistant needs. *slackapi.Client
// satisfies it.
type SlackSurface interface {
	PostMessage(ctx context.Context, channelID, threadTS, text string) (string, error)
	UpdateMessage(ctx context.Context, channelID, ts, text string) (string, error)
	AddReaction(ctx context.Context, channelID, ts, name string) error
	Permalink(ctx context.Context, channelID, ts string) (string, error)
	OpenConversation(ctx context.Context, userID string) (string, error)
	UserInfo(ctx context.Context, userID string) (slackapi.User, error)
	// ConversationInfo is conversations.info for one channel ID; `!tasks`
	// names watched channels through it.
	ConversationInfo(ctx context.Context, id string) (*slack.Channel, error)
}

// Service routes inbound Slack messages for one daemon.
type Service struct {
	DB    *db.DB
	Slack SlackSurface
	Coord *coordinator.Coordinator
	// Paths locates the database and workspace whose sizes `!status` reports.
	Paths *paths.Paths
	// Owner is the Slack user id whose instructions the assistant follows.
	Owner string
	// Agent is the configured coding agent; nil when config.yaml has no agent,
	// in which case DM requests are refused with a pointer to the setting.
	Agent *config.Agent
	// Runner spawns the agent process for each queued run; nil (no agent
	// configured) leaves queued rows waiting.
	Runner    agent.Runner
	Now       func() time.Time
	Retention config.Retention
	// started is when the Service was constructed; `!status` reports uptime from it.
	started time.Time
	// verbs maps a lowercased `!` command to its handler; see verbs.go.
	verbs map[string]verb
	// channelNames caches conversations.info names by channel id for `!tasks`.
	channelNames map[string]string
	// ownerDM caches the DM channel id for the owner, opened on the first task delivery.
	ownerDM string
	// wake receives one signal when inbound work is queued for the runner.
	wake chan struct{}
	// inflight counts the deliveries waiting on a running agent; RunDispatcher
	// waits for them before returning.
	inflight sync.WaitGroup
	// verifyMu guards verify, the setup verification waiting for the owner's
	// reply; nil when none is pending. See verify.go.
	verifyMu sync.Mutex
	verify   *pendingVerify
	// verifyTimeout bounds one verification; zero means defaultVerifyTimeout.
	// Tests shorten it.
	verifyTimeout time.Duration
}

// New returns a Service over database and slack whose run-thread replies go to
// coord, whose files live under p, whose DM requests run on agent (nil when
// none is configured), and whose clock is now.
func New(database *db.DB, slack SlackSurface, coord *coordinator.Coordinator, p *paths.Paths, owner string, agent *config.Agent, now func() time.Time) *Service {
	s := &Service{DB: database, Slack: slack, Coord: coord, Paths: p, Owner: owner, Agent: agent, Now: now, started: now(), channelNames: map[string]string{}, wake: make(chan struct{}, 1)}
	s.verbs = s.verbTable()
	return s
}

// Wake receives one value each time inbound work is queued. The channel has
// capacity one, so a signal sent while one is pending is dropped rather than
// blocking the router.
func (s *Service) Wake() <-chan struct{} { return s.wake }

// signalWake wakes the runner without blocking; a pending signal already
// covers this one.
func (s *Service) signalWake() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

// channelName is the `#name` of channel id, looked up once through
// conversations.info and cached; a lookup that fails answers the bare id and
// is retried next time.
func (s *Service) channelName(ctx context.Context, id string) string {
	if name, ok := s.channelNames[id]; ok {
		return name
	}
	ch, err := s.Slack.ConversationInfo(ctx, id)
	if err != nil || ch.Name == "" {
		return id
	}
	name := "#" + ch.Name
	s.channelNames[id] = name
	return name
}

// stamp formats t as the RFC 3339 UTC string every timestamp column holds.
func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }
