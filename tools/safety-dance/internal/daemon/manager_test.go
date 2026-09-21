package daemon

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
)

func TestSameBranchSupersede(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err = d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	started := 0
	m := NewManager(d, func(ctx context.Context, r *db.Run) { mu.Lock(); started++; mu.Unlock(); <-ctx.Done() })
	key := BranchKey{"repo", "refs/heads/main"}
	first, err := m.Replace(context.Background(), key, db.AcceptedRef{RepoID: "repo", Branch: key.Ref, GateHead: "a", LaunchNonce: "1"}, "/tmp/one")
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(20 * time.Millisecond)
	second, err := m.Replace(context.Background(), key, db.AcceptedRef{RepoID: "repo", Branch: key.Ref, GateHead: "b", LaunchNonce: "2"}, "/tmp/two")
	if err != nil {
		t.Fatal(err)
	}
	if first.ID == second.ID {
		t.Fatal("replacement reused run")
	}
	r, _ := d.GetRun(first.ID)
	if r.Status != "cancelled" {
		t.Fatalf("old run status=%s", r.Status)
	}
	mu.Lock()
	if started < 2 {
		t.Fatalf("started=%d", started)
	}
	mu.Unlock()
	m.Active(key).Cancel()
}

func TestDifferentBranchesOverlap(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err = d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	started := make(chan string, 2)
	release := make(chan struct{})
	m := NewManager(d, func(ctx context.Context, r *db.Run) { started <- r.Branch; <-release })
	if _, err = m.Replace(context.Background(), BranchKey{"repo", "refs/heads/main"}, db.AcceptedRef{RepoID: "repo", Branch: "refs/heads/main", GateHead: "a", LaunchNonce: "a"}, "/tmp/a"); err != nil {
		t.Fatal(err)
	}
	if _, err = m.Replace(context.Background(), BranchKey{"repo", "refs/heads/dev"}, db.AcceptedRef{RepoID: "repo", Branch: "refs/heads/dev", GateHead: "b", LaunchNonce: "b"}, "/tmp/b"); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for i := 0; i < 2; i++ {
		seen[<-started] = true
	}
	close(release)
	if len(seen) != 2 {
		t.Fatalf("branches did not overlap: %v", seen)
	}
}

func TestRestartRecoveryListsActiveRuns(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err = d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	r, err := d.InsertRun("repo", "refs/heads/main", "head", "base")
	if err != nil {
		t.Fatal(err)
	}
	active, err := d.RecoverableRuns()
	if err != nil {
		t.Fatal(err)
	}
	if len(active) != 1 || active[0].ID != r.ID {
		t.Fatalf("recovery=%v", active)
	}
	resumed := make(chan string, 1)
	recovered := NewManager(d, func(ctx context.Context, run *db.Run) { resumed <- run.ID })
	if err := recovered.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-resumed:
		if got != r.ID {
			t.Fatalf("resumed run=%s, want %s", got, r.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("manager did not resume recovered run")
	}
}

func TestOwnershipJournalFailureDoesNotStrandRunningRun(t *testing.T) {
	home := t.TempDir()
	t.Setenv("SD_HOME", home)
	d, err := db.Open(filepath.Join(home, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err = d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	worktree := filepath.Join(home, "worktrees", "repo", "run")
	sum := sha256.Sum256([]byte(filepath.Clean(worktree)))
	marker := filepath.Join(home, "worktrees", ".safety-dance-journals", hex.EncodeToString(sum[:])+".safety-dance-pending.json")
	if err := os.MkdirAll(marker, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(marker, "keep"), []byte("occupied"), 0o600); err != nil {
		t.Fatal(err)
	}
	m := NewManager(d, func(context.Context, *db.Run) { t.Error("stranded run started") })
	key := BranchKey{"repo", "refs/heads/main"}
	_, err = m.Replace(context.Background(), key, db.AcceptedRef{RepoID: "repo", Branch: key.Ref, GateHead: "head", LaunchNonce: "nonce"}, worktree)
	if err == nil {
		t.Fatal("expected ownership journal failure")
	}
	if m.Active(key) != nil {
		t.Fatal("failed ownership commit registered an active run")
	}
	runs, err := d.GetRunsByRepo("repo")
	if err != nil || len(runs) != 1 {
		t.Fatalf("runs=%v err=%v", runs, err)
	}
	if runs[0].Status != "failed" {
		t.Fatalf("run status=%s, want failed", runs[0].Status)
	}
}
