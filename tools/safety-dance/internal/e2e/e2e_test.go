package e2e

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/daemon"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/pipeline"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/pipeline/steps"
)

func TestLocalPipelineFixture(t *testing.T) {
	r := pipeline.New()
	var got []pipeline.StepName
	for _, name := range pipeline.CoreSteps {
		name := name
		r.Register(name, func(context.Context) error { got = append(got, name); return nil })
	}
	if _, err := r.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, pipeline.CoreSteps) {
		t.Fatalf("pipeline order = %v, want %v", got, pipeline.CoreSteps)
	}
}

func TestValidationFailureStopsPublication(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	run, err := database.InsertRun("repo", "main", "candidate", "")
	if err != nil {
		t.Fatal(err)
	}
	r := pipeline.NewDurable(database, run.ID)
	called := map[pipeline.StepName]bool{}
	for _, name := range pipeline.CoreSteps {
		name := name
		r.Register(name, func(context.Context) error {
			called[name] = true
			if name == pipeline.StepReview {
				return errors.New("review rejected candidate")
			}
			return nil
		})
	}
	if _, err := r.Run(context.Background()); err == nil {
		t.Fatal("expected validation failure")
	}
	if called[pipeline.StepPush] || called[pipeline.StepPullRequest] || called[pipeline.StepCI] {
		t.Fatalf("publication steps ran after validation failure: %#v", called)
	}
	if rows, err := database.GetStepsByRun(run.ID); err != nil || len(rows) != 3 {
		t.Fatalf("durable failed-step rows=%d, err=%v", len(rows), err)
	}
}

func TestSameBranchSupersessionCancelsPriorRun(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	started := make(chan string, 2)
	manager := daemon.NewManager(database, func(ctx context.Context, run *db.Run) {
		started <- run.ID
		<-ctx.Done()
	})
	key := daemon.BranchKey{RepositoryID: "repo", Ref: "refs/heads/main"}
	first, err := manager.Replace(context.Background(), key, db.AcceptedRef{RepoID: "repo", Branch: key.Ref, GateHead: "a", LaunchNonce: "a"}, filepath.Join(t.TempDir(), "one"))
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first run did not start")
	}
	second, err := manager.Replace(context.Background(), key, db.AcceptedRef{RepoID: "repo", Branch: key.Ref, GateHead: "b", LaunchNonce: "b"}, filepath.Join(t.TempDir(), "two"))
	if err != nil {
		t.Fatal(err)
	}
	if first.ID == second.ID {
		t.Fatal("supersession reused the active run")
	}
	old, err := database.GetRun(first.ID)
	if err != nil || old.Status != "cancelled" {
		t.Fatalf("old run status=%q, err=%v", old.Status, err)
	}
	select {
	case got := <-started:
		if got != second.ID {
			t.Fatalf("replacement run=%s, want %s", got, second.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("replacement run did not start")
	}
	manager.Active(key).Cancel()
}

func TestTemporaryUpstreamPublicationMatrix(t *testing.T) {
	work, upstream, candidate := temporaryRepository(t)
	ref := "refs/heads/main"

	t.Run("success", func(t *testing.T) {
		result, err := steps.Push(context.Background(), steps.PushRequest{Worktree: work, Remote: upstream, Ref: ref, Candidate: candidate, ReviewedHead: candidate})
		if err != nil {
			t.Fatal(err)
		}
		if result.Upstream != candidate {
			t.Fatalf("published head = %s, want %s", result.Upstream, candidate)
		}
	})
	t.Run("stale-reviewed-head", func(t *testing.T) {
		_, err := steps.Push(context.Background(), steps.PushRequest{Worktree: work, Remote: upstream, Ref: ref, Candidate: candidate, ReviewedHead: "different"})
		if err == nil {
			t.Fatal("expected reviewed-head rejection")
		}
	})
	t.Run("lease-rejection", func(t *testing.T) {
		_, err := steps.Push(context.Background(), steps.PushRequest{Worktree: work, Remote: upstream, Ref: ref, Candidate: candidate, ReviewedHead: candidate, VerifiedHead: "different"})
		if err == nil {
			t.Fatal("expected remote-head rejection")
		}
	})
	t.Run("cancellation", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := steps.Push(ctx, steps.PushRequest{Worktree: work, Remote: upstream, Ref: ref, Candidate: candidate, ReviewedHead: candidate})
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("error = %v, want cancellation", err)
		}
	})
}

func TestPublicationRecoveryAfterRemoteWrite(t *testing.T) {
	work, upstream, candidate := temporaryRepository(t)
	database, err := db.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.InsertRepoWithID("repo", work, upstream, "main"); err != nil {
		t.Fatal(err)
	}
	run, err := database.InsertRun("repo", "main", candidate, "")
	if err != nil {
		t.Fatal(err)
	}
	ref := "refs/heads/main"
	failMirror := true
	mirror := func(ctx context.Context, sha string) error {
		if failMirror {
			failMirror = false
			return errors.New("simulated interruption after remote write")
		}
		return nil
	}
	req := steps.PushRequest{Worktree: work, Remote: upstream, Ref: ref, Candidate: candidate, ReviewedHead: candidate}
	if _, err := steps.Publish(context.Background(), database, run.ID, req, mirror); err == nil {
		t.Fatal("expected first publication to stop before binding")
	}
	if _, err := steps.Publish(context.Background(), database, run.ID, req, mirror); err != nil {
		t.Fatalf("recovery publication: %v", err)
	}
	if publication, err := database.GetPublication(run.ID); err != nil || publication == nil || publication.Candidate != candidate {
		t.Fatalf("publication binding = %#v, err=%v", publication, err)
	}
}

func temporaryRepository(t *testing.T) (work, upstream, candidate string) {
	t.Helper()
	root := t.TempDir()
	work = filepath.Join(root, "work")
	upstream = filepath.Join(root, "upstream.git")
	runGit(t, root, "init", work)
	runGit(t, work, "config", "user.email", "test@example.com")
	runGit(t, work, "config", "user.name", "Safety Dance Test")
	if err := os.WriteFile(filepath.Join(work, "README"), []byte("candidate\n"), 0600); err != nil {
		t.Fatal(err)
	}
	runGit(t, work, "add", "README")
	runGit(t, work, "commit", "-m", "candidate")
	candidate = runGit(t, work, "rev-parse", "HEAD")
	runGit(t, root, "init", "--bare", upstream)
	runGit(t, work, "push", upstream, "HEAD:refs/heads/main")
	return work, upstream, candidate
}

func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return stringTrim(string(out))
}

func stringTrim(value string) string {
	for len(value) > 0 && (value[len(value)-1] == '\n' || value[len(value)-1] == '\r' || value[len(value)-1] == ' ') {
		value = value[:len(value)-1]
	}
	return value
}
