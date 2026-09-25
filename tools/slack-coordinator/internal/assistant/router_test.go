package assistant

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

// newTestService returns a Service over a temp runtime root holding its
// database, with a configured agent, the recording fakeSlack it posts through,
// the clock it reads, and a coordinator sharing all three.
func newTestService(t *testing.T) (*Service, *fakeSlack, *testClock) {
	t.Helper()
	return newTestServiceAt(t, paths.WithRoot(t.TempDir()))
}

// newTestServiceAt is newTestService over the runtime root p, for tests that
// also open its database file directly.
func newTestServiceAt(t *testing.T, p *paths.Paths) (*Service, *fakeSlack, *testClock) {
	t.Helper()
	database, err := db.Open(p.DB())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	clock := &testClock{at: time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC)}
	slack := &fakeSlack{}
	coord := &coordinator.Coordinator{DB: database, Slack: slack, Now: clock.Now, OwnerUserID: "U1"}
	return New(database, slack, coord, p, "U1", &config.Agent{Command: "pi", Approval: "edits"}, clock.Now), slack, clock
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
	if claimed, err := c.DB.ClaimOwnerInput(ctx, "RUN2", "1700000000.000200", "t"); err != nil || !claimed {
		t.Fatalf("claim first input = %t, %v", claimed, err)
	}
	if err := c.DB.ResolveOwnerInput(ctx, "RUN2", "1700000000.000200", "applied", "t"); err != nil {
		t.Fatal(err)
	}
	in, ok, _ = c.DB.OldestUnhandledInput(ctx, "RUN2")
	if !ok || in.Text != "second input" {
		t.Fatalf("second pending input = %+v, %t; want only the two owner replies stored", in, ok)
	}
	if claimed, err := c.DB.ClaimOwnerInput(ctx, "RUN2", in.MessageTS, "t"); err != nil || !claimed {
		t.Fatalf("claim second input = %t, %v", claimed, err)
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

type verifyingAcker struct {
	acked  []string
	verify func()
}

func (a *verifyingAcker) Ack(req socketmode.Request) {
	a.acked = append(a.acked, req.EnvelopeID)
	if a.verify != nil {
		a.verify()
	}
}

func TestConsumeInboundPersistsDMAndMentionBeforeAck(t *testing.T) {
	const thread = "1700000000.000100"
	cases := []struct {
		name, channel, text string
		event               func(user, ts string) socketmode.Event
	}{
		{
			name: "DM", channel: "D1", text: "please stop",
			event: func(user, ts string) socketmode.Event {
				return messageEnvelope("input", &slackevents.MessageEvent{
					Type: "message", User: user, Text: "please stop",
					TimeStamp: ts, ThreadTimeStamp: thread, Channel: "D1",
				})
			},
		},
		{
			name: "mention", channel: "C1", text: "please stop",
			event: func(user, ts string) socketmode.Event {
				return mentionEnvelope("input", &slackevents.AppMentionEvent{
					Type: "app_mention", User: user, Text: "<@UBOT> please stop",
					TimeStamp: ts, ThreadTimeStamp: thread, Channel: "C1",
				})
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name+" persistence failure", func(t *testing.T) {
			s, slack, _ := newTestService(t)
			slack.fixedTS = thread
			if _, err := s.Coord.StartRun(context.Background(), coordinator.StartRunInput{
				RunID: "RUN1", ChannelID: tc.channel, Work: "w",
			}); err != nil {
				t.Fatal(err)
			}
			rawDB, err := sql.Open("sqlite", s.Paths.DB())
			if err != nil {
				t.Fatal(err)
			}
			defer rawDB.Close()
			if _, err := rawDB.Exec(`CREATE TRIGGER fail_owner_input BEFORE INSERT ON owner_inputs
				BEGIN SELECT RAISE(ABORT, 'forced owner-input failure'); END`); err != nil {
				t.Fatal(err)
			}
			events := make(chan socketmode.Event, 1)
			events <- tc.event("U1", "1700000000.000200")
			close(events)
			acker := &verifyingAcker{}
			s.ConsumeInbound(context.Background(), events, acker)
			if len(acker.acked) != 0 {
				t.Fatalf("failed persistence acked %v", acker.acked)
			}
		})

		t.Run(tc.name+" persistence success", func(t *testing.T) {
			s, slack, _ := newTestService(t)
			slack.fixedTS = thread
			if _, err := s.Coord.StartRun(context.Background(), coordinator.StartRunInput{
				RunID: "RUN1", ChannelID: tc.channel, Work: "w",
			}); err != nil {
				t.Fatal(err)
			}
			const messageTS = "1700000000.000200"
			events := make(chan socketmode.Event, 1)
			events <- tc.event("U1", messageTS)
			close(events)
			acker := &verifyingAcker{verify: func() {
				input, ok, err := s.DB.OldestUnhandledInput(context.Background(), "RUN1")
				if err != nil || !ok || input.MessageTS != messageTS || input.Text != tc.text {
					t.Errorf("ack observed input %+v, %t, %v; want persisted %q", input, ok, err, tc.text)
				}
			}}
			s.ConsumeInbound(context.Background(), events, acker)
			if len(acker.acked) != 1 || acker.acked[0] != "input" {
				t.Fatalf("acks = %v; want exactly one ack", acker.acked)
			}
			input, ok, err := s.DB.OldestUnhandledInput(context.Background(), "RUN1")
			if err != nil || !ok || input.Text != tc.text {
				t.Fatalf("pending input = %+v, %t, %v; want one normalized input", input, ok, err)
			}
		})

		t.Run(tc.name+" non-owner ignored", func(t *testing.T) {
			s, slack, _ := newTestService(t)
			slack.fixedTS = thread
			if _, err := s.Coord.StartRun(context.Background(), coordinator.StartRunInput{
				RunID: "RUN1", ChannelID: tc.channel, Work: "w",
			}); err != nil {
				t.Fatal(err)
			}
			events := make(chan socketmode.Event, 1)
			events <- tc.event("U2", "1700000000.000300")
			close(events)
			acker := &recordingAcker{}
			s.ConsumeInbound(context.Background(), events, acker)
			if len(acker.acked) != 1 {
				t.Fatalf("non-owner event acked %v; want normal single ack", acker.acked)
			}
			if _, ok, err := s.DB.OldestUnhandledInput(context.Background(), "RUN1"); err != nil || ok {
				t.Fatalf("non-owner input persisted: %t, %v", ok, err)
			}
		})
	}
}

// mentionEnvelope wraps ev the way socketmode delivers an app_mention.
func mentionEnvelope(envelopeID string, ev *slackevents.AppMentionEvent) socketmode.Event {
	return socketmode.Event{
		Type: socketmode.EventTypeEventsAPI,
		Data: slackevents.EventsAPIEvent{
			Type:       slackevents.CallbackEvent,
			InnerEvent: slackevents.EventsAPIInnerEvent{Type: string(slackevents.AppMention), Data: ev},
		},
		Request: &socketmode.Request{Type: "events_api", EnvelopeID: envelopeID},
	}
}

func routeMentionEvent(t *testing.T, s *Service, ev *slackevents.AppMentionEvent) {
	t.Helper()
	if err := s.route(context.Background(), mentionEnvelope("e-"+ev.TimeStamp, ev)); err != nil {
		t.Fatal(err)
	}
}

func TestOwnerChannelMentionOpensOneRequest(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	const ts = "1700000000.002000"
	ev := &slackevents.AppMentionEvent{
		Type: "app_mention", User: "U1",
		Text:      "<@UBOT|coordinator> summarize the open pull requests",
		TimeStamp: ts, Channel: "C9",
	}

	routeMentionEvent(t, s, ev)
	wantWake(t, s, true)

	req, ok, err := s.DB.GetDMRequest(ctx, ts)
	if err != nil || !ok || req.ChannelID != "C9" {
		t.Fatalf("dm_requests row = %+v, %t, %v", req, ok, err)
	}
	msgs, err := s.DB.ListDMMessages(ctx, ts)
	if err != nil || len(msgs) != 2 || msgs[0].Text != "summarize the open pull requests" || msgs[0].Author != db.AuthorOwner {
		t.Fatalf("dm_messages = %+v, %v; want the mention stored without the bot mention", msgs, err)
	}
	if len(slack.reactions) != 1 || slack.reactions[0] != (slackReaction{"C9", ts, "eyes"}) {
		t.Fatalf("reactions = %+v, want eyes on the mention", slack.reactions)
	}
	if len(slack.posts) != 1 || slack.posts[0] != (slackPost{"C9", ts, "Working on it"}) {
		t.Fatalf("posts = %+v, want one Working on it in the channel thread", slack.posts)
	}

	routeMentionEvent(t, s, ev)
	wantWake(t, s, false)
	if n, _ := s.DB.CountRunsByState(ctx, db.RunQueued); n != 1 || len(slack.posts) != 1 {
		t.Fatalf("redelivery queued %d runs and %d posts, want 1 and 1", n, len(slack.posts))
	}

	// A channel mention is not a DM verb, even when the text is a ! command.
	bang := &slackevents.AppMentionEvent{
		Type: "app_mention", User: "U1", Text: "<@UBOT> !help",
		TimeStamp: "1700000000.003000", Channel: "G1",
	}
	routeMentionEvent(t, s, bang)
	if _, ok, _ := s.DB.GetDMRequest(ctx, bang.TimeStamp); !ok {
		t.Fatal("!help in a channel mention did not open a request")
	}
	for _, p := range slack.posts {
		if strings.Contains(p.text, "this table") {
			t.Fatalf("a channel mention ran a ! verb: %+v", slack.posts)
		}
	}
}

func TestNonOwnerMentionDoesNothing(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	cases := []*slackevents.AppMentionEvent{
		{Type: "app_mention", User: "U2", Text: "<@UBOT> do the thing", TimeStamp: "1700000000.004000", Channel: "C9"},
		{Type: "app_mention", User: "U1", Text: "<@UBOT> from a bot", TimeStamp: "1700000000.004100", Channel: "C9", BotID: "B1"},
		{Type: "app_mention", User: "U1", Text: "<@UBOT>", TimeStamp: "1700000000.004200", Channel: "C9"},
		{Type: "app_mention", User: "U1", Text: "<@UBOT> in a dm", TimeStamp: "1700000000.004300", Channel: "D1"},
	}
	for _, ev := range cases {
		routeMentionEvent(t, s, ev)
		if _, ok, _ := s.DB.GetDMRequest(ctx, ev.TimeStamp); ok {
			t.Fatalf("%+v opened a request", ev)
		}
	}
	if len(slack.posts) != 0 || len(slack.reactions) != 0 {
		t.Fatalf("posts %+v reactions %+v, want none", slack.posts, slack.reactions)
	}
	if isRefused(t, s, "U2") {
		t.Fatal("a channel mention stored a refusal")
	}
	wantWake(t, s, false)
}

func TestOwnerMentionInActiveRunIsSteering(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	const thread = "1700000000.000100"
	slack.fixedTS = thread
	startTestRun(t, s.Coord, "RUN1")
	roots := len(slack.posts)

	ev := &slackevents.AppMentionEvent{
		Type: "app_mention", User: "U1", Text: "<@UBOT> please stop",
		TimeStamp: "1700000000.000200", ThreadTimeStamp: thread, Channel: "C1",
	}
	routeMentionEvent(t, s, ev)

	in, ok, err := s.DB.OldestUnhandledInput(ctx, "RUN1")
	if err != nil || !ok || in.Text != "please stop" {
		t.Fatalf("owner input = %+v, %t, %v", in, ok, err)
	}
	if _, ok, _ := s.DB.GetDMRequest(ctx, thread); ok {
		t.Fatal("a mention in an active run opened a second request")
	}
	if len(slack.posts) != roots {
		t.Fatalf("posts = %+v, want no acknowledgement for run steering", slack.posts)
	}
	wantWake(t, s, false)

	other := *ev
	other.User = "U2"
	other.TimeStamp = "1700000000.000300"
	other.Text = "<@UBOT> ignore me"
	routeMentionEvent(t, s, &other)
	if claimed, err := s.DB.ClaimOwnerInput(ctx, "RUN1", in.MessageTS, "t"); err != nil || !claimed {
		t.Fatalf("claim mention input = %t, %v", claimed, err)
	}
	if err := s.DB.ResolveOwnerInput(ctx, "RUN1", in.MessageTS, "applied", "t"); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := s.DB.OldestUnhandledInput(ctx, "RUN1"); ok {
		t.Fatal("a non-owner mention was stored as run steering")
	}
}

func TestOwnerReplyInMentionThreadIsFollowUp(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	const root = "1700000000.005000"
	routeMentionEvent(t, s, &slackevents.AppMentionEvent{
		Type: "app_mention", User: "U1", Text: "<@UBOT> first request",
		TimeStamp: root, Channel: "C9",
	})
	<-s.Wake()

	msg := &slackevents.MessageEvent{
		Type: "message", User: "U1", Text: "add the release notes",
		TimeStamp: "1700000001.000001", ThreadTimeStamp: root, Channel: "C9",
	}
	routeDMEvent(t, s, msg)
	wantWake(t, s, false)

	messages, err := s.DB.ListDMMessages(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 3 || messages[2].Author != db.AuthorOwner || messages[2].TS != msg.TimeStamp || messages[2].Text != msg.Text {
		t.Fatalf("request thread messages = %+v; want original request, ack, and owner follow-up", messages)
	}
	if len(slack.posts) != 1 || slack.posts[0].channel != "C9" || slack.posts[0].thread != root {
		t.Fatalf("posts = %+v; follow-up during queued run should not post another ack", slack.posts)
	}
}

func TestToRunRecordsInputForOwnedActiveRun(t *testing.T) {
	s, slack, _ := newTestService(t)
	slack.fixedTS = "1700000000.000100"
	startTestRun(t, s.Coord, "RUN1")
	rootPosts := append([]slackPost(nil), slack.posts...)

	routeDMEvent(t, s, dm("U1", "1700000001.000001", "", "!to RUN1 please stop and wait"))

	in, ok, err := s.DB.OldestUnhandledInput(context.Background(), "RUN1")
	if err != nil || !ok || in.Text != "please stop and wait" || in.MessageTS != "1700000001.000001" {
		t.Fatalf("directed input = %+v, %t, %v; want the owner's message recorded for RUN1", in, ok, err)
	}
	if len(slack.posts) != len(rootPosts)+1 {
		t.Fatalf("posts = %+v; want the original run root and exactly one direct acknowledgement", slack.posts)
	}
	for i, post := range rootPosts {
		if slack.posts[i] != post {
			t.Fatalf("post %d = %+v; want original run root post %+v", i, slack.posts[i], post)
		}
	}
	if got := slack.posts[len(rootPosts)]; got != (slackPost{"D1", "", "Sent input to run RUN1."}) {
		t.Fatalf("direct acknowledgement = %+v; want one top-level delivery acknowledgement in the owner's DM", got)
	}
}

func TestToRunDoesNotSendToUnknownOrOtherOwnersRuns(t *testing.T) {
	s, slack, _ := newTestService(t)
	other := db.Run{
		RunID: "RUN2", OwnerUserID: "U2", ChannelID: "C1", ThreadTS: "1700000000.000200",
		Lifecycle: "active", SlackMode: db.SlackEnabled, StartedAt: "2026-09-21T10:00:00Z",
	}
	if err := s.DB.InsertRun(context.Background(), other); err != nil {
		t.Fatal(err)
	}

	routeDMEvent(t, s, dm("U1", "1700000001.000001", "", "!to missing please stop"))
	routeDMEvent(t, s, dm("U1", "1700000001.000002", "", "!to RUN2 please stop"))

	if _, ok, err := s.DB.OldestUnhandledInput(context.Background(), "RUN2"); err != nil || ok {
		t.Fatalf("other owner's run received input: %t, %v", ok, err)
	}
	if len(slack.posts) != 2 || slack.posts[0].channel != "D1" || slack.posts[1].channel != "D1" {
		t.Fatalf("posts = %+v; want error replies in owner's DM", slack.posts)
	}
}
