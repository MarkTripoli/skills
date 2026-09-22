package assistant

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// fakeSlack records every call. PostMessage answers with fixedTS when set (so
// every run root shares one thread) and otherwise with a fresh ts per post;
// postErr, when set, is returned after the attempt is recorded.
// OpenConversation answers "D1" for any user; UserInfo names the owner "ada"
// and fails for everyone else.
type fakeSlack struct {
	fixedTS   string
	postErr   error
	posts     []slackPost
	reactions []slackReaction
	opened    []string
}

type slackPost struct{ channel, thread, text string }

type slackReaction struct{ channel, ts, name string }

func (f *fakeSlack) PostMessage(_ context.Context, channelID, threadTS, text string) (string, error) {
	f.posts = append(f.posts, slackPost{channelID, threadTS, text})
	if f.postErr != nil {
		return "", f.postErr
	}
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

func (f *fakeSlack) OpenConversation(_ context.Context, userID string) (string, error) {
	f.opened = append(f.opened, userID)
	return "D1", nil
}

func (f *fakeSlack) UserInfo(_ context.Context, userID string) (slackapi.User, error) {
	if userID != "U1" {
		return slackapi.User{}, errors.New("users.info: user_not_found")
	}
	return slackapi.User{ID: "U1", DisplayName: "ada"}, nil
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

// captureLog routes slog's default logger into the returned buffer until the
// test ends.
func captureLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

// isRefused reports whether refused_users holds userID: a fresh insert that
// changes nothing proves the row is there.
func isRefused(t *testing.T, s *Service, userID string) bool {
	t.Helper()
	inserted, err := s.DB.InsertRefusedUser(context.Background(), userID, "probe")
	if err != nil {
		t.Fatal(err)
	}
	return !inserted
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

func TestNonOwnerDMIsRefusedOnceThenDropped(t *testing.T) {
	s, slack, clock := newTestService(t)
	const refusal = "This assistant only takes instructions from its owner, <@U1>."

	routeDMEvent(t, s, dm("U2", "1700000000.001000", "", "hello?"))
	clock.at = clock.at.Add(time.Minute)
	routeDMEvent(t, s, dm("U2", "1700000000.002000", "1700000000.001000", "anyone there?"))

	if len(slack.posts) != 1 || slack.posts[0] != (slackPost{"D1", "", refusal}) {
		t.Fatalf("posts = %+v, want exactly one top-level refusal", slack.posts)
	}
	if !isRefused(t, s, "U2") {
		t.Fatal("no refused_users row for U2")
	}
	if _, ok, _ := s.DB.GetDMRequest(context.Background(), "1700000000.001000"); ok {
		t.Fatal("a non-owner DM opened a request")
	}
	if len(slack.reactions) != 0 {
		t.Fatalf("reactions = %+v, want none", slack.reactions)
	}
	wantWake(t, s, false)
}

func TestFailedRefusalPostKeepsTheRowAndLogs(t *testing.T) {
	s, slack, _ := newTestService(t)
	logged := captureLog(t)
	slack.postErr = errors.New("slack is down")

	routeDMEvent(t, s, dm("U2", "1700000000.001000", "", "hello?"))

	if !isRefused(t, s, "U2") {
		t.Fatal("the failed post rolled back the refused_users row")
	}
	if len(slack.posts) != 1 {
		t.Fatalf("posts = %+v, want one attempted refusal", slack.posts)
	}
	if !strings.Contains(logged.String(), "level=ERROR") || !strings.Contains(logged.String(), "slack is down") {
		t.Fatalf("log %q does not carry the post error at ERROR", logged.String())
	}

	slack.postErr = nil
	routeDMEvent(t, s, dm("U2", "1700000000.002000", "", "still there?"))
	if len(slack.posts) != 1 {
		t.Fatalf("posts = %+v, want no second refusal after the failed one", slack.posts)
	}
}

func TestRouteDMDropsWhatIsNotARequest(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	for _, msg := range []*slackevents.MessageEvent{
		dm("U1", "1700000000.003000", "1600000000.000000", "reply under an unknown thread"),
		dm("U1", "1700000000.004000", "1600000000.000000", "!status as a thread reply"),
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
