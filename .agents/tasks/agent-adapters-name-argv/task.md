---
slug: agent-adapters-name-argv
title: "agent adapters name argv per binary and approval level"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - config-yaml-loads-agent
issue: 45
---
Create package `tools/slack-coordinator/internal/agent` (this child adds `adapter.go` only; a sibling adds the process runner). Import nothing from `slackapi`, `db`, or `config`.

```go
type Adapter interface { Command() string; Args(spec RunSpec) []string; FinalTextPath(runDir string) string }
type RunSpec struct { RunDir string; Approval string /* edits|full */; ExtraDirs []string; Timeout time.Duration }
func Lookup(name string) (Adapter, error) // omp | claude | codex; error text: `unknown agent command %q; use omp, claude, or codex`
const instruction = "Read prompt.md in the current directory and follow it."
```

Argv tables (`edits` row; `full` differences in parentheses), flags checked against `omp` 18.1.22, `claude` 2.1.258, `codex` 0.155.1:

- `omp`: `-p --cwd <RunDir> --approval-mode write --no-session --max-time <Timeout.String()> [--add-dir D]... <instruction>` (full: `--auto-approve` replaces `--approval-mode write`); `FinalTextPath` = `<RunDir>/stdout.log`.
- `claude`: `-p --output-format text --permission-mode acceptEdits --no-session-persistence [--add-dir D]... <instruction>` (full: `--permission-mode bypassPermissions`); `FinalTextPath` = `<RunDir>/stdout.log`.
- `codex`: `exec -C <RunDir> --skip-git-repo-check -s workspace-write --ephemeral [--add-dir D]... -o last-message.md <instruction>` (full: adds `--approve-for-me` before `-o`); `FinalTextPath` = `<RunDir>/last-message.md`.

`Command()` returns the binary name. Keep the tables in one place so a flag rename is a one-line change.

Proof: `internal/agent/adapter_test.go` table test asserting the exact argv slice per adapter for `edits` and `full`, with zero and two `ExtraDirs`, plus `Lookup` rejection text and `FinalTextPath`. `go test ./internal/agent`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `agent.Lookup` is called with `omp`, `claude`, or `codex`, it shall return that adapter, and with any other name it shall return an error listing the three names.
- WHEN `Args(RunSpec{Approval: "edits"})` is called, each adapter shall return exactly its `edits` argv row from the table, with `--add-dir <D>` repeated per `ExtraDirs` entry and the instruction as the last argument.
- WHEN `Approval` is `full`, `omp` shall replace `--approval-mode write` with `--auto-approve`, `claude` shall use `--permission-mode bypassPermissions`, and `codex` shall add `--approve-for-me`.
- `FinalTextPath(runDir)` shall be `<runDir>/stdout.log` for `omp` and `claude` and `<runDir>/last-message.md` for `codex`.
