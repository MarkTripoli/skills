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
	cases := []struct {
		name      string
		approval  string
		extraDirs []string
		want      []string
	}{
		{"omp", "edits", nil, []string{"-p", "--cwd", runDir, "--approval-mode", "write", "--no-session", "--max-time", "10m0s", instruction}},
		{"omp", "full", nil, []string{"-p", "--cwd", runDir, "--auto-approve", "--no-session", "--max-time", "10m0s", instruction}},
		{"omp", "edits", two, join([]string{"-p", "--cwd", runDir, "--approval-mode", "write", "--no-session", "--max-time", "10m0s"}, addDirs, instruction)},
		{"omp", "full", two, join([]string{"-p", "--cwd", runDir, "--auto-approve", "--no-session", "--max-time", "10m0s"}, addDirs, instruction)},

		{"claude", "edits", nil, []string{"-p", "--output-format", "text", "--permission-mode", "acceptEdits", "--no-session-persistence", instruction}},
		{"claude", "full", nil, []string{"-p", "--output-format", "text", "--permission-mode", "bypassPermissions", "--no-session-persistence", instruction}},
		{"claude", "edits", two, join([]string{"-p", "--output-format", "text", "--permission-mode", "acceptEdits", "--no-session-persistence"}, addDirs, instruction)},
		{"claude", "full", two, join([]string{"-p", "--output-format", "text", "--permission-mode", "bypassPermissions", "--no-session-persistence"}, addDirs, instruction)},

		{"codex", "edits", nil, []string{"exec", "-C", runDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral", "-o", "last-message.md", instruction}},
		{"codex", "full", nil, []string{"exec", "-C", runDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral", "--approve-for-me", "-o", "last-message.md", instruction}},
		{"codex", "edits", two, join([]string{"exec", "-C", runDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral"}, addDirs, "-o", "last-message.md", instruction)},
		{"codex", "full", two, join([]string{"exec", "-C", runDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral"}, addDirs, "--approve-for-me", "-o", "last-message.md", instruction)},
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

func TestFinalTextPathPerAdapter(t *testing.T) {
	cases := map[string]string{
		"omp":    filepath.Join(runDir, "stdout.log"),
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
	if want := `unknown agent command "aider"; use omp, claude, or codex`; err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
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
