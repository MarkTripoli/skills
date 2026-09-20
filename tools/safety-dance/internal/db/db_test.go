package db

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	_ "modernc.org/sqlite"
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

func TestPublicationBindingSurvivesCancellationAfterRemoteWrite(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err = d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	r, err := d.CreateRunFromAccepted(RunInput{Accepted: AcceptedRef{RepoID: "repo", Branch: "refs/heads/main", GateHead: "candidate", LaunchNonce: "n2"}, WorktreeDir: "/tmp/run2"})
	if err != nil {
		t.Fatal(err)
	}
	if err = d.TransitionRunStatus(r.ID, types.RunPending, types.RunRunning); err != nil {
		t.Fatal(err)
	}
	if err = d.AcquireRunPushActive(r.ID); err != nil {
		t.Fatal(err)
	}
	if err = d.CancelRun(r.ID, "cancelled"); err != nil {
		t.Fatal(err)
	}
	binding := PushBinding{HeadSHA: "candidate", TargetKind: "remote", TargetFingerprint: "fingerprint", Ref: "refs/heads/main"}
	if err = d.RecordPublicationAndBinding(Publication{RunID: r.ID, RepoID: "repo", Ref: binding.Ref, Candidate: "candidate", VerifiedUpstream: "candidate", GateMirror: "candidate"}, binding); err != nil {
		t.Fatal(err)
	}
}

func TestOpenMigratesLegacyResponsesBeforeIndexes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.sqlite")
	legacy, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = legacy.Exec(`CREATE TABLE responses (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, step TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL); INSERT INTO responses(run_id,step,action,payload,created_at) VALUES ('run','review','approve','{}',1),('run','review','approve','{}',2)`)
	if err != nil {
		t.Fatal(err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}
	d, err := Open(path)
	if err != nil {
		t.Fatalf("legacy open: %v", err)
	}
	defer d.Close()
	var count int
	if err := d.sql.QueryRow(`SELECT count(*) FROM responses WHERE run_id='run'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("legacy duplicate count=%d, want 1", count)
	}
	var indexed int
	if err := d.sql.QueryRow(`SELECT count(*) FROM pragma_index_list('responses') WHERE name='idx_responses_prompt_generation'`).Scan(&indexed); err != nil {
		t.Fatal(err)
	}
	if indexed != 1 {
		t.Fatalf("prompt generation index count=%d, want 1", indexed)
	}
}
