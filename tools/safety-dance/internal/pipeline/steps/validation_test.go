package steps

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"time"
	"path/filepath"
	"testing"


	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/agent"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
)

func TestValidateRunsConfiguredStageCommand(t *testing.T) {
	ctx := WithRepoConfig(WithWorktree(context.Background(), t.TempDir()), &config.RepoConfig{Commands: config.Commands{Test: "exit 17"}})
	if err := Validate(ctx, "test"); err == nil {
		t.Fatal("expected configured test command failure")
	}
}

func TestValidateRunsConfiguredCommandInOwnedWorktree(t *testing.T) {
	dir := t.TempDir()
	if err := exec.Command("git", "init", "-q", dir).Run(); err != nil {
		t.Fatal(err)
	}
	ctx := WithRepoConfig(WithWorktree(context.Background(), dir), &config.RepoConfig{Commands: config.Commands{Lint: "pwd > marker"}})
	if err := Validate(ctx, "lint"); err != nil {
		t.Fatal(err)
	}
}

func TestTypedStageDoesNotRunRepositoryCommand(t *testing.T) {
	dir := t.TempDir()
	marker := dir + "/marker"
	ctx := WithWorktree(context.Background(), dir)
	ctx = WithConfig(ctx, &config.Config{Commands: config.Commands{Review: "touch " + marker}})
	if err := Review(ctx); err == nil {
		t.Fatal("expected missing typed owner")
	}
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("typed stage executed repository command")
	}
}

func TestParseTypedVerdictRejectsFailureAsApproval(t *testing.T) {
	verdict, err := parseTypedVerdict([]byte(`{"verdict":"fail"}`))
	if err != nil {
		t.Fatal(err)
	}
	if verdict == "pass" {
		t.Fatal("failing typed verdict was accepted as approval")
	}
}

func TestParseTypedVerdictRejectsUnknownValue(t *testing.T) {
	if _, err := parseTypedVerdict([]byte(`{"verdict":"maybe"}`)); err == nil {
		t.Fatal("unknown typed verdict was accepted")
	}
}

func TestTypedEvidenceUsesCanonicalFindingsEnvelope(t *testing.T) {
	evidence, err := typedEvidence(typedResult{Verdict: "fail", Findings: []json.RawMessage{json.RawMessage(`{"severity":"error","description":"bad","action":"no-op"}`)}, Evidence: []string{"agent output"}})
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := types.ParseFindingsJSON(evidence.FindingsJSON)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Verdict != "fail" || len(parsed.Items) != 1 || len(evidence.Evidence) != 1 {
		t.Fatalf("unexpected evidence: %#v", evidence)
	}
}
type recordingTestAgent struct{}

func (recordingTestAgent) Name() string { return "codex" }
func (recordingTestAgent) Close() error { return nil }
func (recordingTestAgent) Run(_ context.Context, opts agent.RunOpts) (*agent.Result, error) {
	now := time.Now()
	result := &agent.Result{
		Output: json.RawMessage(`{"verdict":"pass","findings":[],"evidence":["reviewed"]}`),
		Model: "model-under-test", UsageReported: true,
		Usage: agent.TokenUsage{InputTokens: 12, OutputTokens: 5, CacheReadTokens: 2, Reported: true},
	}
	opts.OnAttempt(agent.Attempt{Agent: "codex", Result: result, StartedAt: now, CompletedAt: now.Add(time.Millisecond)})
	return result, nil
}

