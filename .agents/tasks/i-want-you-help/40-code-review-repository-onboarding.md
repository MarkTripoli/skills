---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 8803aa9
status: findings
summary: "The complete repository-onboarding diff has one major retained-evidence finding. Git-index manifests accept traversal or absolute paths, duplicate path-stage identities, and impossible 41–63-character object IDs, allowing equal malformed evidence to regrade green."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `8803aa9`
- commits: 86 commits after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product-code findings.

## Previous Round

- previous artifact: `38-code-review-repository-onboarding.md`
- CR-020 Retained manifest integrity is incomplete: fixed for repository/excluded-root paths and payload digests; Git-index identity validation remains separate below
- CR-021 Setup can dereference unsafe metadata entries: fixed
- CR-022 Permission-only mutations evade grading: fixed
- CR-023 Git-index capture inherits repository routing: fixed
- CR-024 Unreadable regular files abort evidence capture: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add a local-only setup skill with live and retained evidence that fails closed on malformed or mutated repository and Git state.
- change description quality: Fix receipt 39 accurately records path/digest, permissions, entry-type, Git-routing, and read-error hardening. Git-index entry identity remained outside those validator tests.
- implementation model and review model: Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: Skill behavior, eval infrastructure/scenarios, build/install integration, tests, docs, and release metadata remain one release slice.
- resulting large-file concerns: No structural change is required for this focused validator repair.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: 223 offline tests cover setup behavior, retained schemas, filesystem modes/errors, Git routing, concurrency, and portable parity.
- missing or misleading coverage: Git-index retained tests do not cover path ownership, exact object-ID lengths, or duplicate path-stage records.

## Five-Axis Assessment

- helper axis-coverage: `correctness=covered:3`, `readability=covered:2`, `architecture=covered:2`, `security=covered:3`, `performance=covered:3`; model `jev-1.13.0`, 2408 input tokens, 73 output tokens

### Correctness

- assessment and evidence: All prior findings remain fixed. CR-025 permits impossible retained index identities to pass validation.
- helper coverage: covered, level 3

### Readability and Simplicity

- assessment and evidence: Validator ownership is clear; index entries need the same normalized relative-path helper and collection-level uniqueness check used by other retained evidence.
- helper coverage: covered, level 2

### Architecture

- assessment and evidence: `evals/manifest.mjs` is the responsible fail-closed boundary. No runner change is required.
- helper coverage: covered, level 2

### Security

- assessment and evidence: The defect requires local retained-evidence tampering and exposes no payload, but can produce a false green regrade.
- helper coverage: covered, level 3

### Performance

- assessment and evidence: Path validation and one set lookup per index entry are linear in the existing manifest and add no I/O.
- helper coverage: covered, level 3

## Verification Story

- command or inspection: Fresh main-thread `npm test`; 67 focused tests; portable validation; Node/Deno and commit checks; direct validator probes.
- result: Main-thread aggregate passed 223/223. Direct probes return no problem for `../outside`, absolute paths, duplicate `(path, stage)` records, and a 41-character object ID.
- manual, screenshot, or before-and-after evidence: No visual surface changed. Live setup evidence remains outside this focused retained-validator finding.

## Critical and Required Findings

### CR-025 Git-index manifest identity validation is incomplete

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/manifest.mjs:147`
- failure mode: Equal malformed before/after Git-index manifests can regrade green despite path traversal, absolute paths, duplicate path-stage identities, or object IDs that Git cannot emit.
- evidence or reproduction: `indexEntryProblem()` requires only a nonempty path and accepts any lowercase hexadecimal object ID between 40 and 64 characters. Collection validation does not reject duplicate `(path, stage)` entries. A direct probe with `../outside` and a 41-character object ID returns no problem.
- fix direction: Require normalized repository-relative index paths, exact 40- or 64-character object IDs, and unique `(path, stage)` identities. Add validator and equal-before/after retained-regrade regressions for traversal, absolute paths, wrong object length, and duplicates.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: Requested behavior and earlier hardening are present; one retained index schema gap remains.
- rationale: The gap permits a false-green retained regrade and belongs to the branch's strict evidence-validation contract.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. Main-thread aggregate passed; one unchanged native-helper test flaked only in an independent worker and passed in isolation.
- residual manual verification: Authenticated provider behavior remains intentionally deferred and unclaimed.
