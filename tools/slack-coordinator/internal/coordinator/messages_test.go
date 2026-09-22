package coordinator

import "testing"

const rootGolden = `*Work:* Add --verbose flag
*Goal:* Print each command before running it
*Scope:* internal/cli only
*Owner:* <@U123>
*Links:*
• https://github.com/o/r/pull/1
• https://jira.example/browse/K-1
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
		Links:       []string{"https://github.com/o/r/pull/1", "https://jira.example/browse/K-1"},
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
