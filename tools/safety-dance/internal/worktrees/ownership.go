package worktrees

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// CreateDetached creates and verifies one disposable worktree for a run.
func CreateDetached(ctx context.Context, source, dir, head string) error {
	if source == "" || dir == "" || head == "" {
		return fmt.Errorf("source, directory, and head are required")
	}
	if err := os.MkdirAll(filepath.Dir(dir), 0755); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, "git", "-C", source, "worktree", "add", "--detach", dir, head)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("create worktree: %w: %s", err, out)
	}
	verify := exec.CommandContext(ctx, "git", "-C", dir, "rev-parse", "HEAD")
	out, err := verify.Output()
	if err != nil {
		return fmt.Errorf("verify worktree: %w", err)
	}
	got := strings.TrimSpace(string(out))
	if got != head {
		return fmt.Errorf("worktree head mismatch: got %s want %s", got, head)
	}
	return nil
}
func RemoveDetached(ctx context.Context, source, dir string) error {
	cmd := exec.CommandContext(ctx, "git", "-C", source, "worktree", "remove", "--force", dir)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("remove worktree: %w: %s", err, out)
	}
	return nil
}
