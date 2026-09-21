package worktrees

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecoverDetachedRecreatesMissingOwnedWorktree(t *testing.T) {
	source := t.TempDir()
	run(t, source, "git", "init", "-q")
	run(t, source, "git", "config", "user.email", "test@example.com")
	run(t, source, "git", "config", "user.name", "Test")
	run(t, source, "sh", "-c", "printf x > file && git add file && git commit -qm init")
	head := strings.TrimSpace(string(runOut(t, source, "git", "rev-parse", "HEAD")))
	dir := filepath.Join(t.TempDir(), "run")
	if err := RecoverDetached(context.Background(), source, dir, head); err != nil {
		t.Fatal(err)
	}
	if got := strings.TrimSpace(string(runOut(t, dir, "git", "rev-parse", "HEAD"))); got != head {
		t.Fatalf("head=%s want=%s", got, head)
	}
}

func run(t *testing.T, dir string, name string, args ...string) {
	t.Helper()
	c := exec.Command(name, args...)
	c.Dir = dir
	if out, err := c.CombinedOutput(); err != nil {
		t.Fatalf("%s: %v %s", name, err, out)
	}
}
func runOut(t *testing.T, dir string, name string, args ...string) []byte {
	t.Helper()
	c := exec.Command(name, args...)
	c.Dir = dir
	out, err := c.CombinedOutput()
	if err != nil {
		t.Fatalf("%s: %v %s", name, err, out)
	}
	return out
}
