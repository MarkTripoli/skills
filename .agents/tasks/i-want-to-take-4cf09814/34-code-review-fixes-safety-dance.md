---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 33-code-review-safety-dance.md
reviewed_head_sha: 556fe3cadcc82adcc9955520b38e1020206068f1
fixed_head_sha: 87d6919
status: complete
summary: "This repair pass closes the publication cancellation race, serializes receipt delivery, restores service and hook state on failed repair, applies nested lifecycle guards, exposes durable TUI prompt state and run logs, rejects multi-document configuration, and protects runtime state permissions. CR-034 and CR-035 remain blocked because the shipped pipeline still does not connect every named validation owner and token issuance still lacks OS ancestry proof; all local Node and Go gates passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review head was `6ece31b0a75cb5fc51ec051d23b1ceaccd8464fe`; this pass started at `556fe3cadcc82adcc9955520b38e1020206068f1` after the prior review artifact and committed code at `87d6919`. The merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` is unchanged.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-034

- disposition: blocked
- evidence: The shipped pipeline remains unchanged in its ownership gap: `executeRun` still registers the named stages against wrappers that only run `git diff --check`; configuration, agent, provider PR, and CI owners are not all connected to the ordinary daemon run. No false closure is claimed.
- files changed: None for this finding.
- regression check: `go test ./...`, `go vet ./...`, and `npm test` pass, but do not prove configured failing gates reject publication.

### CR-035

- disposition: blocked
- evidence: Token issuance no longer depends on the long-lived daemon inheriting `SD_HOOK_HELPER`; ordinary tokenless pushes can obtain a token through the managed hook, while explicitly empty push-token options are rejected. The daemon still lacks a verified OS process-ancestry check that distinguishes a managed hook caller from an arbitrary same-user IPC client.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/git/hook.go`
- regression check: `go test ./internal/daemon ./internal/git` passes, including executable hook admission and replay tests.

### CR-036

- disposition: fixed
- evidence: `AcquireRunPushActive` now claims ownership with one compare-and-set requiring `pending` or `running` status and `push_active = 0`. A cancellation that wins before the claim prevents any external push; the deferred clear remains after the guarded operation.
- files changed: `tools/safety-dance/internal/db/run.go`, `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `go test -race ./internal/pipeline/... ./internal/db ./internal/e2e` passes.

### CR-037

- disposition: blocked
- evidence: Notification delivery now holds the receipt mutex through callback and deletion, so concurrent consumers cannot create duplicate runs; receipts remain persisted when the callback fails. Startup still ignores an unreadable receipt store and has no explicit retry scheduler, so the full finding is not closed.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `go test -race ./internal/daemon ./internal/git` passes.

### CR-038

- disposition: fixed
- evidence: `daemon stop` now detects the selected runtime home's installed service and asks its service manager to stop it before signalling the informational PID. This prevents a service manager from immediately restarting a directly signalled daemon.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/cli ./internal/daemon` passes.

### CR-039

- disposition: fixed
- evidence: Service installation snapshots the existing definition and restores it, or removes the newly created definition, when service activation fails. The wizard's ownership compensation remains limited to definitions created by the current attempt.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `go test ./internal/wizard ./internal/cli ./internal/daemon` passes.

### CR-040

- disposition: fixed
- evidence: TUI refresh now loads the latest durable step, findings payload, and approval prompt; `r` submits a response for the selected run and step, `a` aborts that run, and `logs [run-id]` reads the run log path instead of ignoring the argument.
- files changed: `tools/safety-dance/internal/cli/tui.go`, `tools/safety-dance/internal/cli/logs.go`
- regression check: `go test ./internal/cli ./internal/tui` passes.

### CR-041

- disposition: fixed
- evidence: `daemon start`, `daemon stop`, and `daemon restart` now apply the same `nestedMutation` fence as other mutating commands. Read-only daemon status remains available to nested validation children.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/cli` passes.

### CR-042

- disposition: fixed
- evidence: Runtime directories are created and repaired as `0700`; SQLite database, WAL, and shared-memory files are repaired to `0600` after migration. PID and receipt writes already use restrictive modes.
- files changed: `tools/safety-dance/internal/paths/paths.go`, `tools/safety-dance/internal/db/db.go`
- regression check: `go test ./internal/paths ./internal/db` passes; `npm test` also passes the Safety Dance aggregate.

### CR-043

- disposition: fixed
- evidence: Global and repository YAML loaders now decode a second document and reject any non-EOF result, preventing policy fields after `---` from being silently ignored.
- files changed: `tools/safety-dance/internal/config/config.go`
- regression check: `go test ./internal/config` passes.

### CR-044

- disposition: fixed
- evidence: Failed post-receive wrapper installation now attempts to rename the preserved user hook back to `post-receive`, matching the pre-receive rollback path.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `go test ./internal/git ./internal/daemon` passes.

## Advisory Decisions

### ADV-001

- disposition: fixed
- reason: `gofmt` was run on `tools/safety-dance/internal/tui/app.go` and all changed Go files; the prior formatting advisory no longer applies.

## Verification

- command: `go test ./...`
- result: Passed across all Go packages.
- command: `git diff --check`
- result: Passed before the code commit.
- command: `npm test`
- result: Passed with validation, plugin synchronization, 136 Node tests, Go race/vet/build checks, identity scanning, and release-contract tests.

## Remaining Blocks

- CR-034 remains blocked until the ordinary daemon run loads trusted configuration and invokes the imported agent, configured test/lint/documentation, provider PR, and CI owners rather than generic `git diff --check` wrappers.
- CR-035 remains blocked until token issuance verifies managed-hook OS process ancestry and rejects arbitrary same-user IPC clients.
- CR-037 remains blocked until unreadable receipt storage fails daemon readiness and accepted receipts receive an explicit retry/reconciliation path.
- Hosted release execution, Windows service-manager execution, live provider behavior, and dependency vulnerability scanning remain untested.
