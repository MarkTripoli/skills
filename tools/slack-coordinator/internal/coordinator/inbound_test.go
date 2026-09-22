package coordinator

import (
	"context"
	"testing"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"
)

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
	c, _, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1") // owner U1, channel C1, thread 1700000000.000100
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	// RUN2 is the active run; fakePoster gives every root the same ts, so RUN1
	// (completed) and RUN2 (active) share the thread and only RUN2 may match.
	startTestRun(t, c, "RUN2")
	const thread = "1700000000.000100"

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
	c.ConsumeInbound(ctx, events, acker)

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
	c, _, _ := newTestCoordinator(t)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		c.ConsumeInbound(ctx, make(chan socketmode.Event), nil)
		close(done)
	}()
	cancel()
	<-done
}
