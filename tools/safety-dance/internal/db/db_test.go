package db

import (
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"path/filepath"
	"testing"
)

func TestAcceptedRefAndGuardedTransition(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err = d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	r, err := d.CreateRunFromAccepted(RunInput{Accepted: AcceptedRef{RepoID: "repo", Branch: "refs/heads/main", GateHead: "abc", LaunchNonce: "n"}, WorktreeDir: "/tmp/run"})
	if err != nil {
		t.Fatal(err)
	}
	if err = d.TransitionRunStatus(r.ID, types.RunPending, types.RunRunning); err != nil {
		t.Fatal(err)
	}
	if err = d.TransitionRunStatus(r.ID, types.RunPending, types.RunCompleted); err == nil {
		t.Fatal("expected compare-and-set conflict")
	}
	if err = d.CancelRun(r.ID, "superseded"); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetRun(r.ID)
	if got.Status != types.RunCancelled {
		t.Fatalf("status=%s", got.Status)
	}
}
