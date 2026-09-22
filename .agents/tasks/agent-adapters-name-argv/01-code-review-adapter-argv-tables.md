---
type: code-review
date: 2026-09-22
branch: agent-adapters-name-argv
base_branch: epic-slack-assistant-bot-dms
base_sha: 0c80de9ac7d53af3a4d99480caa32377e74771e8
head_sha: 99e86451faa8288bd0cc292f4c6ccd672767b78d
status: clean
summary: "Reviewed the two-file `internal/agent` package (adapter.go, adapter_test.go) against `epic-slack-assistant-bot-dms`. Every argv row, the `full` differences, `Lookup` rejection text, and `FinalTextPath` match task.md and are pinned by the table test; every flag exists on the installed omp 18.1.22, claude 2.1.258, and codex 0.155.1. No critical or major findings; the next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `0c80de9ac7d53af3a4d99480caa32377e74771e8` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists yet)
- reviewed HEAD: `99e86451faa8288bd0cc292f4c6ccd672767b78d`
- commits: 1, `99e8645 feat(slack-coordinator): add agent adapters naming argv per binary`
- staged and unstaged changes: none (`git status --short --branch` clean)
- task-owned untracked files: none
- excluded changes: none; the diff is `A tools/slack-coordinator/internal/agent/adapter.go`, `A tools/slack-coordinator/internal/agent/adapter_test.go`

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `.agents/tasks/agent-adapters-name-argv/task.md`, issue #45, oneshot child of `slack-assistant-bot-dms`. Four acceptance criteria, decided below under Correctness.
- implementation source: no plan artifact (oneshot). Parent TDD `.agents/tasks/slack-assistant-bot-dms/03-tdd-slack-assistant-bot-dms.md:210-236` and epic plan `04-epic-plan-slack-assistant-bot-dms.md:29,106` carry the same interface and argv table as `task.md`.
- repository instructions: `AGENTS.md` requires Conventional Commits per `scripts/check-commits.mjs` and a `.changeset/` entry for user-facing changes. The commit subject is 66 characters and matches the required regex. No changeset: the package has no caller yet and the sibling child `config-yaml-loads-agent` (PR #75) merged without one; `docs/slack-coordinator.md` has no adapter or approval section to update.

## Change Profile

- intent and expected behavior: `agent.Lookup(name)` returns an `Adapter` for `omp`, `claude`, or `codex`; `Args(RunSpec)` returns the non-interactive argv for one run directory with `--add-dir` per `ExtraDirs` entry and the fixed instruction last; `FinalTextPath(runDir)` names the file holding the final message.
- change description quality: subject stands alone; body explains the one-map-per-binary layout, the argv join order, and why unknown `Approval` values build the `edits` row (`config.Validate` already rejects them, confirmed at `internal/config/config.go:163-166`). `Refs: #45`.
- implementation model and review model: implementation model not recorded in the commit; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 204 added lines, one package, one concern.
- resulting large-file concerns: none; `adapter.go` is 109 lines.
- dependency or lockfile changes: none; imports are `fmt`, `path/filepath`, `time`.

## Tests Reviewed First

- behavior claimed by tests: `TestArgsMatchTablePerApprovalAndExtraDirs` (`adapter_test.go:16-55`) asserts the exact argv slice with `reflect.DeepEqual` for all three adapters, both approval values, and zero and two `ExtraDirs` (12 cases), and asserts `Command()` per adapter. `TestFinalTextPathPerAdapter` (`:57-72`) asserts `<runDir>/stdout.log` for omp and claude and `<runDir>/last-message.md` for codex. `TestLookupRejectsUnknownCommand` (`:74-85`) asserts a nil adapter and the exact error text `unknown agent command "aider"; use omp, claude, or codex`.
- missing or misleading coverage: none against the task's proof list. The expected slices are literal rows, not derived from the table under test, so a flag rename must be made in both files; that is the intended pin.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4712` in / `73` out (`judge: model jev-1.13.0, tokens 4712 in / 73 out`, one run)

### Correctness

- assessment and evidence: Acceptance criterion 1 (`Lookup`): `adapter.go:36-42` returns the map entry or `fmt.Errorf("unknown agent command %q; use omp, claude, or codex", name)`; proven by `adapter_test.go:74-85` and by each `Lookup` call in the table test. Criterion 2 (`edits` rows): omp `adapter.go:63-70`, claude `:77-82`, codex `:89-94` build the `task.md:23-25` rows; `argv` (`:101-109`) appends head, `--add-dir D` per entry, tail, then `instruction`; proven by the `edits` cases at `adapter_test.go:25,27,30,32,35,37`. Criterion 3 (`full`): omp swaps `--approval-mode write` for `--auto-approve` (`:64-68`), claude sets `bypassPermissions` (`:77-80`), codex prepends `--approve-for-me` to the `-o` tail (`:91-93`); proven at `adapter_test.go:26,28,31,33,36,38`. Criterion 4 (`FinalTextPath`): `filepath.Join(runDir, a.finalText)` with `stdout.log` / `stdout.log` / `last-message.md` (`:52,61,75,87`); proven at `adapter_test.go:57-72`. Flags cross-checked against the installed binaries at the exact versions the task names (`omp --version` 18.1.22, `claude --version` 2.1.258, `codex --version` 0.155.1): `omp --help` lists `-p`, `--cwd`, `--approval-mode` (values `always-ask|write|yolo`), `--auto-approve`, `--no-session`, `--max-time`, `--add-dir`; `claude --help` lists `-p`, `--output-format`, `--permission-mode`, `--no-session-persistence`, `--add-dir`; `codex exec --help` lists `-C`, `--skip-git-repo-check`, `-s`, `--ephemeral`, `--add-dir`, `--approve-for-me`, `-o`, positional `[PROMPT]`. `Timeout.String()` yields `10m0s`, a form `--max-time` documents (`600, 10m, 1h`). Boundary: `ExtraDirs` nil or empty produces no `--add-dir`; `Approval` outside the two values falls to `edits` (least privilege, see ADV-001). No state, concurrency, or I/O in the package.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: One unexported `adapter` struct (`adapter.go:44-48`) with `command`, `finalText`, and an `args` closure; the three rows sit in one `adapters` map literal (`:58-97`) with the approval branch inline, so a flag rename is one line, as `task.md:27` requires. `argv` (`:101-109`) is the only shared assembly step and preallocates the exact capacity. Names match the task's interface verbatim. No dead code; `gofmt -l internal/agent` reports nothing. Test helpers `join` and `dirsLabel` (`adapter_test.go:87-95`) keep the 12 expected rows readable.
- helper coverage: covered, level 3, confidence 1.00

### Architecture

- assessment and evidence: The package imports only the standard library (`adapter.go:6-10`), satisfying the `task.md:12` boundary and the TDD trust-boundary rule (`03-tdd-slack-assistant-bot-dms.md:163`) that no Slack token reaches the agent package. The exported surface is exactly `Adapter`, `RunSpec`, `Lookup`, matching the epic plan contract at `04-epic-plan-slack-assistant-bot-dms.md:29` that the runner sibling and `assistant` consume. Approval validation stays in `config` (`config.go:157-167`), not duplicated here. No new abstraction beyond the table.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: `RunDir` and `ExtraDirs` are passed as separate argv elements (`adapter.go:63,89,105`), never joined into a shell string, so path contents cannot inject flags into a shell; `exec.Command` in the runner sibling will receive them as discrete arguments. The `edits` row is the default for any unrecognized `Approval` (`:64,78,91`), so a malformed value cannot escalate to `--auto-approve`, `bypassPermissions`, or `--approve-for-me`. The `full` rows grant the agent unattended tool approval by design (`task.md:35`); the config-only `agent.approval` knob and the `edits` default are the TDD's stated control (`03-tdd-slack-assistant-bot-dms.md:210`). No secrets, no network, no file I/O in this package.
- helper coverage: covered, level 3, confidence 0.99

### Performance

- assessment and evidence: `Args` runs once per spawned run. `argv` allocates one slice sized `len(head)+2*len(ExtraDirs)+len(tail)+1` (`adapter.go:102`), and each head is one small literal; `Lookup` is a map read. No loops beyond `ExtraDirs`, no I/O.
- helper coverage: covered, level 3, confidence 0.95

## Verification Story

- command or inspection: `go test ./internal/agent` from `tools/slack-coordinator`; `gofmt -l internal/agent`; `omp --help`, `claude --help`, `codex exec --help` flag listings; `omp -p --cwd /nonexistent-dir-xyz --approval-mode write --no-session --max-time 1s "noop"`.
- result: `ok github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent 0.227s`; `gofmt -l` printed nothing; every flag in the three rows appears in the installed binary's help at the task-named version; the omp probe reached `Error: Cannot change working directory to /nonexistent-dir-xyz` (exit 1) with no option-parse error, so the space-separated `--approval-mode write` form is accepted by the parser.
- manual, screenshot, or before-and-after evidence: not applicable; no interface.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Unknown approval value silently builds the edits row

- type: Nitpick
- severity: info
- category: Functional correctness
- location: `tools/slack-coordinator/internal/agent/adapter.go:26`
- evidence: `Approval` other than `full` takes the `edits` branch at `:64`, `:78`, `:91`; `config.Validate` rejects anything but `edits` or `full` at `internal/config/config.go:163-166`, and the `RunSpec` comment documents the fallback.
- suggestion: none; least privilege on a value config already validates is the right default. A runner test that constructs `RunSpec` by hand should pass `edits` or `full` explicitly.

### ADV-002 Codex final-message path is relative to the process working directory

- type: Potential issue
- severity: info
- category: Data integrity and integration
- location: `tools/slack-coordinator/internal/agent/adapter.go:90`
- evidence: `-o last-message.md` is relative while `FinalTextPath` returns `<RunDir>/last-message.md` (`:52,87`). The two agree only when the runner sets `cmd.Dir = RunDir`, which the TDD specifies (`03-tdd-slack-assistant-bot-dms.md:34`) and which the instruction "Read prompt.md in the current directory" already requires. The row is exactly what `task.md:25` prescribes.
- suggestion: the runner child's test should spawn a fake `codex` that writes `-o` relative to its cwd and read it back through `FinalTextPath`, so the coupling is pinned where it lives.

### ADV-003 Non-interactive approval behavior is documented, not exercised

- type: Potential issue
- severity: info
- category: Stability and availability
- location: `tools/slack-coordinator/internal/agent/adapter.go:67,81`
- evidence: the TDD open questions `03-tdd-slack-assistant-bot-dms.md:590-592` ask whether `omp --approval-mode write` and `claude --permission-mode acceptEdits` deny rather than hang without a TTY, and whether `codex exec -o` writes on SIGKILL. This review verified flag existence and parsing only; a live agent run is out of scope for an argv table.
- suggestion: the runner child closes these with its fake-binary and timeout tests; no change to this package.

## Dead Code and Dependency Review

- newly orphaned code: none; the package is new and has no callers yet by design (`task.md:12`, runner sibling pending).
- dependency findings: none; standard library only, `go.mod` and `go.sum` unchanged.

## Verdict

- decision: approve
- overall code-health change: improves; adds the agent-package boundary the TDD requires with one table and full argv pinning.
- rationale: all four acceptance criteria are proven by `adapter_test.go` and confirmed against the installed binaries; the import boundary holds; no critical or major finding.

## Review Limits

- blocked or unavailable checks: none.
- residual manual verification: end-to-end spawn behavior of the three binaries in `-p`/`exec` mode (hang versus deny, `-o` on SIGKILL) belongs to the runner child, per ADV-003. Formatters, linters, and the project-wide `npm test` were not run, per `task.md:29`.
