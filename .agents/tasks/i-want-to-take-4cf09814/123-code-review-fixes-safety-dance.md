---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/122-code-review-safety-dance.md
reviewed_head_sha: 83b537b
fixed_head_sha: 740019f
status: blocked
summary: "This repair round addresses evidence-size exhaustion, strict CWD recovery, Windows handle-path confinement, cross-platform TUI sizing, blocked exit-code mapping, hook command validation, and GitHub Enterprise routing. GitHub conditional PR publication now refuses an unsafe non-atomic REST write. Full proof remains blocked for daemonized descendant capability separation and native Windows adversarial execution; focused Go, Windows cross-compilation, and root aggregate checks provide local evidence."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains the merge target; review 122 covered `83b537b`, and this round has uncommitted fixes.
- unrelated changes preserved: existing `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `.agents/tasks/i-want-to-take-4cf09814/evidence/`, and `progress.md` remain untouched.

## Finding Dispositions

### CR-392

- disposition: blocked
- evidence: Mutation authorization now fails closed when ancestry traversal cannot reach a verified root. The remaining daemonized-descendant case can shed `SD_PARENT_RUN_ID` after reparenting, and no OS-level capability or containment proof was added in this round.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `go test -race ./internal/daemon` passed; a complete daemonized-descendant regression remains required.

### CR-393

- disposition: fixed
- evidence: Strict recovery performs a completeness-checked CWD inspection before sweeping a persisted worktree. Linux lookup failures and unavailable non-Linux lookup results now abort recovery instead of being treated as an empty match.
- files changed: `tools/safety-dance/internal/procreap/procreap.go`, `tools/safety-dance/internal/procreap/cwd_linux.go`, `tools/safety-dance/internal/procreap/cwd_other_unix.go`, `tools/safety-dance/internal/procreap/proc_other.go`, `tools/safety-dance/internal/procreap/recovery_test.go`
- regression check: `go test -race ./internal/procreap` passed.

### CR-394

- disposition: blocked
- evidence: Windows evidence reads now verify the final opened handle path against the managed root, preventing an ancestor replacement from publishing an outside handle, and apply the same 16 MiB limit as Unix. Native Windows replacement execution is unavailable in this checkout.
- files changed: `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go`
- regression check: `GOOS=windows GOARCH=amd64 go test -c ./internal/pipeline/steps` passed; native reparse-point execution remains unavailable.

### CR-395

- disposition: fixed
- evidence: GitHub conditional PR publication no longer performs a non-atomic PATCH after a GET. It compares the current body, then refuses the unsafe REST update rather than risking an authored edit; callers receive a typed failure path through the existing conditional updater contract.
- files changed: `tools/safety-dance/internal/scm/github/github.go`
- regression check: `go test -race ./internal/scm/... ./internal/pipeline/steps` passed.

### CR-396

- disposition: fixed
- evidence: Managed-hook authorization no longer accepts bare forged `pre-receive` or `post-receive` basenames, and receive-pack validation requires the executable to be the command's first field. Managed hook invocations pass the gate hook path explicitly.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/git/hook.go`
- regression check: `go test -race ./internal/git ./internal/daemon` passed.

### CR-397

- disposition: fixed
- evidence: Unix and Windows evidence reads use a 16 MiB maximum and a limited reader, returning a typed size error before retaining oversized content.
- files changed: `tools/safety-dance/internal/pipeline/steps/evidence_open_unix.go`, `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go`
- regression check: `go test -race ./internal/pipeline/steps` and Windows cross-compilation passed.

### CR-398

- disposition: fixed
- evidence: TUI width detection uses `charmbracelet/x/term.GetSize`, which supplies native Windows console sizing while retaining Unix behavior and zero-width fallback for non-terminals.
- files changed: `tools/safety-dance/internal/tui/app.go`
- regression check: `go test -race ./internal/tui` and Windows cross-compilation passed.

### CR-399

- disposition: fixed
- evidence: Nested mutation policy errors return `ExitCodeError{Code: 6}`, preserving the distinct blocked-run exit class for every command using `nestedMutation`.
- files changed: `tools/safety-dance/internal/cli/root.go`
- regression check: `go test -race ./internal/cli` passed.

### CR-400

- disposition: fixed
- evidence: GitHub Enterprise conditional-read requests now pass the resolved `--hostname` while retaining the host-prefixed repository slug behavior.
- files changed: `tools/safety-dance/internal/scm/github/github.go`
- regression check: `go test -race ./internal/scm/...` passed.

## Advisory Decisions

None.

## Verification

- command: `go test -race ./internal/git ./internal/daemon ./internal/cli ./internal/procreap ./internal/pipeline/steps ./internal/scm/... ./internal/tui`
- result: passed.
- command: `GOOS=windows GOARCH=amd64 go test -c` for `internal/pipeline/steps`, `internal/procreap`, `internal/tui`, and `internal/cli`
- result: passed; binaries were written outside the repository.
- command: `cd tools/safety-dance && make e2e`
- result: passed after correcting fail-closed ancestry termination handling.
- command: `npm test`
- result: passed after the final e2e ancestry correction with 137 Node tests, identity scanning, Go race tests, vet, temporary build, local e2e, and release-contract checks.

## Remaining Blocks

- CR-392 requires an unforgeable daemon-issued top-level mutation capability or OS containment identity that survives descendant reparenting, plus an adversarial regression.
- CR-394 requires native Windows reparse-point replacement execution and handle-level regression proof.
- Hosted release execution and authorized live-provider concurrency remain unavailable.
