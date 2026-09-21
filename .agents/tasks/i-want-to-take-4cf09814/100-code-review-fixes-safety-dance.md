---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 99-code-review-safety-dance.md
reviewed_head_sha: 21750d96db24c3e5e7759a8a63e18f8f253bfea1
fixed_head_sha: f1bc838
status: blocked
summary: "CR-344 is fixed by promoting matching pre-acceptance gate receipts during daemon startup and rejecting conflicts. CR-343 is tightened with a distinct post-initialization candidate, mandatory completed-run polling, and persisted run/publication assertions, but the built-binary gate flow still times out with no run in this environment; the required end-to-end gate remains blocked."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review head `21750d96db24c3e5e7759a8a63e18f8f253bfea1`; this phase added commit `f1bc838` with the three reviewed-path changes. Existing task-owned untracked `.atomic-delivery/` and `evidence/` directories were preserved.
- unrelated changes preserved: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/` were not staged or modified.

## Finding Dispositions

### CR-343

- disposition: blocked
- evidence: `TestPublicBinarySmoke` now creates the upstream base before `safety-dance init`, creates a distinct candidate afterward, requires `status=completed` before its deadline, opens the isolated SQLite database, requires exactly one run for the repository, and requires a publication binding for the candidate. The built-binary test still times out with `runs: none` in this environment, so it no longer accepts a false-green unchanged-head flow but cannot prove the required gate-to-publication path.
- files changed: `tools/safety-dance/internal/e2e/public_binary_test.go`
- regression check: `make e2e` failed at `TestPublicBinarySmoke` after the 20-second poll with `runs: none`; focused package compilation and non-smoke tests passed.

### CR-344

- disposition: fixed
- evidence: `Admission.ImportGateReceipts` now validates gate, ref, old revision, and new revision when a journal token already exists. Matching persisted pre-acceptance receipts are promoted to `Accepted: true` while existing push-option metadata is preserved; conflicting records return an error before persistence. Regression tests cover promotion with metadata preservation and conflict rejection.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `go test ./internal/daemon ./internal/cli ./internal/e2e -run 'TestImportGateReceipts|TestAdmission|Test.*Receipt|TestGate'` passed.

## Advisory Decisions

None.

## Verification

- command: `gofmt -w internal/e2e/public_binary_test.go internal/daemon/admission.go internal/daemon/admission_test.go`
- result: Passed.
- command: `git diff --check`
- result: Passed.
- command: `go test ./internal/daemon ./internal/cli ./internal/e2e -run 'TestImportGateReceipts|TestAdmission|Test.*Receipt|TestGate'`
- result: Passed.
- command: `make e2e`
- result: Failed at the mandatory built-binary smoke test because the status poll ended with `runs: none`; the test correctly failed instead of claiming publication.

## Remaining Blocks

- CR-343 remains blocked until a supported environment completes the built-binary flow from a distinct post-initialization candidate through durable run completion and publication binding.
- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence remain unavailable.
