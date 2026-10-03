package daemon

import (
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"testing"
	"time"
)

func TestSingletonOwnership(t *testing.T) {
	p := paths.WithRoot(t.TempDir())
	one, err := AcquireOwnership(p)
	if err != nil {
		t.Fatal(err)
	}
	defer one.Close()
	if _, err := AcquireOwnership(p); err == nil {
		t.Fatal("second daemon acquired ownership")
	}
}

func TestWaitForOwnershipReleaseBlocksUntilTheOldDaemonLetsGo(t *testing.T) {
	p := paths.WithRoot(t.TempDir())
	if err := WaitForOwnershipRelease(p, time.Second); err != nil {
		t.Fatalf("no lock file yet: %v", err)
	}
	old, err := AcquireOwnership(p)
	if err != nil {
		t.Fatal(err)
	}
	if err := WaitForOwnershipRelease(p, 50*time.Millisecond); err == nil {
		t.Fatal("returned while the old daemon still held the lock")
	}
	// releasing closes before Close, so it cannot lag the unlock the helper
	// observes: seeing it open after the wait returns means the wait returned
	// before the old daemon began to release.
	releasing := make(chan struct{})
	go func() {
		time.Sleep(100 * time.Millisecond)
		close(releasing)
		old.Close()
	}()
	if err := WaitForOwnershipRelease(p, 5*time.Second); err != nil {
		t.Fatal(err)
	}
	select {
	case <-releasing:
	default:
		t.Fatal("returned before the old daemon began to release the lock")
	}
	next, err := AcquireOwnership(p)
	if err != nil {
		t.Fatalf("replacement could not take ownership after the wait: %v", err)
	}
	next.Close()
}
