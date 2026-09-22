---
slug: agent-runner-spawns-an
title: "agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - agent-adapters-name-argv
issue: 48
---
In `tools/slack-coordinator/internal/agent` (the `Adapter`, `RunSpec`, and `Lookup` already exist in `adapter.go`), add the process runner. Import `os/exec`, `syscall`, standard library only; never `slackapi`, `db`, or `config`.

`rundir.go`: `Create(dir string) error` (MkdirAll 0700 + chmod 0700), `ReadOutputs(dir, finalTextPath string) (result, source string, err error)` returning `result.md` text with source `result.md`, else the trimmed content of `finalTextPath` with source `stdout`, else empty with empty source; `Remove(dir string) error`.

`run.go`:
```go
type Runner interface { Start(ctx context.Context, spec RunSpec) (*Handle, error) }
type Handle struct { Pid, Pgid int; Wait func() RunOutcome; Kill func() }
type RunOutcome struct { ExitCode int; TimedOut bool; Duration time.Duration; Proposal *Proposal; ProposalErr error; Result, ResultSource, StderrTail string }
type ErrBinaryMissing struct{ Name string } // Error(): agent binary %q not found on PATH
func NewRunner(adapter Adapter) Runner
```
`proposal.go` holds `type Proposal struct{}` as a placeholder a sibling child fills. `Start`: `exec.LookPath(adapter.Command())` → `ErrBinaryMissing`; `Create(spec.RunDir)`; `cmd := exec.Command(bin, adapter.Args(spec)...)`; `cmd.Dir = spec.RunDir`; `cmd.Stdin` = opened `/dev/null`; `stdout.log`/`stderr.log` created 0600 in the run dir; `cmd.Env` = `os.Environ()` minus the four variables; `cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}`; `cmd.Start()`; `Handle.Pgid` = `syscall.Getpgid(pid)`; `Handle.Kill` = `syscall.Kill(-pgid, syscall.SIGKILL)`. `Wait` selects on process exit, `ctx.Done()`, and `time.After(spec.Timeout)`; on timeout or ctx it kills the group, waits for exit, sets `TimedOut`; then `ReadOutputs(spec.RunDir, adapter.FinalTextPath(spec.RunDir))`, computes `StderrTail` (last 20 lines of `stderr.log`), writes `meta.json` `{"exit_code", "duration_ms", "timed_out", "result_source"}` (0600), returns the outcome. Exit code `-1` when killed.

`testdata/fake-agent.sh` (executable, `#!/bin/sh`): reads env `FAKE_MODE`: `result` writes `result.md` with `$FAKE_TEXT`; `stdout` echoes `$FAKE_TEXT` and writes nothing; `empty` exits 0 writing nothing; `sleep` runs `sleep 300 &`, writes `$!` to `child.pid`, then `wait`; `fail` prints 25 numbered lines to stderr and exits 3; `env` writes `env` output to `result.md`. Tests use a test adapter whose `Command()` is `fake-agent.sh` with `PATH` prepended to `testdata`, and `FinalTextPath` = `stdout.log`: assert run dir mode 0700, `Pgid == Pid`, group kill after a 200 ms timeout (`syscall.Kill(childPid, 0)` returns `ESRCH` within one second), env scrub (`result.md` lacks the four names while the test sets them), `meta.json` fields, `ResultSource` `stdout` fallback, `empty` → empty source, `fail` → exit 3 and a 20-line `StderrTail`, `ErrBinaryMissing` for an unknown command.

Proof: `go test -race ./internal/agent`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `Runner.Start` is called with a `RunSpec`, it shall create `RunDir` at mode 0700, spawn the adapter's binary with `cmd.Dir = RunDir`, stdin from `/dev/null`, `Setpgid: true`, stdout and stderr to `stdout.log` and `stderr.log` (0600), and an environment without `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `JIRA_API_TOKEN`, `SLACK_COORDINATOR_HOME`.
- IF the process has not exited at `spec.Timeout`, THEN the runner shall `SIGKILL` the process group so a child the agent forked is dead within one second and `RunOutcome.TimedOut` is true.
- WHEN the process exits, `RunOutcome.Result` shall be the `result.md` text with `ResultSource` `result.md`, else the trimmed final text file with `ResultSource` `stdout`, else empty with an empty `ResultSource`, and `meta.json` shall record `exit_code`, `duration_ms`, `timed_out`, `result_source`.
- WHEN the process exits, `RunOutcome.StderrTail` shall hold the last 20 lines of `stderr.log`.
- IF the adapter's binary is not on `PATH`, THEN `Start` shall return `ErrBinaryMissing` naming the binary without creating a process.
