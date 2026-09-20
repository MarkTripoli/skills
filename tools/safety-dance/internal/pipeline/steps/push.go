package steps

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os/exec"
	"strings"
	"time"

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
func Publish(ctx context.Context, database *db.DB, runID string, req PushRequest, mirror func(context.Context, string) error) (result PushResult, err error) {
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
	if run == nil || ((run.Status == types.RunCancelled || run.Status == types.RunFailed) && !run.PushActive) {
		return PushResult{}, fmt.Errorf("run %s is not publishable", runID)
	}
	if req.Candidate == "" || req.ReviewedHead == "" || req.Candidate != req.ReviewedHead {
		return PushResult{}, fmt.Errorf("candidate is not reviewed head")
	}
	if err := ctx.Err(); err != nil {
		return PushResult{}, err
	}
	claimed := run.PushActive
	if run.PushActive {
		live, liveErr := (branchsync.Syncer{Remote: req.Remote, Ref: req.Ref}).LiveHead(ctx)
		if liveErr != nil {
			return PushResult{}, fmt.Errorf("reconcile active publication: %w", liveErr)
		}
		if live == req.Candidate {
			result = PushResult{Candidate: req.Candidate, Upstream: live, GateMirror: req.GateMirror}
		} else if live == strings.TrimSpace(req.VerifiedHead) {
			if err := database.SetRunPushActive(runID, false); err != nil {
				return PushResult{}, fmt.Errorf("release interrupted publication claim: %w", err)
			}
			claimed = false
			run.PushActive = false
		} else {
			return PushResult{}, fmt.Errorf("active publication requires reconciliation: live head %s, candidate %s", live, req.Candidate)
		}
	}
	if !run.PushActive {
		if !claimed {
			if err := database.AcquireRunPushActive(runID); err != nil {
				return PushResult{}, err
			}
			claimed = true
		}
	}
	defer func() {
		if !claimed {
			return
		}
		if clearErr := database.SetRunPushActive(runID, false); clearErr != nil && err == nil {
			result = PushResult{}
			err = fmt.Errorf("clear publication ownership: %w", clearErr)
		}
	}()
	if !run.PushActive {
		if live, liveErr := (branchsync.Syncer{Remote: req.Remote, Ref: req.Ref}).LiveHead(ctx); liveErr == nil && live == req.Candidate {
			result = PushResult{Candidate: req.Candidate, Upstream: live, GateMirror: req.GateMirror}
		} else {
			pushResult, pushErr := Push(ctx, req)
			if pushErr != nil {
				reconcileCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				remoteHead, reconcileErr := (branchsync.Syncer{Remote: req.Remote, Ref: req.Ref}).LiveHead(reconcileCtx)
				cancel()
				if reconcileErr != nil || remoteHead != req.Candidate {
					return PushResult{}, pushErr
				}
				result = PushResult{Candidate: req.Candidate, Upstream: remoteHead, GateMirror: req.GateMirror}
			} else {
				result = pushResult
			}
		}
	}
	if mirror == nil {
		return PushResult{}, fmt.Errorf("gate mirror callback is required")
	}
	// Once the remote ref is known to contain the candidate, cancellation no
	// longer makes the publication uncertain. Finish mirror and binding work on
	// a bounded context that is independent of the caller's cancellation.
	publicationCtx, publicationCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer publicationCancel()
	if err := mirror(publicationCtx, result.Candidate); err != nil {
		return PushResult{}, fmt.Errorf("update gate mirror: %w", err)
	}
	run, err = database.GetRun(runID)
	if err != nil {
		return PushResult{}, err
	}
	if run == nil {
		return PushResult{}, fmt.Errorf("run %s not found", runID)
	}
	fingerprint := sha256.Sum256([]byte(req.Remote))
	binding := db.PushBinding{HeadSHA: result.Candidate, TargetKind: "remote", TargetFingerprint: hex.EncodeToString(fingerprint[:]), Ref: req.Ref}
	if err := database.RecordPublicationAndBinding(db.Publication{RunID: runID, RepoID: run.RepoID, Ref: req.Ref, Candidate: result.Candidate, VerifiedUpstream: result.Upstream, GateMirror: result.Candidate}, binding); err != nil {
		return PushResult{}, err
	}
	return result, nil
}
