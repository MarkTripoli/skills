package steps

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"runtime"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/agent"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/runenv"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/shellenv"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

type worktreeKey struct{}
type repoConfigKey struct{}
type configKey struct{}
type databaseKey struct{}
type scmKey struct{}
type typedAgentFactoryKey struct{}
type typedAgentFactory func(types.AgentName, *config.Config) (agent.Agent, error)

func withTypedAgentFactory(ctx context.Context, factory typedAgentFactory) context.Context {
	return context.WithValue(ctx, typedAgentFactoryKey{}, factory)
}
type evidenceDirKey struct{}

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
func WithEvidenceDir(ctx context.Context, dir string) context.Context {
	return context.WithValue(ctx, evidenceDirKey{}, dir)
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
func evidenceDir(ctx context.Context) string {
	dir, _ := ctx.Value(evidenceDirKey{}).(string)
	return dir
}

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

func typedEvidence(result typedResult) (*db.TypedEvidence, error) {
	items := make([]types.Finding, len(result.Findings))
	for i, raw := range result.Findings {
		if err := json.Unmarshal(raw, &items[i]); err != nil {
			return nil, fmt.Errorf("decode finding %d: %w", i, err)
		}
	}
	findings, err := json.Marshal(types.Findings{Items: items, Summary: result.Verdict, Verdict: result.Verdict})
	if err != nil {
		return nil, fmt.Errorf("marshal typed findings: %w", err)
	}
	return &db.TypedEvidence{FindingsJSON: string(findings), Evidence: append([]string(nil), result.Evidence...)}, nil
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
		var a agent.Agent
		var err error
		if factory, ok := ctx.Value(typedAgentFactoryKey{}).(typedAgentFactory); ok {
			a, err = factory(candidate, roleCfg)
		} else {
			a, err = agent.NewWithOptions(candidate, roleCfg.AgentPathFor(candidate), roleCfg.AgentArgsFor(candidate), agent.Options{ACPRegistryOverrides: roleCfg.ACPRegistryOverrides, DisableProjectSettings: roleCfg.DisableProjectSettings, Profile: roleCfg.AgentProfileFor(candidate)})
		}
		if err != nil {
			lastErr = err
			continue
		}
		if roleCfg.DisableProjectSettings {
			if err := agent.EnsureGateNeutralized(a); err != nil {
				_ = a.Close()
				lastErr = err
				continue
			}
		}
		opts := agent.RunOpts{CWD: worktree(ctx), Purpose: name, Env: []string{"SD_PARENT_RUN_ID=" + runID(ctx)}, Prompt: fmt.Sprintf("Run the typed %s validation for this checkout and return verdict, findings, and evidence.", name), JSONSchema: json.RawMessage(`{"type":"object","required":["verdict","findings","evidence"],"properties":{"verdict":{"type":"string","enum":["pass","fail","blocked"]},"findings":{"type":"array"},"evidence":{"type":"array","items":{"type":"string"}}}}`)}
		opts.OnAttempt = func(attempt agent.Attempt) {
			if database := dbValue(ctx); database != nil {
				_ = persistAgentAttempt(database, runID(ctx), name, attempt)
			}
		}
		res, runErr := a.Run(ctx, opts)
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
		if sink := db.TypedEvidenceSinkFrom(ctx); sink != nil {
			evidence, evidenceErr := typedEvidence(result)
			if evidenceErr != nil {
				lastErr = evidenceErr
				continue
			}
			sink.Value = evidence
		}
		if result.Verdict != "pass" {
			return fmt.Errorf("%s: typed validation verdict %q", name, result.Verdict)
		}
		return nil
	}
	return fmt.Errorf("%s: typed validation failed: %w", name, lastErr)
}

