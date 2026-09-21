---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/118-code-review-safety-dance.md
reviewed_head_sha: 9c0ffd5a87b57b2d08cab4f14e4900e6429edf68
fixed_head_sha: a647fed
status: complete
summary: "The six findings in review 118 received code changes: mutation authorization is narrowed to a direct CLI peer, restart recovery reaps persisted worktrees before resuming, evidence is opened with no-follow semantics on Unix, authored existing PR bodies are merged through the provider reader, Windows task absence requires the exact missing-task result, and typed evidence survives failure and approval. The Safety Dance aggregate and root npm test pass; hosted Windows, live-provider, and hosted-release evidence remain unavailable, and the next phase must review the complete diff again."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains the moving merge target; reviewed head `9c0ffd5` advanced to `a647fed`.
- unrelated changes preserved: pre-existing `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `.agents/tasks/i-want-to-take-4cf09814/evidence/`, and `progress.md` remain unmodified.

## Finding Dispositions

### CR-382

- disposition: fixed
- evidence: `AuthorizeMutationPeer` now requires the authenticated peer itself to be `safety-dance`, rejects the peer marker, and rejects an immediate validation or agent parent instead of accepting any executable in the ancestry. The mutation authorization path no longer grants authority from a removable marker on an ancestor.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./...` passed. A detached-descendant process fixture remains a follow-up review target.

### CR-383

- disposition: fixed
- evidence: `Manager.Recover` invokes a restart-only reaper before status transition or runner launch. The CLI wires the reaper to `procreap.SweepRunWorktree`, scoped to the persisted run worktree.
- files changed: `tools/safety-dance/internal/daemon/manager.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/e2e` passed. A surviving-writer fixture remains a follow-up review target.

### CR-384

- disposition: fixed
- evidence: Unix evidence publication opens the already-confined path with `O_NOFOLLOW`, obtains metadata from the opened descriptor, and reads that descriptor rather than performing separate `Stat` and `ReadFile` path traversals. Windows uses the platform fallback.
- files changed: `tools/safety-dance/internal/pipeline/steps/pr.go`, `tools/safety-dance/internal/pipeline/steps/evidence_open_unix.go`, `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps` passed.

### CR-385

- disposition: fixed
- evidence: Existing pull requests require `PRContentReader`; publication merges only the bounded Safety Dance evidence section and preserves authored body text. New pull requests retain their creation body and receive generated evidence directly.
- files changed: `tools/safety-dance/internal/pipeline/steps/pr.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps ./internal/e2e` passed.

### CR-386

- disposition: fixed
- evidence: Windows task absence now requires exit status 1 plus the exact documented missing-file diagnostic. Generic `not found`, unrelated diagnostics, and other exit codes fail closed.
- files changed: `tools/safety-dance/internal/daemon/service.go`, `tools/safety-dance/internal/daemon/service_query_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon` passed, including unrelated-diagnostic and access-failure cases.

### CR-387

- disposition: fixed
- evidence: Failed steps persist typed evidence activity through `FailStepWithActivity`; interactive approval parking persists typed evidence; response completion leaves the existing evidence activity intact instead of replacing it with a status string.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/db/step.go`, `tools/safety-dance/internal/db/responses.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline` passed.

## Advisory Decisions

None.

## Verification

- command: `npm test`
- result: Passed with 137 Node tests and the Safety Dance aggregate.
- command: `npm run test:safety-dance`
- result: Passed identity scanning, Go race tests, vet, temporary binary build, local end-to-end tests, and release-contract tests.
- command: `git diff --check`
- result: Passed for the code changes.
- command: `git status --short --branch`
- result: Code changes are committed as `a647fed`; pre-existing task-owned untracked paths remain.

## Remaining Blocks

- Hosted Windows execution, live provider behavior, hosted `safety-dance-v*` release execution, and deterministic surviving-writer or filesystem-swap harnesses remain unavailable.
