---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/107-code-review-safety-dance.md
reviewed_head_sha: 425b8fb34dde8840995db18a8fcf5fc07e3cbb32
fixed_head_sha: 4967099
status: complete
summary: "CR-349 and CR-350 are fixed. The aggregate now builds and runs the shipped production binary through publication with deterministic agent and SCM dependencies, and ownership-journal failures terminally fail pending runs before active registration. npm test, the Safety Dance aggregate, race tests, and the built-binary end-to-end test passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Base `origin/main` and the reviewed product scope were unchanged; fixes are committed at `4967099`.
- unrelated changes preserved: Existing task-owned `.atomic-delivery/` and `evidence/` paths remain unmodified and untracked.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-349

- disposition: fixed
- evidence: `tools/safety-dance/Makefile` now builds the untagged production binary, and `package.json` runs `make e2e` inside `test:safety-dance`. `TestPublicBinarySmoke` uses the production completion and cleanup lifecycle, injects deterministic SCM and agent dependencies through the test environment, fails supported-platform admission errors, and verifies the completed run, publication record, upstream ref, and gate ref.
- files changed: `package.json`; `tools/safety-dance/Makefile`; `tools/safety-dance/internal/e2e/public_binary_test.go`; `tools/safety-dance/internal/cli/test_scm_default.go`; deleted tagged lifecycle and SCM variants; `tools/safety-dance/internal/cli/daemon.go`; `tools/safety-dance/internal/worktrees/ownership.go`.
- regression check: `make e2e` passed with the shipped untagged binary; `npm run test:safety-dance` and `npm test` passed.

### CR-350

- disposition: fixed
- evidence: `Manager.replaceValidated` commits worktree ownership before transitioning a run to `running` or inserting its active handle. Ownership-commit and status-transition failures now persist terminal `failed` status before returning. `TestOwnershipJournalFailureDoesNotStrandRunningRun` forces a non-empty journal directory, verifies no active handle starts, and verifies the durable run is failed.
- files changed: `tools/safety-dance/internal/daemon/manager.go`; `tools/safety-dance/internal/daemon/manager_test.go`.
- regression check: `go test -race ./internal/daemon ./internal/worktrees ./internal/e2e` passed.

## Advisory Decisions

None.

## Verification

- command: `npm test`
- result: Passed. Validation, plugin synchronization, 137 Node tests, the Safety Dance race/vet/build checks, production-binary end-to-end test, and release tests all passed.
- command: `npm run test:safety-dance`
- result: Passed. Identity scan, all Go race packages, vet, production binary build, `make e2e`, and three release tests passed.
- command: `make e2e` from `tools/safety-dance`
- result: Passed against the untagged shipped binary.
- command: `go test -race ./internal/daemon ./internal/worktrees ./internal/e2e`
- result: Passed, including the forced ownership-journal failure test.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence remain unavailable from this environment.
