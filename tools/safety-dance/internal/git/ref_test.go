package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDirectRefTargetDistinguishesDirectSymbolicAndMissingRefs(t *testing.T) {
	dir := t.TempDir()
	runGitOrFatal(t, dir, "init", "-q", "-b", "main")
	runGitOrFatal(t, dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "init")
	head := strings.TrimSpace(runGitOrFatal(t, dir, "rev-parse", "HEAD"))
	runGitOrFatal(t, dir, "symbolic-ref", "refs/heads/alias", "refs/heads/main")
	if runtime.GOOS != "windows" {
		realGit, err := exec.LookPath("git")
		if err != nil {
			t.Fatal(err)
		}
		shimDir := t.TempDir()
		// Delegate repository operations to real Git, but model Git 2.34's
		// rejection of the newer symbolic-ref option.
		shim := "#!/bin/sh\nfor arg do\nif [ \"$arg\" = '--no-recurse' ]; then exit 129; fi\ndone\nexec '" +
			strings.ReplaceAll(realGit, "'", "'\"'\"'") + "' \"$@\"\n"
		if err := os.WriteFile(filepath.Join(shimDir, "git"), []byte(shim), 0o700); err != nil {
			t.Fatal(err)
		}
		t.Setenv("PATH", shimDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	}
	ctx := context.Background()

	if target, exists, err := DirectRefTarget(ctx, dir, "refs/heads/main"); err != nil || !exists || target != head {
		t.Fatalf("direct ref: %q, %v, %v; want %s", target, exists, err, head)
	}
	if _, _, err := DirectRefTarget(ctx, dir, "refs/heads/alias"); err == nil || !strings.Contains(err.Error(), "is symbolic") {
		t.Fatalf("symbolic ref: %v; want an is-symbolic error", err)
	}
	if target, exists, err := DirectRefTarget(ctx, dir, "refs/heads/missing"); err != nil || exists || target != "" {
		t.Fatalf("missing ref: %q, %v, %v; want absent", target, exists, err)
	}
}
