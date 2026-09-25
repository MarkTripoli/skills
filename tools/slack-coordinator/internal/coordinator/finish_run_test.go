package coordinator

import (
	"context"
	"database/sql"
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
	if len(poster.posts) != 1 || len(poster.updates) != 1 || poster.updates[0].ThreadTS != "1700000000.000100" {
		t.Fatalf("completion did not edit root: posts=%+v updates=%+v", poster.posts, poster.updates)
	}
	for _, part := range []string{"*Work:* w", "*Outcome:* failed", "*Unresolved items:*\n• flaky test"} {
		if !strings.Contains(poster.updates[0].Text, part) {
			t.Fatalf("completion missing %q: %s", part, poster.updates[0].Text)
		}
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
	if len(poster.posts) != 1 || len(poster.updates) != 1 {
		t.Fatalf("terminal run still sent updates; posts=%d updates=%d", len(poster.posts), len(poster.updates))
	}
}

func TestSuccessfulMessagesDoNotClearUploadUncertainty(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	run := db.Run{
		RunID:             "UNCERTAIN",
		OwnerUserID:       "U1",
		ChannelID:         "C1",
		ThreadTS:          "1700000000.000100",
		Lifecycle:         "active",
		SlackMode:         db.SlackEnabled,
		StartedAt:         "2026-09-21T10:00:00Z",
		RootMessage:       sql.NullString{String: `{"Work":"original"}`, Valid: true},
		LastDeliveryError: sql.NullString{String: db.UploadOutcomeUncertainPrefix + "response lost", Valid: true},
	}
	if err := c.DB.InsertRun(ctx, run); err != nil {
		t.Fatal(err)
	}

	if err := c.updateRoot(ctx, run, &WorkEvent{RunID: run.RunID, Current: "updated"}, nil, ""); err != nil {
		t.Fatal(err)
	}
	if err := c.post(ctx, run, BuildStatusMessage(WorkEvent{Current: "posted"})); err != nil {
		t.Fatal(err)
	}
	stored, err := c.DB.GetRun(ctx, run.RunID)
	if err != nil {
		t.Fatal(err)
	}
	if !stored.LastDeliveryError.Valid || stored.LastDeliveryError.String != run.LastDeliveryError.String {
		t.Fatalf("successful messages cleared upload uncertainty: %+v", stored.LastDeliveryError)
	}
	if len(poster.updates) != 1 || len(poster.posts) != 1 {
		t.Fatalf("expected both successful delivery paths, updates=%d posts=%d", len(poster.updates), len(poster.posts))
	}
}

func TestLegacyRunPostsStatusAndCompletionWithoutEditingRoot(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	if err := c.DB.InsertRun(ctx, db.Run{
		RunID:       "LEGACY",
		OwnerUserID: "U1",
		ChannelID:   "C1",
		ThreadTS:    "1700000000.000100",
		Lifecycle:   "active",
		SlackMode:   db.SlackEnabled,
		StartedAt:   "2020-01-01T00:00:00Z",
	}); err != nil {
		t.Fatal(err)
	}

	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "LEGACY", Current: "preserving original root"}); err != nil {
		t.Fatal(err)
	}
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "LEGACY", Outcome: "completed", Completed: []string{"ship safely"}}); err != nil {
		t.Fatal(err)
	}

	if len(poster.updates) != 0 {
		t.Fatalf("legacy root was edited: %+v", poster.updates)
	}
	if len(poster.posts) != 2 {
		t.Fatalf("legacy run should post status and completion in its thread, got %+v", poster.posts)
	}
	if poster.posts[0].ThreadTS != "1700000000.000100" || !strings.Contains(poster.posts[0].Text, "preserving original root") {
		t.Fatalf("legacy status was not posted in the original thread: %+v", poster.posts[0])
	}
	if poster.posts[1].ThreadTS != "1700000000.000100" ||
		!strings.Contains(poster.posts[1].Text, "*Outcome:* completed") ||
		!strings.Contains(poster.posts[1].Text, "*Completed work:*\n• ship safely") ||
		strings.Contains(poster.posts[1].Text, "*Work:* Run") {
		t.Fatalf("legacy completion did not preserve the original root content: %+v", poster.posts[1])
	}
}

func TestFinishRunReactsByOutcomeAndOverride(t *testing.T) {
	for _, tc := range []struct {
		outcome string
		emoji   string
		want    string
	}{
		{"completed", "", "white_check_mark"},
		{"failed", "", "x"},
		{"cancelled", "", "black_square_for_stop"},
		{"completed", ":rocket:", "rocket"},
		{"failed", "none", ""},
	} {
		t.Run(tc.outcome+"/"+tc.emoji, func(t *testing.T) {
			c, poster, _ := newTestCoordinator(t)
			startTestRun(t, c, "RUN1")
			if err := c.FinishRun(context.Background(), FinishRunInput{RunID: "RUN1", Outcome: tc.outcome, Emoji: tc.emoji}); err != nil {
				t.Fatal(err)
			}
			if tc.want == "" {
				if len(poster.reactions) != 0 {
					t.Fatalf("suppressed finish reacted: %+v", poster.reactions)
				}
				return
			}
			if len(poster.reactions) != 1 || poster.reactions[0] != (reaction{ChannelID: "C1", TS: "1700000000.000100", Name: tc.want}) {
				t.Fatalf("finish reaction = %+v; want %s on the root", poster.reactions, tc.want)
			}
		})
	}
}

func TestFinishRunReactionFailureStillClosesAndRecordsError(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	poster.failReactions = errors.New("ratelimited")
	poster.onReaction = func() {
		run, err := c.DB.GetRun(ctx, "RUN1")
		if err != nil {
			t.Fatal(err)
		}
		if len(poster.updates) != 1 || run.Lifecycle != "active" {
			t.Fatalf("reaction must follow root edit and precede DB finish: updates=%d lifecycle=%s", len(poster.updates), run.Lifecycle)
		}
	}
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"}); err != nil {
		t.Fatalf("reaction failure prevented finish: %v", err)
	}
	run, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	if run.Lifecycle != "completed" || !run.LastDeliveryError.Valid || !strings.Contains(run.LastDeliveryError.String, "ratelimited") {
		t.Fatalf("reaction failure not recorded on terminal run: %+v", run)
	}
	if len(poster.posts) != 1 || len(poster.updates) != 1 || len(poster.reactions) != 1 {
		t.Fatalf("completion and reaction attempts: posts=%d updates=%d reactions=%d", len(poster.posts), len(poster.updates), len(poster.reactions))
	}
	poster.failReactions = nil
	poster.onReaction = nil
	if err := c.ReactRun(ctx, ReactRunInput{RunID: "RUN1", Emoji: "white_check_mark"}); err != nil {
		t.Fatalf("retry on finished run: %v", err)
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
