---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 53092f7167df964948f27cbccf85115be54d4727
status: findings
summary: "The complete 40,872-line Safety Dance product diff was reviewed through 53092f7 against origin/main. Four prior critical or major findings remain open: nested validation descendants can still invoke mutation commands, restart recovery resumes after best-effort process cleanup, evidence reads can cross managed roots through filesystem races, and pull-request evidence updates can overwrite concurrent authored edits. The next fix round must close these trust, recovery, and data-preservation gaps and add focused regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `53092f7167df964948f27cbccf85115be54d4727`
- commits: 206 commits from the merge base through HEAD; no pull request exists for `safety-dance`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts, retained evidence, workflow metadata, and unrelated untracked `progress.md`

## Previous Round

- previous artifact: `118-code-review-safety-dance.md`
- CR-382 Detached validation descendants still bypass nested-run authorization: still open
- CR-383 Restart recovery races validation processes that survived the daemon: still open
- CR-384 Evidence confinement has a symlink replacement race: still open
- CR-385 Evidence updates still replace authored pull-request bodies: still open
- CR-386 Windows task absence matching can overwrite an unverified task: fixed
- CR-387 Failed and operator-approved steps discard typed evidence: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; bring the referenced local Git gate into this repository under a new identity without retaining source-product references outside the required license
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the plan requires nested-run isolation, restart-safe durable execution, evidence confinement, and behavior-preserving provider integration
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, authenticated local Git gate, durable validation pipeline, guarded publication, operator interfaces, canonical skill distribution, identity checks, and binary release contract
- change description quality: commit subjects identify the implementation and repair rounds, but there is no pull request title or body to explain the 206-commit change as a whole
- implementation model and review model: implementation receipts record multiple models across the delivery run; this review used `GPT-5.6 Sol` at medium reasoning
- changed-line size and logical cohesion: 234 product files, 40,872 insertions, and 4 deletions outside task artifacts; the six planned phases form one product but exceed the review skill's split signal by a wide margin
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, and several daemon and CLI owners are large; the current findings concern trust-boundary behavior rather than file length alone
- dependency or lockfile changes: a new pinned Go module and `go.sum` were added; no root Node dependency changed, and generated third-party notices are part of the aggregate gate

## Tests Reviewed First

- behavior claimed by tests: authenticated hook admission, same-branch replacement, restart recovery, guarded publication, PR evidence, Windows service ownership, typed step evidence, runtime installation, identity scanning, and release packaging
- missing or misleading coverage: no regression drives a validation descendant through an unmarked shell into the real mutation CLI; recovery tests do not make process enumeration or termination fail before resume; evidence tests cover a final symlink but not intermediate-directory replacement or Windows reparse points; PR-body tests do not interleave an author edit between read and update

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4122` in / `73` out

### Correctness

- assessment and evidence: the aggregate and focused race suites pass, but restart recovery at `tools/safety-dance/internal/cli/daemon.go:300-306` converts best-effort reaping into unconditional success and `tools/safety-dance/internal/daemon/manager.go:259-284` resumes the run immediately afterward. Existing-PR updates also use an unguarded read-then-write sequence at `tools/safety-dance/internal/pipeline/steps/pr.go:83-95`, so a concurrent authored edit can be lost.
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: the new owners generally keep CLI, daemon, database, pipeline, SCM, and evidence responsibilities separate. The repair round adds parallel database methods for activity-preserving completion, but their callers make the intended difference explicit; no critical or major readability defect was found.
- helper coverage: covered, level 2, confidence 0.57

### Architecture

- assessment and evidence: mutation authority still depends on the peer's executable name, its own environment, and an immediate-parent name heuristic at `tools/safety-dance/internal/daemon/admission.go:356-386`. That boundary cannot establish the plan's full descendant prohibition because an intermediate shell can remove the marker before launching the real CLI.
- helper coverage: covered, level 2, confidence 0.57

### Security

- assessment and evidence: `confinedEvidencePath` resolves a path before opening it at `tools/safety-dance/internal/pipeline/steps/pr.go:231-237`; the Unix opener applies `O_NOFOLLOW` only to the final component at `tools/safety-dance/internal/pipeline/steps/evidence_open_unix.go:13-27`, while the Windows opener follows reparse points at `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go:10-24`. A validation process can replace an ancestor after resolution and make the daemon publish a file outside either managed root.
- helper coverage: covered, level 3, confidence 0.94

### Performance

- assessment and evidence: package and aggregate race checks completed without a hot-path regression. The reviewed pipeline is branch-scoped and bounded by persisted runs; no critical or major performance defect was established in this round.
- helper coverage: unavailable

## Verification Story

- command or inspection: `go test -race ./internal/daemon ./internal/db ./internal/pipeline ./internal/pipeline/steps ./internal/e2e`; `npm test`; product-only `git diff --check`; source inspection of the six prior repair paths
- result: focused Go packages passed; `npm test` passed with 137 Node tests, the full Go race suite, vet, temporary binary build, local end-to-end tests, identity scan, and three release-contract tests; product-only diff check passed
- manual, screenshot, or before-and-after evidence: no UI screenshot was required; hosted Windows, live-provider, and hosted-release behavior remains outside local proof

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-388 Nested validation can relaunch the mutation CLI through an unmarked shell

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:356-386`
- failure mode: a validation descendant removes `SD_PARENT_RUN_ID`, starts an ordinary shell, and launches the real `safety-dance` binary. The authenticated peer now has the expected basename and no marker, while its immediate parent is named `sh` or `bash`, so `AuthorizeMutationPeer` permits `run`, `respond`, `abort`, or daemon shutdown from the nested run.
- evidence or reproduction: the function examines only the peer environment at lines 360-365 and only the immediate parent's basename at lines 375-384. It no longer walks authenticated ancestry, and the test suite has no mutation-authorization regression for an intermediate unmarked process.
- fix direction: bind mutation authority to an unforgeable top-level launch credential or verify the full authenticated ancestry with a durable parent-run prohibition. Add a process fixture that unsets the marker, inserts a neutral shell, and attempts every mutating IPC method.

