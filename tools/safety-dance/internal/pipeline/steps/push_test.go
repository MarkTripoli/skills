package steps

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
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
func gitTest(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return string(out)
}

func TestPushFastForwardUsesNormalPush(t *testing.T) {
	root := t.TempDir()
	remote := filepath.Join(root, "remote.git")
	work := filepath.Join(root, "work")
	gitTest(t, root, "init", "--bare", remote)
	gitTest(t, root, "init", work)
	gitTest(t, work, "config", "user.email", "test@example.com")
	gitTest(t, work, "config", "user.name", "Test")
	if err := os.WriteFile(filepath.Join(work, "file"), []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitTest(t, work, "add", "file")
	gitTest(t, work, "commit", "-m", "one")
	gitTest(t, work, "push", remote, "HEAD:refs/heads/main")
	base := strings.TrimSpace(gitTest(t, work, "rev-parse", "HEAD"))
	if err := os.WriteFile(filepath.Join(work, "file"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitTest(t, work, "commit", "-am", "two")
	candidate := strings.TrimSpace(gitTest(t, work, "rev-parse", "HEAD"))
	result, err := Push(context.Background(), PushRequest{Worktree: work, Remote: remote, Ref: "refs/heads/main", Candidate: candidate, ReviewedHead: candidate, VerifiedHead: base})
	if err != nil {
		t.Fatal(err)
	}
	if result.Lease != "" {
		t.Fatalf("fast-forward used lease %q", result.Lease)
	}
}

func TestPushUsesRewriteSelectedByPrePushCallback(t *testing.T) {
	root := t.TempDir()
	remote := filepath.Join(root, "remote.git")
	work := filepath.Join(root, "work")
	gitTest(t, root, "init", "--bare", remote)
	gitTest(t, root, "init", work)
	gitTest(t, work, "config", "user.email", "test@example.com")
	gitTest(t, work, "config", "user.name", "Test")
	if err := os.WriteFile(filepath.Join(work, "file"), []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitTest(t, work, "add", "file")
	gitTest(t, work, "commit", "-m", "one")
	gitTest(t, work, "push", remote, "HEAD:refs/heads/main")
	base := strings.TrimSpace(gitTest(t, work, "rev-parse", "HEAD"))
	if err := os.WriteFile(filepath.Join(work, "file"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitTest(t, work, "commit", "-am", "two")
	candidate := strings.TrimSpace(gitTest(t, work, "rev-parse", "HEAD"))
	result, err := Push(context.Background(), PushRequest{Worktree: work, Remote: remote, Ref: "refs/heads/main", Candidate: candidate, ReviewedHead: candidate, VerifiedHead: base, BeforePush: func(req *PushRequest) error { req.Rewrite = true; return nil }})
	if err != nil {
		t.Fatal(err)
	}
	if result.Lease == "" {
		t.Fatal("pre-push rewrite selection did not use a lease")
	}
}
func TestPublishUpdatesMirrorAndRecordsBinding(t *testing.T) {
	root := t.TempDir()
	remote := filepath.Join(root, "remote.git")
	work := filepath.Join(root, "work")
	gitTest(t, root, "init", "--bare", remote)
	gitTest(t, root, "init", work)
	gitTest(t, work, "config", "user.email", "test@example.com")
	gitTest(t, work, "config", "user.name", "Test")
	if err := os.WriteFile(filepath.Join(work, "file"), []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitTest(t, work, "add", "file")
	gitTest(t, work, "commit", "-m", "one")
	gitTest(t, work, "remote", "add", "origin", remote)
	gitTest(t, work, "push", "origin", "HEAD:refs/heads/main")
	base := strings.TrimSpace(gitTest(t, work, "rev-parse", "HEAD"))
	if err := os.WriteFile(filepath.Join(work, "file"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitTest(t, work, "commit", "-am", "two")
	candidate := strings.TrimSpace(gitTest(t, work, "rev-parse", "HEAD"))
	database, err := db.Open(filepath.Join(root, "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.InsertRepoWithID("repo", work, remote, "main"); err != nil {
		t.Fatal(err)
	}
	run, err := database.CreateRunFromAccepted(db.RunInput{Accepted: db.AcceptedRef{RepoID: "repo", Branch: "main", GateHead: candidate, LaunchNonce: "nonce"}, BaseSHA: base})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.TransitionRunStatus(run.ID, "pending", "running"); err != nil {
		t.Fatal(err)
	}
	mirrored := false
	if _, err := Publish(context.Background(), database, run.ID, PushRequest{Worktree: work, Remote: remote, Ref: "refs/heads/main", Candidate: candidate, ReviewedHead: candidate, VerifiedHead: base}, func(context.Context, string) error { mirrored = true; return nil }); err != nil {
		t.Fatal(err)
	}
	if !mirrored {
		t.Fatal("mirror callback was not called")
	}
	publication, err := database.GetPublication(run.ID)
	if err != nil || publication == nil {
		t.Fatalf("publication=%v err=%v", publication, err)
	}
	if publication.Candidate != candidate || publication.VerifiedUpstream != candidate {
		t.Fatalf("publication=%+v", publication)
	}
	recovered, err := Publish(context.Background(), database, run.ID, PushRequest{Remote: remote, Ref: "refs/heads/main", Candidate: candidate, ReviewedHead: candidate}, func(context.Context, string) error { t.Fatal("recovery re-ran mirror"); return nil })
	if err != nil || recovered.Candidate != candidate {
		t.Fatalf("recovery=%+v err=%v", recovered, err)
	}
}

func TestPublishReleasesInterruptedFirstPublication(t *testing.T) {
	root := t.TempDir()
	remote := filepath.Join(root, "remote.git")
	work := filepath.Join(root, "work")
	gitTest(t, root, "init", "--bare", remote)
	gitTest(t, root, "init", work)
	gitTest(t, work, "config", "user.email", "test@example.com")
	gitTest(t, work, "config", "user.name", "Test")
	if err := os.WriteFile(filepath.Join(work, "file"), []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitTest(t, work, "add", "file")
	gitTest(t, work, "commit", "-m", "one")
	base := strings.TrimSpace(gitTest(t, work, "rev-parse", "HEAD"))
	if err := os.WriteFile(filepath.Join(work, "file"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitTest(t, work, "commit", "-am", "two")
	candidate := strings.TrimSpace(gitTest(t, work, "rev-parse", "HEAD"))
	database, err := db.Open(filepath.Join(root, "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.InsertRepoWithID("repo", work, remote, "main"); err != nil {
		t.Fatal(err)
	}
	run, err := database.CreateRunFromAccepted(db.RunInput{Accepted: db.AcceptedRef{RepoID: "repo", Branch: "main", GateHead: candidate, LaunchNonce: "nonce"}, BaseSHA: base})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.TransitionRunStatus(run.ID, "pending", "running"); err != nil {
		t.Fatal(err)
	}
	if err := database.AcquireRunPushActive(run.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := Publish(context.Background(), database, run.ID, PushRequest{Worktree: work, Remote: remote, Ref: "refs/heads/main", Candidate: candidate, ReviewedHead: candidate, VerifiedHead: ""}, func(context.Context, string) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if got := strings.TrimSpace(gitTest(t, root, "--git-dir", remote, "rev-parse", "refs/heads/main")); got != candidate {
		t.Fatalf("published head=%s want %s", got, candidate)
	}
}
