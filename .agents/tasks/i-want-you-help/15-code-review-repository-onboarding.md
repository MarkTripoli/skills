---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 2d375b49ac92b3de3bc77d6f28cdf84f3d5a229e
status: findings
summary: "Review of all 28 commits and 43 paths in origin/main...2d375b4 confirms the prior root-exclusion, Git-config, and symlink-dereference fixes, but finds one remaining major snapshot-integrity defect: replacing a regular file with a symlink can evade terminal changed-path grading when the file bytes equal the link target text. Fix snapshot type discrimination, add file/config type-transition regressions, then review the complete branch again."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `2d375b49ac92b3de3bc77d6f28cdf84f3d5a229e`
- commits: 28 commits from `3bfe746` through `2d375b4`, including fix commit `c1e48de`, documentation commit `f6dc65f`, and receipt commit `2d375b4`
- staged and unstaged changes: none before this artifact
- task-owned untracked files: none before this artifact
- excluded changes: The 15 files under `.agents/tasks/i-want-you-help/` were requirements, prior findings, and implementation evidence rather than implementation review subjects. Every changed non-task file was inspected.

## Previous Round

- previous artifact: `13-code-review-repository-onboarding.md`; fix receipt: `14-code-review-fixes-repository-onboarding.md`
- CR-001 Terminal grading misses Git-config and nested reserved-directory mutations: fixed
- CR-002 Repository snapshots dereference symlinks into retained evidence: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`; artifacts 13 and 14 supplied prior findings and claimed fixes, which were checked against source and fresh reproductions rather than trusted as proof
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`. The branch preserves standalone skill ownership, optional setup, Conventional Commit history, changeset policy, and the no-provider-operation boundary.

## Change Profile

