package steps

import (
	"context"
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/branchsync"
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
