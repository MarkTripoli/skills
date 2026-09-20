package worktrees

import (
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"path/filepath"
	"testing"
)

func TestOwnershipPathIsRecorded(t *testing.T) {
	p := paths.WithRoot(t.TempDir())
	l := New(p, nil)
	got := l.Dir("repo", "/checkout", "run")
	want := filepath.Join(p.WorktreesDir(), "repo", "run")
	if got != want {
		t.Fatalf("got %s want %s", got, want)
	}
	if RecordedDir(p, "/custom/run", "repo", "run") != "/custom/run" {
		t.Fatal("recorded path changed")
	}
}
func TestCleanupPreservesUnknown(t *testing.T) {
	p := paths.WithRoot(t.TempDir())
	unknown := filepath.Join(p.WorktreesDir(), "foreign")
	if got := RecordedDir(p, unknown, "repo", "run"); got != unknown {
		t.Fatal("unknown path was rewritten")
	}
}
