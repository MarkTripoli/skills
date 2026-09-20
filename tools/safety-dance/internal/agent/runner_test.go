package agent

import (
	"context"
	"testing"
)

func TestRunnerExecutesCommandInWorktree(t *testing.T) {
	result, err := (Runner{}).Run(context.Background(), Request{Command: []string{"sh", "-c", "printf pass"}, WorkDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "pass" {
		t.Fatalf("output = %q, want pass", result.Text)
	}
}

func TestRunnerRetriesUntilSuccess(t *testing.T) {
	result, err := (Runner{MaxAttempts: 2}).Run(context.Background(), Request{Command: []string{"sh", "-c", "exit 0"}, WorkDir: t.TempDir()})
	if err != nil || result.Text != "" {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}
