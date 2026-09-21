---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/138-code-review-safety-dance.md
reviewed_head_sha: 5b32a124f18e56d6af588b20a1324d706618e9e9
fixed_head_sha: b989648a8a2ddfe5ec1ca563861174356da2af2b
status: complete
summary: "CR-439 is fixed by removing Windows from the release and documented platform contract and retaining release tests for the supported Linux and macOS matrix. CR-435 through CR-438 remain blocked because this checkout has no separately privileged operator or receive broker, validation sandbox, or complete public-binary failure matrix; npm test and focused Go, release, and diff checks pass."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains ahead of the review base; the reviewed head `5b32a12` advanced to `b989648` with the scoped release-platform fix.
- unrelated changes preserved: task-owned `.atomic-delivery/`, `evidence/`, and `progress.md` remain untracked and untouched.

## Finding Dispositions

### CR-435

- disposition: blocked
- evidence: Mutation authorization still cannot establish an operator principal that is both usable by independently launched clients and unavailable to same-user validation descendants. Session equality and process-ancestry checks do not provide that boundary; implementing a secure broker or separate OS principal requires deployment support not present in this checkout.
- files changed: None.
- regression check: Existing daemon authorization tests remain covered by `npm test`; the separate-session compatibility and orphaned-descendant security proof remain unavailable.

### CR-436

- disposition: blocked
- evidence: Managed receive admission still relies on hook ancestry and a persisted per-gate capability readable by same-user repository code. Closing replay after detachment requires a separately privileged receive broker or kernel-bound single-use receive handle, neither of which exists here.
- files changed: None.
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/ipc` passed; detached nested-push rejection remains unproven.

### CR-437

- disposition: blocked
- evidence: Repository commands and validation agents still run under the daemon user's OS principal. Environment filtering and project-settings controls do not isolate operator files, credentials, process control, or network access. A supported worker principal or sandbox is required.
- files changed: None.
- regression check: Validation, race, vet, and end-to-end suites passed; trust-domain isolation remains a deployment limitation.

### CR-438

- disposition: blocked
- evidence: The built public-binary test still proves the successful gate flow only. The planned validation-failure, supersession, stale-review, lease-rejection, cancellation, and post-write recovery matrix remains component-driven and was not expanded in this phase.
- files changed: None.
- regression check: `npm test` passed with the existing public-binary smoke test and Safety Dance aggregate; it does not establish the complete failure matrix.

### CR-439

- disposition: fixed
- evidence: Windows was removed from `.github/workflows/safety-dance-release.yml` and from `docs/safety-dance.md`'s supported release contract. `docs/testing.md` records Windows as unsupported until native gate and service CI exists, so the release no longer claims an unproved platform.
- files changed: `.github/workflows/safety-dance-release.yml`, `docs/safety-dance.md`, `docs/testing.md`, `tests/safety-dance-release.test.mjs`
- regression check: `node --test tests/safety-dance-release.test.mjs` passed; it verifies the tag-only Linux/macOS matrix and packaging contract.

## Advisory Decisions

None.

## Verification

- command: `npm test`
- result: Passed; 137 Node tests passed, the identity scan passed, Go race tests and vet passed, the temporary public-binary e2e passed, and release-contract tests passed.
- command: `cd tools/safety-dance && go test ./internal/e2e ./internal/daemon ./internal/pipeline/steps && go vet ./...`
- result: Passed.
- command: `node --test tests/safety-dance-release.test.mjs`
- result: Passed; 3 release-contract tests passed.
- command: `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks/**' && git diff --check`
- result: Passed with no whitespace errors.

## Remaining Blocks

- CR-435 requires a separately privileged operator credential or broker that supports later-session clients and rejects orphaned validation descendants.
- CR-436 requires a separately privileged receive broker or kernel-bound single-use receive handle.
- CR-437 requires a supported unprivileged sandbox or worker principal for repository validation.
- CR-438 requires a built-binary failure and recovery matrix through hooks, daemon, durable state, worktrees, mirror, and upstream.
- Hosted release execution and live-provider behavior remain unavailable, as recorded by verification.
