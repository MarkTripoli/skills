package tui

import (
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"strings"
	"testing"
)

func TestPlainViewPreservesTerminalStatus(t *testing.T) {
	got := Plain(Model{Branch: "main", Status: types.RunFailed, Step: "review", Error: "blocked"})
	if strings.Contains(got, "\x1b") || !strings.Contains(got, "failed") || !strings.Contains(got, "error: blocked") {
		t.Fatalf("plain view=%q", got)
	}
}
