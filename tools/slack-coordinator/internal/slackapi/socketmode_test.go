package slackapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

// newSocketMode points a SocketMode at a fake apps.connections.open that
// always answers with the given Slack error, so no WebSocket is dialed.
func newSocketMode(t *testing.T, slackError string) *SocketMode {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/apps.connections.open" {
			t.Errorf("unexpected call %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"ok":false,"error":"` + slackError + `"}`))
	}))
	t.Cleanup(srv.Close)
	return NewSocketMode(New(config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", APIURL: srv.URL}).API())
}

func TestSocketModeReportsDisconnectedWhenSlackRefusesTheApp(t *testing.T) {
	s := newSocketMode(t, "invalid_auth")
	if s.Health() != SocketNotStarted {
		t.Fatalf("Health before Run = %q", s.Health())
	}
	err := s.Run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "invalid_auth") {
		t.Fatalf("Run = %v, want the fatal invalid_auth error", err)
	}
	if s.Health() != SocketDisconnected {
		t.Fatalf("Health after a fatal connect = %q", s.Health())
	}
	if _, open := <-s.Inbound(); open {
		t.Fatal("Inbound stayed open after Run returned")
	}
}

func TestSocketModeStaysDisconnectedWhileRetrying(t *testing.T) {
	s := newSocketMode(t, "internal_error")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- s.Run(ctx) }()

	deadline := time.Now().Add(5 * time.Second)
	for s.Health() != SocketDisconnected && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if s.Health() != SocketDisconnected {
		t.Fatalf("Health during a recoverable connect error = %q", s.Health())
	}
	cancel()
	select {
	case err := <-done:
		if err != context.Canceled {
			t.Fatalf("Run after cancel = %v, want context.Canceled", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
