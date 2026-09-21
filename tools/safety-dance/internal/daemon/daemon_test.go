package daemon

import (
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"testing"
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
