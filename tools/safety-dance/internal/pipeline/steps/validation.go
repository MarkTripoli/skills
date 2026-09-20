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
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

type worktreeKey struct{}
type repoConfigKey struct{}
type configKey struct{}
type databaseKey struct{}
type scmKey struct{}

func WithSCM(ctx context.Context, host scm.Host) context.Context {
	return context.WithValue(ctx, scmKey{}, host)
}
func scmHost(ctx context.Context) scm.Host { host, _ := ctx.Value(scmKey{}).(scm.Host); return host }

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
func dbValue(ctx context.Context) *db.DB {
	database, _ := ctx.Value(databaseKey{}).(*db.DB)
	return database
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
func parseTypedVerdict(raw []byte) (string, error) {
	var verdict struct {
		Verdict string `json:"verdict"`
	}
	if err := json.Unmarshal(raw, &verdict); err != nil {
		return "", fmt.Errorf("invalid verdict: %w", err)
	}
	if verdict.Verdict != "pass" && verdict.Verdict != "fail" && verdict.Verdict != "blocked" {
		return "", fmt.Errorf("invalid verdict %q", verdict.Verdict)
	}
	return verdict.Verdict, nil
}

type typedResult struct {
	Verdict  string            `json:"verdict"`
	Findings []json.RawMessage `json:"findings"`
	Evidence []string          `json:"evidence"`
}

func parseTypedResult(raw []byte) (typedResult, error) {
	var result typedResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return result, fmt.Errorf("invalid typed result: %w", err)
	}
	if result.Verdict != "pass" && result.Verdict != "fail" && result.Verdict != "blocked" {
		return result, fmt.Errorf("invalid verdict %q", result.Verdict)
	}
	if len(result.Evidence) == 0 {
		return result, fmt.Errorf("typed result has no evidence")
	}
	return result, nil
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
	roleCfg := cfg
	if name == "review" {
		if entry, ok := cfg.ReviewAgents["reviewer"]; ok {
			roleCfg = cfg.ForReviewAgent(entry)
		}
	}
	candidates := append([]types.AgentName(nil), roleCfg.Agents...)
	if len(candidates) == 0 {
		candidates = []types.AgentName{roleCfg.Agent}
	}
	var lastErr error
	for _, candidate := range candidates {
		a, err := agent.NewWithOptions(candidate, roleCfg.AgentPathFor(candidate), roleCfg.AgentArgsFor(candidate), agent.Options{ACPRegistryOverrides: roleCfg.ACPRegistryOverrides, DisableProjectSettings: roleCfg.DisableProjectSettings, Profile: roleCfg.AgentProfileFor(candidate)})
		if err != nil {
			lastErr = err
			continue
		}
		if err := agent.EnsureGateNeutralized(a); err != nil {
			_ = a.Close()
			lastErr = err
			continue
		}
		res, runErr := a.Run(ctx, agent.RunOpts{CWD: worktree(ctx), Purpose: name, Env: []string{"SD_PARENT_RUN_ID=" + runID(ctx)}, Prompt: fmt.Sprintf("Run the typed %s validation for this checkout and return verdict, findings, and evidence.", name), JSONSchema: json.RawMessage(`{"type":"object","required":["verdict","findings","evidence"],"properties":{"verdict":{"type":"string","enum":["pass","fail","blocked"]},"findings":{"type":"array"},"evidence":{"type":"array","items":{"type":"string"}}}}`)})
		_ = a.Close()
		if runErr != nil {
			lastErr = runErr
			continue
		}
		if res == nil || len(res.Output) == 0 {
			lastErr = fmt.Errorf("no typed result")
			continue
		}
		result, parseErr := parseTypedResult(res.Output)
		if parseErr != nil {
			lastErr = parseErr
			continue
		}
		if result.Verdict != "pass" {
			return fmt.Errorf("%s: typed validation verdict %q", name, result.Verdict)
		}
		if sink := db.TypedEvidenceSinkFrom(ctx); sink != nil {
			findings, marshalErr := json.Marshal(result.Findings)
			if marshalErr != nil {
				return fmt.Errorf("marshal typed findings: %w", marshalErr)
			}
			sink.Value = &db.TypedEvidence{FindingsJSON: string(findings), Evidence: append([]string(nil), result.Evidence...)}
		}
		return nil
	}
	return fmt.Errorf("%s: typed validation failed: %w", name, lastErr)
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