func persistAgentAttempt(database *db.DB, runID, stepName string, attempt agent.Attempt) error {
	inv := db.AgentInvocation{
		RunID: runID, StepName: stepName, Purpose: stepName, Agent: attempt.Agent,
		StartedAt: attempt.StartedAt.UnixMilli(), CompletedAt: attempt.CompletedAt.UnixMilli(),
		DurationMS: attempt.CompletedAt.Sub(attempt.StartedAt).Milliseconds(),
		ExitStatus: "ok",
	}
	if inv.DurationMS < 0 { inv.DurationMS = 0 }
	sessionID := ""
	if attempt.Result != nil {
		inv.Model = attempt.Result.Model
		if attempt.Result.ModelProvider != "" { provider := attempt.Result.ModelProvider; inv.ModelProvider = &provider }
		sessionID = attempt.Result.SessionID
	}
	switch {
	case attempt.SessionFallback:
		inv.SessionMode = db.InvocationModeFallback
		reason := db.FallbackReasonOther
		inv.FallbackReason = &reason
	case attempt.Session != nil && attempt.Result != nil && attempt.Result.Resumed:
		inv.SessionMode = db.InvocationModeResumed
	case sessionID != "":
		inv.SessionMode = db.InvocationModeStarted
	default:
		inv.SessionMode = db.InvocationModeCold
	}
	if sessionID == "" && attempt.Session != nil { sessionID = attempt.Session.ID }
	if sessionID != "" {
		digest := sha256.Sum256([]byte(sessionID))
		inv.SessionKey = hex.EncodeToString(digest[:12])
	}
	if attempt.Err != nil {
		inv.ExitStatus = "error"
		inv.FailureCategory = "other"
		if errors.Is(attempt.Err, context.Canceled) || errors.Is(attempt.Err, context.DeadlineExceeded) {
			inv.ExitStatus, inv.FailureCategory = "cancelled", "cancelled"
		} else if agent.IsStructuredOutputRejected(attempt.Err) {
			inv.FailureCategory = "parse"
		}
	}
	if attempt.Result != nil {
		result := attempt.Result
		usage := result.Usage
		if result.UsageReported || usage.Reported {
			input, output, cache := usage.InputTokens, usage.OutputTokens, usage.CacheReadTokens
			inv.InputTokens, inv.OutputTokens, inv.CacheReadTokens = &input, &output, &cache
			deltaInput, deltaOutput, deltaCache := input, output, cache
			if result.SessionUsageCumulative && inv.SessionKey != "" {
				priorIn, priorOut, priorCache, found := database.LatestSessionCumulative(runID, inv.SessionKey)
				if found {
					deltaInput = agent.PerRoundTokens(input, priorIn, true)
					deltaOutput = agent.PerRoundTokens(output, priorOut, true)
					deltaCache = agent.PerRoundTokens(cache, priorCache, true)
				}
			}
			inv.DeltaInputTokens, inv.DeltaOutputTokens, inv.DeltaCacheReadTokens = &deltaInput, &deltaOutput, &deltaCache
			fresh := agent.FreshInputTokens(input, cache)
			inv.FreshInputTokens = &fresh
			if usage.ReasoningReported { reasoning := usage.ReasoningTokens; inv.ReasoningTokens = &reasoning }
			if result.CacheCreationReported || usage.CacheCreationReported {
				cacheCreation := usage.CacheCreationTokens
				inv.CacheCreationTokens = &cacheCreation
			}
		}
		if result.Metrics != nil {
			metrics := result.Metrics
			wait := metrics.SubprocessWaitMS
			roundtrips, tools := metrics.ModelRoundtrips, metrics.ToolCalls
			waitCalls, testLintCalls, editCalls := metrics.ToolCategories.Wait, metrics.ToolCategories.TestLint, metrics.ToolCategories.Edit
			readCalls, gitCalls, otherCalls := metrics.ToolCategories.Read, metrics.ToolCategories.Git, metrics.ToolCategories.Other
			inv.SubprocessWaitMS = &wait
			inv.ModelRoundtrips, inv.ToolCalls = &roundtrips, &tools
			inv.ToolWaitCalls, inv.ToolTestLintCalls, inv.ToolEditCalls = &waitCalls, &testLintCalls, &editCalls
			inv.ToolReadCalls, inv.ToolGitCalls, inv.ToolOtherCalls = &readCalls, &gitCalls, &otherCalls
		}
	}
	if _, err := database.InsertAgentInvocation(inv); err != nil { return fmt.Errorf("persist agent invocation: %w", err) }
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
	shell, args := "sh", []string{"-c", command}
	if runtime.GOOS == "windows" {
		shell, args = "cmd.exe", []string{"/D", "/S", "/C", command}
	}
	cmd := exec.CommandContext(ctx, shell, args...)
	cmd.Dir = dir
	cmd.Env = agent.SafeEnvironment(dir, runenv.Overlay{}, []string{"SD_PARENT_RUN_ID=" + runID(ctx)})
	shellenv.ConfigureShellCommand(cmd)
	if out, err := shellenv.CombinedOutputShellCommand(cmd); err != nil {
		return fmt.Errorf("%s: configured command failed: %s: %w", name, out, err)
	}
	check := exec.CommandContext(ctx, "git", "-C", dir, "diff", "--check")
	if out, err := check.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: git diff --check: %s: %w", name, out, err)
	}
	return nil
}
