package tui

import (
	"fmt"
	"strings"
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
func compactLines(line string, width int) []string {
	if width <= 0 || utf8.RuneCountInString(line) <= width {
		return []string{line}
	}
	if width <= 8 {
		if strings.HasPrefix(line, "keys: ") {
			value := strings.TrimPrefix(line, "keys: ")
			if strings.Contains(value, "approve") && strings.Contains(value, "abort") {
				return []string{"a/f/s/x"}
			}
			line = value
		}
		if strings.HasPrefix(line, "prompt: ") {
			line = strings.TrimPrefix(line, "prompt: ")
		}
	}
	runes := []rune(line)
	out := make([]string, 0, (len(runes)+width-1)/width)
	for len(runes) > 0 {
		n := width
		if n > len(runes) {
			n = len(runes)
		}
		out = append(out, string(runes[:n]))
		runes = runes[n:]
	}
	return out
}

// Render is the semantic status view shared by interactive and plain output.
// Width limits each line independently so terminal status and prompts remain visible.
func Render(m Model, width int) string {
	status := string(m.Status)
	if status == "" {
		status = "idle"
	}
	header := fmt.Sprintf("Safety Dance  %s  %s", status, m.Branch)
	if width > 8 && width > 0 && utf8.RuneCountInString(header) > width {
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
	rendered := make([]string, 0, len(lines))
	for _, line := range lines {
		rendered = append(rendered, compactLines(line, width)...)
	}
	return strings.Join(rendered, "\n")
}
