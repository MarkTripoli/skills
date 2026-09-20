package tui

import "fmt"

func Render(m Model, width int) string {
	status := string(m.Status)
	if status == "" {
		status = "idle"
	}
	line := fmt.Sprintf("Safety Dance  %s  %s", status, m.Branch)
	if width > 0 && len(line) > width {
		line = line[:width]
	}
	if m.Step != "" {
		line += "\nstep: " + m.Step
	}
	if m.Prompt != "" {
		line += "\nprompt: " + m.Prompt
	}
	if m.Error != "" {
		line += "\nerror: " + m.Error
	}
	return line
}
