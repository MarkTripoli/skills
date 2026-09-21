package tui

import "github.com/MarkTripoli/skills/tools/safety-dance/internal/types"

type Model struct {
	RunID, Branch, Step, StepID, Error string
	Generation                         int
	Status                             types.RunStatus
	Findings                           []string
	Prompt                             string
	Publication                        string
	KeyHint                            string
}
