package coordinator

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/slack-go/slack"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

type post struct {
	ChannelID string
	ThreadTS  string
	Text      string
	Blocks    []slack.Block
}

type reaction struct {
	ChannelID string
	TS        string
	Name      string
}

type fakePoster struct {
	posts         []post
	statusCards   []post
	updates       []post
	reactions     []reaction
	messageCount  int
	fail          error
	failReactions error
	onReaction    func()
}

func (f *fakePoster) PostBlocksMessage(_ context.Context, channelID, threadTS, fallback string, blocks []slack.Block) (string, error) {
	if f.fail != nil {
		return "", f.fail
	}
	message := post{ChannelID: channelID, ThreadTS: threadTS, Text: fallback, Blocks: blocks}
	if threadTS != "" && strings.HasPrefix(fallback, "*Now:* Starting") {
		f.statusCards = append(f.statusCards, message)
	} else {
		f.posts = append(f.posts, message)
	}
	ts := fmt.Sprintf("1700000000.%06d", 100+f.messageCount)
	f.messageCount++
	return ts, nil
}

func (f *fakePoster) UpdateBlocksMessage(_ context.Context, channelID, ts, fallback string, blocks []slack.Block) error {
	if f.fail != nil {
		return f.fail
	}
	f.updates = append(f.updates, post{ChannelID: channelID, ThreadTS: ts, Text: fallback, Blocks: blocks})
	return nil
}

func (f *fakePoster) OpenConversation(_ context.Context, _ string) (string, error) {
	return "D1", nil
}

func (f *fakePoster) AddReaction(_ context.Context, channelID, ts, name string) error {
	if f.onReaction != nil {
		f.onReaction()
	}
	f.reactions = append(f.reactions, reaction{ChannelID: channelID, TS: ts, Name: name})
	return f.failReactions
}

func (f *fakePoster) Permalink(_ context.Context, channelID, ts string) (string, error) {
	return "https://t.slack.com/archives/" + channelID + "/p" + ts, nil
}

func newTestCoordinator(t *testing.T) (*Coordinator, *fakePoster, *time.Time) {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	now := time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC)
	poster := &fakePoster{}
	c := &Coordinator{DB: database, Slack: poster, Now: func() time.Time { return now }, OwnerUserID: "U1"}
	return c, poster, &now
}

func startTestRun(t *testing.T, c *Coordinator, runID string) {
	t.Helper()
	if _, err := c.StartRun(context.Background(), StartRunInput{RunID: runID, ChannelID: "C1", Work: "w"}); err != nil {
		t.Fatal(err)
	}
}

