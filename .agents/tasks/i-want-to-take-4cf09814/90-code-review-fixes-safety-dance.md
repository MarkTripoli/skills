---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 89-code-review-safety-dance.md
reviewed_head_sha: 89a3311fa5f3057a71b6450bf61d8e84ab01df23
fixed_head_sha: 430f60e
status: complete
summary: "Fixed CR-308 through CR-317 by binding responses to parked step generations, enabling production prompt and fix rounds, pinning policy fetches to the persisted publication URL, coordinating daemon shutdown and process-reaping cleanup, queueing accepted push work after authenticated receipt, covering workflow identity scans, and driving the public binary in make e2e. CR-318 is narrowed to an explicit GitHub-only first-release contract. Go race tests, make e2e, and npm test passed; hosted release, live-provider, Windows, and crash evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review examined `89a3311`; code fixes are committed at `430f60e`. Merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged or modified.

## Finding Dispositions

### CR-308

- disposition: fixed
- evidence: Responses now carry the parked `step_id`; application selects a matching run, step, generation, and parked status in one transaction. A fix response transitions the same step to `fixing`; approval, skip, and abort consume the response atomically.
- files changed: `tools/safety-dance/internal/db/schema.go`, `tools/safety-dance/internal/db/responses.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/cli`; passed.

### CR-309

- disposition: fixed
- evidence: Admission and execution fetch trusted policy from `repo.PushURL()` directly instead of the mutable bare-repository `origin` configuration. The fetched revision remains checked against the persisted validation generation.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/policy`; passed through the full race suite.

### CR-310

- disposition: fixed
- evidence: Production runners enable interactive gate handling. Failed durable steps park as `awaiting_approval`, persist findings, wait for the generation-bound response, rerun on `fix`, and complete or skip only through the transactional response path. Unit runners retain non-interactive failure behavior for deterministic package tests.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/db/responses.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline ./internal/cli ./internal/e2e`; passed.

### CR-311

- disposition: fixed
- evidence: `Manager.Shutdown` marks the manager stopping, cancels every live run, waits for each handle, and runs before IPC and daemon ownership are released. New replacements are rejected after shutdown begins; the daemon removes its owned PID file on exit.
- files changed: `tools/safety-dance/internal/daemon/manager.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`; passed.

### CR-312

- disposition: fixed
- evidence: Normal terminal cleanup now calls `procreap.SweepRunWorktree` before removing the detached worktree, using the persisted repository and run identity. Cleanup journaling remains retryable when removal fails.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/worktrees`; passed.

### CR-313

- disposition: fixed
- evidence: The authenticated post-receive IPC callback now queues durable run replacement in a goroutine after the receipt is admitted, so the accepted Git push does not wait for worktree creation, policy fetch, or same-branch cancellation and join. The hook itself remains synchronous only for bounded authenticated delivery.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon -run TestExecutableGateAdmission -count=3`; passed.

### CR-314

- disposition: fixed
- evidence: `daemon stop` requests authenticated shutdown before stopping the installed service, waits for IPC disappearance, then deactivates the service and removes the owned PID file. The daemon also removes the PID file during normal exit.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon`; passed.

### CR-315

- disposition: fixed
- evidence: The executable hook test passes repeatedly after the queue boundary was moved into the daemon callback, avoiding detached-hook ancestry loss while removing durable replacement from the push's critical path.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test -race ./internal/daemon -run TestExecutableGateAdmission -count=3` and `npm test`; both passed. `npm test` reported 137 Node tests and the Safety Dance aggregate.

### CR-316

- disposition: fixed
- evidence: The production identity scanner now includes `workflows/` in its shipped roots, so retired product identifiers in workflow contracts fail the same scan as other shipped paths.
- files changed: `scripts/check-safety-dance-identity.mjs`
- regression check: `npm test`; passed, including identity fixtures and validation.

### CR-317

- disposition: fixed
- evidence: `make e2e` builds one test-owned `safety-dance` binary and passes its path to a public-command smoke test covering root help, daemon help, and status help before running the internal end-to-end package.
- files changed: `tools/safety-dance/Makefile`, `tools/safety-dance/internal/e2e/public_binary_test.go`
- regression check: `cd tools/safety-dance && make e2e`; passed.

### CR-318

- disposition: declined
- evidence: The first-release contract is now explicitly GitHub-only for pull-request and CI stages. The wizard already rejects non-GitHub selections before writing setup, and the CLI documentation states that other providers are not supported rather than implying completion. Implementing six provider adapters is outside this review repair and would require separate provider fixtures and contracts.
- files changed: `tools/safety-dance/docs/cli.md`
- regression check: `npm test`; passed. Non-GitHub live-provider behavior remains untested by design.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./...`
- result: Passed for every Go package.
- command: `cd tools/safety-dance && make e2e`
- result: Passed, including the public binary smoke test and internal end-to-end package.
- command: `npm test`
- result: Passed with 137 Node tests, identity validation, plugin synchronization, Go race tests, vet, temporary binary build, and three release-contract tests.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service and descendant lifecycle, and induced OS/process crash evidence remain unavailable.
