package steps

import (
	"context"
	"fmt"
	"os"
	"os/exec"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
)

type worktreeKey struct{}
type repoConfigKey struct{}
type databaseKey struct{}
type runIDKey struct{}

// WithWorktree binds the run-owned checkout to validation steps.
func WithWorktree(ctx context.Context, dir string) context.Context {
	return context.WithValue(ctx, worktreeKey{}, dir)
}

// WithRepoConfig binds the trusted repository policy to validation steps.
func WithRepoConfig(ctx context.Context, cfg *config.RepoConfig) context.Context {
	return context.WithValue(ctx, repoConfigKey{}, cfg)
}
func WithRun(ctx context.Context, database *db.DB, runID string) context.Context {
	ctx = context.WithValue(ctx, databaseKey{}, database)
	return context.WithValue(ctx, runIDKey{}, runID)
}

func worktree(ctx context.Context) string {
	dir, _ := ctx.Value(worktreeKey{}).(string)
	return dir
}

func repoConfig(ctx context.Context) *config.RepoConfig {
	cfg, _ := ctx.Value(repoConfigKey{}).(*config.RepoConfig)
	return cfg
}

func runID(ctx context.Context) string {
	id, _ := ctx.Value(runIDKey{}).(string)
	return id
}

func requiredCommand(cfg *config.RepoConfig, name string) string {
	if cfg == nil {
		return ""
	}
	return map[string]string{"intent": cfg.Commands.Prepare, "rebase": cfg.Commands.Rebase, "review": cfg.Commands.Review, "test": cfg.Commands.Test, "lint": cfg.Commands.Lint, "document": cfg.Commands.Format, "pull-request": cfg.Commands.PullRequest, "ci": cfg.Commands.CI}[name]
}

// Validate runs a configured stage command in the owned worktree. Production
// callers must provide a command for every stage that can approve publication.
func Validate(ctx context.Context, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	dir := worktree(ctx)
	if dir == "" {
		return fmt.Errorf("%s: owned worktree is required", name)
	}
	command := requiredCommand(repoConfig(ctx), name)
	if command == "" {
		return fmt.Errorf("%s: configured validation command is required", name)
	}
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "SD_PARENT_RUN_ID="+runID(ctx))
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: configured command failed: %s: %w", name, out, err)
	}
	check := exec.CommandContext(ctx, "git", "-C", dir, "diff", "--check")
	if out, err := check.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: git diff --check: %s: %w", name, out, err)
	}
	return nil
}