func TestTypedPersistsProductionAgentAttemptForRunReport(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil { t.Fatal(err) }
	defer d.Close()
	if _, err := d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil { t.Fatal(err) }
	run, err := d.InsertRun("repo", "main", "head", "base")
	if err != nil { t.Fatal(err) }
	cfg := &config.Config{Agent: types.AgentName("codex")}
	ctx := WithRun(WithConfig(WithWorktree(context.Background(), t.TempDir()), cfg), d, run.ID)
	ctx = withTypedAgentFactory(ctx, func(types.AgentName, *config.Config) (agent.Agent, error) { return recordingTestAgent{}, nil })
	if err := Typed(ctx, "review"); err != nil { t.Fatal(err) }
	report, err := d.GetRunMetrics(run.ID)
	if err != nil { t.Fatal(err) }
	if len(report.Invocations) != 1 || report.Invocations[0].RunID != run.ID || report.Invocations[0].Model != "model-under-test" {
		t.Fatalf("production typed path did not persist invocation: %+v", report.Invocations)
	}
	if report.Tokens.Input == nil || *report.Tokens.Input != 12 || report.Tokens.Output == nil || *report.Tokens.Output != 5 {
		t.Fatalf("production usage missing from report: %+v", report.Tokens)
	}
}
func TestPersistAgentAttemptUsesPerRoundFreshInput(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil { t.Fatal(err) }
	defer d.Close()
	if _, err := d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil { t.Fatal(err) }
	run, err := d.InsertRun("repo", "main", "head", "base")
	if err != nil { t.Fatal(err) }
	start := time.Unix(1_700_000_000, 0)
	first := &agent.Result{SessionID: "session", SessionUsageCumulative: true, UsageReported: true, Usage: agent.TokenUsage{InputTokens: 100, OutputTokens: 8, CacheReadTokens: 20, Reported: true}}
	if err := persistAgentAttempt(d, run.ID, "review", agent.Attempt{Agent: "codex", Result: first, StartedAt: start, CompletedAt: start.Add(time.Second)}); err != nil { t.Fatal(err) }
	second := &agent.Result{SessionID: "session", Resumed: true, SessionUsageCumulative: true, UsageReported: true, Usage: agent.TokenUsage{InputTokens: 150, OutputTokens: 12, CacheReadTokens: 30, Reported: true}}
	if err := persistAgentAttempt(d, run.ID, "review", agent.Attempt{Agent: "codex", Result: second, Session: &agent.SessionRef{ID: "session", Agent: "codex"}, StartedAt: start.Add(2*time.Second), CompletedAt: start.Add(3*time.Second)}); err != nil { t.Fatal(err) }
	invocations, err := d.GetAgentInvocationsByRun(run.ID)
	if err != nil { t.Fatal(err) }
	if len(invocations) != 2 || invocations[1].FreshInputTokens == nil || *invocations[1].FreshInputTokens != 40 {
		t.Fatalf("resumed fresh input=%+v; want 40 from delta input 50 minus delta cache 10", invocations)
	}
}
func TestPersistAgentAttemptPreservesPartialTokenCoverage(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil { t.Fatal(err) }
	defer d.Close()
	if _, err := d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil { t.Fatal(err) }
	run, err := d.InsertRun("repo", "main", "head", "base")
	if err != nil { t.Fatal(err) }
	start := time.Unix(1_700_000_000, 0)
	result := &agent.Result{UsageReported: true, Usage: agent.TokenUsage{Reported: true, OutputTokensReported: true}}
	if err := persistAgentAttempt(d, run.ID, "review", agent.Attempt{Agent: "copilot", Result: result, StartedAt: start, CompletedAt: start.Add(time.Second)}); err != nil { t.Fatal(err) }
	report, err := d.GetRunMetrics(run.ID)
	if err != nil { t.Fatal(err) }
	if report.Tokens.Input != nil || report.Tokens.InputReported != 0 || report.Tokens.CacheRead != nil || report.Tokens.CacheReadReported != 0 {
		t.Fatalf("unavailable token counters gained coverage: %+v", report.Tokens)
	}
	if report.Tokens.Output == nil || *report.Tokens.Output != 0 || report.Tokens.OutputReported != 1 {
		t.Fatalf("observed zero output counter lost: %+v", report.Tokens)
	}
}

func TestPersistAgentAttemptDoesNotInventPrimaryCoverageForCacheOnly(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil { t.Fatal(err) }
	defer d.Close()
	if _, err := d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil { t.Fatal(err) }
	run, err := d.InsertRun("repo", "main", "head", "base")
	if err != nil { t.Fatal(err) }
	start := time.Unix(1_700_000_000, 0)
	result := &agent.Result{CacheCreationReported: true, Usage: agent.TokenUsage{CacheCreationReported: true}}
	if err := persistAgentAttempt(d, run.ID, "review", agent.Attempt{Agent: "acp:omp", Result: result, StartedAt: start, CompletedAt: start.Add(time.Second)}); err != nil { t.Fatal(err) }
	report, err := d.GetRunMetrics(run.ID)
	if err != nil { t.Fatal(err) }
	if report.Tokens.Input != nil || report.Tokens.Output != nil || report.Tokens.CacheRead != nil ||
		report.Tokens.InputReported != 0 || report.Tokens.OutputReported != 0 || report.Tokens.CacheReadReported != 0 {
		t.Fatalf("cache-only usage invented primary coverage: %+v", report.Tokens)
	}
	if len(report.Invocations) != 1 || report.Invocations[0].CacheCreationTokens == nil || *report.Invocations[0].CacheCreationTokens != 0 {
		t.Fatalf("observed cache-creation zero lost: %+v", report.Invocations)
	}
}
