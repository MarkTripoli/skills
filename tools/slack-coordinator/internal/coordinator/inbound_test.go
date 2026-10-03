package coordinator

import (
	"context"
	"strings"
	"testing"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

type inboundAcker func(socketmode.Request)

func (a inboundAcker) Ack(request socketmode.Request) { a(request) }

func inboundEvent(data interface{}, ts string) socketmode.Event {
	return socketmode.Event{
		Type:    socketmode.EventTypeEventsAPI,
		Data:    slackevents.EventsAPIEvent{InnerEvent: slackevents.EventsAPIInnerEvent{Data: data}},
		Request: &socketmode.Request{EnvelopeID: ts},
	}
}

func consumeEvents(c *Coordinator, ack Acker, events ...socketmode.Event) {
	inbound := make(chan socketmode.Event, len(events))
	for _, event := range events {
		inbound <- event
	}
	close(inbound)
	c.ConsumeInbound(context.Background(), inbound, ack)
}

func TestRunMentionIsDurableBeforeAckAndRedeliveryDoesNotReopenResolvedInput(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	startTestRun(t, c, "RUN1")
	run, err := c.DB.GetRun(context.Background(), "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	event := inboundEvent(&slackevents.AppMentionEvent{
		User: "U1", Channel: run.ChannelID, ThreadTimeStamp: run.ThreadTS,
		TimeStamp: "2.0", Text: "<@UBOT> change scope",
	}, "2.0")
	acks := 0
	consumeEvents(c, inboundAcker(func(socketmode.Request) {
		acks++
		input, found, err := c.DB.OldestUnhandledInput(context.Background(), run.RunID)
		if err != nil || !found || input.Text != "change scope" || input.MessageTS != "2.0" {
			t.Fatalf("input not durable at acknowledgment: %+v, %t, %v", input, found, err)
		}
	}), event)
	if acks != 1 || len(poster.reactions) != 1 || poster.reactions[0].TS != "2.0" {
		t.Fatalf("owner input receipt: acks=%d reactions=%v", acks, poster.reactions)
	}
	if err := c.ResolveOwnerInput(context.Background(), OwnerInputResolution{RunID: "RUN1", MessageTS: "2.0", Outcome: "applied", Reply: "Scope changed."}); err != nil {
		t.Fatal(err)
	}
	consumeEvents(c, nil, event)
	if input, found, err := c.DB.OldestUnhandledInput(context.Background(), "RUN1"); err != nil || found {
		t.Fatalf("redelivery reopened handled input: %+v, %t, %v", input, found, err)
	}
}

func TestUnrelatedMessagesAndNonOwnerCommandsNeverStartOrSteerRuns(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	startTestRun(t, c, "RUN1")
	run, err := c.DB.GetRun(context.Background(), "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	posts := len(poster.posts)
	consumeEvents(c, nil,
		inboundEvent(&slackevents.MessageEvent{User: "U1", Channel: "D1", TimeStamp: "2.0", Text: "do some work"}, "2.0"),
		inboundEvent(&slackevents.MessageEvent{User: "U1", Channel: "D1", TimeStamp: "2.1", Text: "!tasks"}, "2.1"),
		inboundEvent(&slackevents.AppMentionEvent{User: "U1", Channel: "C1", TimeStamp: "2.2", Text: "<@UBOT> do work"}, "2.2"),
		inboundEvent(&slackevents.AppMentionEvent{User: "U1", Channel: "C1", ThreadTimeStamp: "unknown", TimeStamp: "2.3", Text: "<@UBOT> do work"}, "2.3"),
		inboundEvent(&slackevents.MessageEvent{User: "U2", Channel: run.ChannelID, ThreadTimeStamp: run.ThreadTS, TimeStamp: "2.4", Text: "stop"}, "2.4"),
		inboundEvent(&slackevents.MessageEvent{User: "U2", Channel: "D1", TimeStamp: "2.5", Text: "!to RUN1 stop"}, "2.5"),
		inboundEvent(&slackevents.MessageEvent{User: "U2", Channel: "D1", TimeStamp: "2.6", Text: "!runs"}, "2.6"),
		inboundEvent(&slackevents.MessageEvent{User: "U1", BotID: "B1", Channel: run.ChannelID, ThreadTimeStamp: run.ThreadTS, TimeStamp: "2.7", Text: "stop"}, "2.7"),
	)
	if input, found, err := c.DB.OldestUnhandledInput(context.Background(), "RUN1"); err != nil || found {
		t.Fatalf("unrelated event steered a run: %+v, %t, %v", input, found, err)
	}
	runs, err := c.DB.ActiveRuns(context.Background())
	if err != nil || len(runs) != 1 || runs[0].RunID != "RUN1" {
		t.Fatalf("unrelated event created work: %+v, %v", runs, err)
	}
	if len(poster.posts) != posts || len(poster.reactions) != 0 {
		t.Fatalf("unrelated event received a reply or reaction: posts=%v reactions=%v", poster.posts, poster.reactions)
	}
}

func TestLookupFailureDoesNotAcknowledgeOwnerInput(t *testing.T) {
	c, _, _ := newTestCoordinator(t)
	if err := c.DB.Close(); err != nil {
		t.Fatal(err)
	}
	acks := 0
	consumeEvents(c, inboundAcker(func(socketmode.Request) { acks++ }),
		inboundEvent(&slackevents.MessageEvent{User: "U1", Channel: "D1", ThreadTimeStamp: "1.0", TimeStamp: "2.0", Text: "stop"}, "2.0"),
	)
	if acks != 0 {
		t.Fatalf("failed durable lookup acknowledged %d envelopes", acks)
	}
}

func TestRunsDMListsOnlyActiveRunsOwnedByTheConfiguredOwner(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	startTestRun(t, c, "OWNED")
	startTestRun(t, c, "FINISHED")
	if err := c.DB.FinishRun(context.Background(), "FINISHED", "completed", "t"); err != nil {
		t.Fatal(err)
	}
	if err := c.DB.InsertRun(context.Background(), db.Run{RunID: "FOREIGN", OwnerUserID: "U2", ChannelID: "C1", ThreadTS: "9.0", Permalink: "private", Lifecycle: "active", SlackMode: db.SlackEnabled, StartedAt: "t"}); err != nil {
		t.Fatal(err)
	}
	consumeEvents(c, nil, inboundEvent(&slackevents.MessageEvent{User: "U1", Channel: "D1", TimeStamp: "2.0", Text: "!runs"}, "2.0"))
	listing := poster.posts[len(poster.posts)-1]
	if listing.ChannelID != "D1" || listing.ThreadTS != "" || !strings.Contains(listing.Text, "OWNED") || strings.Contains(listing.Text, "FINISHED") || strings.Contains(listing.Text, "FOREIGN") {
		t.Fatalf("run listing crossed the owner/lifecycle boundary: %+v", listing)
	}
}
