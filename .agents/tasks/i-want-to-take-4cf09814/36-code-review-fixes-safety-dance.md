---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 35-code-review-safety-dance.md
reviewed_head_sha: 9c7caab
fixed_head_sha: 18f608f
status: complete
summary: "This repair pass executes trusted repository prepare, test, format, and lint commands in the owned worktree, rejects token issuance from callers outside managed receive-hook ancestry, fails daemon readiness on unreadable admission receipts and retries accepted receipts, and requires explicit TUI response actions. CR-045 remains blocked for unconnected agent, pull-request, and CI owners; CR-046 through CR-048 and ADV-001 are fixed, and all local Node and Go gates passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review targeted `bf6f8f49890d86f1efdd11b991827bbf7ed96a83`; this pass applied the fixes on the current task branch and committed them at `18f608f20e9fc96c52cd015930c56c882105a7e4`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-045

- disposition: blocked
- evidence: `executeRun` now loads the trusted repository configuration and passes it into every fixed stage. `intent`, `test`, `document`, and `lint` execute the configured prepare, test, format, and lint commands in the run-owned worktree before the common diff check. The imported agent, pull-request, and CI owners are still not connected to the ordinary daemon path, so this finding is not falsely marked fixed.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/steps/validation.go`, `tools/safety-dance/internal/pipeline/steps/validation_test.go`
- regression check: `go test -race ./internal/pipeline/... ./internal/cli`; the new validation tests prove a configured test failure blocks and a configured lint command runs in the owned worktree.

### CR-046

- disposition: fixed
- evidence: Token issuance now requires the authenticated IPC peer's process ancestry to contain the requested gate's managed `pre-receive` or `post-receive` hook. The old daemon-environment marker is no longer used; unsupported Windows callers fail closed. Executable hook admission still passes, while an ordinary process is rejected by the new test.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `go test -race ./internal/daemon -run 'Admission|ExecutableGate'`.

### CR-047

- disposition: fixed
- evidence: Admission construction retains receipt-load errors and `serveDaemon` refuses readiness when the persisted receipt store is unreadable. A reconciliation worker retries stored accepted receipts every second and deletes each receipt only after its durable callback and receipt-store update succeed.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test -race ./internal/daemon ./internal/cli`; the new test proves receipt-load failure is visible.

### CR-048

- disposition: fixed
- evidence: The TUI no longer maps `r` or `respond` to approval. It prints an explicit action prompt; only `approve`, `fix`, or `skip` submits a response, and the CLI requires a durable prompt before sending it. The new TUI test proves `r` does not invoke the response callback.
- files changed: `tools/safety-dance/internal/tui/app.go`, `tools/safety-dance/internal/tui/app_test.go`, `tools/safety-dance/internal/cli/tui.go`
- regression check: `go test -race ./internal/tui ./internal/cli`.

## Advisory Decisions

### ADV-001

- disposition: fixed
- reason: `gofmt` was run on all changed Go files, including `tools/safety-dance/internal/tui/app.go`.

## Verification

- command: `go test -race ./...`
- result: Passed across all Go packages.
- command: `go vet ./...`
- result: Passed with no diagnostics.
- command: `make e2e`
- result: Passed the built-binary end-to-end package.
- command: `npm test`
- result: Passed validation, plugin synchronization, 136 Node tests, Go race/vet/build checks, identity scanning, and release-contract tests.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- CR-045 remains blocked until the ordinary daemon run invokes the imported agent, configured documentation and lint owners, provider pull-request owner, and CI owner as their real implementations rather than only the configured local command subset.
- Hosted release execution, Windows service-manager execution, live provider behavior, and dependency vulnerability scanning remain untested.
