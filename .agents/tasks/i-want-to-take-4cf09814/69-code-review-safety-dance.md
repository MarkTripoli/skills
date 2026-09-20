---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 0b9551cc05443b8aa2b2c64f28800ae0c736932b
status: findings
summary: "Review of the 122-commit Safety Dance change found five critical or major failures in cancelled-publication recovery, wizard rollback, custom-gate durability and nested-run isolation, and multi-ref receipt cleanup. The next fix round must close these production paths and add focused restart, rollback, gate, and concurrent-hook regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `0b9551cc05443b8aa2b2c64f28800ae0c736932b`
- commits: 122 commits in `origin/main..HEAD`; the committed verification and the current `npm test` run accepted all commit subjects
- staged and unstaged changes: none
- task-owned untracked files: 260 files under `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: committed task artifacts and untracked workflow/evidence state were review inputs, not product-code subjects

## Previous Round

- previous artifact: `67-code-review-safety-dance.md`
- CR-217 Repository content can command destructive worktree cleanup: fixed
- CR-218 Cancelled publication recovery is still unreachable after restart: still open
- CR-219 Wizard validation failure can eject a pre-existing gate: still open
- CR-220 Preserved-hook rejection never reaches durable receipt revocation: fixed
- CR-221 Manual runs use a cleanup source that cannot remove their worktrees: fixed
- CR-222 Windows task ownership still uses invalid query syntax: fixed
- CR-223 Advertised non-GitHub providers still cannot execute: fixed
- CR-224 The release workflow cannot package Windows or publish any assets: fixed
- CR-225 Trusted custom gates are accepted and then ignored: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded local Git gate with no source-repository product references
- implementation source: `05-plan-safety-dance.md`; the plan requires durable creation before execution, restart recovery, nested-run isolation, transactional setup, and publication binding before completion
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add the independently branded Safety Dance Go tool, authenticated local gate, durable validation and publication runtime, operator surfaces, canonical skill, installer support, identity enforcement, and native releases
- change description quality: no pull request exists; 122 focused commit subjects describe the iterative implementation and repairs, while the plan and receipts hold behavioral rationale and limits
- implementation model and review model: implementation receipts identify the delivery workers; this review used GPT-5.6 Sol plus three read-only implementation-review delegates, with every retained finding checked against the repository
- changed-line size and logical cohesion: 227 product files, 38,394 additions, and 4 deletions; the change is one coherent product import but exceeds the review skill's split threshold and carries several trust boundaries in one branch
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, and `internal/agent/agent.go` are large ownership surfaces; no size-only finding is raised
- dependency or lockfile changes: the new Go module pins its graph in `go.sum`, generates dependency notices, and passed build, race, vet, identity, and release-contract checks

## Tests Reviewed First

- behavior claimed by tests: authenticated admission and receipt persistence, gate rollback, daemon replacement and recovery, guarded publication, worktree ownership, platform services, CLI/TUI behavior, installer adaptation, identity enforcement, and release packaging
- missing or misleading coverage: the latest 159-line fix adds no regression tests for cancelled push-owner completion, wizard failure before a rollback handle exists, durable gate pinning/execution, or concurrent and partial multi-ref receipt cleanup; the aggregate remains green because those production paths are not exercised

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4603` in / `73` out

### Correctness

- assessment and evidence: the aggregate passes, but cancelled publication recovery continues into pull-request/CI work and cannot complete terminal cleanup (`internal/daemon/manager.go:189-220`, `internal/cli/daemon.go:207-264`, `internal/cli/daemon.go:739-765`). Wizard compensation can still eject an existing gate when initialization returns no rollback handle (`internal/cli/wizard.go:112-127`). Multi-ref admission can leave durable receipts for a push Git rejected (`internal/git/hook.go:46-66`).
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: gate sequencing is explicit in one constructed order, and worktree source resolution is centralized. The comments claiming gates are pinned at creation conflict with the only write occurring during execution (`internal/db/run.go:1109-1115`, `internal/cli/daemon.go:625-638`), which obscures the actual restart invariant.
- helper coverage: covered, level 2, confidence 0.78

