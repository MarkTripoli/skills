package steps

import (
	"context"
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/branchsync"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"os/exec"
	"strings"
)

type PushRequest struct {
	Worktree, Remote, Ref, Candidate, ReviewedHead, VerifiedHead, GateMirror string
	Rewrite                                                                  bool
}
type PushResult struct {
	Candidate, Upstream, GateMirror string
	Lease                           string
}

func Push(ctx context.Context, req PushRequest) (PushResult, error) {
	if req.Candidate == "" || req.ReviewedHead == "" || req.Candidate != req.ReviewedHead {
		return PushResult{}, fmt.Errorf("candidate is not reviewed head")
	}
	s := branchsync.Syncer{Remote: req.Remote, Ref: req.Ref}
	live, err := s.LiveHead(ctx)
	if err != nil {
		return PushResult{}, err
	}
	if req.Rewrite && req.VerifiedHead == "" {
		return PushResult{}, fmt.Errorf("rewrite requires verified upstream head")
	}
	if !req.Rewrite && req.VerifiedHead != "" && live != req.VerifiedHead {
		return PushResult{}, fmt.Errorf("upstream changed before push")
	}
	args := []string{"push", req.Remote, req.Candidate + ":" + req.Ref}
	lease := ""
	if req.Rewrite {
		lease = "--force-with-lease=" + req.Ref + ":" + live
		args = []string{"push", lease, req.Remote, req.Candidate + ":" + req.Ref}
	}
	if out, e := exec.CommandContext(ctx, "git", args...).CombinedOutput(); e != nil {
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
	if err := database.SetRunPushActive(runID, true); err != nil {
		return PushResult{}, err
	}
	defer database.SetRunPushActive(runID, false)
	result, err := Push(ctx, req)
	if err != nil {
		return PushResult{}, err
	}
	if mirror == nil {
		return PushResult{}, fmt.Errorf("gate mirror callback is required")
	}
	if err := mirror(ctx, result.Candidate); err != nil {
		return PushResult{}, fmt.Errorf("update gate mirror: %w", err)
	}
	run, err := database.GetRun(runID)
	if err != nil {
		return PushResult{}, err
	}
	if run == nil {
		return PushResult{}, fmt.Errorf("run %s not found", runID)
	}
	if err := database.RecordPublication(db.Publication{RunID: runID, RepoID: run.RepoID, Ref: req.Ref, Candidate: result.Candidate, VerifiedUpstream: result.Upstream, GateMirror: result.Candidate}); err != nil {
		return PushResult{}, err
	}
	if err := database.UpdateRunPushBinding(runID, db.PushBinding{HeadSHA: result.Candidate, TargetKind: "remote", TargetFingerprint: req.Remote, Ref: req.Ref}); err != nil {
		return PushResult{}, err
	}
	return result, nil
}
