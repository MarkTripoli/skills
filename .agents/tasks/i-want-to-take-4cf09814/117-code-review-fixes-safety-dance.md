---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/116-code-review-safety-dance.md
reviewed_head_sha: 2994a6c78377d00ce14aa9df99b015e09ef9ba59
fixed_head_sha: 3412daa
status: blocked
summary: "CR-378, CR-379, and CR-381 are fixed with confined file evidence, atomic typed-evidence persistence, and output-aware Windows task classification. CR-376 and CR-377 remain blocked, and CR-380 remains blocked because authored PR-body preservation could not be retained without updating the provider fixture; the aggregate and Safety Dance gates pass."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains the moving merge target; reviewed head `2994a6c` advanced to `3412daa`. The checkout still contains pre-existing untracked task orchestration, evidence, and progress paths.
- unrelated changes preserved: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `.agents/tasks/i-want-to-take-4cf09814/evidence/`, and `progress.md` were not modified.

## Finding Dispositions

### CR-376

- disposition: blocked
- evidence: Mutation authorization still relies on the existing process-ancestry and environment-marker design. No OS-bound run-scoped capability was added.
- files changed: None.
- regression check: Not run for this finding.

### CR-377

- disposition: blocked
- evidence: Restart recovery still does not perform a verified process reap before resuming a persisted run. An attempted direct sweep broke the public binary smoke path and was removed.
- files changed: None.
- regression check: The public binary smoke test passes without the unverified sweep; no surviving-writer restart test was added.

### CR-378

- disposition: fixed
- evidence: Typed evidence is persisted as structured JSON in the step activity field. Only explicit `file://` items are read, and relative paths must resolve inside the managed worktree or evidence root after symlink resolution; ordinary evidence strings remain text.
- files changed: `tools/safety-dance/internal/db/step.go`, `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/pipeline/steps/pr.go`, `tools/safety-dance/internal/pipeline/steps/pr_security_test.go`
- regression check: `go test ./internal/pipeline/steps ./internal/pipeline` passed, including host-file and symlink escape rejection.

### CR-379

- disposition: fixed
- evidence: `CompleteStepWithRunHeadAndActivity` writes completion, checkpoint, findings, and structured evidence activity in one SQLite transaction. The runner no longer completes a step and then performs a separate evidence write.
- files changed: `tools/safety-dance/internal/db/step.go`, `tools/safety-dance/internal/pipeline/runner.go`
- regression check: `go test ./internal/db ./internal/pipeline` and the full Safety Dance race suite passed.

### CR-380

- disposition: blocked
- evidence: Evidence links now use the canonical repository web URL rather than appending `/blob` below the pull-request URL. Authored PR-body preservation was not retained because the existing public binary provider fixture returns a non-content response for `pr view`; enabling the reader made the smoke run fail closed, so the provider-compatible read/update fixture remains required.
- files changed: `tools/safety-dance/internal/pipeline/steps/pr.go`, `tools/safety-dance/internal/pipeline/steps/pr_security_test.go`
- regression check: `go test ./internal/pipeline/steps` and `make e2e` passed; no existing-body provider fixture was added.

### CR-381

- disposition: fixed
- evidence: Windows scheduled-task absence classification now examines captured command output together with the structured error, recognizes the documented missing-task diagnostic and HRESULT, and still fails closed for access-denied and unrelated errors.
- files changed: `tools/safety-dance/internal/daemon/service.go`, `tools/safety-dance/internal/daemon/service_query_test.go`
- regression check: `go test ./internal/daemon` and the full Safety Dance race suite passed.

## Advisory Decisions

None.

## Verification

- command: `npm test`
- result: Passed before the final focused rerun; 137 Node tests and the Safety Dance aggregate passed. The final `npm run test:safety-dance` also passed.
- command: `npm run test:safety-dance`
- result: Passed; identity checks, Go race tests, vet, temporary build, local end-to-end, and release contract tests passed.
- command: `go test ./internal/daemon ./internal/db ./internal/pipeline ./internal/pipeline/steps`
- result: Passed.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- CR-376 needs an OS-bound, run-scoped mutation capability and detached-descendant test.
- CR-377 needs verified restart recovery cleanup and a surviving-writer test.
- CR-380 needs provider-compatible read/update fixtures that preserve authored PR bodies while refreshing only the bounded evidence section.
- Hosted Windows, live-provider, and hosted-release evidence remain unavailable.