func TestStartRunPersistsOneCompactThreadStatusCard(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ref, err := c.StartRun(context.Background(), StartRunInput{
		RunID: "RUN1", ChannelID: "C1", Work: "Profile enhancements",
		Goal: "Improve profile editing", Scope: "Profile screen",
		Links: []string{"https://example.test/pr/1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if ref.ThreadTS != "1700000000.000100" || len(poster.posts) != 1 || len(poster.statusCards) != 1 {
		t.Fatalf("start messages: ref=%+v posts=%+v statusCards=%+v", ref, poster.posts, poster.statusCards)
	}
	if poster.posts[0].Text != "*Issue:* Profile enhancements\n*Goal:* Improve profile editing\n*Scope:* Profile screen" {
		t.Fatalf("root is not compact: %q", poster.posts[0].Text)
	}
	if poster.statusCards[0].ThreadTS != ref.ThreadTS || poster.statusCards[0].Text != "*Now:* Starting\n*Links:* <https://example.test/pr/1|example.test>" {
		t.Fatalf("initial card = %+v", poster.statusCards[0])
	}
	run, err := c.DB.GetRun(context.Background(), "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	if !run.StatusMessageTS.Valid || run.StatusMessageTS.String != "1700000000.000101" {
		t.Fatalf("saved status-card timestamp = %+v", run.StatusMessageTS)
	}
}

func TestLegacyRunKeepsRootEditBehavior(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	legacy := db.Run{
		RunID: "LEGACY", OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1700000000.000100",
		Permalink: "https://example.test/thread", Lifecycle: "active", SlackMode: db.SlackEnabled,
		StartedAt: stamp(*now), StatusIntervalSeconds: db.DefaultStatusIntervalSeconds,
		RootMessage:    sql.NullString{String: `{"Work":"Legacy issue","Goal":"Keep old behavior"}`, Valid: true},
		LastRootUpdate: sql.NullString{String: stamp(*now), Valid: true},
	}
	if err := c.DB.InsertRun(context.Background(), legacy); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(3 * time.Hour)
	if err := c.RecordWorkEvent(context.Background(), WorkEvent{RunID: "LEGACY", Current: "Still working"}); err != nil {
		t.Fatal(err)
	}
	if len(poster.updates) != 1 || poster.updates[0].ThreadTS != legacy.ThreadTS || !strings.Contains(poster.updates[0].Text, "*Current work:* Still working") {
		t.Fatalf("legacy run did not edit root: %+v", poster.updates)
	}
}

func TestLegacyBlockerStillGetsImmediateRootEdit(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	legacy := db.Run{
		RunID: "LEGACY", OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1700000000.000050",
		Permalink: "https://example.test/thread", Lifecycle: "active", SlackMode: db.SlackEnabled,
		StartedAt: stamp(*now), StatusIntervalSeconds: db.DefaultStatusIntervalSeconds,
		RootMessage:    sql.NullString{String: `{"Work":"Legacy issue","Goal":"Keep old behavior"}`, Valid: true},
		LastRootUpdate: sql.NullString{String: stamp(*now), Valid: true},
	}
	if err := c.DB.InsertRun(context.Background(), legacy); err != nil {
		t.Fatal(err)
	}
	if err := c.RecordWorkEvent(context.Background(), WorkEvent{RunID: legacy.RunID, Current: "Waiting", Blockers: []string{"Need approval"}}); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 1 || poster.posts[0].ThreadTS != legacy.ThreadTS || len(poster.updates) != 1 || poster.updates[0].ThreadTS != legacy.ThreadTS || !strings.Contains(poster.updates[0].Text, "*Blockers:*\n• Need approval") {
		t.Fatalf("legacy blocker behavior changed: posts=%+v updates=%+v", poster.posts, poster.updates)
	}
}

func TestStatusEditsThreadCardAfterQuietInterval(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	s := &StatusScheduler{C: c}
	if err := s.Tick(ctx, now.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 1 || len(poster.updates) != 0 {
		t.Fatalf("idle run emitted messages: posts=%d updates=%d", len(poster.posts), len(poster.updates))
	}
	e := WorkEvent{RunID: "RUN1", Current: "Wiring flags", Completed: []string{"Parsed flag"}}
	if err := c.RecordWorkEvent(ctx, e); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 1 || len(poster.updates) != 0 {
		t.Fatalf("routine event edited root before the 3h cadence: %+v", poster.updates)
	}
	if err := s.Tick(ctx, now.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(3 * time.Hour)
	if err := s.Tick(ctx, *now); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 1 || len(poster.updates) != 1 || poster.updates[0].ThreadTS != "1700000000.000101" || !strings.Contains(poster.updates[0].Text, "*Now:* Wiring flags") {
		t.Fatalf("status did not edit the thread card: posts=%+v updates=%+v", poster.posts, poster.updates)
	}
	if err := c.RecordWorkEvent(ctx, e); err != nil {
		t.Fatal(err)
	}
	if err := s.Tick(ctx, now.Add(3*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if len(poster.updates) != 1 {
		t.Fatalf("duplicate or periodic edit: %+v", poster.updates)
	}
}

func TestNewBlockerGetsOneThreadReply(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	for _, e := range []WorkEvent{
		{RunID: "RUN1", Current: "A", Blockers: []string{"Need approval"}},
		{RunID: "RUN1", Current: "B", Blockers: []string{"Need approval"}},
		{RunID: "RUN1", Current: "C"},
	} {
		if err := c.RecordWorkEvent(ctx, e); err != nil {
			t.Fatal(err)
		}
	}
	if len(poster.posts) != 2 || poster.posts[1].Text != "*Blocker:* Need approval\n*Owner:* <@U1>" || len(poster.posts[1].Blocks) == 0 || poster.posts[1].ThreadTS != "1700000000.000100" || len(poster.updates) != 0 {
		t.Fatalf("blocker notifications: posts=%+v updates=%+v", poster.posts, poster.updates)
	}
}

func TestBlockerFailureKeepsGateUnavailableUntilEventRetried(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	e := WorkEvent{RunID: "RUN1", Current: "Waiting", Blockers: []string{"Need approval"}}
	poster.fail = context.DeadlineExceeded
	if err := c.RecordWorkEvent(ctx, e); err == nil {
		t.Fatal("blocker notification succeeded during outage")
	}
	poster.fail = nil
	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	run, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil || !run.LastDeliveryError.Valid || len(poster.updates) != 0 {
		t.Fatalf("scheduler hid missed blocker: run=%+v edits=%+v err=%v", run, poster.updates, err)
	}
	if err := c.RecordWorkEvent(ctx, e); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 2 || len(poster.updates) != 1 || poster.updates[0].ThreadTS != "1700000000.000101" {
		t.Fatalf("event retry: posts=%+v edits=%+v", poster.posts, poster.updates)
	}
}

func TestSchedulerSkipsFinishedRuns(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(3*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 1 || len(poster.updates) != 1 {
		t.Fatalf("finished run emitted status: posts=%d updates=%d", len(poster.posts), len(poster.updates))
	}
}

func TestSchedulerRetriesFailedRootEdit(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	*now = now.Add(3 * time.Hour)
	poster.fail = context.DeadlineExceeded
	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "Wiring flags"}); err == nil {
		t.Fatal("failed status-card edit succeeded")
	}
	s := &StatusScheduler{C: c}
	if err := s.Tick(ctx, now.Add(time.Minute)); err == nil || !strings.Contains(err.Error(), "RUN1") {
		t.Fatalf("retry error = %v", err)
	}
	poster.fail = nil
	if err := s.Tick(ctx, now.Add(2*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 1 || len(poster.updates) != 1 || !strings.Contains(poster.updates[0].Text, "Wiring flags") {
		t.Fatalf("failed edit not retried: posts=%+v updates=%+v", poster.posts, poster.updates)
	}
}

func TestReactRunSerializesWithDisableSlack(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	entered, release := make(chan struct{}), make(chan struct{})
	poster.onReaction = func() {
		close(entered)
		<-release
	}
	defer func() {
		select {
		case <-release:
		default:
			close(release)
		}
	}()
	reactionDone := make(chan error, 1)
	go func() {
		reactionDone <- c.ReactRun(ctx, ReactRunInput{RunID: "RUN1", Emoji: "white_check_mark"})
	}()
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("reaction did not enter Slack client")
	}

	disableStarted := make(chan struct{})
	disableDone := make(chan error, 1)
	go func() {
		close(disableStarted)
		disableDone <- c.DisableSlackForRun(ctx, "RUN1")
	}()
	<-disableStarted
	select {
	case err := <-disableDone:
		t.Fatalf("disable completed while reaction was still in flight: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	close(release)
	if err := <-reactionDone; err != nil {
		t.Fatalf("reaction: %v", err)
	}
	if err := <-disableDone; err != nil {
		t.Fatalf("disable: %v", err)
	}
	if err := c.ReactRun(ctx, ReactRunInput{RunID: "RUN1", Emoji: "white_check_mark"}); err == nil || !strings.Contains(err.Error(), ErrRunSlackDisabled.Error()) || len(poster.reactions) != 1 {
		t.Fatalf("reaction after disable was not refused: err=%v reactions=%+v", err, poster.reactions)
	}
}
