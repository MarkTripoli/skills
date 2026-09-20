package steps

import (
	"context"
	"fmt"
	"os/exec"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/branchsync"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

type PushRequest struct {
	Worktree, Remote, Ref, Candidate, ReviewedHead, VerifiedHead, GateMirror string
	Rewrite                                                                  bool
	// BeforePush runs after the live head and lease are verified, immediately before Git push.
	BeforePush func() error
}
type PushResult struct {
	Candidate, Upstream, GateMirror string
	Lease                           string
}

func Push(ctx context.Context, req PushRequest) (PushResult, error) {
	if req.Candidate == "" || req.ReviewedHead == "" || req.Candidate != req.ReviewedHead {
		return PushResult{}, fmt.Errorf("candidate is not reviewed head")
	}
	if err := ctx.Err(); err != nil {
		return PushResult{}, err
	}
	s := branchsync.Syncer{Remote: req.Remote, Ref: req.Ref}
	live, err := s.LiveHead(ctx)
	if err != nil {
		return PushResult{}, err
	}
	if req.VerifiedHead != "" && live != req.VerifiedHead {
		return PushResult{}, fmt.Errorf("upstream changed before push: expected %s, got %s", req.VerifiedHead, live)
	}
	if req.Rewrite && req.VerifiedHead == "" {
		return PushResult{}, fmt.Errorf("rewrite requires verified upstream head")
	}
	args := []string{"push", req.Remote, req.Candidate + ":" + req.Ref}
	lease := ""
	if req.Rewrite {
		lease = "--force-with-lease=" + req.Ref + ":" + req.VerifiedHead
		args = []string{"push", lease, req.Remote, req.Candidate + ":" + req.Ref}
	}
	if req.BeforePush != nil {
		if err := req.BeforePush(); err != nil {
			return PushResult{}, err
		}
	}
	cmd := exec.CommandContext(ctx, "git", args...)
	if req.Worktree != "" {
		cmd.Dir = req.Worktree
	}
	if out, e := cmd.CombinedOutput(); e != nil {
		return PushResult{}, fmt.Errorf("push: %s: %w", strings.TrimSpace(string(out)), e)
	}
	after, err := s.LiveHead(ctx)
	if err != nil {
		return PushResult{}, err
	}
	if after != req.Candidate {
		return PushResult{}, fmt.Errorf("published ref mismatch: %s", after)
	}
	return PushResult{Candidate: req.Candidate, Upstream: after, GateMirror: req.GateMirror, Lease: lease}, nil
}

// Publish performs the durable publication sequence around Push. The mirror
// callback must update the gate ref and return only after that update succeeds.
func Publish(ctx context.Context, database *db.DB, runID string, req PushRequest, mirror func(context.Context, string) error) (PushResult, error) {
	if database == nil || runID == "" {
		return PushResult{}, fmt.Errorf("database and run id are required")
	}
	// A durable binding is the replay receipt. Do not push again after a
	// restart has completed the remote write and recorded publication.
	if publication, err := database.GetPublication(runID); err != nil {
		return PushResult{}, err
	} else if publication != nil {
		if publication.Ref != req.Ref || publication.Candidate != req.Candidate || publication.VerifiedUpstream != publication.Candidate {
			return PushResult{}, fmt.Errorf("publication binding does not match candidate")
		}
		return PushResult{Candidate: publication.Candidate, Upstream: publication.VerifiedUpstream, GateMirror: publication.GateMirror}, nil
	}
	run, err := database.GetRun(runID)
	if err != nil {
		return PushResult{}, err
	}
	if run == nil || run.Status == types.RunCancelled || run.Status == types.RunFailed {
		return PushResult{}, fmt.Errorf("run %s is not publishable", runID)
	}
	if req.Candidate == "" || req.ReviewedHead == "" || req.Candidate != req.ReviewedHead {
		return PushResult{}, fmt.Errorf("candidate is not reviewed head")
	}
	if err := ctx.Err(); err != nil {
		return PushResult{}, err
	}
	if err := database.AcquireRunPushActive(runID); err != nil {
		return PushResult{}, err
	}
	defer database.SetRunPushActive(runID, false)
	result := PushResult{}
	if live, liveErr := (branchsync.Syncer{Remote: req.Remote, Ref: req.Ref}).LiveHead(ctx); liveErr == nil && live == req.Candidate {
		result = PushResult{Candidate: req.Candidate, Upstream: live, GateMirror: req.GateMirror}
	} else {
		var err error
		result, err = Push(ctx, req)
		if err != nil {
			return PushResult{}, err
		}
	}
	if mirror == nil {
		return PushResult{}, fmt.Errorf("gate mirror callback is required")
	}
	if err := mirror(ctx, result.Candidate); err != nil {
		return PushResult{}, fmt.Errorf("update gate mirror: %w", err)
	}
	run, err = database.GetRun(runID)
	if err != nil {
		return PushResult{}, err
	}
	if run == nil {
		return PushResult{}, fmt.Errorf("run %s not found", runID)
	}
	if err := ctx.Err(); err != nil {
		return PushResult{}, err
	}
	if err := database.RecordPublicationAndBinding(db.Publication{RunID: runID, RepoID: run.RepoID, Ref: req.Ref, Candidate: result.Candidate, VerifiedUpstream: result.Upstream, GateMirror: result.Candidate}, db.PushBinding{HeadSHA: result.Candidate, TargetKind: "remote", TargetFingerprint: req.Remote, Ref: req.Ref}); err != nil {
		return PushResult{}, err
	}
	return result, nil
}
