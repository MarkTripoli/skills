// Package assistant owns the daemon's inbound Slack surface: it consumes
// Socket Mode envelopes and routes each message to the use case that handles
// it, delegating run-thread owner replies to the coordinator.
package assistant

import (
	"context"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// SlackSurface is the Slack client surface the assistant needs. *slackapi.Client
// satisfies it.
type SlackSurface interface {
	PostMessage(ctx context.Context, channelID, threadTS, text string) (string, error)
	Permalink(ctx context.Context, channelID, ts string) (string, error)
}

// Service routes inbound Slack messages for one daemon.
type Service struct {
	DB    *db.DB
	Slack SlackSurface
	Coord *coordinator.Coordinator
	// Owner is the Slack user id whose instructions the assistant follows.
	Owner string
	Now   func() time.Time
	// wake receives one signal when inbound work is queued for the runner.
	wake chan struct{}
}

// New returns a Service over database and slack whose run-thread replies go to
// coord and whose clock is now.
func New(database *db.DB, slack SlackSurface, coord *coordinator.Coordinator, owner string, now func() time.Time) *Service {
	return &Service{DB: database, Slack: slack, Coord: coord, Owner: owner, Now: now, wake: make(chan struct{}, 1)}
}

// Wake receives one value each time inbound work is queued. The channel has
// capacity one, so a signal sent while one is pending is dropped rather than
// blocking the router.
func (s *Service) Wake() <-chan struct{} { return s.wake }
