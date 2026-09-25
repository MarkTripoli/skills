package agent

import "testing"

func TestSelectModel(t *testing.T) {
	cases := []struct {
		name    string
		command string
		text    string
		want    string
	}{
		{"pi default", "pi", "", modelPiSonnet},
		{"pi no model named", "pi", "summarize the open pull requests", modelPiSonnet},
		{"pi opus 5.5", "pi", "for this please use opus 5.5", "claude-bridge/claude-opus-5"},
		{"pi haiku", "pi", "use haiku", "claude-bridge/claude-haiku-4-5"},
		{"pi sonnet", "pi", "please use sonnet", modelPiSonnet},
		{"pi sonnet 4.6", "pi", "use sonnet 4.6", "claude-bridge/claude-sonnet-4-6"},
		{"pi opus 4.8", "pi", "use opus 4.8", "claude-bridge/claude-opus-4-8"},
		{"pi tests is not a model", "pi", "use the tests", modelPiSonnet},
		{"pi last named model wins", "pi", "use sonnet, actually opus", "claude-bridge/claude-opus-5"},
		{"claude default", "claude", "", "sonnet"},
		{"claude opus 5.5 is the short alias", "claude", "for this please use opus 5.5", "opus"},
		{"claude haiku", "claude", "use haiku", "haiku"},
		{"claude sonnet", "claude", "please use sonnet", "sonnet"},
		{"codex default", "codex", "", modelCodexLuna},
		{"codex ignores opus", "codex", "for this please use opus 5.5", modelCodexLuna},
		{"codex ignores haiku", "codex", "use haiku", modelCodexLuna},
		{"codex luna stays luna", "codex", "please use gpt-6-luna", modelCodexLuna},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := SelectModel(tc.command, tc.text); got != tc.want {
				t.Fatalf("SelectModel(%q, %q) = %q, want %q", tc.command, tc.text, got, tc.want)
			}
		})
	}
}
