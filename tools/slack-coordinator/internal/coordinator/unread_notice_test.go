package coordinator

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

func insertTestInput(t *testing.T, c *Coordinator, runID, ts string, receivedAt time.Time) {
	t.Helper()
	if _, err := c.DB.InsertOwnerInput(context.Background(), db.OwnerInput{RunID: runID, MessageTS: ts, Text: "reply", ReceivedAt: stamp(receivedAt)}); err != nil {
		t.Fatal(err)
	}
}

func unreadNotices(poster *fakePoster) int {
	n := 0
	for _, p := range poster.posts {
		if p.Text == unreadInputNotice {
			n++
		}
	}
	return n
}

func TestUnreadInputNoticePostsOnceAfterThreshold(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	c.Health = func() string { return slackapi.SocketConnected }
	startTestRun(t, c, "RUN1")
	insertTestInput(t, c, "RUN1", "1700000000.000200", *now)
	s := &StatusScheduler{C: c}

	if err := s.Tick(ctx, now.Add(unreadInputAfter-time.Second)); err != nil {
		t.Fatal(err)
	}
	if n := unreadNotices(poster); n != 0 {
		t.Fatalf("notice before threshold: %d", n)
	}

	poster.fail = errors.New("ratelimited")
	if err := s.Tick(ctx, now.Add(unreadInputAfter)); err == nil {
		t.Fatal("failed notice was not reported")
	}
	poster.fail = nil
	run, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil || run.LastDeliveryError.Valid {
		t.Fatalf("failed notice changed last_delivery_error: %+v, %v", run.LastDeliveryError, err)
	}

	for _, at := range []time.Duration{unreadInputAfter + time.Minute, unreadInputAfter + 2*time.Minute} {
		if err := s.Tick(ctx, now.Add(at)); err != nil {
			t.Fatal(err)
		}
	}
	if n := unreadNotices(poster); n != 1 {
		t.Fatalf("notices after retry and a second tick = %d, want 1", n)
	}
	last := poster.posts[len(poster.posts)-1]
	if last.ChannelID != "C1" || last.ThreadTS != "1700000000.000100" {
		t.Fatalf("notice not in the run thread: %+v", last)
	}

	gate, err := c.CheckBeforeWrite(ctx, "RUN1")
	if err != nil || gate.Kind != GateOwnerInput || gate.Input == nil || gate.Input.MessageTS != "1700000000.000200" {
		t.Fatalf("notice changed run check: %+v, %v", gate, err)
	}
}

func TestUnreadInputNoticeSkipsHandledClaimedDisabledAndFinished(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	for _, id := range []string{"HANDLED", "CLAIMED", "DISABLED", "FINISHED"} {
		startTestRun(t, c, id)
		insertTestInput(t, c, id, "1700000000.000200", *now)
	}
	at := stamp(*now)
	if _, err := c.DB.ClaimOwnerInput(ctx, "HANDLED", "1700000000.000200", at); err != nil {
		t.Fatal(err)
	}
	if err := c.DB.ResolveOwnerInput(ctx, "HANDLED", "1700000000.000200", "answered", at); err != nil {
		t.Fatal(err)
	}
	if _, err := c.DB.ClaimOwnerInput(ctx, "CLAIMED", "1700000000.000200", at); err != nil {
		t.Fatal(err)
	}
	if err := c.DisableSlackForRun(ctx, "DISABLED"); err != nil {
		t.Fatal(err)
	}
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "FINISHED", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}

	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if n := unreadNotices(poster); n != 0 {
		t.Fatalf("notices for ineligible inputs = %d, want 0", n)
	}
}

func TestUnreadInputNoticeNotRepeatedAfterRestart(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "state.sqlite")
	now := time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC)
	open := func() (*Coordinator, *fakePoster) {
		database, err := db.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { database.Close() })
		poster := &fakePoster{}
		return &Coordinator{DB: database, Slack: poster, Now: func() time.Time { return now }, OwnerUserID: "U1"}, poster
	}

	c, poster := open()
	startTestRun(t, c, "RUN1")
	insertTestInput(t, c, "RUN1", "1700000000.000200", now)
	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(unreadInputAfter)); err != nil {
		t.Fatal(err)
	}
	if n := unreadNotices(poster); n != 1 {
		t.Fatalf("notices before restart = %d, want 1", n)
	}
	c.DB.Close()

	c, poster = open()
	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if n := unreadNotices(poster); n != 0 {
		t.Fatalf("notices after restart = %d, want 0", n)
	}
}