### CR-389 Restart recovery resumes after cleanup failures

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:300-306`
- failure mode: if process-table enumeration or signaling fails during daemon restart, an old validation process remains alive while the recovered runner starts against the same persisted worktree. The old writer can race the resumed step, change HEAD or files after validation, and invalidate durable step results.
- evidence or reproduction: `procreap.SweepAndLog` logs and discards errors at `tools/safety-dance/internal/procreap/procreap.go:213-220`; `SweepRunWorktree` returns no result; the installed recovery callback always returns `nil`; and `Manager.Recover` launches the runner at `tools/safety-dance/internal/daemon/manager.go:259-284` as soon as that callback returns. No test forces enumeration or kill failure and asserts that recovery stays blocked.
- fix direction: give restart recovery a strict reaper that returns enumeration and termination failures, confirms every selected PID exited after the kill deadline, and blocks or fails the run before reuse when exclusivity cannot be proven. Keep best-effort cleanup only for non-recovery maintenance paths.

### CR-390 Evidence reads still permit ancestor replacement and Windows reparse traversal

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/evidence_open_unix.go:13-27`
- failure mode: a validation process swaps an ancestor directory between `EvalSymlinks` and `open`, or uses a Windows reparse point, causing the daemon to read and publish a credential or other file outside the managed worktree and evidence roots.
- evidence or reproduction: `confinedEvidencePath` returns a resolved string after a separate filesystem walk at `tools/safety-dance/internal/pipeline/steps/pr.go:231-237`. Unix `O_NOFOLLOW` protects only the last pathname component, not replaced ancestors. Windows calls `os.Open` directly at `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go:10-24`, which follows reparse points. Existing tests reject a stable final symlink but do not race an ancestor or exercise a Windows reparse point.
- fix direction: open the root directory once and resolve every component relative to that descriptor with no-follow or beneath-root semantics, using platform-specific handle checks on Windows. Read from the verified handle and add deterministic ancestor-swap and reparse-point tests.

### CR-391 Pull-request body preservation has a lost-update window

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:83-95`
- failure mode: an author edits the pull-request body after `GetPRContent` returns but before `UpdatePR` runs. Safety Dance sends the stale merged body and silently deletes that edit, despite the repair's preservation contract.
- evidence or reproduction: the provider read and update are separate calls with no version, ETag, conditional request, or retry. `TestMergeEvidenceBodyPreservesAuthoredText` covers only sequential local string merges and cannot detect provider concurrency.
- fix direction: make the provider update conditional on the version or ETag returned by the read, retry the merge on conflict, or publish evidence through a provider operation that does not replace the authored body. Add a host fixture that changes the body between read and update.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found; the new evidence readers, reaper callback, PR content reader, service matcher, and activity-preserving database methods all have production callers
- dependency findings: the new Go dependencies are pinned in `go.mod` and `go.sum`; the aggregate generated-notice and release checks passed, and no critical or major dependency defect was established

## Verdict

- decision: request_changes
- overall code-health change: the repair round narrows several prior failures and keeps all aggregate checks green, but four trust and durability boundaries still do not meet the plan
- rationale: CR-388 through CR-391 can authorize forbidden nested mutation, race two writers in one recovered worktree, disclose files outside managed roots, or erase concurrent pull-request edits. Green tests do not exercise those failure paths.

## Review Limits

- blocked or unavailable checks: hosted Windows service and reparse behavior, live provider concurrency, and hosted `safety-dance-v*` release execution were unavailable; the performance axis judgment returned `unclear`, so that helper judgment was skipped and the axis was decided from the pinned diff and completed checks
- residual manual verification: after repair, exercise a detached validation descendant, forced process-table and kill failures, ancestor-directory replacement on Unix, a Windows reparse fixture, and a provider lost-update fixture
