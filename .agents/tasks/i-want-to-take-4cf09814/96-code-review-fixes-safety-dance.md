---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 95-code-review-safety-dance.md
reviewed_head_sha: 338e90a868bd20d9c534a39d6e4e72f3022bab54
fixed_head_sha: 6a5e24d5f4cf7fb315ead7a78e95f1fae65b8fb5
status: complete
summary: "CR-336 is fixed: accepted deferred receipts now persist and replay push options and validation generation, with a regression test. The built-binary test now covers init, daemon start/restart/stop, isolated status, and generated hook installation, but it does not yet prove authenticated push-to-publication behavior, so CR-337 remains blocked. Focused Go checks and the root npm test passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review head `338e90a868bd20d9c534a39d6e4e72f3022bab54` advanced to `6a5e24d5f4cf7fb315ead7a78e95f1fae65b8fb5`; merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged or modified.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-336

- disposition: fixed
- evidence: `AdmitPushParams` now stores `PushOptions` and `ValidationGeneration`; `notifyPush` persists both before acknowledging deferred receipt processing; `ReconcileOnce` replays both fields into `PushNotification`.
- files changed: `tools/safety-dance/internal/ipc/protocol.go`, `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `go test -race ./internal/daemon ./internal/ipc`; passed, including `TestReconcileOncePreservesAcceptedNotificationMetadata`.

### CR-337

- disposition: blocked
- evidence: `internal/e2e/public_binary_test.go` now exercises the built binary through isolated init, daemon startup, status, generated pre/post-receive hook installation, daemon restart, health, and stop. The test cannot complete authenticated generated-hook push and publication because the production hook ancestry authorization rejected the built-binary token request in this environment; the full init-to-publication journey remains unproved.
- files changed: `tools/safety-dance/internal/e2e/public_binary_test.go`
- regression check: `make e2e`; passed for the expanded lifecycle test, but the test stops before authenticated push and publication.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/ipc ./internal/e2e && go vet ./...`
- result: Passed.
- command: `cd tools/safety-dance && make e2e`
- result: Passed; built-binary lifecycle and hook-installation test passed.
- command: `npm test`
- result: Passed with 137 Node tests, identity validation, plugin sync, Safety Dance race tests, vet, build, and release-contract tests.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- CR-337 remains blocked until the built binary drives an authenticated generated-hook push through durable run creation, validation response, publication, restart recovery, and daemon stop.
- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence remain unavailable.