### Architecture

- assessment and evidence: daemon, database, pipeline, gate, and worktree packages own distinct boundaries. The new custom-gate path bypasses the existing subprocess isolation convention and resolves durable policy inside the executor instead of the run-creation transaction (`internal/cli/daemon.go:625-689`), producing CR-228 and CR-229.
- helper coverage: covered, level 3, confidence 0.66

### Security

- assessment and evidence: IPC mutation and hook ancestry checks fail closed, receipt tokens are single-use, and publication uses verified heads and explicit leases. Custom gate commands omit `SD_PARENT_RUN_ID`, so validation descendants can invoke mutation commands that the CLI and daemon otherwise reject (`internal/cli/daemon.go:680-688`, `internal/cli/root.go:71-74`, `internal/daemon/admission.go:226-257`).
- helper coverage: covered, level 3, confidence 0.73

### Performance

- assessment and evidence: no critical or major hot-path regression was found. Recovery scans bounded configured worktree roots, custom gates are capped at 16, and branch managers serialize only per repository/ref; the remaining risks are correctness and trust-boundary failures rather than unbounded runtime work.
- helper coverage: covered, level 3, confidence 0.73

## Verification Story

- command or inspection: `npm test`; `cd tools/safety-dance && go test -race ./internal/daemon ./internal/worktrees ./internal/pipeline/... ./internal/config`; `GOOS=windows GOARCH=amd64 go test -exec=true ./internal/daemon ./internal/ipc ./internal/cli ./internal/worktrees ./internal/pipeline/...`; complete `origin/main...HEAD` diff and latest repair diff inspection
- result: root aggregate passed with 136 Node tests, full Go race/vet/build checks, identity scan, and 2 release tests; focused race checks passed; Windows-target packages compiled. A direct Windows test invocation first produced the expected host `exec format error`, so the compile proof was repeated with `-exec=true`.
- manual, screenshot, or before-and-after evidence: verification artifact 16 records all locally decidable criteria as passed at `49c6c2d`; hosted release, live provider, and hosted Windows behavior remain untested. No UI screenshot is required for these daemon and lifecycle findings.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-226 Cancelled publication recovery performs later side effects and never cleans up

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:207-264`
- failure mode: after restart, a cancelled run with `push_active` can reconcile publication, then continue into pull-request and CI steps. The wrapper cannot transition its already-cancelled status from `running` to `completed`, so it never marks cleanup eligible and leaves the worktree behind.
- evidence or reproduction: `Manager.Recover` now resumes `RunCancelled && PushActive` records (`internal/daemon/manager.go:189-220`). `executeRun` permits that state before publication and the runner continues through `pull-request` and `ci` after `push` (`internal/cli/daemon.go:669-765`). On success the wrapper only sets `cleanup` when `TransitionRunStatus(r.ID, RunRunning, RunCompleted)` succeeds (`internal/cli/daemon.go:239-249`), which cannot match a cancelled row. This is the same unresolved boundary as CR-218.
- fix direction: give interrupted-publication reconciliation a bounded recovery path that performs only remote verification, mirror update, binding, claim clearing, and cancelled-run cleanup. Do not resume the ordinary post-push pipeline, and add a restart test asserting no PR/CI call and removal of the cancelled run's worktree.

### CR-227 Wizard initialization errors can still eject an existing gate

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:112-127`
- failure mode: any `InitWithRollback` error returned before a rollback handle is produced sets `gateAttempted` and sends compensation through `gate.Eject`, deleting a pre-existing working gate even though this wizard attempt did not create it.
- evidence or reproduction: the flag is set before the call, and the fallback eject runs whenever `rollback == nil`. `InitWithForkRollback` has multiple pre-mutation and transactionally restored error returns with a nil rollback, including gate-context inspection and existing-gate provisioning failure (`internal/gate/gate.go:137-190`, `internal/gate/gate.go:221-237`). Those paths already preserve the existing gate, after which the wizard removes it. This keeps CR-219 open.
- fix direction: remove the eject fallback and make gate initialization itself return an explicit compensation handle or creation receipt for every successful mutation. Add a wizard regression with a pre-existing gate and an injected nil-rollback initialization failure.

