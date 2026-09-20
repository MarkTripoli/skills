package steps

import (
	"context"
	"fmt"
	"os/exec"
)

type worktreeKey struct{}

// WithWorktree binds the run-owned checkout to validation steps.
func WithWorktree(ctx context.Context, dir string) context.Context {
	return context.WithValue(ctx, worktreeKey{}, dir)
}

func worktree(ctx context.Context) string {
	dir, _ := ctx.Value(worktreeKey{}).(string)
	return dir
}

// Validate performs the common fail-closed checks shared by the configured
// gates. Repository-specific agent and provider work is layered on top by the
// caller; no step is represented by an unconditional placeholder anymore.
func Validate(ctx context.Context, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	dir := worktree(ctx)
	if dir == "" {
		return fmt.Errorf("%s: owned worktree is required", name)
	}
	cmd := exec.CommandContext(ctx, "git", "-C", dir, "diff", "--check")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: git diff --check: %s: %w", name, out, err)
	}
	return nil
}
