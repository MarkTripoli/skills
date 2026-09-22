Ticket: [#45](https://github.com/MarkTripoli/skills/issues/45) | Task: `agent-adapters-name-argv`

## Purpose

The coordinator's process runner needs one place that says how to start `omp`, `claude`, or `codex` non-interactively for a run directory; `internal/agent` adds that argv table behind `Adapter`, `RunSpec`, and `Lookup` with no imports from `slackapi`, `db`, or `config`.

## Acceptance criteria

- `Lookup` returns the adapter for `omp`, `claude`, `codex` and rejects any other name with `unknown agent command %q; use omp, claude, or codex`: `TestArgsMatchTablePerApprovalAndExtraDirs` calls `Lookup` for all three; `TestLookupRejectsUnknownCommand` asserts a nil adapter and the exact text for `aider`.
- `Args(RunSpec{Approval: "edits"})` returns each adapter's `edits` row with `--add-dir <D>` per `ExtraDirs` entry and the instruction last: the `edits` cases in `TestArgsMatchTablePerApprovalAndExtraDirs` compare the full slice with `reflect.DeepEqual` for zero and two `ExtraDirs`.
- `Approval: "full"` swaps `--approval-mode write` for `--auto-approve` (omp), sets `--permission-mode bypassPermissions` (claude), and inserts `--approve-for-me` before `-o` (codex): the `full` cases in the same test.
- `FinalTextPath(runDir)` is `<runDir>/stdout.log` for omp and claude and `<runDir>/last-message.md` for codex: `TestFinalTextPathPerAdapter`.

`go test -count=1 ./internal/agent` from `tools/slack-coordinator`: `ok ... 0.434s`.

## Special things to note

- Codex writes `-o last-message.md` relative to its process working directory while `FinalTextPath` returns `<RunDir>/last-message.md`; the two agree only when the runner sets `cmd.Dir = RunDir`, which the parent TDD already requires. The runner child should pin this with a fake `codex`.
- An `Approval` value other than `full` builds the `edits` row. `config.Validate` (`internal/config/config.go:163-166`) already rejects anything but `edits` or `full`, so the adapter does not duplicate the check and a malformed value cannot escalate approval.
- Every flag was checked against the installed `omp` 18.1.22, `claude` 2.1.258, and `codex` 0.155.1 help output. Whether the `edits` modes deny rather than hang without a TTY is not exercised here; it belongs to the runner child.

## Change outline

New package, standard library only:

```text
tools/slack-coordinator/internal/agent/
  adapter.go       Adapter, RunSpec, Lookup, the adapters table, argv
  adapter_test.go  12 argv rows, FinalTextPath per adapter, Lookup rejection
```

Exported surface the runner sibling consumes:

```go
type Adapter interface {
    Command() string
    Args(spec RunSpec) []string
    FinalTextPath(runDir string) string
}
type RunSpec struct { RunDir string; Approval string; ExtraDirs []string; Timeout time.Duration }
func Lookup(name string) (Adapter, error)
```

How one argv is assembled:

```text
Lookup(name) -> adapters[name]
Args(spec)
  head  = binary-specific flags; approval branch chosen here
  argv(spec, head, tail)
    head
    --add-dir D            per ExtraDirs entry
    tail                   codex only: [--approve-for-me] -o last-message.md
    instruction            "Read prompt.md in the current directory and follow it."
```

The three rows live in the single `adapters` map literal in `adapter.go`; a flag rename is one line there plus the pinned expectation in the test.

## Human Review

### Review targets

- The three rows in `adapters` (`adapter.go:58-97`) against the task table; `--add-dir` position (before the tail) and the codex `--approve-for-me` position (before `-o`).
- `RunDir` and `ExtraDirs` stay separate argv elements; nothing is joined into a shell string.
- Import list of `adapter.go`: `fmt`, `path/filepath`, `time` only.

### Verify

- [ ] `Commits` and Go checks pass on the pull request.
- [ ] A reviewer confirms the argv rows match the task table and that `internal/agent` imports nothing from `slackapi`, `db`, or `config`.

### Known limits

- No live run of the three binaries; flag existence and parsing were checked, not non-TTY deny-versus-hang behavior or `codex -o` on SIGKILL.
- No `.changeset/` entry: the package has no caller yet, matching sibling #75.

Closes #45
