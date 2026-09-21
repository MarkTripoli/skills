---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 93-code-review-safety-dance.md
reviewed_head_sha: d0315b20b5a8a624c509f799d14ecc3d75fdb2ba
fixed_head_sha: 2ccd695b2741e1b82230cde1e15fdcfa942f6fab
status: complete
summary: "Eight major findings were fixed: prompt identity and response policy are enforced before durable mutation, response checkpoints are single-write, legacy databases migrate before response indexes, accepted receipts are deferred to reconciliation, worktree retries are idempotent, manual replacements revalidate gate heads under the branch lock, and enterprise fork PR heads use owner/repository slugs. CR-335 remains blocked because the binary test still does not drive the complete init-to-publication journey; Go race, migration, vet, identity, and root aggregate checks passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review head `d0315b20b5a8a624c509f799d14ecc3d75fdb2ba` advanced to `2ccd695b2741e1b82230cde1e15fdcfa942f6fab`; merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged or modified.

## Finding Dispositions

### CR-327

- disposition: fixed
- evidence: `RespondParams` now carries `step_id` and nonzero `generation`; status and TUI prompt views expose both values; daemon and database admission reject missing or stale identity transactionally.
- files changed: `tools/safety-dance/internal/ipc/protocol.go`, `tools/safety-dance/internal/cli/{daemon,respond,status,tui}.go`, `tools/safety-dance/internal/tui/model.go`, `tools/safety-dance/internal/db/responses.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/cli ./internal/pipeline`; passed.

### CR-328

- disposition: fixed
- evidence: `types.ResponseAllowed` is the shared policy. The daemon, `RecordResponse`, and `ApplyResponse` reject disallowed actions before a response can mutate durable state; review skip remains forbidden.
- files changed: `tools/safety-dance/internal/types/types.go`, `tools/safety-dance/internal/db/responses.go`, `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline ./internal/cli`; passed.

### CR-329

- disposition: fixed
- evidence: A successful live response is already the final durable checkpoint from `ApplyResponse`; the runner now records `responseCompleted` and skips the second HEAD sample and completion write. Fix and abort paths retain their existing control flow.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline ./internal/db`; passed.

### CR-330

- disposition: fixed
- evidence: Response indexes are created only after additive columns and duplicate-row reconciliation. `TestOpenMigratesLegacyResponsesBeforeIndexes` opens a preceding response schema, removes duplicate generations, and verifies the unique index.
- files changed: `tools/safety-dance/internal/db/schema.go`, `tools/safety-dance/internal/db/db_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/db`; passed.

### CR-331

- disposition: fixed
- evidence: `CreateDetached` recognizes a matching journaled worktree and verified HEAD as an idempotent retry, preserving custody until the run owns it after transient policy failure.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees ./internal/cli`; passed.

### CR-332

- disposition: fixed
- evidence: `Manager.ReplaceValidated` executes the gate-head callback while holding the repository/branch lock, before cancellation or replacement persistence. Manual and accepted-push paths use this boundary.
- files changed: `tools/safety-dance/internal/daemon/manager.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`; passed.

### CR-333

- disposition: fixed
- evidence: GitHub PR construction now passes `github.RepoSlug(fork)` for the fork head owner while retaining the host-prefixed upstream slug for `--repo`.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/scm/github`; passed.

### CR-334

- disposition: fixed
- evidence: Production admission calls `DeferNotifications`, so post-receive persists an accepted receipt, clears its claim, and returns without worktree creation, policy fetch, or prior-run joining. The existing one-second reconciliation worker performs `recordPush` and removes the receipt only after successful processing.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`; passed.

### CR-335

- disposition: blocked
- evidence: The existing `internal/e2e/public_binary_test.go` still covers isolated status and help only. A complete built-binary init, daemon, generated-hook, publication, response, and restart journey was not added in this round.
- files changed: None.
- regression check: `cd tools/safety-dance && make e2e`; passed, but does not prove the missing lifecycle.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./...`
- result: Passed.
- command: `npm test`
- result: Passed with 137 Node tests, identity validation, plugin sync, Safety Dance race tests, vet, build, and release-contract tests.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- CR-335 remains blocked until `internal/e2e/public_binary_test.go` drives the shipped binary through init, daemon lifecycle, authenticated generated hooks, durable status or response, publication, and restart.
- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence remain unavailable.
