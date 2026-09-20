---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 4976917ba7d31cbe80d126c473b8932fbe1bc781
status: findings
summary: "The complete post-fix review found three major evidence-integrity gaps. Repository-local Git helpers can execute during index capture, retained phase and pinned-source evidence can escape through symlinks, and repository/excluded-root manifests accept NUL paths."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `4976917ba7d31cbe80d126c473b8932fbe1bc781`
- commits: 94 commits after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product findings.

## Previous Round

- previous artifact: `42-code-review-repository-onboarding.md`
- CR-026 Eval runner inherits Git routing and configuration: fixed for inherited environment; repository-local command helpers remain under CR-029
- CR-027 Retained summary names can escape the run directory: fixed for summary/report/scenario paths; phase and pinned-source paths remain under CR-030
- CR-028 Git-index manifests accept impossible identities: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Local-only setup plus live and retained evidence that cannot mutate unrelated state, execute untrusted helpers, or read outside its recording.
- change description quality: Receipt 43 accurately describes inherited environment, summary containment, and index schema fixes; tests omit local Git config execution, phase-tree symlinks, and NUL paths in non-index manifests.
- implementation model and review model: Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: The release remains one setup-skill slice with supporting eval infrastructure and proof.
- resulting large-file concerns: Fixes belong at existing Git-command, retained-tree, and path-schema boundaries; no unrelated split is required.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: 235 tests cover setup behavior, inherited Git environment isolation, retained summary containment, manifest schemas, concurrency, and portable parity.
- missing or misleading coverage: No test configures a local fsmonitor helper, symlinks phase/pinned-source evidence, or supplies NUL paths to repository/excluded-root validators.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 2761 in / 73 out; readability, architecture, and performance unavailable because the helper returned unclear

### Correctness

- assessment and evidence: Current checks cover prior findings but still permit side effects after snapshots and external retained phase inputs.
- helper coverage: covered, level 3, confidence 0.64

### Readability and Simplicity

- assessment and evidence: One Git command prefix, one retained-tree validator, and one shared relative-path rule are the smallest responsible fixes.
- helper coverage: unavailable; reviewer assessed the complete pinned scope

### Architecture

- assessment and evidence: Command safety belongs in index capture; all retained file ownership belongs before any retained read; NUL rejection belongs in the shared path parser.
- helper coverage: unavailable; reviewer assessed the complete pinned scope

### Security

- assessment and evidence: Local Git configuration can execute a helper after snapshots, and retained symlinks can redirect reads to external content.
- helper coverage: covered, level 3, confidence 0.63

### Performance

- assessment and evidence: A single linear retained-tree walk and constant Git overrides add bounded work relative to already-retained evidence.
- helper coverage: unavailable; reviewer assessed the complete pinned scope

## Verification Story

- command or inspection: Two independent full-diff reviews plus direct local-fsmonitor, phase-symlink, and NUL-path probes.
- result: Local fsmonitor executed, a symlinked phase regraded green, and repository/excluded-root validators returned no problem for NUL paths.
- manual, screenshot, or before-and-after evidence: No visual surface changed. Pre-review gates passed 235/235 tests and all five live/retained setup scenarios.

## Critical and Required Findings

### CR-029 Semantic index capture executes local Git helpers

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/git-index.mjs:48`
- failure mode: Repository-local `core.fsmonitor` can execute during post-phase index capture after repository snapshots, so helper side effects can evade retained diffs.
- evidence or reproduction: Configuring `core.fsmonitor` in the requested repository and calling `snapshotGitIndex()` created the helper marker.
- fix direction: Override command-executing local Git configuration for index inspection, including fsmonitor and hooks, and add a local-config regression.

### CR-030 Retained phase evidence follows symlinks

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/run.mjs:531`
- failure mode: Phase directories, answers, status, manifests, task copies, and pinned `.dist` inputs are read without a complete non-symlink containment check.
- evidence or reproduction: Replacing a phase directory or `exit-status.json` with an external symlink still returned a passing retained regrade.
- fix direction: Validate the canonical retained run tree contains only regular files and directories before any retained read; add symlink cases for completion, phase, task, manifest, and pinned-source inputs.

### CR-031 Repository manifests accept NUL paths

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/manifest.mjs:32`
- failure mode: Equal malformed repository or excluded-root manifests containing NUL paths can regrade green even though the filesystem cannot emit those names.
- evidence or reproduction: Direct probes returned no problem for `bad\0name` and `.agents/bad\0name`.
- fix direction: Reject NUL in the shared normalized relative-path parser and add unit plus equal-manifest regrade regressions.

## Advisories

### ADV-001 Retained reconstruction omits phase fixture hooks

- type: Potential issue
- severity: info
- category: Maintainability and code quality
- location: `evals/run.mjs:550`
- evidence: Live phases apply overlays and fixture hooks; retained grading reconstructs base fixtures only. Current checks use retained manifests, so no failure reproduced.
- suggestion: Keep future retained checks independent of reconstructed mutable fixture state, or persist the exact prepared source snapshot when such a check is introduced.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: Setup behavior remains correct, but evidence execution and containment boundaries are incomplete.
- rationale: The three defects permit unrecorded side effects or false-green retained evidence.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. Typed axis judgments were unavailable for readability, architecture, and performance because the helper returned unclear; the reviewer assessed those axes directly.
- residual manual verification: Authenticated provider behavior remains intentionally deferred and unclaimed.
