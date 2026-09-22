---
type: code-review
date: 2026-09-22
branch: agent-runner-spawns-an
base_branch: epic-slack-assistant-bot-dms
base_sha: da39e897228eb829509761cb8c5c1027f8751460
head_sha: 563ef1df9409e10907592d870c44ce1cbef94917
status: clean
summary: "Reviewed commit 563ef1d, which adds run.go, rundir.go, proposal.go, run_test.go, and testdata/fake-agent.sh to tools/slack-coordinator/internal/agent. Every task.md acceptance criterion is proven by go test -race ./internal/agent: 0700 run dir, 0600 logs and meta.json, process-group SIGKILL on timeout and ctx end with the forked child gone within one second, env scrub, result.md then trimmed stdout then empty, 20-line StderrTail, ErrBinaryMissing before any file is created. No critical or major findings; one minor advisory on a same-instant exit-versus-timeout select. The next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `da39e897228eb829509761cb8c5c1027f8751460` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists for the branch)
- reviewed HEAD: `563ef1df9409e10907592d870c44ce1cbef94917`
- commits: `563ef1d feat(slack-coordinator): add agent runner with group kill`
- staged and unstaged changes: none (`git status --short --branch` printed only `## agent-runner-spawns-an`)
- task-owned untracked files: none before this artifact
- excluded changes: none; the diff adds five files under `tools/slack-coordinator/internal/agent/` (+622/-0): `run.go` (242), `rundir.go` (56), `proposal.go` (6), `run_test.go` (282), `testdata/fake-agent.sh` (36, mode 100755)

## Previous Round

- previous artifact: None.

`None.` in the first round.

## Requirements and Standards