- intent and expected behavior: Add an idempotent local-only `/setup-repository` skill, fail closed on unsafe metadata, preserve foreign ownership, support explicit managed reset, and extend terminal evals with retained repository and Git-config evidence that can be regraded.
- change description quality: Commit subjects isolate runner support, skill behavior, migrations, safety, provider contracts, repairs, documentation, and artifacts. `c1e48de` states the snapshot repair directly; `f6dc65f` documents the resulting root-only and Git-config boundaries.
- implementation model and review model: implementation model not recorded; review model `openai/gpt-5.6-sol`
- changed-line size and logical cohesion: 3,389 additions and 20 deletions across 43 paths. Excluding task history, the changes form one repository-onboarding feature with eval, install, build, validation, documentation, fixture, and test support.
- resulting large-file concerns: `evals/run.mjs` is 467 lines and `scripts/validate.mjs` is 577 lines, but this branch adds bounded terminal-eval and inventory branches within their existing ownership. No new implementation file exceeds 250 lines.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: creation/modification/deletion diffs, root harness exclusions, nested reserved paths, local Git-config byte changes, file and directory symlink non-dereference, changed link targets, terminal allowlists, answer shape, valid-current rerun classification, five-runtime installation, provider outcomes, migration, reset, privacy, and idempotency
- missing or misleading coverage: `tests/evals-terminal-phase.test.mjs:105-143` covers links that remain links and link-target changes, but not a regular-file-to-symlink or symlink-to-regular-file transition whose payload hashes collide. The Git-config test at lines 91-103 likewise changes bytes without changing entry type.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3618` in / `73` out

### Correctness

- assessment and evidence: Root-only exclusions now retain nested `.agents` and `.omp` paths, live and regraded Git-config hashes are compared, absent/config creation is detected, and broken file/directory links snapshot without following targets. However, `diffRepositorySnapshots` compares only `sha256`; a regular file containing `target` and a replacement symlink whose target is `target` have the same digest, so the type-changing mutation produces an empty changed-path set. CR-003 records the reproduced grading bypass.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: The setup flow, metadata ownership rules, migration table, terminal branch, and snapshot helpers use direct names and bounded responsibilities. The remaining defect comes from an incomplete manifest comparison contract, not confusing control flow or speculative abstraction.
- helper coverage: covered, level 3, confidence 0.59

### Architecture

- assessment and evidence: Canonical skill source, generated plugin inventory, installer selection, portable build, standalone setup ownership, and terminal-versus-artifact eval separation remain intact. Snapshot capture centralizes bytes and link targets, but the diff boundary discards entry-kind information; comparing complete typed records is the smallest responsible repair.
- helper coverage: covered, level 3, confidence 0.73

### Security

- assessment and evidence: `lstatSync` and `readlinkSync` prevent file, directory, and broken symlinks from copying target bytes into retained manifests. Local Git-config snapshots retain only the controlled throwaway repository config. CR-003 still permits an undeclared symlink substitution to pass grading, weakening the integrity guarantee used to detect a terminal skill redirecting repository paths.
- helper coverage: covered, level 3, confidence 0.59

### Performance

- assessment and evidence: Repository snapshots remain linear in fixture entries and ordinary-file bytes, with no network access, retry loop, or hot production path. Recording an entry kind or comparing the existing `bytes`/`linkTarget` shape adds constant work per path; no performance finding remains.
- helper coverage: covered, level 3, confidence 0.96

## Verification Story

- command or inspection: Full `git diff origin/main...HEAD`, complete commit log, all changed non-task files, task and plan, artifacts 13 and 14, focused source inspection of `c1e48de` and `f6dc65f`, targeted Node reproductions, focused terminal tests, aggregate `npm test`, and portable build/validation
- result: `node --test tests/evals-terminal-phase.test.mjs` passed 10 tests; `npm test` passed validation, plugin sync, and 146 tests; portable build validated 44 skills. A fresh Node reproduction returned `changedPaths: []` after replacing a file containing `target` with a symlink to `target`; the retained before/after records differed only by `bytes` versus `linkTarget` and shared the same SHA-256. The analogous valid Git-config file-to-symlink transition returned `gitConfigChanged: false`.
- manual, screenshot, or before-and-after evidence: Temporary reproductions covered root-only exclusions, nested reserved paths, absent/config creation, file/directory/broken links, changed link targets, and same-digest type transitions; temporary directories and portable output were removed. No interface screenshot applies.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-003 Snapshot hashes do not distinguish regular files from symlinks

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/lib.mjs:64-71`
- failure mode: A terminal phase can replace an undeclared regular file with a symlink and pass exact changed-path grading when the original file bytes equal the symlink target text. `snapshotBytes` and `snapshotSymbolicLink` intentionally produce different record shapes, but `diffRepositorySnapshots` compares only their SHA-256 values. `gitConfigChanged` has the same shape-blind comparison at `evals/lib.mjs:35-37`, so a valid `.git/config` file-to-symlink transition with equal payload text is also reported unchanged.
- evidence or reproduction: In a temporary directory, write `same-kind` with bytes `target`, snapshot it, replace it with `same-kind -> target`, and snapshot again. Both records hash to `34a04005bcaf206eec990bd9637d9fdb6725e0a0c0d4aebf003f17f4c956eb5c`; `diffRepositorySnapshots` returned empty `created`, `modified`, `deleted`, and `changedPaths`. Repeating under `.git/config` with an existing `target` destination made `gitConfigChanged` return `false`. The 10 focused tests pass because `tests/evals-terminal-phase.test.mjs:105-143` tests link targets, not file-kind transitions.
- fix direction: Add an explicit entry kind to retained records or compare the complete discriminated record shape as well as the digest. Apply the same type-sensitive comparison to Git-config snapshots. Add both regular-file-to-symlink and symlink-to-regular-file regressions for repository paths and `.git/config`, using equal payload/target text so the tests fail if comparison regresses to digest-only behavior.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none. `buildPortable` is used by `scripts/build-runtimes.mjs`; snapshot and Git-config helpers are used by live execution and regrading.
- dependency findings: no package or lockfile changes; Node standard-library filesystem, path, crypto, test, and child-process APIs remain the only added runtime surface.

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested local setup contract and fixes the two prior concrete failures, but terminal snapshot grading still has one reproducible type-confusion bypass introduced by the symlink manifest design.
- rationale: CR-001 and CR-002 from artifact 13 are independently fixed, and aggregate gates pass. CR-003 is major because the eval contract promises exact undeclared-path detection and retained regrading, while a repository path can change from data to indirection without appearing in `changedPaths`.

## Review Limits

- blocked or unavailable checks: LSP diagnostics cannot run because the requested worktree is outside this session's cwd; Node syntax and test execution provide executable diagnostics. Axis helper covered all five axes.
- residual manual verification: Authenticated provider behavior remains intentionally outside scope. Live OMP scenarios were not rerun because the branch already retains their evidence and the discovered defect is reproduced below the model boundary.
