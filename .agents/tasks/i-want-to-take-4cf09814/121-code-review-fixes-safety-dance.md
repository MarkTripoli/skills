---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/120-code-review-safety-dance.md
reviewed_head_sha: 53092f7
fixed_head_sha: f3ee0f7
status: blocked
summary: "The four findings from review 120 were addressed in code where the platform contract was available: mutation authorization now checks the complete authenticated ancestry, restart recovery fails closed when process reaping cannot prove exclusivity, Unix evidence reads use descriptor-relative no-follow traversal, and GitHub pull-request evidence updates use ETag conditional PATCH. The Windows reparse-point proof remains blocked because this environment cannot execute Windows handle tests; focused Go and root aggregate checks pass, and review must re-evaluate the full diff."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains the merge target; review 120 covered `53092f7`, and the fixes are committed at `f3ee0f7`.
- unrelated changes preserved: pre-existing `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `.agents/tasks/i-want-to-take-4cf09814/evidence/`, and `progress.md` remain unmodified.

## Finding Dispositions

### CR-388

- disposition: fixed
- evidence: `AuthorizeMutationPeer` walks the authenticated peer's full parent chain, rejects `SD_PARENT_RUN_ID` at any ancestor, and still requires the peer command itself to be `safety-dance` or `safety-dance.exe`. A regression models a marked validation process, an unmarked shell, and a mutation CLI.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `go test -race ./internal/daemon` passed.

### CR-389

- disposition: fixed
- evidence: restart recovery now calls `SweepRunWorktreeStrict`; process-table, signaling, and post-kill liveness errors stop recovery before the persisted worktree is reused. Ordinary cleanup keeps its best-effort logging path.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/procreap/procreap.go`, `tools/safety-dance/internal/procreap/recovery_test.go`
- regression check: the strict reaper test forces signal failure and `go test -race ./internal/procreap ./internal/cli` passed.

### CR-390

- disposition: blocked
- evidence: Unix publication now opens the managed root and every path component with `openat`, `O_NOFOLLOW`, and directory handles, then reads the verified descriptor; an intermediate-symlink regression passes. The Windows implementation still requires a platform-specific handle/reparse-point test and cannot be proven in this macOS checkout.
- files changed: `tools/safety-dance/internal/pipeline/steps/pr.go`, `tools/safety-dance/internal/pipeline/steps/evidence_open_unix.go`, `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go`, `tools/safety-dance/internal/pipeline/steps/pr_security_test.go`
- regression check: `go test -race ./internal/pipeline/steps` passed; Windows execution remains unavailable.

### CR-391

- disposition: fixed
- evidence: existing PR evidence publication requires a conditional updater. GitHub reads the PR with `gh api --include`, compares the expected body, and sends the update with `If-Match: <ETag>`, so a concurrent authored edit is rejected by the provider instead of overwritten. Parsing and missing-ETag regressions are covered.
- files changed: `tools/safety-dance/internal/scm/host.go`, `tools/safety-dance/internal/scm/github/github.go`, `tools/safety-dance/internal/scm/github/pr_conditional_test.go`, `tools/safety-dance/internal/pipeline/steps/pr.go`
- regression check: `go test -race ./internal/pipeline/steps ./internal/scm/...` passed.

## Advisory Decisions

None.

## Verification

- command: `go test -race ./internal/daemon ./internal/cli ./internal/procreap ./internal/pipeline/steps ./internal/scm/... ./internal/e2e`
- result: passed.
- command: `npm test`
- result: passed with 137 Node tests, identity scanning, Go race tests, vet, temporary binary build, local end-to-end tests, and release-contract tests.
- command: `git diff --check`
- result: passed before the code commit.

## Remaining Blocks

- CR-390 Windows reparse-point and ancestor-replacement proof requires a Windows runner and platform-specific handle implementation review.
- Hosted Windows service behavior, live provider concurrency, and hosted `safety-dance-v*` release execution remain unavailable.