- task or ticket: `.agents/tasks/agent-runner-spawns-an/task.md` (oneshot child of `slack-assistant-bot-dms`, issue #48). It fixes the `Runner`, `Handle`, `RunOutcome`, and `ErrBinaryMissing` shapes, the `rundir.go` functions, the spawn sequence, the fake agent's six modes, and the test assertions. Import boundary: standard library only, never `slackapi`, `db`, or `config`.
- implementation source: `task.md` itself; a oneshot child carries no plan or outline artifact. The user's request for this session: manual mode, implement before review, no questions, run only the Go package `task.md` names.
- repository instructions: `AGENTS.md` (worktree root). The change is inside `tools/slack-coordinator`, outside the skill, controller, and installer boundaries it names. `npm test` was not run per the user's instruction.

## Change Profile

- intent and expected behavior: `NewRunner(adapter).Start(ctx, spec)` spawns the adapter's binary in its own process group inside a private run directory; `Handle.Wait` returns exit code, duration, `TimedOut`, result text with its source, and the last 20 stderr lines, and leaves `meta.json` beside the logs.
- change description quality: the subject is 55 characters and stands alone; the body says why (group kill so forked children die, meta.json for purge and `!show`), lists the four choices `task.md` left open with their reasons, and carries `Refs: #48`. The claim that `config.Validate` rejects `timeout <= 0` is true (`internal/config/config.go:168-170`, tested at `config_test.go:164-165`).
- implementation model and review model: implementation model unrecorded; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 622 added lines, one runner plus its directory helpers, fake agent, and proof; cohesive, no split warranted.
- resulting large-file concerns: none; the largest file is `run_test.go` at 282 lines.
- dependency or lockfile changes: none; `go.mod` and `go.sum` untouched, imports are `os/exec`, `syscall`, and other standard library packages only. No `.changeset/` entry; the epic pull request owns the user-facing entry, as with the sibling children.

## Tests Reviewed First

- behavior claimed by tests: `TestStartCreatesPrivateRunDirAndReadsResultFile` (`run_test.go:52`) asserts `Pgid == Pid`, run dir `0700`, `stdout.log`/`stderr.log`/`meta.json` `0600`, exit 0, `Result`/`ResultSource` from `result.md`, positive `Duration`, and the four `meta.json` fields. `TestTimeoutKillsProcessGroup` (`:99`) reads the `child.pid` the fake writes after `sleep 300 &`, waits with a 200 ms timeout, and requires `TimedOut`, exit `-1`, `Duration >= 200ms`, `kill(child, 0) == ESRCH` within one second (`waitGone`, `:272`), and `meta.json` `timed_out: true`. `TestContextEndKillsProcessGroup` (`:125`) does the same through `cancel()`. `TestEnvironmentDropsSecretsAndHome` (`:142`) sets the four names plus `KEEP_ME`, runs mode `env`, and checks the four are absent and `KEEP_ME` present. `TestResultFallsBackToTrimmedStdout` (`:167`), `TestNoOutputYieldsEmptySource` (`:182`), `TestFailureKeepsExitCodeAndLastTwentyStderrLines` (`:194`, lines 6 through 25), `TestStartReportsMissingBinaryBeforeCreatingAnything` (`:210`, nil handle, `errors.As`, exact message, run dir absent), and `TestTailLinesReadsAcrossChunkBoundary` (`:229`, 3000 lines of 51 bytes against the 8 KiB chunk) cover the rest.
- missing or misleading coverage: none blocking. Stdin from `/dev/null` is not asserted directly; the runner leaves `cmd.Stdin` nil, which `os/exec` documents as reading from `os.DevNull`, and the fake agent never reads stdin so a test could not distinguish the two. The exit-versus-timeout tie in ADV-001 is not tested; it needs a same-nanosecond coincidence.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4784` in / `73` out
- provenance: `judge: model jev-1.13.0, tokens 4784 in / 73 out` (stderr, both runs; first run every axis `covered`, second run after a heading repair every axis `covered`; confidences below are from the second run)

### Correctness

- assessment and evidence: `Start` (`run.go:65-118`) orders `exec.LookPath` before `Create`, so a missing binary touches nothing (`run_test.go:224`). `Create` (`rundir.go:20-25`) does `MkdirAll 0700` then `Chmod 0700`, defeating a wider umask or pre-existing mode. Logs open `O_CREATE|O_WRONLY|O_TRUNC` at `0600` (`run.go:178`). `cmd.Stdout`/`cmd.Stderr` are `*os.File`, so `cmd.Wait` returns on process exit without waiting for pipe copies; a `sleep 300` grandchild holding the fds cannot stall `Wait`, which is why the 200 ms test finishes in 0.22 s. `Setpgid: true` and `Getpgid(pid)` (`run.go:91-101`) give `Pgid == Pid`; `kill` sends `SIGKILL` to `-pgid`. `wait` (`run.go:124-154`) selects on exit, `ctx.Done()`, and a stopped timer; the kill paths drain `exited` before reading `ProcessState`, whose `ExitCode()` is `-1` for a signalled process. `ReadOutputs` (`rundir.go:31-51`) prefers `result.md`, then `TrimSpace` of `finalTextPath` with `"stdout"`, and treats blank trimmed text as no output; only a non-`ENOENT` read error propagates. `tailLines` (`run.go:203-242`) reads backwards until it has `n+1` newlines, trims one trailing newline, and slices the last `n`, correct for files with or without a final newline. `writeMeta` (`run.go:164-175`) emits the four keys at `0600`. `go test -race -count=1 ./internal/agent` passes 12 tests in 1.47 s; `pgrep -f "sleep 300"` before and after the run finds no leaked child. All five acceptance criteria are proven by these tests.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `Start` reads top to bottom in the order `task.md` lists; `wait` is the only function with branching and its three cases are visible in one `select`. `scrubEnv` (`run.go:187-198`) is a single loop with the four names in one `switch`. `sync.Once` around `outcome` (`run.go:107-116`) makes `Wait` idempotent without a mutex. File names live in one `const` block (`rundir.go:11-16`). The `Stdin` comment (`run.go:86-87`) records why the field stays nil. No dead branches or unused parameters.
- helper coverage: covered, level 3, confidence 0.98

### Architecture

- assessment and evidence: the runner depends only on `Adapter`, `RunSpec`, and the standard library, matching the package comment in `adapter.go:1-4`; no `slackapi`, `db`, or `config` import. `Runner` is an interface over an unexported struct so a later child can substitute a fake. `Handle` exposes `Wait` and `Kill` as closures over the started process instead of leaking `*exec.Cmd`. `Proposal` is the empty placeholder `task.md` prescribes; `RunOutcome.Proposal`/`ProposalErr` are declared but never set, which the field comments and the commit body state.
- helper coverage: covered, level 3, confidence 0.96

### Security

- assessment and evidence: run directory `0700`, logs and `meta.json` `0600`, asserted by tests. The child environment drops `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `JIRA_API_TOKEN`, and `SLACK_COORDINATOR_HOME` (`run.go:192`), asserted with the variables set (`run_test.go:143-161`). The binary is resolved once by `exec.LookPath` and passed as an absolute path to `exec.Command`, so no relative-path lookup happens at spawn. Group kill on `SIGKILL` cannot be trapped by the agent; a grandchild that calls `setsid` would escape, which is inherent to the `Setpgid` design `task.md` dictates.
- helper coverage: covered, level 3, confidence 0.90

### Performance

- assessment and evidence: no pipes or copy goroutines; stdout and stderr go straight to files. `tailLines` reads at most one 8 KiB chunk per iteration from the end and stops at `n+1` newlines, so a multi-megabyte `stderr.log` costs a few reads (`TestTailLinesReadsAcrossChunkBoundary`). `ReadOutputs` reads `result.md` whole, which is the agent's final message, not a log. `scrubEnv` allocates one slice sized to the environment. `time.NewTimer` is stopped on return.
- helper coverage: covered, level 3, confidence 0.98

## Verification Story

- command or inspection: `go test -race -count=1 -v ./internal/agent` and `go vet ./internal/agent` in `tools/slack-coordinator`; `pgrep -fl "sleep 300"` before and after the run; `git ls-files -s internal/agent/testdata/fake-agent.sh`.
- result: 12 tests `PASS`, `ok github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent 1.470s`; `go vet` prints nothing; `pgrep` finds no process both times; the fake agent is committed at mode `100755`.
- manual, screenshot, or before-and-after evidence: not applicable; no interface.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Exit and timeout ready in the same select can mark a finished run TimedOut

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `tools/slack-coordinator/internal/agent/run.go:133-143`
- evidence: Go's `select` picks uniformly among ready cases. If the process exits in the same instant the timer fires or `ctx` ends, the `timeout`/`ctx.Done()` case can win, `kill()` hits a dead group (`ESRCH`, ignored), `<-exited` returns at once, and `TimedOut` is `true` beside the real `ExitCode` (`0` for a clean exit).
- suggestion: in the two kill cases, first try a non-blocking `select { case <-exited: default: kill(); <-exited; out.TimedOut = true }` so an already-exited process keeps `TimedOut == false`. No fix round required; the window is sub-millisecond and the run still records its true exit code.

### ADV-002 Timeout of zero disables the deadline instead of failing fast

- type: Nitpick
- severity: info
- category: Stability and availability
- location: `tools/slack-coordinator/internal/agent/run.go:125-130`
- evidence: `spec.Timeout <= 0` leaves `timeout` nil, so `Wait` blocks until exit or `ctx` end. `config.Validate` rejects a non-positive `agent.timeout` (`internal/config/config.go:168`), so the daemon never passes one; a future caller building `RunSpec` by hand would get an unbounded run.
- suggestion: none now; the commit body records the choice. If a later child adds a second `RunSpec` producer, guard there or reject in `Start`.

## Dead Code and Dependency Review

- newly orphaned code: none; the change adds files only. `RunOutcome.Proposal` and `ProposalErr` are unset placeholders the proposal child fills, as `task.md` requires.
- dependency findings: none; `go.mod` and `go.sum` are untouched.

## Verdict

- decision: approve
- overall code-health change: improves; the epic's run lifecycle now has a tested spawn, kill, and collect path with the private directory and secret scrub the design requires.
- rationale: every `task.md` acceptance criterion and every listed test assertion is present and passes under `-race`; the two advisories are a sub-millisecond tie and a guarded caller choice, neither blocking.

## Review Limits

- blocked or unavailable checks: none. Per the user's instruction the project-wide `npm test` was not run; only `go test -race ./internal/agent` and `go vet ./internal/agent`.
- residual manual verification: none.
