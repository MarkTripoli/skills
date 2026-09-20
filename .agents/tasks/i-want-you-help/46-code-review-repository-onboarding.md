---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 436bdfcfd98f915f466732c28894007d054820af
status: findings
summary: "The complete post-fix review found two final major static-isolation gaps. Mixed-case Git environment keys survive sanitization on Windows, and retained regular files with external hard-link aliases pass the pre-read tree gate."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `436bdfcfd98f915f466732c28894007d054820af`
- commits: 99 commits after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product findings.

## Previous Round

- previous artifact: `44-code-review-repository-onboarding.md`
- CR-029 Semantic index capture executes local Git helpers: fixed
- CR-030 Retained phase evidence follows symlinks: fixed for symlinks and special entries; hard-link aliases remain under CR-032
- CR-031 Repository manifests accept NUL paths: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Local-only setup with isolated live and retained evidence.
- change description quality: Receipt 45 accurately records local-helper, symlink, and NUL fixes; mixed-case environment and hard-link identity cases remain uncovered.
- implementation model and review model: Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: The release remains one setup-skill slice with supporting eval proof.
- resulting large-file concerns: Both fixes are small checks in existing boundary owners.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: 247 tests cover setup behavior, Git environment isolation, retained tree types, manifest schemas, concurrency, and portable parity.
- missing or misleading coverage: No test uses mixed-case Git keys or hard-linked retained files.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 2382 in / 73 out

### Correctness

- assessment and evidence: Current checks pass supported flows but miss Windows environment case folding and static inode aliasing.
- helper coverage: covered, level 3, confidence 0.83

### Readability and Simplicity

- assessment and evidence: Case-folding one prefix check and tracking retained file identities are direct fixes.
- helper coverage: covered, level 2, confidence 0.51

### Architecture

- assessment and evidence: Both checks belong in the existing environment and retained-tree boundaries.
- helper coverage: covered, level 2, confidence 0.50

### Security

- assessment and evidence: Surviving Git routing can redirect work; hard-link aliases let external mutation alter accepted retained evidence.
- helper coverage: covered, level 3, confidence 0.75

### Performance

- assessment and evidence: Case folding and one inode set lookup per retained file are linear and bounded.
- helper coverage: covered, level 3, confidence 0.61

## Verification Story

- command or inspection: Two independent full-diff reviews, 247-test aggregate, focused probes, and commit/diff checks.
- result: Requirements review was clean. Adversarial probes retained mixed-case Git keys and regraded a hard-linked answer green.
- manual, screenshot, or before-and-after evidence: No visual surface changed.

## Critical and Required Findings

### CR-032 Retained files can alias external hard links

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/run.mjs:355`
- failure mode: A regular retained file with multiple links passes validation, so mutation through an external alias changes evidence accepted by regrade.
- evidence or reproduction: Replacing `answer.md` with a hard link to an external file left the same inode and regraded 1/1 green.
- fix direction: Reject retained regular files whose link count is not one and duplicate retained `(device, inode)` identities. Add a hard-link regression. Concurrent malicious path replacement remains outside the local static-recording contract.

### CR-033 Mixed-case Git environment keys survive sanitization

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/git-environment.mjs:5`
- failure mode: `git_dir` or `Git_Work_Tree` survives the exact-uppercase filter and can act as Git routing on case-insensitive Windows environments.
- evidence or reproduction: Direct sanitizer probe preserved both mixed-case keys.
- fix direction: Compare the environment key with `toUpperCase().startsWith("GIT_")` and add mixed-case routing/config cases.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: Functional requirements pass; two small isolation gaps remain.
- rationale: Both can undermine repository or retained-evidence ownership on supported platforms or static recordings.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. Windows behavior is inferred from documented case-insensitive environment semantics and covered through platform-neutral sanitizer output.
- residual manual verification: Concurrent malicious path swaps and authenticated provider behavior remain outside this local release contract.
