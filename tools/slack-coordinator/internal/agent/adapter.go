// Package agent maps a configured coding agent command to the argv that runs
// it non-interactively inside one run directory. It imports nothing from
// slackapi, db, or config so the process runner can depend on it alone.
package agent

import (
	"fmt"
	"path/filepath"
	"time"
)

// Adapter describes one coding agent binary: its name, the argv for a run,
// and where the run's final message lands.
type Adapter interface {
	// Command returns the binary name looked up on PATH.
	Command() string
	// Args returns the full argv after the binary; the instruction is last.
	Args(spec RunSpec) []string
	// FinalTextPath returns the file under runDir that holds the agent's final text.
	FinalTextPath(runDir string) string
}

// RunSpec is what one run needs from the caller to build its argv.
type RunSpec struct {
	RunDir    string
	Approval  string // edits | full; anything else builds the edits row
	ExtraDirs []string
	Timeout   time.Duration
}

// instruction is the prompt every adapter passes as its final argument; the
// runner writes the real prompt to prompt.md in RunDir.
const instruction = "Read prompt.md in the current directory and follow it."

// Lookup returns the adapter for omp, claude, or codex.
func Lookup(name string) (Adapter, error) {
	a, ok := adapters[name]
	if !ok {
		return nil, fmt.Errorf("unknown agent command %q; use omp, claude, or codex", name)
	}
	return a, nil
}

type adapter struct {
	command   string
	finalText string // file name under RunDir holding the final message
	args      func(spec RunSpec) []string
}

func (a adapter) Command() string                    { return a.command }
func (a adapter) Args(spec RunSpec) []string         { return a.args(spec) }
func (a adapter) FinalTextPath(runDir string) string { return filepath.Join(runDir, a.finalText) }

// adapters is the single argv table. Each row is
// <head> [--add-dir D]... <tail> <instruction>; the head carries the approval
// flags that differ between edits and full. Flags checked against omp 18.1.22,
// claude 2.1.258, and codex 0.155.1.
var adapters = map[string]adapter{
	"omp": {
		command:   "omp",
		finalText: "stdout.log",
		args: func(spec RunSpec) []string {
			head := []string{"-p", "--cwd", spec.RunDir}
			if spec.Approval == "full" {
				head = append(head, "--auto-approve")
			} else {
				head = append(head, "--approval-mode", "write")
			}
			head = append(head, "--no-session", "--max-time", spec.Timeout.String())
			return argv(spec, head, nil)
		},
	},
	"claude": {
		command:   "claude",
		finalText: "stdout.log",
		args: func(spec RunSpec) []string {
			mode := "acceptEdits"
			if spec.Approval == "full" {
				mode = "bypassPermissions"
			}
			head := []string{"-p", "--output-format", "text", "--permission-mode", mode, "--no-session-persistence"}
			return argv(spec, head, nil)
		},
	},
	"codex": {
		command:   "codex",
		finalText: "last-message.md",
		args: func(spec RunSpec) []string {
			head := []string{"exec", "-C", spec.RunDir, "--skip-git-repo-check", "-s", "workspace-write", "--ephemeral"}
			tail := []string{"-o", "last-message.md"}
			if spec.Approval == "full" {
				tail = append([]string{"--approve-for-me"}, tail...)
			}
			return argv(spec, head, tail)
		},
	},
}

// argv assembles head, one --add-dir per ExtraDirs entry, tail, and the
// instruction into one slice.
func argv(spec RunSpec, head, tail []string) []string {
	out := make([]string, 0, len(head)+2*len(spec.ExtraDirs)+len(tail)+1)
	out = append(out, head...)
	for _, dir := range spec.ExtraDirs {
		out = append(out, "--add-dir", dir)
	}
	out = append(out, tail...)
	return append(out, instruction)
}
