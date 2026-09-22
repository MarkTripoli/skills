package coordinator

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

func TestDisableSlackForRunSilencesOneRunOnly(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	startTestRun(t, c, "RUN2")
	// No Health injected: every enabled run reads unavailable, which the
	// break-glass must outrank.
	if err := c.DB.SetDeliveryError(ctx, "RUN1", "ratelimited"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.DB.InsertOwnerInput(ctx, db.OwnerInput{RunID: "RUN1", MessageTS: "1700000000.000200", Text: "stop", ReceivedAt: "t"}); err != nil {
		t.Fatal(err)
	}

	if err := c.DisableSlackForRun(ctx, ""); err == nil {
		t.Fatal("empty run_id accepted")
	}
	if err := c.DisableSlackForRun(ctx, "nope"); !errors.Is(err, db.ErrRunNotFound) {
		t.Fatalf("unknown run = %v, want ErrRunNotFound", err)
	}
	if err := c.DisableSlackForRun(ctx, "RUN1"); err != nil {
		t.Fatal(err)
	}

	gate, err := c.CheckBeforeWrite(ctx, "RUN1")
	if err != nil || !gateIs(gate, GateSlackDisabled, "") {
		t.Fatalf("disabled run with a delivery error and a pending input: %+v, %v; want slack_disabled", gate, err)
	}
	if gate.Run == nil || *gate.Run != (RunSummary{RunID: "RUN1", ChannelID: "C1", Permalink: "https://t.slack.com/archives/C1/p1700000000.000100"}) {
		t.Fatalf("slack_disabled run summary %+v", gate.Run)
	}
	if gate, err := c.CheckBeforeWrite(ctx, "RUN2"); err != nil || !gateIs(gate, GateUnavailable, "socket_mode not_started") {
		t.Fatalf("sibling run: %+v, %v; want it untouched", gate, err)
	}

	// Posts stop but SQLite keeps recording; the scheduler neither retries nor reposts.
	posts := len(poster.posts)
	poster.fail = errors.New("slack is down")
	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "offline work"}); err != nil {
		t.Fatalf("RecordWorkEvent on a disabled run = %v, want the status stored without posting", err)
	}
	run, _ := c.DB.GetRun(ctx, "RUN1")
	if !run.LastStatus.Valid || run.LastStatus.String == "" || run.SlackMode != db.SlackDisabled {
		t.Fatalf("disabled run after an event: %+v", run)
	}
	poster.fail = nil
	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	run, _ = c.DB.GetRun(ctx, "RUN1")
	if run.Lifecycle != "completed" {
		t.Fatalf("disabled run after finish: %+v", run)
	}
	// Both runs share the fake's channel and thread ts, so the one new post is
	// identified by its text: RUN2's all-None quiet-interval repost, never
	// RUN1's "offline work" status or its completion.
	if got := len(poster.posts) - posts; got != 1 || !strings.Contains(poster.posts[posts].Text, "*Current work:* None") {
		t.Fatalf("after disabling RUN1: %d new posts %+v; want only RUN2's quiet-interval repost", got, poster.posts[posts:])
	}
	for _, p := range poster.posts {
		if strings.Contains(p.Text, "offline work") || strings.Contains(p.Text, "*Outcome:*") {
			t.Fatalf("disabled run posted: %+v", p)
		}
	}

	if err := c.DisableSlackForRun(ctx, "RUN1"); !errors.Is(err, db.ErrRunNotActive) {
		t.Fatalf("disable on a finished run = %v, want ErrRunNotActive", err)
	}
}
