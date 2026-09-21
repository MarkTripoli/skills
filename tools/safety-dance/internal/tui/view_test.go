package tui

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

func TestPlainViewPreservesTerminalStatus(t *testing.T) {
	got := Plain(Model{Branch: "main", Status: types.RunFailed, Step: "review", Error: "blocked"})
	if strings.Contains(got, "\x1b") || !strings.Contains(got, "failed") || !strings.Contains(got, "error: blocked") {
		t.Fatalf("plain view=%q", got)
	}
}

func TestRenderWidthPreservesStatusAndPrompt(t *testing.T) {
	got := Render(Model{Status: types.RunPending, Branch: "main", Prompt: "approve"}, 12)
	lines := strings.Split(got, "\n")
	if !strings.Contains(lines[0], "pending") || !strings.Contains(got, "prompt") {
		t.Fatalf("semantic fields missing: %q", got)
	}
	for _, line := range lines {
		if utf8.RuneCountInString(line) > 12 {
			t.Fatalf("line exceeds width: %q", line)
		}
	}
}
func TestCompactRenderPreservesActionValue(t *testing.T) {
	got := Render(Model{Status: types.RunPending, Branch: "main", Prompt: "approve", KeyHint: "y/n"}, 8)
	if !strings.Contains(got, "approve") || !strings.Contains(got, "y/n") {
		t.Fatalf("action value hidden: %q", got)
	}
	for _, line := range strings.Split(got, "\n") {
		if utf8.RuneCountInString(line) > 8 {
			t.Fatalf("line exceeds width: %q", line)
		}
	}
}

func TestRenderIncludesFindings(t *testing.T) {
	if got := Plain(Model{Findings: []string{"missing test"}}); !strings.Contains(got, "finding: missing test") {
		t.Fatalf("finding missing: %q", got)
	}
}
