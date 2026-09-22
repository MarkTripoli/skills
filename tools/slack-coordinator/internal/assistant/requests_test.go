package assistant

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// fakeSlack records every call. PostMessage answers with fixedTS when set (so
// every run root shares one thread) and otherwise with a fresh ts per post.
type fakeSlack struct {
	fixedTS   string
	posts     []slackPost
	reactions []slackReaction
}

type slackPost struct{ channel, thread, text string }

type slackReaction struct{ channel, ts, name string }

func (f *fakeSlack) PostMessage(_ context.Context, channelID, threadTS, text string) (string, error) {
	f.posts = append(f.posts, slackPost{channelID, threadTS, text})
	if f.fixedTS != "" {
		return f.fixedTS, nil
	}
	return fmt.Sprintf("1700000000.%06d", 900000+len(f.posts)), nil
}

func (f *fakeSlack) UpdateMessage(_ context.Context, _, ts, _ string) (string, error) { return ts, nil }

func (f *fakeSlack) AddReaction(_ context.Context, channelID, ts, name string) error {
	f.reactions = append(f.reactions, slackReaction{channelID, ts, name})
	return nil
}

func (f *fakeSlack) Permalink(_ context.Context, channelID, ts string) (string, error) {
	return "https://t.slack.com/archives/" + channelID + "/p" + ts, nil
}

// dm is an owner message in DM channel D1; threadTS "" makes it top level.
func dm(user, ts, threadTS, text string) *slackevents.MessageEvent {
	return &slackevents.MessageEvent{Type: "message", User: user, Text: text, TimeStamp: ts, ThreadTimeStamp: threadTS, Channel: "D1"}
}

// routeDMEvent delivers msg through route as an events_api envelope.
func routeDMEvent(t *testing.T, s *Service, msg *slackevents.MessageEvent) {
	t.Helper()
	if err := s.route(context.Background(), messageEnvelope("e-"+msg.TimeStamp, msg)); err != nil {
		t.Fatal(err)
	}
}

func wantWake(t *testing.T, s *Service, want bool) {
	t.Helper()
	select {
	case <-s.Wake():
		if !want {
			t.Fatal("the runner was woken with nothing queued")
		}
	default:
		if want {
			t.Fatal("the runner was not woken after a request was queued")
		}
	}
}

