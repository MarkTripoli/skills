package steps

import (
	"context"
	"testing"
)

func TestReviewedHeadRejectsUnreviewedCandidate(t *testing.T) {
	_, err := Push(context.Background(), PushRequest{Candidate: "new", ReviewedHead: "old"})
	if err == nil {
		t.Fatal("expected reviewed-head rejection")
	}
}

func TestLeaseRequiresRemoteHeadVerification(t *testing.T) {
	_, err := Push(context.Background(), PushRequest{Candidate: "same", ReviewedHead: "same", Rewrite: true})
	if err == nil {
		t.Fatal("expected lease verification rejection")
	}
}

func TestPublishedRefVerificationHasReviewedPrecondition(t *testing.T) {
	_, err := Push(context.Background(), PushRequest{Candidate: "same", ReviewedHead: "different"})
	if err == nil {
		t.Fatal("expected published-ref precondition rejection")
	}
}

func TestCancelContextStopsPushBeforeRemoteHead(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := Push(ctx, PushRequest{Candidate: "same", ReviewedHead: "same", Remote: "remote", Ref: "refs/heads/main"})
	if err == nil {
		t.Fatal("expected cancellation")
	}
}
