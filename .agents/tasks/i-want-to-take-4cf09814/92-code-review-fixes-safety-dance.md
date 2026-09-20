---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 91-code-review-safety-dance.md
reviewed_head_sha: 41f123f1170fafc9ed134068b3a967e8e2fcd28f
fixed_head_sha: c0107de6166c2b1e576a82184f53c8f21c790512
status: complete
summary: "Seven required findings were repaired: prompt generations and atomic checkpoints now bind responses, protected gates reject approval and skip, accepted receipts remain in custody until durable run creation, trusted policy and GitHub PR authority use upstream with fork-aware heads, shutdown closes registration before joining runs, and manual runs require the authenticated gate head. The built-binary test now executes isolated status state, but it does not yet drive the complete init-to-publication lifecycle, so CR-326 remains blocked; focused race tests, make e2e, go test -race ./..., and npm test passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review examined `41f123f`; code fixes are committed at `c0107de`. Merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged or modified.

## Finding Dispositions

### CR-319

- disposition: fixed
- evidence: `step_results.prompt_generation` increments whenever a step parks. Responses capture that generation in a transaction, a unique prompt-generation index permits one response per parked generation, and application requires the response generation to equal the current parked generation.
- files changed: `tools/safety-dance/internal/db/schema.go`, `tools/safety-dance/internal/db/step.go`, `tools/safety-dance/internal/db/responses.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline`; passed.

### CR-320

- disposition: fixed
- evidence: Push, pull-request, and CI steps accept only abort or fix responses; review cannot be skipped. Restart-time fix responses transition the parked step into a new execution round instead of advancing, while skip remains persisted as skipped for permitted steps.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline ./internal/cli`; passed.

### CR-321

- disposition: fixed
- evidence: The runner resolves the worktree checkpoint before consuming a response. `ApplyResponse` atomically matches the current prompt generation, consumes the response, transitions the step, updates the run head, and records review authority in one SQLite transaction.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/db/responses.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline`; passed.

### CR-322

- disposition: fixed
- evidence: The authenticated notification callback now performs `recordPush` before admission reconciliation can remove the persisted receipt. A failed run creation or worktree/policy setup leaves the receipt available for the next reconciliation attempt.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`; passed.

### CR-323

- disposition: fixed
- evidence: Trusted policy fetches use `Repo.UpstreamURL`. Publication still uses the fork push URL, and GitHub SCM construction uses the upstream repository for PR authority plus `NewWithFork` for the fork head owner.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/e2e`; passed.

### CR-324

- disposition: fixed
- evidence: Shutdown signals the daemon's internal channel on every platform, then closes the manager only after admission serving stops. `Resume` rejects registration after stopping begins, and `Replace` rechecks stopping after joining a prior run.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/manager.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`; passed.

### CR-325

- disposition: fixed
- evidence: Public `run` now resolves the canonical gate ref and compares its object to the requested head before creating the worktree or pinning gates. A local checkout head that was not admitted by the gate is rejected.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/e2e`; passed.

### CR-326

- disposition: blocked
- evidence: The public binary test now runs the built executable against an isolated `SD_HOME` and verifies `status` creates and reads durable state, in addition to command help. `make e2e` passed, but the test still does not drive binary `init`, daemon lifecycle, authenticated push, response, publication, and restart end to end.
- files changed: `tools/safety-dance/internal/e2e/public_binary_test.go`
- regression check: `cd tools/safety-dance && make e2e`; passed for the isolated status binary test and internal e2e suite.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline ./internal/daemon ./internal/cli ./internal/e2e`
- result: Passed.
- command: `cd tools/safety-dance && go test -race ./...`
- result: Passed.
- command: `cd tools/safety-dance && make e2e`
- result: Passed.
- command: `npm test`
- result: Passed with 137 Node tests, Safety Dance race tests, vet, build, identity, and release-contract checks.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- CR-326 still needs a temporary-repository built-binary journey covering init, daemon start, generated hooks, authenticated push, durable status/respond/abort, publication, and restart.
- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence remain unavailable.
