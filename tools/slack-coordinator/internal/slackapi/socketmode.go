package slackapi

import (
	"context"
	"log/slog"
	"sync/atomic"

	"github.com/slack-go/slack"
	"github.com/slack-go/slack/socketmode"
)

// Socket Mode connection states reported by SocketMode.Health and daemon.health.
const (
	SocketNotStarted   = "not_started"
	SocketConnected    = "connected"
	SocketDisconnected = "disconnected"
)

// SocketMode owns the daemon's one Socket Mode connection. The SDK client
// reconnects on its own; this wrapper tracks whether the WebSocket is up and
// forwards Slack's envelopes to Inbound.
type SocketMode struct {
	client  *socketmode.Client
	state   atomic.Value // one of the Socket* constants
	inbound chan socketmode.Event
}

// NewSocketMode wraps api in a managed Socket Mode client. Nothing connects
// until Run.
func NewSocketMode(api *slack.Client) *SocketMode {
	s := &SocketMode{client: socketmode.New(api), inbound: make(chan socketmode.Event, 50)}
	s.state.Store(SocketNotStarted)
	return s
}

// Run connects and blocks until ctx ends or the SDK gives up (invalid
// credentials, or a fatal connect error). Connection lifecycle events update
// Health; every other event is forwarded to Inbound, which Run closes on
// return. Run is called once per SocketMode.
func (s *SocketMode) Run(ctx context.Context) error {
	defer close(s.inbound)
	done := make(chan error, 1)
	go func() { done <- s.client.RunContext(ctx) }()
	for {
		select {
		case <-ctx.Done():
			s.state.Store(SocketDisconnected)
			return <-done
		case err := <-done:
			s.state.Store(SocketDisconnected)
			return err
		case evt := <-s.client.Events:
			switch evt.Type {
			case socketmode.EventTypeConnected:
				s.state.Store(SocketConnected)
			case socketmode.EventTypeConnecting, socketmode.EventTypeConnectionError,
				socketmode.EventTypeInvalidAuth, socketmode.EventTypeDisconnect:
				s.state.Store(SocketDisconnected)
			case socketmode.EventTypeHello:
			default:
				select {
				case s.inbound <- evt:
				case <-ctx.Done():
				}
			}
		}
	}
}

// Health reports the connection state as one of the Socket* constants.
func (s *SocketMode) Health() string { return s.state.Load().(string) }

// Inbound delivers every envelope that is not a connection lifecycle event.
// The consumer acks each event carrying a Request. The channel closes when Run
// returns.
func (s *SocketMode) Inbound() <-chan socketmode.Event { return s.inbound }

// Ack tells Slack the envelope was received; without it Slack redelivers.
func (s *SocketMode) Ack(req socketmode.Request) {
	if err := s.client.Ack(req); err != nil {
		slog.Warn("socket mode ack failed", "envelope_id", req.EnvelopeID, "error", err)
	}
}
