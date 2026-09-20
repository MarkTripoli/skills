package daemon

import (
	"context"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"path/filepath"
	"sync"
	"testing"
	"time"
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
