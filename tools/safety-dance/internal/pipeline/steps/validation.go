package steps

import (
	"context"
	"fmt"
	"os/exec"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
)

type worktreeKey struct{}
type repoConfigKey struct{}

// WithWorktree binds the run-owned checkout to validation steps.
func WithWorktree(ctx context.Context, dir string) context.Context {
	return context.WithValue(ctx, worktreeKey{}, dir)
}

// WithRepoConfig binds the trusted repository policy to validation steps.
func WithRepoConfig(ctx context.Context, cfg *config.RepoConfig) context.Context {
	return context.WithValue(ctx, repoConfigKey{}, cfg)
}

func worktree(ctx context.Context) string {
	dir, _ := ctx.Value(worktreeKey{}).(string)
	return dir
}

func repoConfig(ctx context.Context) *config.RepoConfig {
	cfg, _ := ctx.Value(repoConfigKey{}).(*config.RepoConfig)
	return cfg
}

// Validate runs the stage-specific trusted command, then the common diff check.
// A configured command is executed in the run-owned worktree and must pass.
func Validate(ctx context.Context, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	dir := worktree(ctx)
	if dir == "" {
		return fmt.Errorf("%s: owned worktree is required", name)
	}
	if cfg := repoConfig(ctx); cfg != nil {
		command := ""
		switch name {
		case "intent":
			command = cfg.Commands.Prepare
		case "test":
			command = cfg.Commands.Test
		case "lint":
			command = cfg.Commands.Lint
		case "document":
			command = cfg.Commands.Format
		}
		if command != "" {
			cmd := exec.CommandContext(ctx, "sh", "-c", command)
			cmd.Dir = dir
			if out, err := cmd.CombinedOutput(); err != nil {
				return fmt.Errorf("%s: configured command failed: %s: %w", name, out, err)
			}
		}
	}
	cmd := exec.CommandContext(ctx, "git", "-C", dir, "diff", "--check")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: git diff --check: %s: %w", name, out, err)
	}
	return nil
}
