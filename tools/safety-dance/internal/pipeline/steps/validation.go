package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/agent"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
)

type worktreeKey struct{}
type repoConfigKey struct{}
type configKey struct{}
type databaseKey struct{}
type runIDKey struct{}

func WithWorktree(ctx context.Context, dir string) context.Context {
	return context.WithValue(ctx, worktreeKey{}, dir)
}

// WithRepoConfig is retained for package-level repository-check callers.
func WithRepoConfig(ctx context.Context, cfg *config.RepoConfig) context.Context {
	return context.WithValue(ctx, repoConfigKey{}, cfg)
}

// WithConfig binds the complete trusted merged execution policy. Production
// steps must use this instead of a repository-only projection.
func WithConfig(ctx context.Context, cfg *config.Config) context.Context {
	return context.WithValue(ctx, configKey{}, cfg)
}

func WithRun(ctx context.Context, database *db.DB, runID string) context.Context {
	ctx = context.WithValue(ctx, databaseKey{}, database)
	return context.WithValue(ctx, runIDKey{}, runID)
}

func worktree(ctx context.Context) string { dir, _ := ctx.Value(worktreeKey{}).(string); return dir }
func repoConfig(ctx context.Context) *config.RepoConfig {
	cfg, _ := ctx.Value(repoConfigKey{}).(*config.RepoConfig)
	return cfg
}
func mergedConfig(ctx context.Context) *config.Config {
	cfg, _ := ctx.Value(configKey{}).(*config.Config)
	return cfg
}
func runID(ctx context.Context) string { id, _ := ctx.Value(runIDKey{}).(string); return id }

func requiredCommand(cfg *config.RepoConfig, name string) string {
	if cfg == nil {
		return ""
	}
	return map[string]string{"intent": cfg.Commands.Prepare, "rebase": cfg.Commands.Rebase, "review": cfg.Commands.Review, "test": cfg.Commands.Test, "lint": cfg.Commands.Lint, "document": cfg.Commands.Format, "pull-request": cfg.Commands.PullRequest, "ci": cfg.Commands.CI}[name]
}

// configuredCommand exposes shell only for explicit repository checks. Typed
// stages never consult commands, preventing a command from self-certifying a gate.
func configuredCommand(ctx context.Context, name string) string {
	if cfg := mergedConfig(ctx); cfg != nil {
		return map[string]string{"test": cfg.Commands.Test, "lint": cfg.Commands.Lint, "document": cfg.Commands.Format}[name]
	}
	return requiredCommand(repoConfig(ctx), name)
}

// Typed delegates non-shell validation to the configured typed agent owner.
func Typed(ctx context.Context, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if worktree(ctx) == "" {
		return fmt.Errorf("%s: owned worktree is required", name)
	}
	cfg := mergedConfig(ctx)
	if cfg == nil || cfg.Agent == "" {
		return fmt.Errorf("%s: typed validation owner is required", name)
	}
	a, err := agent.NewWithOptions(cfg.Agent, cfg.AgentPath(), cfg.AgentArgs(), agent.Options{
		ACPRegistryOverrides:   cfg.ACPRegistryOverrides,
		DisableProjectSettings: cfg.DisableProjectSettings,
		Profile:                cfg.AgentProfileFor(cfg.Agent),
	})
	if err != nil {
		return fmt.Errorf("%s: construct typed validation owner: %w", name, err)
	}
	defer a.Close()
	res, err := a.Run(ctx, agent.RunOpts{
		CWD: worktree(ctx), Purpose: name,
		Prompt:     fmt.Sprintf("Run the typed %s validation for this checkout and return the structured verdict.", name),
		JSONSchema: json.RawMessage(`{"type":"object","required":["verdict"],"properties":{"verdict":{"type":"string"}}}`),
	})
	if err != nil {
		return fmt.Errorf("%s: typed validation failed: %w", name, err)
	}
	if res == nil || len(res.Output) == 0 {
		return fmt.Errorf("%s: typed validation returned no verdict", name)
	}
	return nil
}

// Validate runs an explicitly configured repository check in the owned worktree.
func Validate(ctx context.Context, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	dir := worktree(ctx)
	if dir == "" {
		return fmt.Errorf("%s: owned worktree is required", name)
	}
	command := configuredCommand(ctx, name)
	if command == "" {
		return fmt.Errorf("%s: configured repository check is required", name)
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
