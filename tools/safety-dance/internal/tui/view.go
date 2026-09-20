package tui

import (
	"fmt"
	"unicode/utf8"
)

func truncate(s string, width int) string {
	if width <= 0 || utf8.RuneCountInString(s) <= width {
		return s
	}
	runes := []rune(s)
	if width == 1 {
		return string(runes[:1])
	}
	return string(runes[:width-1]) + "…"
}

// Render is the semantic status view shared by interactive and plain output.
// Width limits each line independently so terminal status and prompts remain visible.
func Render(m Model, width int) string {
	status := string(m.Status)
	if status == "" {
		status = "idle"
	}
	header := fmt.Sprintf("Safety Dance  %s  %s", status, m.Branch)
	if width > 0 && len(header) > width {
		header = truncate(status+" "+m.Branch, width)
	}
	lines := []string{header}
	if m.RunID != "" {
		lines = append(lines, "run: "+m.RunID)
	}
	if m.Step != "" {
		lines = append(lines, "step: "+m.Step)
	}
	if m.Prompt != "" {
		lines = append(lines, "prompt: "+m.Prompt)
	}
	if m.Publication != "" {
		lines = append(lines, "publication: "+m.Publication)
	}
	if m.KeyHint != "" {
		lines = append(lines, "keys: "+m.KeyHint)
	}
	for _, finding := range m.Findings {
		lines = append(lines, "finding: "+finding)
	}
	if m.Error != "" {
		lines = append(lines, "error: "+m.Error)
	}
	for i := range lines {
		lines[i] = truncate(lines[i], width)
	}
	out := lines[0]
	for _, line := range lines[1:] {
		out += "\n" + line
	}
	return out
}
