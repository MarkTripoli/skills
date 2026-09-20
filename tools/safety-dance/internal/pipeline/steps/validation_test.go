package steps

import (
	"context"
	"os"
	"os/exec"
	"testing"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
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
