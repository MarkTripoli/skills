package db

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestRunsRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.sqlite")
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()

	if _, err := d.GetRun(ctx, "missing"); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("GetRun(missing) = %v, want ErrRunNotFound", err)
	}

	want := Run{RunID: "r1", OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1.0", Permalink: "https://x/p", Lifecycle: "active", SlackMode: "enabled", StartedAt: "2026-09-21T00:00:00Z"}
	if err := d.InsertRun(ctx, want); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetRun(ctx, "r1")
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("GetRun = %+v, want %+v", got, want)
	}
	if err := d.InsertRun(ctx, want); err == nil {
		t.Fatal("duplicate run_id inserted")
	}
	if err := d.InsertRun(ctx, Run{RunID: "r2", OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1", Permalink: "p", Lifecycle: "bogus", SlackMode: "enabled", StartedAt: "t"}); err == nil {
		t.Fatal("lifecycle outside the CHECK constraint inserted")
	}

	for _, statePath := range []string{path, path + "-wal", path + "-shm"} {
		info, err := os.Stat(statePath)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		if mode := info.Mode().Perm(); mode != 0o600 {
			t.Fatalf("%s mode %o, want 600", statePath, mode)
		}
	}
}
