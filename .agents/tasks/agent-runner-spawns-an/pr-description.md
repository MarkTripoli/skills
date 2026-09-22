Ticket: [#48](https://github.com/MarkTripoli/skills/issues/48) | Task: `agent-runner-spawns-an`

## Purpose

The coordinator has adapters that name an agent's argv (#78) but nothing that runs one; `internal/agent` adds `Runner`, which spawns the binary in its own process group inside a private 0700 run directory, kills the group on timeout or context end, and returns the agent's final text, exit code, stderr tail, and a `meta.json` for later purge and `!show`.

## Acceptance criteria

- `Start` creates `RunDir` at 0700, runs the binary with `cmd.Dir = RunDir`, `Setpgid: true`, stdin from `/dev/null`, 0600 `stdout.log`/`stderr.log`, and an environment without `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `JIRA_API_TOKEN`, `SLACK_COORDINATOR_HOME`: `TestStartCreatesPrivateRunDirAndReadsResultFile` stats the directory (`0700`), the two logs and `meta.json` (`0600`), and asserts `Pgid == Pid`; the fake agent writes `result.md` by relative path, which only lands when `cmd.Dir` is the run directory; `TestEnvironmentDropsSecretsAndHome` sets the four names plus `KEEP_ME`, runs `env > result.md`, and checks the four are absent and `KEEP_ME` survives. Stdin is not asserted directly: `cmd.Stdin` stays nil, which `os/exec` documents as reading from `os.DevNull`.
- A process still running at `spec.Timeout` is `SIGKILL`ed as a group, its forked child is dead within one second, and `TimedOut` is true: `TestTimeoutKillsProcessGroup` (200 ms timeout, fake forks `sleep 300`, `syscall.Kill(child, 0)` returns `ESRCH` inside one second, `ExitCode == -1`, `meta.json` `timed_out: true`); `TestContextEndKillsProcessGroup` covers the same path through `cancel()`.
- `Result`/`ResultSource` are `result.md` text with `result.md`, else the trimmed final text with `stdout`, else empty with empty source, and `meta.json` records `exit_code`, `duration_ms`, `timed_out`, `result_source`: `TestStartCreatesPrivateRunDirAndReadsResultFile`, `TestResultFallsBackToTrimmedStdout` (`"  from stdout  "` becomes `"from stdout"`), `TestNoOutputYieldsEmptySource`; each reads `meta.json` and checks the four fields.
- `StderrTail` holds the last 20 lines of `stderr.log`: `TestFailureKeepsExitCodeAndLastTwentyStderrLines` (25 lines written, tail is `line 6` through `line 25`, exit 3); `TestTailLinesReadsAcrossChunkBoundary` proves the backward 8 KiB reader across a 3000-line file.
- A binary missing from `PATH` returns `ErrBinaryMissing` naming it and creates nothing: `TestStartReportsMissingBinaryBeforeCreatingAnything` asserts the exact `agent binary "no-such-agent-binary" not found on PATH`, a nil handle, and that `RunDir` does not exist.

`go test -race -count=1 ./internal/agent` from `tools/slack-coordinator`: `ok ... 1.535s`.

## Special things to note

- `wait` (`run.go:133-143`) selects on exit, `ctx.Done()`, and the timer. If the process exits in the same instant the deadline fires, Go may pick the kill case: `SIGKILL` hits a dead group, and the outcome carries the true exit code with `TimedOut == true`. Sub-millisecond window, left as is; the code review records it as ADV-001.
- `spec.Timeout <= 0` disables the deadline instead of failing fast. `config.Validate` (`internal/config/config.go:168`) already rejects a non-positive `agent.timeout`, so the daemon never passes one; a hand-built `RunSpec` would get an unbounded run.
- `RunOutcome` has no error slot in the epic contract, so a `ReadOutputs` or `meta.json` write failure leaves the corresponding fields empty rather than failing `Wait`. `Proposal` and `ProposalErr` are declared and never set; `proposal.go` is the empty placeholder the proposal child fills.

## Change outline

Five new files, standard library only (`os/exec`, `syscall`, `context`, `encoding/json`, and friends); `go.mod` untouched:

```text
tools/slack-coordinator/internal/agent/
  run.go                   Runner, Handle, RunOutcome, ErrBinaryMissing, NewRunner, wait, meta.json, scrubEnv, tailLines
  rundir.go                Create (MkdirAll+Chmod 0700), ReadOutputs (result.md > trimmed final text > empty), Remove
  proposal.go              type Proposal struct{} placeholder
  run_test.go              9 tests over a fakeAdapter whose Command() is fake-agent.sh
  testdata/fake-agent.sh   modes result | stdout | empty | sleep | fail | env (mode 100755)
```

Exported surface the dispatch child consumes:

```go
type Runner interface { Start(ctx context.Context, spec RunSpec) (*Handle, error) }
type Handle struct { Pid, Pgid int; Wait func() RunOutcome; Kill func() }
type RunOutcome struct {
    ExitCode int; TimedOut bool; Duration time.Duration
    Proposal *Proposal; ProposalErr error
    Result, ResultSource, StderrTail string
}
type ErrBinaryMissing struct{ Name string }   // agent binary %q not found on PATH
func NewRunner(adapter Adapter) Runner
func Create(dir string) error
func ReadOutputs(dir, finalTextPath string) (result, source string, err error)
func Remove(dir string) error
```

One run, start to outcome:

```text
Start(ctx, spec)
  exec.LookPath(adapter.Command())        -> ErrBinaryMissing, nothing created
  Create(spec.RunDir)                     MkdirAll 0700; Chmod 0700
  createLog stdout.log, stderr.log        0600, O_TRUNC; *os.File, no pipes
  cmd.Dir = RunDir; Env = scrubEnv(os.Environ()); SysProcAttr.Setpgid = true
  cmd.Start(); pgid = Getpgid(pid); kill = SIGKILL -pgid
  go exited <- cmd.Wait()
Handle.Wait()  (sync.Once)
  select exited | ctx.Done() | timer     kill paths: kill(); <-exited; TimedOut = true
  ExitCode = ProcessState.ExitCode() or -1
  Result, ResultSource = ReadOutputs(RunDir, adapter.FinalTextPath(RunDir))
  StderrTail = tailLines(stderr.log, 20)
  writeMeta(meta.json 0600)
```

Stdout and stderr are `*os.File`, so `cmd.Wait` returns on process exit and a grandchild that inherits the descriptors cannot stall it; that is why the 200 ms timeout test finishes in about 0.2 s.

## Human Review

### Review targets

- `Start` ordering in `run.go:65-118`: `LookPath` before `Create`, so a missing binary leaves no directory; `defer stdout.Close()` after `cmd.Start` hands the descriptors to the child.
- The three `select` arms and the drain of `exited` after `kill()` in `run.go:133-143`; `ExitCode` fallback to `-1` when `ProcessState` is nil.
- `scrubEnv` name list (`run.go:192`) against the four variables in the task; `Create` forcing `Chmod 0700` after `MkdirAll`.
- `tailLines` chunk loop (`run.go:217-232`): `n+1` newline stop condition and the trailing-newline trim.

### Verify

- [ ] `Commits` and Go checks pass on the pull request.
- [ ] A reviewer confirms `internal/agent` imports nothing from `slackapi`, `db`, or `config`, and that `testdata/fake-agent.sh` is committed executable (`git ls-files -s` shows `100755`).

### Known limits

- Only `testdata/fake-agent.sh` was run; no live `omp`, `claude`, or `codex` process. Whether `codex -o last-message.md` survives a group `SIGKILL` is not exercised.
- The exit-versus-deadline tie in ADV-001 has no test; it needs a same-nanosecond coincidence.
- No `.changeset/` entry: the epic pull request owns the user-facing entry, matching siblings #75 and #78.
- No plan artifact exists for this oneshot child, so the description was checked against `task.md` and [01-code-review-agent-runner-spawns-an.md](.agents/tasks/agent-runner-spawns-an/01-code-review-agent-runner-spawns-an.md), and the pull request base is `epic-slack-assistant-bot-dms` from `task.md` `base:`.

Closes #48
