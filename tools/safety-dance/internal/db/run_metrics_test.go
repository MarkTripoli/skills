package db

import (
	"path/filepath"
	"testing"
)

func TestRunMetricsPreservesZeroMissingAndRunProvenance(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil { t.Fatal(err) }
	defer d.Close()
	if _, err := d.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil { t.Fatal(err) }
	run, err := d.InsertRun("repo", "main", "head", "base")
	if err != nil { t.Fatal(err) }
	_, err = d.sql.Exec(`UPDATE runs SET safety_dance_version = ?, safety_dance_build_sha = ? WHERE id = ?`, "v1.2.3", "build-sha", run.ID)
	if err != nil { t.Fatal(err) }
	zero, missing := 0, 7
	if _, err := d.InsertAgentInvocation(AgentInvocation{RunID: run.ID, StepName: "review", Agent: "codex", Model: "model-a", InputTokens: &zero}); err != nil { t.Fatal(err) }
	other, err := d.InsertRun("repo", "other", "head2", "base")
	if err != nil { t.Fatal(err) }
	if _, err := d.InsertAgentInvocation(AgentInvocation{RunID: other.ID, StepName: "review", Agent: "claude", Model: "model-b", InputTokens: &missing}); err != nil { t.Fatal(err) }
	report, err := d.GetRunMetrics(run.ID)
	if err != nil { t.Fatal(err) }
	if report.Run.ID != run.ID || report.Run.SafetyDanceVersion == nil || *report.Run.SafetyDanceVersion != "v1.2.3" || report.Run.SafetyDanceBuildSHA == nil || *report.Run.SafetyDanceBuildSHA != "build-sha" { t.Fatalf("provenance=%+v", report.Run) }
	if len(report.Invocations) != 1 || report.Invocations[0].RunID != run.ID || report.Invocations[0].Model != "model-a" { t.Fatalf("invocations=%+v", report.Invocations) }
	if report.Tokens.Input == nil || *report.Tokens.Input != 0 || report.Tokens.InputReported != 1 { t.Fatalf("observed zero lost: %+v", report.Tokens) }
	if report.Tokens.Output != nil || report.Tokens.OutputReported != 0 { t.Fatalf("missing usage fabricated: %+v", report.Tokens) }
	if wrong, err := d.GetRunMetrics("not-"+run.ID); err != nil || wrong != nil { t.Fatalf("mismatched run report=%v err=%v", wrong, err) }
}
