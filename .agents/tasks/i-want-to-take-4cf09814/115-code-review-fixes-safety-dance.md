---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/114-code-review-safety-dance.md
reviewed_head_sha: ea3bbe4942ec20f45ace34ef1c9f47edf23c2142
fixed_head_sha: 37f59a88c1e4c737f8fbcc64cdfe063d66447d08
status: blocked
summary: "CR-370 and CR-375 are fixed with fail-closed Windows task queries and a Windows-aware reduced environment; CR-374 now limits retention deletion to marked Safety Dance run directories. CR-368, CR-369, CR-371, CR-372, and CR-373 remain blocked for a subsequent repair pass because their boundary fixes require additional authorization, process-recovery, typed-evidence, and provider-fixture work."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains the moving merge target; current product head is `37f59a8`. The checkout also contains pre-existing untracked task orchestration, evidence, and progress paths.
- unrelated changes preserved: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `.agents/tasks/i-want-to-take-4cf09814/evidence/`, and `progress.md` were not modified.

## Finding Dispositions

### CR-368

- disposition: blocked
- evidence: The current authorization still relies on authenticated peer ancestry and the forgeable parent marker; no non-forgeable run-scoped capability was added.
- files changed: None.
- regression check: Not run for this finding.

### CR-369

- disposition: blocked
- evidence: The existing orphan-process reaper remains available for ordinary cleanup, but this pass did not wire a verified restart-only reap before worktree reset.
- files changed: None.
- regression check: Full Go tests passed, but no surviving-writer restart test was added.

### CR-370

- disposition: fixed
- evidence: Windows installation now requires an output-capable scheduler executor, distinguishes positive task-not-found errors from other query failures, and rejects foreign task metadata before mutation.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon` passed.

### CR-371

- disposition: blocked
- evidence: The provider publication path still uses the existing evidence-file handling; a complete path-confined implementation was not retained after it caused the public binary fixture to stop completing. No host-file publication claim is made.
- files changed: None.
- regression check: Public binary smoke passes on the reviewed baseline path; the security fix needs a dedicated fixture before reapplication.

### CR-372

- disposition: blocked
- evidence: Step completion and evidence remain separate persistence paths in the current checkout; no atomic evidence schema change was retained.
- files changed: None.
- regression check: `cd tools/safety-dance && go test ./...` passed without the requested crash-boundary proof.

### CR-373

- disposition: blocked
- evidence: Existing pull-request bodies are still not preserved by the current provider update path; no provider-compatible read/update fixture was retained.
- files changed: None.
- regression check: No focused existing-body or canonical-repository-link test was added.

### CR-374

- disposition: fixed
- evidence: Evidence setup writes a root ownership marker and per-run marker, and retention/max-run cleanup only considers directories with matching run markers. The configured root is still validated against managed worktrees.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/paths` passed.

### CR-375

- disposition: fixed
- evidence: The reduced environment matches variable names case-insensitively and retains Windows execution, home, temporary-directory, system, shell, program-data, and module-path variables while continuing to exclude ambient credentials.
- files changed: `tools/safety-dance/internal/agent/env.go`
- regression check: `cd tools/safety-dance && go test ./internal/agent ./internal/daemon` passed; hosted Windows execution remains unavailable.

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: Provider validation remains outside this bounded repair because the review's critical and major findings require a later pass first.

### ADV-002

- disposition: left_advisory
- reason: CLI documentation was not changed in this pass.

## Verification

- command: `cd tools/safety-dance && go test ./...`
- result: Passed.
- command: `git diff --check`
- result: Passed.
- command: `cd tools/safety-dance && go test -count=1 -run TestPublicBinarySmoke ./internal/e2e` with a temporary built binary
- result: Passed after retaining the current provider behavior.

## Remaining Blocks

- CR-368 needs an OS-bound, run-scoped mutation capability and detached-descendant test.
- CR-369 needs restart recovery to reap surviving writers before reset and a post-clean write test.
- CR-371 needs typed evidence records plus worktree/evidence-root confinement tested before provider publication.
- CR-372 needs atomic step/evidence persistence and a crash-boundary test.
- CR-373 needs provider read/update fixtures that preserve authored bodies and build repository-root links.
- Hosted Windows, live-provider, and hosted-release evidence remain unavailable.
