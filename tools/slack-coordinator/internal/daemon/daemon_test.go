package daemon

import (
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
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
	if err := one.Close(); err != nil {
		t.Fatal(err)
	}
	two, err := AcquireOwnership(p)
	if err != nil {
		t.Fatalf("ownership not released after Close: %v", err)
	}
	two.Close()
}
