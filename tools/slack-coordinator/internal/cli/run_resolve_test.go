package cli

import (
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// threadReply is the Socket Mode envelope Slack sends for a message posted in
// the fake workspace's one thread.
func threadReply(user, ts, text string) socketmode.Event {
	return socketmode.Event{
		Type: socketmode.EventTypeEventsAPI,
		Data: slackevents.EventsAPIEvent{
			Type: slackevents.CallbackEvent,
			InnerEvent: slackevents.EventsAPIInnerEvent{
				Type: string(slackevents.Message),
				Data: &slackevents.MessageEvent{Type: "message", User: user, Text: text, TimeStamp: ts, ThreadTimeStamp: "1700000000.000100", Channel: "C0000000001"},
			},
		},
		Request: &socketmode.Request{Type: "events_api", EnvelopeID: ts},
	}
}

// waitForGate polls run check until it exits with want or the deadline passes.
func waitForGate(t *testing.T, runID string, want int) (coordinator.WriteGate, int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		gate, code := checkGate(t, runID)
		if code == want || time.Now().After(deadline) {
			return gate, code
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestRunCheckReportsOwnerInputUntilResolved(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	inbound := make(chan socketmode.Event, 8)
	startTestDaemonWith(t, cfg, daemon.Options{
		SocketModeHealth: func() string { return slackapi.SocketConnected },
		Inbound:          inbound,
	})

	if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("run start exit %d, output %q", code, out)
	}

	// A reply from another user and a top-level message from the owner leave the gate ready.
	inbound <- threadReply("U2", "1700000000.000150", "drive-by comment")
	inbound <- socketmode.Event{Type: socketmode.EventTypeEventsAPI, Data: slackevents.EventsAPIEvent{
		Type:       slackevents.CallbackEvent,
		InnerEvent: slackevents.EventsAPIInnerEvent{Type: string(slackevents.Message), Data: &slackevents.MessageEvent{Type: "message", User: "U1", Text: "top level", TimeStamp: "1700000000.000160", Channel: "C0000000001"}},
	}}
	inbound <- threadReply("U1", "1700000000.000200", "Skip the docs step")
	gate, code := waitForGate(t, "RUN1", ExitOwnerInput)
	if code != ExitOwnerInput || gate.Kind != "owner_input" || gate.Input == nil {
		t.Fatalf("after the owner replied: exit %d, gate %+v; want 10 and owner_input", code, gate)
	}
	if gate.Input.MessageTS != "1700000000.000200" || gate.Input.Text != "Skip the docs step" || gate.Input.RunID != "RUN1" {
		t.Fatalf("owner_input payload %+v; want the owner's reply", gate.Input)
	}
	if _, code := runCLI(t, "run", "event", "--run-id", "RUN1", "--current", "still posting"); code != ExitOK {
		t.Fatalf("run event while input is pending exit %d; the gate is advisory for posts", code)
	}
	posts := fake.count()

	if _, code := runCLI(t, "run", "resolve", "--run-id", "RUN1", "--message-ts", gate.Input.MessageTS, "--outcome", "maybe", "--reply", "x"); code != ExitUsage {
		t.Fatalf("run resolve with a bad outcome exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLI(t, "run", "resolve", "--run-id", "RUN1", "--message-ts", gate.Input.MessageTS, "--outcome", "applied"); code != ExitUsage {
		t.Fatalf("run resolve without --reply exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLI(t, "run", "resolve", "--run-id", "RUN1", "--message-ts", "9.9", "--outcome", "applied", "--reply", "x"); code != ExitUsage {
		t.Fatalf("run resolve of an unknown input exit %d, want %d", code, ExitUsage)
	}
	if fake.count() != posts {
		t.Fatalf("refused resolves posted; %d posts, want %d", fake.count(), posts)
	}

	out, code := runCLI(t, "run", "resolve", "--run-id", "RUN1", "--message-ts", gate.Input.MessageTS, "--outcome", "applied", "--reply", "Skipping docs.")
	if code != ExitOK || out != "" {
		t.Fatalf("run resolve exit %d, output %q; want 0 and no output", code, out)
	}
	if fake.count() != posts+1 {
		t.Fatalf("run resolve made %d posts, want one acknowledgement", fake.count()-posts)
	}
	ack := fake.post(posts)
	if ack.Get("thread_ts") != "1700000000.000100" || ack.Get("channel") != "C0000000001" || ack.Get("text") != "Skipping docs." {
		t.Fatalf("acknowledgement form %v; want the reply text in the run's thread", ack)
	}
	if gate, code := checkGate(t, "RUN1"); code != ExitOK || gate.Kind != "ready" {
		t.Fatalf("after resolve: exit %d, gate %+v; want 0 and ready", code, gate)
	}
	if _, code := runCLI(t, "run", "resolve", "--run-id", "RUN1", "--message-ts", gate.Input.MessageTS, "--outcome", "applied", "--reply", "again"); code != ExitUsage || fake.count() != posts+1 {
		t.Fatalf("second resolve exit %d with %d posts; want %d and no new post", code, fake.count(), ExitUsage)
	}

	// The same reply redelivered after resolution stays handled.
	inbound <- threadReply("U1", "1700000000.000200", "Skip the docs step")
	inbound <- threadReply("U1", "1700000000.000300", "And add a test")
	gate, code = waitForGate(t, "RUN1", ExitOwnerInput)
	if code != ExitOwnerInput || gate.Input == nil || gate.Input.MessageTS != "1700000000.000300" {
		t.Fatalf("second owner reply: exit %d, gate %+v (input %+v); want 10 with the new message_ts", code, gate, gate.Input)
	}
}
