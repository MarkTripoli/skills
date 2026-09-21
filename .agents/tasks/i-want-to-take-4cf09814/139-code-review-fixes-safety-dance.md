---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/138-code-review-safety-dance.md
reviewed_head_sha: 5b32a124f18e56d6af588b20a1324d706618e9e9
fixed_head_sha: b989648a8a2ddfe5ec1ca563861174356da2af2b
status: complete
summary: "CR-439 is fixed by removing Windows from the release and documented platform contract. CR-435 through CR-437 are accepted limits under the source-parity trusted-user and trusted-repository threat model, now documented in the product and skill references. CR-438 is deferred test coverage; npm test and focused Go, release, and diff checks pass."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains ahead of the review base; the reviewed head `5b32a12` advanced to `b989648` with the scoped release-platform fix.
- unrelated changes preserved: task-owned `.atomic-delivery/`, `evidence/`, and `progress.md` remain untracked and untouched.

## Finding Dispositions

### CR-435

- disposition: accepted_limit
- evidence: Safety Dance intentionally retains the source product's same-user trust model. Independent operator clients, hooks, validation commands, and agents run as the trusted local OS user; hostile same-user isolation requires a separate broker or OS principal and is outside this integration.
- files changed: `docs/safety-dance.md`, `skills/delivery/safety-dance/references/safety.md`.
- regression check: Existing daemon authorization tests remain covered by `npm test`; documentation now states that same-user process checks are not a hostile-code security boundary.

### CR-436

- disposition: accepted_limit
- evidence: Managed receive admission retains the source product's trusted-local-user boundary. A separately privileged receive broker or kernel capability would be a different deployment architecture, not behavior parity.
- files changed: `docs/safety-dance.md`, `skills/delivery/safety-dance/references/safety.md`.
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/ipc` passed; documentation excludes hostile same-user replay from the supported threat model.

### CR-437

- disposition: accepted_limit
- evidence: Repository commands and validation agents intentionally run under the trusted developer's OS principal, matching the imported behavior. Untrusted repositories require an external sandbox or worker principal.
- files changed: `docs/safety-dance.md`, `skills/delivery/safety-dance/references/safety.md`.
- regression check: Validation, race, vet, and end-to-end suites passed; documentation states the trusted-repository requirement.

### CR-438

- disposition: deferred
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

## Accepted Limits

- CR-435 through CR-437 are outside the source-parity trusted-user and trusted-repository threat model.
- CR-438 remains deferred coverage: component tests cover the failure paths, while the built-binary suite covers the successful full flow.
- Hosted release execution and live-provider behavior remain unavailable, as recorded by verification.