### CR-228 Custom-gate policy is not pinned when the run is created

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:625-638`
- failure mode: a pending or recovering run with a null or intentionally empty `gates_json` resolves gates from the current default branch at execution time. Changing default-branch policy between admission and execution can add or remove checks from an already accepted run.
- evidence or reproduction: the only `SetRunGates` caller runs inside `executeRun`, after the durable run exists and has entered execution. Empty and absent gate lists both use `""`, so even a run originally created with no gates is re-resolved on every restart (`internal/config/gates.go:142-149`). This contradicts the database contract that the caller writes the value once at run creation before any step is observable (`internal/db/run.go:1109-1115`).
- fix direction: serialize the resolved trusted gate list, including an explicit empty-list sentinel, in the same transaction that creates the run. Make execution read-only with respect to gate policy and add admission-to-start and restart tests that change the default-branch configuration between events.

### CR-229 Custom gates bypass nested-run isolation

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:680-688`
- failure mode: a custom gate runs as an unmarked daemon child, so it can invoke `safety-dance run`, `respond`, `abort`, service control, or other mutating commands without the parent-run fence applied to normal validation commands and typed agents.
- evidence or reproduction: core shell validation sets `SD_PARENT_RUN_ID` (`internal/pipeline/steps/validation.go:194-210`) and typed agents receive the same marker (`internal/pipeline/steps/validation.go:153-164`). The new gate command sets only its directory and inherits the daemon environment. Both CLI and IPC authorization depend on the marker (`internal/cli/root.go:71-74`, `internal/daemon/admission.go:226-257`).
- fix direction: execute custom gates through the same run-scoped subprocess helper as repository checks, with `SD_PARENT_RUN_ID` and the same shell/platform behavior. Add a gate that attempts a parent mutation and assert both CLI and direct IPC paths reject it.

### CR-230 Rejected and concurrent receive hooks can corrupt durable receipt custody

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/git/hook.go:46-80`
- failure mode: in a multi-ref push, a later admission failure exits without revoking receipts admitted for earlier refs. Concurrent receives also append and rewrite the shared receipt file without locking and use one fixed `.cleanup` filename, so one rejected user hook can erase another accepted push's receipt before post-receive notification.
- evidence or reproduction: each successful admission appends immediately at line 62, while the failure exit at lines 63-65 performs no cleanup of earlier loop iterations. Preserved-hook rejection rewrites the whole shared file through one fixed temporary path at lines 71-80. Git may run receive hooks concurrently for independent pushes, and no test covers partial multi-ref failure or overlapping receipt append/cleanup. A lost receipt makes the accepted ref's post-receive notification fail; a stale daemon receipt remains replayable if that ref later reaches the recorded head.
- fix direction: move receipt-file custody into one locked helper or the daemon, revoke every receipt accumulated by a receive before any rejection exit, and use atomic unique temporary files under the lock. Add executable-hook tests for a two-ref partial admission failure and overlapping accepted/rejected receives.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found; the custom-gate executor now consumes the previously ignored gate configuration
- dependency findings: no new dependency defect found; module sums, generated third-party notices, identity enforcement, and native packaging checks pass

## Verdict

- decision: request_changes
- overall code-health change: the repair closes cleanup-path trust, worktree source, Windows query, provider, release, and ignored-gate failures, but leaves two prior critical findings open and introduces incomplete gate and receipt lifecycle ownership
- rationale: five critical or major findings violate cancellation, rollback, durable-policy, nested-run, and accepted-push custody guarantees. Green aggregate checks do not cover these paths.

## Review Limits

- blocked or unavailable checks: hosted release, live GitHub provider operations, and hosted Windows execution were not available
- residual manual verification: after fixes, exercise a real installed service and concurrent receive hooks on supported hosts, then record the first hosted `safety-dance-v*` release assets and checksums
