---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 31-code-review-safety-dance.md
reviewed_head_sha: 1ef50b7620c4258145ca7b9aded5fca5fac85bca
fixed_head_sha: b00a27b
status: complete
summary: "This repair pass replaces fail-closed validation stubs with worktree-bound diff-check gates, persists admission receipts across daemon restarts, restricts token issuance to managed-hook calls, adds an interactive polling TUI, commits publication binding under a transactional run-state guard, propagates SD_HOME to Windows tasks, deletes owned tasks, and protects wizard service rollback. CR-027 and CR-028 remain blocked because the imported agent/provider validation semantics and OS ancestry proof are not complete; hosted release and live-provider evidence remain untested."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review covered `1ef50b7`; code fixes are committed at `b00a27b`. The merge base `4458fbf` is unchanged.
- unrelated changes preserved: Existing task-owned `.atomic-delivery/` and `evidence/` directories remain unmodified and untracked.

## Finding Dispositions

### CR-027

- disposition: blocked
- evidence: `internal/pipeline/steps/validation.go` now binds each gate to the owned worktree and runs `git diff --check`, so runs no longer fail through unconditional placeholder errors. The imported agent, configured test/lint, documentation, provider PR, and CI semantics are not yet connected, so this finding is not fully closed.
- files changed: `internal/pipeline/steps/{ci,document,intent,lint,pr,rebase,review,test,validation}.go`, `internal/cli/daemon.go`
- regression check: `go test ./...`, `go vet ./...`, and `npm test` pass; these do not prove provider-backed validation behavior.

### CR-028

- disposition: blocked
- evidence: Token issuance now requires `SD_HOOK_HELPER=1`, an authenticated peer, and no `SD_PARENT_RUN_ID`; arbitrary callers can still spoof the helper environment because OS process-ancestry validation was not added.
- files changed: `internal/daemon/admission.go`, `internal/git/hook.go`
- regression check: `go test -race ./internal/daemon ./internal/git` passes; ancestry rejection remains unproven.

### CR-029

- disposition: fixed
- evidence: `tui.App.Run` now renders initial state, polls durable state, accepts `q`, `r`, and `a` commands, and the CLI starts it for TTY input while retaining one-shot ANSI-free output for non-TTY input.
- files changed: `internal/tui/app.go`, `internal/cli/tui.go`
- regression check: `go test ./internal/cli ./internal/tui` passes.

### CR-030

- disposition: fixed
- evidence: `RecordPublicationAndBinding` updates push provenance and inserts the publication only when the run remains pending/running with `push_active=1`, in one SQLite transaction. `Publish` uses this method after mirror reconciliation.
- files changed: `internal/db/publications.go`, `internal/pipeline/steps/push.go`
- regression check: `go test -race ./internal/pipeline/... ./internal/db ./internal/e2e` passes, including publication interruption recovery.

### CR-031

- disposition: fixed
- evidence: Admission receipts are atomically written to `admission-receipts.json`, loaded at daemon startup, retained when notification handling fails, and removed only after the notification callback succeeds. CLI daemon construction uses the store under the selected runtime home.
- files changed: `internal/daemon/admission.go`, `internal/cli/daemon.go`
- regression check: `go test -race ./internal/daemon ./internal/git` and `npm run test:safety-dance` pass.

### CR-032

- disposition: fixed
- evidence: Windows task creation wraps the executable with an explicit `SD_HOME`; stop now deletes the home-scoped task instead of only ending its current process.
- files changed: `internal/daemon/service.go`
- regression check: `go test ./internal/daemon` and `go vet ./...` pass; hosted Windows execution remains untested.

### CR-033

- disposition: fixed
- evidence: Wizard setup tracks whether the service definition existed before this attempt and only invokes stop compensation for a service created by the attempt. CLI wiring records that ownership before install.
- files changed: `internal/wizard/setup.go`, `internal/cli/wizard.go`, `internal/daemon/service.go`
- regression check: `go test ./internal/wizard ./internal/cli ./internal/daemon` passes.

## Advisory Decisions

None.

## Verification

- command: `npm test`
- result: Passed; validation and plugin sync passed, 136 Node tests passed, and the Safety Dance aggregate passed.
- command: `cd tools/safety-dance && go test ./... && go vet ./...`
- result: Passed across all Go packages.
- command: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli ./internal/pipeline/...`
- result: Passed.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- CR-027: connect the imported agent/configuration/provider implementations and prove a successful configured validation run reaches publication.
- CR-028: replace environment-based helper gating with OS process-ancestry authorization and add a same-user child regression test.
- Hosted `safety-dance-v*` release execution, Windows task-manager execution, and authorized live-provider behavior remain untested.
