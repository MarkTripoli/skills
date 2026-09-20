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
