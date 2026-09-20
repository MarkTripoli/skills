package steps

import (
	"context"
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