func TestOwnerTopLevelDMOpensRequestOnce(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	const root = "1700000000.001000"
	msg := dm("U1", root, "", "summarize the open pull requests")

	routeDMEvent(t, s, msg)
	wantWake(t, s, true)

	req, ok, err := s.DB.GetDMRequest(ctx, root)
	if err != nil || !ok {
		t.Fatalf("dm_requests row = %+v, %t, %v", req, ok, err)
	}
	if req.ChannelID != "D1" || req.ReceivedAt != "2026-09-21T10:00:00Z" || req.LastMessageAt != "2026-09-21T10:00:00Z" {
		t.Fatalf("dm_requests row = %+v", req)
	}
	if len(slack.reactions) != 1 || slack.reactions[0] != (slackReaction{"D1", root, "eyes"}) {
		t.Fatalf("reactions = %+v, want eyes on the request", slack.reactions)
	}
	if len(slack.posts) != 1 || slack.posts[0] != (slackPost{"D1", root, "Working on it"}) {
		t.Fatalf("posts = %+v, want one Working on it in the thread", slack.posts)
	}
	msgs, err := s.DB.ListDMMessages(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 2 || msgs[0] != (db.DMMessage{RootTS: root, TS: root, Author: db.AuthorOwner, Text: msg.Text}) {
		t.Fatalf("dm_messages = %+v, want the owner root then the ack", msgs)
	}
	if ack := msgs[1]; !req.AckTS.Valid || ack.TS != req.AckTS.String || ack.Author != db.AuthorBot || ack.Text != "Working on it" || ack.TS == root {
		t.Fatalf("ack row %+v does not match ack_ts %+v", ack, req.AckTS)
	}
	if n, _ := s.DB.CountRunsByState(ctx, db.RunQueued); n != 1 {
		t.Fatalf("queued runs = %d, want 1", n)
	}

	// The same envelope again: nothing new is stored, posted, or signalled.
	routeDMEvent(t, s, msg)
	wantWake(t, s, false)
	msgs, _ = s.DB.ListDMMessages(ctx, root)
	n, _ := s.DB.CountRunsByState(ctx, db.RunQueued)
	if len(msgs) != 2 || n != 1 || len(slack.posts) != 1 || len(slack.reactions) != 1 {
		t.Fatalf("after redelivery: %d messages, %d queued runs, %d posts, %d reactions; want 2, 1, 1, 1", len(msgs), n, len(slack.posts), len(slack.reactions))
	}
}

func TestRequestBehindRunningRunsIsAckedAsQueued(t *testing.T) {
	s, slack, clock := newTestService(t)
	ctx := context.Background()
	for i := range 3 {
		run := db.AssistantRun{RunID: fmt.Sprintf("RUNNING%d", i), Kind: db.RunKindDM, State: db.RunRunning, QueuedAt: "2026-09-21T09:00:00Z"}
		if err := s.DB.InsertAssistantRun(ctx, run); err != nil {
			t.Fatal(err)
		}
	}

	routeDMEvent(t, s, dm("U1", "1700000000.001000", "", "first"))
	clock.at = clock.at.Add(time.Second)
	routeDMEvent(t, s, dm("U1", "1700000000.002000", "", "second"))

	if len(slack.posts) != 2 || slack.posts[0].text != "Queued behind 0" || slack.posts[1].text != "Queued behind 1" {
		t.Fatalf("posts = %+v, want Queued behind 0 then Queued behind 1", slack.posts)
	}
	if n, _ := s.DB.CountRunsByState(ctx, db.RunQueued); n != 2 {
		t.Fatalf("queued runs = %d, want 2", n)
	}
}

func TestDMWithoutAgentIsRefusedWithoutRows(t *testing.T) {
	s, slack, _ := newTestService(t)
	s.Agent = nil
	const root = "1700000000.001000"

	routeDMEvent(t, s, dm("U1", root, "", "do something"))

	if len(slack.posts) != 1 || slack.posts[0] != (slackPost{"D1", root, noAgentReply}) {
		t.Fatalf("posts = %+v, want the fixed no-agent reply in the thread", slack.posts)
	}
	if len(slack.reactions) != 0 {
		t.Fatalf("reactions = %+v, want none", slack.reactions)
	}
	if _, ok, _ := s.DB.GetDMRequest(context.Background(), root); ok {
		t.Fatal("a dm_requests row was stored without an agent")
	}
	if n, _ := s.DB.CountRunsByState(context.Background(), db.RunQueued); n != 0 {
		t.Fatalf("queued runs = %d, want 0", n)
	}
	wantWake(t, s, false)
}

func TestOwnerReplyUnderRequestIsRecordedAsFollowUp(t *testing.T) {
	s, _, clock := newTestService(t)
	ctx := context.Background()
	const root = "1700000000.001000"
	routeDMEvent(t, s, dm("U1", root, "", "first"))
	<-s.Wake()

	clock.at = clock.at.Add(time.Minute)
	routeDMEvent(t, s, dm("U1", "1700000001.000000", root, "and the docs"))
	wantWake(t, s, false)

	msgs, err := s.DB.ListDMMessages(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	want := db.DMMessage{RootTS: root, TS: "1700000001.000000", Author: db.AuthorOwner, Text: "and the docs", RunID: sql.NullString{}}
	if len(msgs) != 3 || msgs[2] != want {
		t.Fatalf("dm_messages = %+v, want the reply last with run_id NULL", msgs)
	}
	req, _, _ := s.DB.GetDMRequest(ctx, root)
	if req.LastMessageAt != "2026-09-21T10:01:00Z" {
		t.Fatalf("last_message_at = %s, want the reply time", req.LastMessageAt)
	}
	if n, _ := s.DB.CountRunsByState(ctx, db.RunQueued); n != 1 {
		t.Fatalf("queued runs = %d, want the reply to queue nothing", n)
	}
}

func TestRouteDMDropsWhatIsNotARequest(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	for _, msg := range []*slackevents.MessageEvent{
		dm("U2", "1700000000.001000", "", "not the owner"),
		dm("U1", "1700000000.002000", "", "!status"),
		dm("U1", "1700000000.003000", "", "  !status with leading space"),
		dm("U1", "1700000000.004000", "1600000000.000000", "reply under an unknown thread"),
	} {
		routeDMEvent(t, s, msg)
		if _, ok, _ := s.DB.GetDMRequest(ctx, msg.TimeStamp); ok {
			t.Fatalf("%q opened a request", msg.Text)
		}
		if msgs, _ := s.DB.ListDMMessages(ctx, msg.ThreadTimeStamp); len(msgs) != 0 {
			t.Fatalf("%q stored %+v", msg.Text, msgs)
		}
	}
	if len(slack.posts) != 0 || len(slack.reactions) != 0 {
		t.Fatalf("posts %+v reactions %+v, want none", slack.posts, slack.reactions)
	}
	wantWake(t, s, false)
}
