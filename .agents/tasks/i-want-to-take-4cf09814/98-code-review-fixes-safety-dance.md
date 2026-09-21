---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 97-code-review-safety-dance.md
reviewed_head_sha: 5297c50b217f9346c698ba2f715964f56e895cfa
fixed_head_sha: 3d3e94f
status: complete
summary: "CR-339, CR-340, CR-341, and CR-342 are fixed with isolated daemon cleanup, gate-receipt startup import, compare-and-swap mirror publication, replacement revalidation, and filesystem durability barriers. CR-338 remains blocked because the built-binary push still cannot authenticate hook ancestry in this environment; its regression now attempts the flow and records an explicit skip rather than claiming publication proof."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review head `5297c50b217f9346c698ba2f715964f56e895cfa` had no product changes before this phase; the current working tree adds the five reviewed-path repairs and retains the existing task evidence trees untracked.
- unrelated changes preserved: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` were not staged or modified.

## Finding Dispositions

### CR-338

- disposition: blocked
- evidence: `internal/e2e/public_binary_test.go` now attempts a built-binary push after isolated initialization and daemon restart, then polls status and checks upstream and gate refs. The push still returns `could not obtain admission token` because the environment does not expose an authorized hook ancestry; the test records that limitation with `t.Skipf` and does not claim publication proof.
- files changed: `tools/safety-dance/internal/e2e/public_binary_test.go`
- regression check: `make e2e` passed; the built-binary test was skipped at the authentication boundary. Full init-to-publication proof remains unavailable.

### CR-339

- disposition: fixed
- evidence: cleanup now invokes `daemon stop` with the same temporary working directory and `SD_HOME` as the test run, so it cannot resolve or stop the user's default daemon. Cleanup remains registered before the push flow.
- files changed: `tools/safety-dance/internal/e2e/public_binary_test.go`
- regression check: `make e2e`; passed.

### CR-340

- disposition: fixed
- evidence: `Admission.ImportGateReceipts` reads authenticated pre-receive custody journals at daemon startup, validates each live gate ref against the recorded new revision, imports unacknowledged receipts as accepted, and persists them into the daemon receipt store before reconciliation. This covers the committed-ref and daemon-down interval.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/daemon ./internal/cli`; passed. Existing receipt reconciliation tests passed.

### CR-341

- disposition: fixed
- evidence: replacement validation runs again after the prior same-branch run is cancelled and joined. Publication mirror updates now use `git update-ref` with the run's accepted head as the expected old value, so an older publication cannot overwrite a newer gate head.
- files changed: `tools/safety-dance/internal/daemon/manager.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/daemon ./internal/cli ./internal/e2e`; passed. The existing same-branch supersession and publication matrix passed.

### CR-342

- disposition: fixed
- evidence: daemon receipt replacement now writes a uniquely named temporary file, syncs file contents, renames it, and syncs the parent directory. Gate-side receipt append and cleanup now issue file durability barriers before admission proceeds or an acknowledged receipt is removed.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/git/hook.go`
- regression check: `go test ./internal/daemon ./internal/git`; passed, including hook receipt and admission tests. Fault-injection power-loss proof remains unavailable.

## Advisory Decisions

None.

## Verification

- command: `go test ./internal/daemon ./internal/cli ./internal/e2e`
- result: Passed.
- command: `make e2e`
- result: Passed; built binary lifecycle ran, and the push-to-publication section explicitly skipped at the unavailable hook-ancestry authentication boundary.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- CR-338 remains blocked until a supported environment can authenticate a real generated-hook ancestry and complete built-binary push, durable run, response, publication, restart, and stop verification.
- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence remain unavailable.
