package agent

import (
	"fmt"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

const (
	runDir  = "/srv/sc/workspace/runs/RUN1"
	timeout = 10 * time.Minute
)

func TestArgsMatchTablePerApprovalAndExtraDirs(t *testing.T) {
	two := []string{"/home/u/proj", "/home/u/notes"}
	addDirs := []string{"--add-dir", two[0], "--add-dir", two[1]}
	piArgs := []string{"-p", "--model", modelPiSonnet, "--no-session", instruction}
	cases := []struct {
		name      string
		approval  string
		extraDirs []string
		want      []string
	}{
		// pi 0.87.0 has no --cwd, --add-dir, or approval flag. ExtraDirs are ignored.
		{"pi", "edits", nil, piArgs},
		{"pi", "full", nil, piArgs},
		{"pi", "edits", two, piArgs},
		{"pi", "full", two, piArgs},

		{"claude", "edits", nil, []string{"-p", "--model", "sonnet", "--output-format", "text", "--permission-mode", "acceptEdits", "--no-session-persistence", instruction}},
		{"claude", "full", nil, []string{"-p", "--model", "sonnet", "--output-format", "text", "--permission-mode", "bypassPermissions", "--no-session-persistence", instruction}},
		{"claude", "edits", two, join([]string{"-p", "--model", "sonnet", "--output-format", "text", "--permission-mode", "acceptEdits", "--no-session-persistence"}, addDirs, instruction)},
		{"claude", "full", two, join([]string{"-p", "--model", "sonnet", "--output-format", "text", "--permission-mode", "bypassPermissions", "--no-session-persistence"}, addDirs, instruction)},

		{"codex", "edits", nil, []string{"exec", "--model", modelCodexLuna, "-C", runDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral", "-o", "last-message.md", instruction}},
		{"codex", "full", nil, []string{"exec", "--model", modelCodexLuna, "-C", runDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral", "--approve-for-me", "-o", "last-message.md", instruction}},
		{"codex", "edits", two, join([]string{"exec", "--model", modelCodexLuna, "-C", runDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral"}, addDirs, "-o", "last-message.md", instruction)},
		{"codex", "full", two, join([]string{"exec", "--model", modelCodexLuna, "-C", runDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral"}, addDirs, "--approve-for-me", "-o", "last-message.md", instruction)},
	}
	for _, tc := range cases {
		t.Run(tc.name+"/"+tc.approval+"/"+dirsLabel(tc.extraDirs), func(t *testing.T) {
			a, err := Lookup(tc.name)
			if err != nil {
				t.Fatal(err)
			}
			if got := a.Command(); got != tc.name {
				t.Fatalf("Command() = %q, want %q", got, tc.name)
			}
			got := a.Args(RunSpec{RunDir: runDir, Approval: tc.approval, ExtraDirs: tc.extraDirs, Timeout: timeout})
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("Args =\n  %q\nwant\n  %q", got, tc.want)
			}
		})
	}
}

func TestArgsHonorExplicitModel(t *testing.T) {
	a, err := Lookup("pi")
	if err != nil {
		t.Fatal(err)
	}
	got := a.Args(RunSpec{RunDir: runDir, Approval: "edits", Timeout: timeout, Model: "claude-bridge/claude-opus-5"})
	want := []string{"-p", "--model", "claude-bridge/claude-opus-5", "--no-session", instruction}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Args =\n  %q\nwant\n  %q", got, want)
	}
}

func TestFinalTextPathPerAdapter(t *testing.T) {
	cases := map[string]string{
		"pi":     filepath.Join(runDir, "stdout.log"),
		"claude": filepath.Join(runDir, "stdout.log"),
		"codex":  filepath.Join(runDir, "last-message.md"),
	}
	for name, want := range cases {
		a, err := Lookup(name)
		if err != nil {
			t.Fatal(err)
		}
		if got := a.FinalTextPath(runDir); got != want {
			t.Errorf("%s FinalTextPath = %q, want %q", name, got, want)
		}
	}
}

func TestLookupRejectsUnknownCommand(t *testing.T) {
	a, err := Lookup("aider")
	if a != nil {
		t.Fatalf("Lookup returned adapter %v for unknown name", a)
	}
	if err == nil {
		t.Fatal("Lookup returned nil error for unknown name")
	}
	if want := `unknown agent command "aider"; use pi, claude, or codex`; err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
	if _, err := Lookup("omp"); err == nil || err.Error() != `unknown agent command "omp"; use pi, claude, or codex` {
		t.Fatalf("Lookup(omp) = %v, want the pi, claude, or codex list", err)
	}
}

func join(head, addDirs []string, tail ...string) []string {
	out := append([]string{}, head...)
	out = append(out, addDirs...)
	return append(out, tail...)
}

func dirsLabel(dirs []string) string {
	return fmt.Sprintf("dirs-%d", len(dirs))
}
