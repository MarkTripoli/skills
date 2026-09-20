package tui

import "github.com/MarkTripoli/skills/tools/safety-dance/internal/types"

type Model struct {
	RunID, Branch, Step, Error string
	Status                     types.RunStatus
	Findings                   []string
	Prompt                     string
	Publication                string
	KeyHint                    string
}
