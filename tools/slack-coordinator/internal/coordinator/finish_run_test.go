package coordinator

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

func TestFinishRunClosesTheRunOnce(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")

	in := FinishRunInput{RunID: "RUN1", Outcome: "failed", Unresolved: []string{"flaky test"}}
	if err := c.FinishRun(ctx, in); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 2 || poster.posts[1].ThreadTS != "1700000000.000100" {
		t.Fatalf("completion not posted in the thread: %+v", poster.posts)
	}
	if want := RenderCompletion(in, "2026-09-21T10:00:00Z"); poster.posts[1].Text != want {
		t.Fatalf("completion text =\n%s\nwant\n%s", poster.posts[1].Text, want)
	}
	run, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	if run.Lifecycle != "failed" || run.FinishedAt.String != "2026-09-21T10:00:00Z" || run.NextStatusDue.Valid {
		t.Fatalf("run after finish: %+v", run)
	}

	err = c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"})
	if !errors.Is(err, db.ErrRunNotActive) {
		t.Fatalf("second FinishRun = %v, want ErrRunNotActive", err)
	}
	err = c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "late"})
	if !errors.Is(err, db.ErrRunNotActive) {
		t.Fatalf("RecordWorkEvent on a finished run = %v, want ErrRunNotActive", err)
	}
	if len(poster.posts) != 2 {
		t.Fatalf("terminal run still posted; %d posts", len(poster.posts))
	}
}

func TestFinishRunRejectsBadInput(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")

	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "done"}); err == nil || !strings.Contains(err.Error(), "outcome") {
		t.Fatalf("bad outcome = %v", err)
	}
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "nope", Outcome: "completed"}); !errors.Is(err, db.ErrRunNotFound) {
		t.Fatalf("unknown run = %v, want ErrRunNotFound", err)
	}
	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "nope", Current: "x"}); !errors.Is(err, db.ErrRunNotFound) {
		t.Fatalf("event on unknown run = %v, want ErrRunNotFound", err)
	}
	if len(poster.posts) != 1 {
		t.Fatalf("refused inputs still posted; %d posts", len(poster.posts))
	}
}
