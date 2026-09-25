package coordinator

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

func TestRunCadenceReschedulesLatestPendingEvent(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	start := *now
	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "first"}); err != nil {
		t.Fatal(err)
	}
	*now = start.Add(10 * time.Minute)
	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "latest"}); err != nil {
		t.Fatal(err)
	}
	run, _ := c.DB.GetRun(ctx, "RUN1")
	if run.StatusIntervalSeconds != db.DefaultStatusIntervalSeconds || run.NextStatusDue.String != stamp(start.Add(3*time.Hour)) {
		t.Fatalf("default cadence not anchored at start: %+v", run)
	}
	if err := c.SetStatusCadence(ctx, StatusCadenceInput{RunID: "RUN1", Seconds: 15 * 60}); err != nil {
		t.Fatal(err)
	}
	run, _ = c.DB.GetRun(ctx, "RUN1")
	if run.NextStatusDue.String != stamp(start.Add(15*time.Minute)) {
		t.Fatalf("cadence did not reschedule pending status: %+v", run)
	}
	s := &StatusScheduler{C: c}
	if err := s.Tick(ctx, start.Add(14*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if len(poster.updates) != 0 {
		t.Fatal("status sent early")
	}
	*now = start.Add(15 * time.Minute)
	if err := s.Tick(ctx, *now); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 1 || len(poster.updates) != 1 || !strings.Contains(poster.updates[0].Text, "latest") {
		t.Fatalf("coalesced update: posts=%+v updates=%+v", poster.posts, poster.updates)
	}
	run, _ = c.DB.GetRun(ctx, "RUN1")
	if run.NextStatusDue.Valid || run.LastRootUpdate.String != stamp(*now) {
		t.Fatalf("pending status not cleared: %+v", run)
	}
	if err := s.Tick(ctx, start.Add(2*time.Hour)); err != nil || len(poster.updates) != 1 {
		t.Fatalf("unchanged status reposted: edits=%d err=%v", len(poster.updates), err)
	}
	if err := c.SetStatusCadence(ctx, StatusCadenceInput{RunID: "RUN1", Seconds: 60}); err != nil {
		t.Fatal(err)
	}
	run, _ = c.DB.GetRun(ctx, "RUN1")
	if run.NextStatusDue.Valid {
		t.Fatalf("changing cadence without pending status scheduled an edit: %+v", run)
	}
}

func TestRunCadenceRejectsInvalidOrFinishedRun(t *testing.T) {
	c, _, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	if err := c.SetStatusCadence(ctx, StatusCadenceInput{RunID: "RUN1", Seconds: 0}); err == nil {
		t.Fatal("zero cadence accepted")
	}
	if err := c.SetStatusCadence(ctx, StatusCadenceInput{RunID: "RUN1", Seconds: 1 << 62}); err == nil {
		t.Fatal("overflow cadence accepted")
	}
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	if err := c.SetStatusCadence(ctx, StatusCadenceInput{RunID: "RUN1", Seconds: 60}); err == nil {
		t.Fatal("finished run cadence changed")
	}
}
