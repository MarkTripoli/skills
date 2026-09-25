package coordinator

import "testing"

const rootGolden = `*Work:* Add --verbose flag
*Goal:* Print each command before running it
*Scope:* internal/cli only
*Owner:* <@U123>
*Links:*
• https://github.com/o/r/pull/1
*Started at:* 2026-09-21T10:00:00Z`

const rootEmptyGolden = `*Work:* None
*Goal:* None
*Scope:* None
*Owner:* None
*Links:* None
*Started at:* None`

func TestRenderRoot(t *testing.T) {
	got := RenderRoot(RootMessage{
		Work:        "Add --verbose flag",
		Goal:        "Print each command before running it",
		Scope:       "internal/cli only",
		OwnerUserID: "U123",
		Links:       []string{"https://github.com/o/r/pull/1"},
		StartedAt:   "2026-09-21T10:00:00Z",
	})
	if got != rootGolden {
		t.Fatalf("RenderRoot =\n%s\nwant\n%s", got, rootGolden)
	}
}

func TestRenderRootEmptyFieldsShowNone(t *testing.T) {
	if got := RenderRoot(RootMessage{}); got != rootEmptyGolden {
		t.Fatalf("RenderRoot(empty) =\n%s\nwant\n%s", got, rootEmptyGolden)
	}
}

const statusGolden = `*Current work:* Wiring the --verbose flag through cobra
*Completed since last update:*
• Parsed the flag
• Added the test fixture
*Decisions:*
• Print to stderr, not stdout
*Blockers:* None
*Up next:*
• Document the flag`

const statusEmptyGolden = `*Current work:* None
*Completed since last update:* None
*Decisions:* None
*Blockers:* None
*Up next:* None`

func TestRenderStatus(t *testing.T) {
	got := RenderStatus(WorkEvent{
		RunID:     "RUN1",
		Current:   "Wiring the --verbose flag through cobra",
		Completed: []string{"Parsed the flag", "Added the test fixture"},
		Decisions: []string{"Print to stderr, not stdout"},
		Next:      []string{"Document the flag"},
	})
	if got != statusGolden {
		t.Fatalf("RenderStatus =\n%s\nwant\n%s", got, statusGolden)
	}
	if got := RenderStatus(WorkEvent{}); got != statusEmptyGolden {
		t.Fatalf("RenderStatus(empty) =\n%s\nwant\n%s", got, statusEmptyGolden)
	}
}

const completionGolden = `*Outcome:* completed
*Completed work:*
• Added --verbose
*Decisions:*
• Print to stderr, not stdout
*Unresolved items:* None
*Evidence:*
• go test ./... passes
*Links:*
• https://github.com/o/r/pull/1
*Finished at:* 2026-09-21T12:00:00Z`

const completionEmptyGolden = `*Outcome:* None
*Completed work:* None
*Decisions:* None
*Unresolved items:* None
*Evidence:* None
*Links:* None
*Finished at:* None`

func TestRenderCompletion(t *testing.T) {
	got := RenderCompletion(FinishRunInput{
		RunID:     "RUN1",
		Outcome:   "completed",
		Completed: []string{"Added --verbose"},
		Decisions: []string{"Print to stderr, not stdout"},
		Evidence:  []string{"go test ./... passes"},
		Links:     []string{"https://github.com/o/r/pull/1"},
	}, "2026-09-21T12:00:00Z")
	if got != completionGolden {
		t.Fatalf("RenderCompletion =\n%s\nwant\n%s", got, completionGolden)
	}
	if got := RenderCompletion(FinishRunInput{}, ""); got != completionEmptyGolden {
		t.Fatalf("RenderCompletion(empty) =\n%s\nwant\n%s", got, completionEmptyGolden)
	}
}
