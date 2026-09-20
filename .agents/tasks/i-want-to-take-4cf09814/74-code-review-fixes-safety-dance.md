---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 73-code-review-safety-dance.md
reviewed_head_sha: a1fa55a2251d8ac0af542e551508233df6fb33ac
fixed_head_sha: e973105
status: complete
summary: "CR-240 through CR-246 are fixed in receipt-lock recovery, bootstrap trust, durable accepted-receipt custody, per-receipt reconciliation, worktree journal discovery, and platform-aware validation commands. Focused Go race tests, the full Go suite, vet, and the root npm aggregate passed; hosted Windows, provider, release, and live interruption evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review covered `a1fa55a`; the fixes are committed at `e973105` on the same `safety-dance` branch and retain `origin/main` as base.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-240

- disposition: fixed
- evidence: Both generated receive hooks remove the lock PID before removing the lock directory. Empty, non-numeric, and dead PID owners are recovered after a bounded wait, preventing an interrupted hook from permanently blocking later pushes.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git ./internal/daemon`

### CR-241

- disposition: fixed
- evidence: Execution no longer treats pushed-branch `allow_repo_commands` as trust. A wizard-created initial policy is stored under the daemon runtime root and is used only when the upstream default branch has no committed policy; once present, the default-branch policy remains authoritative.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/paths/paths.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon ./internal/e2e`

### CR-242

- disposition: fixed
- evidence: Receipt revocation removes the shell receipt only when daemon revocation and local removal both succeed. A daemon persistence failure restores its in-memory receipt and claimed state, leaving custody recoverable instead of silently deleting the rejected update's only local marker.
- files changed: `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git`

### CR-243

- disposition: fixed
- evidence: Reconciliation claims one accepted receipt at a time, releases each claim on every failure, continues independent receipts after callback errors, and restores a receipt when durable removal fails. Errors are returned as an aggregate after other receipts have had a retry opportunity.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-244

- disposition: fixed
- evidence: Admission receipts start unaccepted and are eligible for reconciliation only after `notify-push` durably marks the matching token accepted. Ref equality alone can no longer launch a run for a failed concurrent update.
- files changed: `tools/safety-dance/internal/ipc/protocol.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/ipc ./internal/e2e`

### CR-245

- disposition: fixed
- evidence: Journal placement honors `SD_HOME` before deriving a path, so a runtime root nested below a directory named `worktrees` writes journals under the configured runtime root. Startup discovers journal roots from all persisted worktree placements, including terminal removal placements, rather than only active runs.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees ./internal/cli ./internal/daemon`

### CR-246

- disposition: fixed
- evidence: Core configured validation commands now select `sh -c` or `cmd.exe /D /S /C` by platform and use `shellenv.CombinedOutputShellCommand`, matching custom gates' process-tree lifecycle and cancellation behavior.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps ./internal/cli && go vet ./...`

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: Cancelled pre-push recovery remains a follow-up classification improvement. The existing guard prevents publication of a changed remote, while this round stayed within the seven required major findings.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./...`
- result: Passed.
- command: `npm test`
- result: Passed validation and plugin synchronization, 136 Node tests, the Safety Dance identity check, Go race and vet aggregate, build, and release-contract tests.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- Hosted Windows execution, live provider behavior, hosted `safety-dance-v*` release execution, and a real concurrent interruption run remain unavailable in this environment.
