package assistant

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

// TestRunPurgeTicksOnceAfterWarmup verifies that runPurgeLoop fires Purge
// exactly once after the warmup delay. It uses an injected s.Now clock and a
// stale DM request to observe that the purge ran.
func TestRunPurgeTicksOnceAfterWarmup(t *testing.T) {
	s, _, clock := newTestService(t)
	ctx := context.Background()

	// Retention: 30-day window, 7-day consumed window.
	const days, consumedDays = 30, 7
	s.Retention = config.Retention{Days: days, ConsumedDays: consumedDays}

	// Insert a DM request old enough to be purged (31 days > retention.days).
	staleRoot := "1700000000.999"
	_, err := s.DB.InsertDMRequest(ctx, db.DMRequest{
		RootTS:        staleRoot,
		ChannelID:     "D1",
		ReceivedAt:    clock.at.UTC().AddDate(0, 0, -31).Format(time.RFC3339),
		LastMessageAt: clock.at.UTC().AddDate(0, 0, -31).Format(time.RFC3339),
	})
	if err != nil {
		t.Fatal(err)
	}

	// Run the purge loop with a 5 ms warmup (much shorter than 1 min) and a
	// 1-hour repeat period so only the initial tick fires during the test.
	loopCtx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		s.runPurgeLoop(loopCtx, 5*time.Millisecond, time.Hour)
	}()

	// Give the warmup enough wall time to fire, then stop the loop.
	time.Sleep(100 * time.Millisecond)
	cancel()
	<-done

	// The stale DM request must have been deleted by the purge.
	_, ok, err := s.DB.GetDMRequest(ctx, staleRoot)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("stale dm_request still present; RunPurge did not fire")
	}
}

// TestRunPurgeRemovesDeletedAndOrphanedRunDirs verifies that after a purge tick:
//   - run directories for deleted (purged) runs are removed,
//   - a directory whose name has no assistant_runs row (orphan) is removed,
//   - a run directory whose row still exists (live run) is kept.
func TestRunPurgeRemovesDeletedAndOrphanedRunDirs(t *testing.T) {
	p := paths.WithRoot(t.TempDir())
	s, _, clock := newTestServiceAt(t, p)
	ctx := context.Background()

	s.Retention = config.Retention{Days: 30, ConsumedDays: 7}

	staleAt := clock.at.UTC().AddDate(0, 0, -31).Format(time.RFC3339)
	recentAt := clock.at.UTC().Format(time.RFC3339)

	// Two runs that will be deleted by Purge via stale dm_request cleanup.
	for _, id := range []string{"RUNDELETED1", "RUNDELETED2"} {
		root := id + ".root"
		if _, err := s.DB.InsertDMRequest(ctx, db.DMRequest{
			RootTS:        root,
			ChannelID:     "D1",
			ReceivedAt:    staleAt,
			LastMessageAt: staleAt,
		}); err != nil {
			t.Fatal(err)
		}
		if err := s.DB.InsertAssistantRun(ctx, db.AssistantRun{
			RunID:    id,
			Kind:     db.RunKindDM,
			RootTS:   sql.NullString{String: root, Valid: true},
			State:    db.RunDone,
			QueuedAt: staleAt,
		}); err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(p.RunDir(id), 0o700); err != nil {
			t.Fatal(err)
		}
	}

	// One live run whose dm_request is recent; its directory must survive.
	liveRoot := "RUNLIVE.root"
	if _, err := s.DB.InsertDMRequest(ctx, db.DMRequest{
		RootTS:        liveRoot,
		ChannelID:     "D1",
		ReceivedAt:    recentAt,
		LastMessageAt: recentAt,
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.InsertAssistantRun(ctx, db.AssistantRun{
		RunID:    "RUNLIVE",
		Kind:     db.RunKindDM,
		RootTS:   sql.NullString{String: liveRoot, Valid: true},
		State:    db.RunDone,
		QueuedAt: recentAt,
	}); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(p.RunDir("RUNLIVE"), 0o700); err != nil {
		t.Fatal(err)
	}

	// One orphaned directory: no assistant_runs row.
	if err := os.MkdirAll(p.RunDir("RUNORPHAN"), 0o700); err != nil {
		t.Fatal(err)
	}

	s.runPurgeOnce(ctx)

	for _, id := range []string{"RUNDELETED1", "RUNDELETED2", "RUNORPHAN"} {
		if _, err := os.Stat(p.RunDir(id)); !os.IsNotExist(err) {
			t.Errorf("run dir %s still exists after purge, want removed", id)
		}
	}
	if _, err := os.Stat(p.RunDir("RUNLIVE")); err != nil {
		t.Errorf("live run dir RUNLIVE missing after purge: %v", err)
	}
}

// TestRunPurgeLogsUnremovableDir verifies that a directory that cannot be
// removed is logged (with path and error) and that the tick still returns
// without error.
func TestRunPurgeLogsUnremovableDir(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("read-only directories are always writable by root")
	}

	p := paths.WithRoot(t.TempDir())
	s, _, _ := newTestServiceAt(t, p)
	ctx := context.Background()

	s.Retention = config.Retention{Days: 30, ConsumedDays: 7}

	// Create an orphan directory inside a read-only parent so RemoveAll fails.
	readonlyParent := filepath.Join(p.Workspace(), "runs", "readonly-parent")
	orphanDir := filepath.Join(readonlyParent, "RUNBLOCKED")
	if err := os.MkdirAll(orphanDir, 0o700); err != nil {
		t.Fatal(err)
	}
	// Make the parent unwritable so the child directory cannot be removed.
	if err := os.Chmod(readonlyParent, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(readonlyParent, 0o700) })

	logged := captureLog(t)

	// runPurgeOnce must not return an error even when a removal fails.
	s.runPurgeOnce(ctx)

	// The blocked directory must still exist.
	if _, err := os.Stat(readonlyParent); err != nil {
		t.Errorf("readonly-parent should still exist: %v", err)
	}

	// The slog.Error for the failed removal must have been written.
	if !strings.Contains(logged.String(), "run directory not removed") {
		t.Errorf("expected 'run directory not removed' in log, got: %s", logged.String())
	}
}
