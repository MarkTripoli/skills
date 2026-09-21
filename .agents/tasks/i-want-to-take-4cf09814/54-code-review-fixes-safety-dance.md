---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 53-code-review-safety-dance.md
reviewed_head_sha: 7b5d068a1f911a437232fc03dd74505804bb3e69
fixed_head_sha: f86293ca3e9bcf5558fa69e7d3ca8a18fca314f8
status: complete
summary: "This repair pass addresses CR-140 through CR-149: typed validation now requires an explicit pass verdict and neutralized agent, nested validation identity reaches typed children and marked hook ancestry is rejected, Windows ancestry includes the hook command line, worktree and daemon recovery use durable replay-safe ownership, gate repair snapshots restore owned state, wizard input preserves spaced commands while unsupported prompts were removed, terminal views include latest terminal runs, and service activation failures retain compensating ownership evidence. The Safety Dance aggregate, Go race suite, vet, release checks, and Windows cross-compilation pass; hosted Windows runtime, provider, and release evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review examined `7b5d068`; this repair commit advances the branch to `f86293c`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`; the task's pre-existing `.atomic-delivery/` and `evidence/` directories remain unmodified.
- unrelated changes preserved: Untracked task evidence and orchestration state were preserved; no unrelated source files were changed.

## Finding Dispositions

### CR-140

- disposition: fixed
- evidence: `Typed` requests an enum-constrained `pass`/`fail`/`blocked` schema, decodes the returned verdict, and returns an error for every non-pass result. The parsed failure path is covered by `internal/pipeline/steps/validation_test.go`; the returned error is persisted by the durable runner as the failed step error.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`, `tools/safety-dance/internal/pipeline/steps/validation_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps`

### CR-141

- disposition: fixed
- evidence: Typed validation receives `SD_PARENT_RUN_ID`; managed-hook ancestry rejects that marker in both command metadata and readable process environments. The managed hook no longer exports the marker while requesting or admitting tokens, so the negative check does not reject the legitimate chain.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`, `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/pipeline/steps`

### CR-142

- disposition: fixed
- evidence: Every typed gate invocation calls `agent.EnsureGateNeutralized` before `Run` and fails closed for unsupported or overridden adapters.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps ./internal/agent`

### CR-143

- disposition: fixed
- evidence: Windows process ancestry now supplements Toolhelp executable names with the process command line obtained from Windows process metadata, allowing `managedHookPeer` to identify the installed hook script when Git for Windows launches it through `sh.exe`. The daemon package and public command cross-compile for Windows.
- files changed: `tools/safety-dance/internal/daemon/processinfo_windows.go`, `tools/safety-dance/internal/daemon/lock_windows.go`
- regression check: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go test -c ./internal/daemon -o /tmp/safety-dance-daemon.test.exe && GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance`

### CR-144

- disposition: fixed
- evidence: Creation journals remain after Git creates a worktree until ownership commits, verification failures remain recoverable, and removal treats an absent path as completed while retaining the journal for source or active removal failures. Recovery therefore tolerates a crash between Git removal and journal unlink.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees`

### CR-145

- disposition: fixed
- evidence: Daemon ownership now uses an OS-backed nonblocking exclusive file lock instead of read/PID-probe/unlink/recreate takeover. A stale PID file cannot cause a contender to remove a newly acquired lock; Unix and Windows lock implementations are build-tagged.
- files changed: `tools/safety-dance/internal/daemon/daemon.go`, `tools/safety-dance/internal/daemon/lock_unix.go`, `tools/safety-dance/internal/daemon/lock_windows.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon && GOOS=windows GOARCH=amd64 go test -c ./internal/daemon -o /tmp/safety-dance-daemon.test.exe`

### CR-146

- disposition: fixed
- evidence: Existing-gate initialization snapshots the bare-repository config and hook files before repair. Provisioning and existing metadata failures restore the snapshot and the working `safety-dance` remote; fresh gates still remove only newly created state.
- files changed: `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/gate`

### CR-147

- disposition: fixed
- evidence: Wizard fields that were not applied were removed from the production prompt list. Validation commands are read as complete lines, so commands such as `go test ./...` survive parsing and are validated before writing.
- files changed: `tools/safety-dance/internal/wizard/setup.go`, `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/wizard ./internal/cli`

### CR-148

- disposition: fixed
- evidence: Status falls back to the newest terminal run per branch when no active runs exist. The TUI uses the same active-then-latest lookup and preserves the stored terminal status and error instead of inventing `completed`.
- files changed: `tools/safety-dance/internal/db/run.go`, `tools/safety-dance/internal/cli/status.go`, `tools/safety-dance/internal/cli/tui.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/cli`

### CR-149

- disposition: fixed
- evidence: On activation failure, `Service.Install` retains the owned definition and records the prior definition in a recovery sidecar. `Stop` disables the possibly partially activated service before restoring or removing the previous definition, allowing wizard compensation to clean up an activation that returned an error after side effects.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: The Go module graph remains unchanged in this repair pass. `go mod tidy` is still deferred until imported provider and typed-owner integrations settle; it is not a critical or major review finding.

## Verification

- command: `npm test`
- result: Passed validation, plugin synchronization, 136 Node tests, the Safety Dance aggregate, Go race tests, vet, temporary binary build, identity scan, and release-contract tests before the final Windows-only process metadata refinement.
- command: `npm run test:safety-dance`
- result: Passed after the final refinement, including identity scan, full Go race suite, vet, temporary binary build, and both release-contract tests.
- command: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go test -c ./internal/daemon -o /tmp/safety-dance-daemon.test.exe && GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance`
- result: Passed cross-compilation; generated binaries were removed after verification.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- Hosted Windows runtime hook admission, hosted `safety-dance-v*` release execution, and authorized live-provider behavior remain unavailable in this environment. The Windows path has compile proof and command-line ancestry handling but no real Windows Git hook session.
