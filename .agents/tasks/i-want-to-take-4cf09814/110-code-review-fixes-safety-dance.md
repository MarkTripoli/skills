---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/109-code-review-safety-dance.md
reviewed_head_sha: 654f0496e09aacebb990d74cf304c6c045a86f41
fixed_head_sha: aee2266
status: complete
summary: "CR-351 is fixed by removing the environment-controlled fake SCM from production code and making the built-binary end-to-end test use the real GitHub adapter against deterministic fake gh and Git transports. npm test, the Safety Dance aggregate, and the focused built-binary test passed; hosted release, live-provider, Windows-service, and crash-recovery evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Base `origin/main` and reviewed product scope were unchanged; the fix is committed at `aee2266`.
- unrelated changes preserved: Existing task-owned `.atomic-delivery/` and `evidence/` paths remain unmodified and untracked.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-351

- disposition: fixed
- evidence: Deleted `tools/safety-dance/internal/cli/test_scm_default.go`, removed the `newTestSCMHost` branch from `tools/safety-dance/internal/cli/daemon.go`, and removed `SD_E2E_SCM` from `tools/safety-dance/internal/e2e/public_binary_test.go`. The public-binary test now exercises provider detection and the real GitHub SCM adapter, with a temporary `gh` executable and a Git wrapper that maps the GitHub URL to a local bare upstream.
- files changed: `tools/safety-dance/internal/cli/daemon.go`; deleted `tools/safety-dance/internal/cli/test_scm_default.go`; `tools/safety-dance/internal/e2e/public_binary_test.go`.
- regression check: `make e2e` passed with the built untagged binary; `npm run test:safety-dance` and `npm test` passed. The aggregate no longer enables an environment-controlled SCM bypass.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test ./internal/cli ./internal/e2e`
- result: Passed.
- command: `cd tools/safety-dance && make e2e`
- result: Passed; the built production binary completed the public gate flow through the real GitHub adapter and local fake transports.
- command: `npm run test:safety-dance`
- result: Passed; identity scan, Go race tests, vet, temporary production build, built-binary end-to-end test, and release-contract tests passed.
- command: `npm test`
- result: Passed; validation, plugin synchronization, 137 Node tests, the Safety Dance aggregate, and release-contract tests passed.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence remain unavailable from this environment.
