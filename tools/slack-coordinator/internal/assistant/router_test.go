package assistant

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// newTestService returns a Service over a temp database with a configured
// agent, the recording fakeSlack it posts through, the clock it reads, and a
// coordinator sharing all three.
func newTestService(t *testing.T) (*Service, *fakeSlack, *testClock) {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	clock := &testClock{at: time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC)}
	slack := &fakeSlack{}
	coord := &coordinator.Coordinator{DB: database, Slack: slack, Now: clock.Now, OwnerUserID: "U1", Quiet: time.Hour}
	return New(database, slack, coord, "U1", &config.Agent{Command: "omp"}, clock.Now), slack, clock
}

// testClock is a clock tests advance by hand; Now is stable between advances.
type testClock struct{ at time.Time }

func (c *testClock) Now() time.Time { return c.at }

// startTestRun opens runID for owner U1 in channel C1; fixedTS roots every run in one thread.
func startTestRun(t *testing.T, c *coordinator.Coordinator, runID string) {
	t.Helper()
	if _, err := c.StartRun(context.Background(), coordinator.StartRunInput{RunID: runID, ChannelID: "C1", Work: "w"}); err != nil {
		t.Fatal(err)
	}
}

// recordingAcker collects the envelope IDs ConsumeInbound acks.
type recordingAcker struct{ acked []string }

func (a *recordingAcker) Ack(req socketmode.Request) { a.acked = append(a.acked, req.EnvelopeID) }

// messageEnvelope wraps msg the way socketmode delivers an events_api envelope.
func messageEnvelope(envelopeID string, msg *slackevents.MessageEvent) socketmode.Event {
	return socketmode.Event{
		Type: socketmode.EventTypeEventsAPI,
		Data: slackevents.EventsAPIEvent{
			Type:       slackevents.CallbackEvent,
			InnerEvent: slackevents.EventsAPIInnerEvent{Type: string(slackevents.Message), Data: msg},
		},
		Request: &socketmode.Request{Type: "events_api", EnvelopeID: envelopeID},
	}
}

func TestConsumeInboundKeepsOnlyOwnerThreadReplies(t *testing.T) {
	s, slack, _ := newTestService(t)
	c := s.Coord
	ctx := context.Background()
	const thread = "1700000000.000100"
	slack.fixedTS = thread
	startTestRun(t, c, "RUN1") // owner U1, channel C1, thread 1700000000.000100
	if err := c.FinishRun(ctx, coordinator.FinishRunInput{RunID: "RUN1", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	// RUN2 is the active run; fixedTS gives every root the same ts, so RUN1
	// (completed) and RUN2 (active) share the thread and only RUN2 may match.
	startTestRun(t, c, "RUN2")

	reply := func(user, ts, text string) *slackevents.MessageEvent {
		return &slackevents.MessageEvent{Type: "message", User: user, Text: text, TimeStamp: ts, ThreadTimeStamp: thread, Channel: "C1"}
	}
	botReply := reply("U1", "1700000000.000500", "bot")
	botReply.SubType, botReply.BotID = "bot_message", "B1"
	otherThread := reply("U1", "1700000000.000600", "unknown thread")
	otherThread.ThreadTimeStamp = "1600000000.000000"

	events := make(chan socketmode.Event, 16)
	envelopes := []socketmode.Event{
		messageEnvelope("e1", reply("U1", "1700000000.000200", "please stop")),
		messageEnvelope("e2", reply("U1", "1700000000.000200", "please stop")), // redelivered
		messageEnvelope("e3", reply("U2", "1700000000.000300", "not the owner")),
		messageEnvelope("e4", &slackevents.MessageEvent{Type: "message", User: "U1", Text: "top level", TimeStamp: "1700000000.000400", Channel: "C1"}),
		messageEnvelope("e5", botReply),
		messageEnvelope("e6", otherThread),
		{Type: socketmode.EventTypeInteractive, Data: "ignored", Request: &socketmode.Request{Type: "interactive", EnvelopeID: "e7"}},
		{Type: socketmode.EventTypeEventsAPI, Data: "not an EventsAPIEvent", Request: &socketmode.Request{EnvelopeID: "e8"}},
		messageEnvelope("e9", reply("U1", "1700000000.000700", "second input")),
	}
	for _, e := range envelopes {
		events <- e
	}
	close(events)

	acker := &recordingAcker{}
	s.ConsumeInbound(ctx, events, acker)

	if len(acker.acked) != len(envelopes) {
		t.Fatalf("acked %d envelopes %v, want every one of %d", len(acker.acked), acker.acked, len(envelopes))
	}
	for i, id := range acker.acked {
		if want := envelopes[i].Request.EnvelopeID; id != want {
			t.Fatalf("ack %d = %s, want %s (acks in delivery order)", i, id, want)
		}
	}

	in, ok, err := c.DB.OldestUnhandledInput(ctx, "RUN2")
	if err != nil || !ok || in.MessageTS != "1700000000.000200" || in.Text != "please stop" || in.ReceivedAt != "2026-09-21T10:00:00Z" {
		t.Fatalf("oldest input for RUN2 = %+v, %t, %v", in, ok, err)
	}
	if _, ok, _ := c.DB.OldestUnhandledInput(ctx, "RUN1"); ok {
		t.Fatal("the completed run received an input")
	}
	if err := c.DB.ResolveOwnerInput(ctx, "RUN2", "1700000000.000200", "applied", "t"); err != nil {
		t.Fatal(err)
	}
	in, ok, _ = c.DB.OldestUnhandledInput(ctx, "RUN2")
	if !ok || in.Text != "second input" {
		t.Fatalf("second pending input = %+v, %t; want only the two owner replies stored", in, ok)
	}
	if err := c.DB.ResolveOwnerInput(ctx, "RUN2", in.MessageTS, "answered", "t"); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := c.DB.OldestUnhandledInput(ctx, "RUN2"); ok {
		t.Fatal("a dropped envelope produced a row")
	}
}

func TestConsumeInboundStopsWhenTheContextEnds(t *testing.T) {
	s, _, _ := newTestService(t)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		s.ConsumeInbound(ctx, make(chan socketmode.Event), nil)
		close(done)
	}()
	cancel()
	<-done
}
