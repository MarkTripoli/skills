---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 5d08738d3625c147dde57ef721bd281f3e821aad
status: findings
summary: "Review of all 41 commits and 52 paths in origin/main...5d08738 confirms CR-006 and prior excluded-root repairs, but finds one major remaining Git-index integrity gap: excluding .git/index removes its entry type and descendants, so replacing the ordinary index with a directory or symlink can pass live grading and retained regrading. Preserve the justified volatile-byte exception only for an ordinary index file, grade index type and non-file structure, add focused regressions, then review the complete branch again."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `5d08738d3625c147dde57ef721bd281f3e821aad`
- commits: 41 commits from `3bfe746` through `5d08738`, including CR-006 implementation `1d78b9b`, documentation `4f42de2`, and fix receipt `5d08738`
- staged and unstaged changes: none before this artifact
- task-owned untracked files: none before this artifact
- excluded changes: The 22 prior numbered artifacts and `task.md` under `.agents/tasks/i-want-you-help/` were requirements, prior reviews, fix receipts, and evidence inputs rather than implementation review subjects. Every one of the 29 changed non-task paths was inspected.

## Previous Round

- previous artifact: `21-code-review-repository-onboarding.md`; fix receipt: `22-code-review-fixes-repository-onboarding.md`
- CR-006 Excluded harness roots are not exhaustively compared: fixed for `.agents`, `.omp`, `.git/config`, and every tested `.git` path except the deliberately omitted `.git/index`

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`; artifacts 13-22 supplied prior findings and claimed fixes, which were checked against the complete branch, source, tests, fresh transition matrices, and a new live run rather than accepted as proof
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`. The independent Standards axis found no hard documented-standard violation; its live/regrade duplication and diff-helper size observations are non-blocking judgment calls without a demonstrated defect. The independent Spec axis found the planned setup behavior complete, but its acceptance of the full `.git/index` omission was disproved by the direct type-transition reproduction below.

## Change Profile

- intent and expected behavior: Add an idempotent local-only `/setup-repository` skill, preserve foreign metadata, fail closed on unsafe managed state, support explicit managed reset, and retain terminal-eval evidence for exact allowlist grading and regrading.
- change description quality: Commit subjects isolate eval infrastructure, setup behavior, migrations, safety, provider contracts, snapshot repairs, documentation, and artifacts. All 41 subjects pass the repository checker.
- implementation model and review model: implementation model not recorded; review model `openai/gpt-5.6-sol`, with independent Standards and Spec explorer passes
- changed-line size and logical cohesion: 4,565 additions and 20 deletions across 52 paths including task history. The 29 non-task paths form one onboarding feature across eval infrastructure, skill instructions, tests, fixtures, runtime build, installation, inventory, documentation, and release metadata.
- resulting large-file concerns: `evals/run.mjs` is 502 lines, `scripts/validate.mjs` is 577 lines, and `tests/evals-terminal-phase.test.mjs` is 451 lines. The new behavior remains cohesive with their existing ownership; no size-only finding is raised.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: ordinary file creation/content/deletion; absent roots; tracked, untracked, ignored, and deleted excluded entries; root and descendant file/directory/symlink/dangling-symlink/FIFO transitions; non-dereferencing capture; `.git/config` independence; `.git` paths outside config/index; retained JSON; live/regrade manifests; setup semantics; five-runtime installation; provider outcomes; inventory; and portable validation
- missing or misleading coverage: `tests/evals-excluded-roots.test.mjs:126-140` proves that `.git/index` byte changes are omitted, but it also normalizes complete index absence to the same state. No test replaces the ordinary index with a directory, symlink, dangling symlink, or special entry, so the suite does not constrain the volatility exception to bytes of the ordinary index file.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3860` in / `73` out

### Correctness

- assessment and evidence: CR-001 through CR-006 are fixed on their covered paths. Focused tests and a fresh 108-transition matrix detect absent/file/directory/valid-link/dangling-link/FIFO changes for each excluded root; independent config snapshots detect `.git/config` changes; live and retained regrading consume the same three-root manifests. `excludedRootSpecs` removes `.git/index`, and `snapshotTree` returns before recording or traversing an excluded path, so an ordinary index replaced by a directory containing `payload` produces no changed path. CR-007 records the reproduced bypass.
- helper coverage: covered, level 3, score 2.98, confidence 0.98

### Readability and Simplicity

- assessment and evidence: Snapshot record constructors, complete-record comparison, ancestor suppression, setup instructions, migration rules, provider categories, installer/build wiring, and scenario checks use direct names and explicit boundaries. Live/regrade context assembly is duplicated, but both paths currently call the same helpers and no behavioral divergence was found.
- helper coverage: covered, level 3, score 2.56, confidence 0.56

### Architecture

- assessment and evidence: Canonical skill ownership, generated plugin inventory, selected installation, portable build, optional orchestration, terminal/artifact separation, and retained regrading remain intact. The typed-record architecture can express the missing distinction; the defect is that the index path is removed before any type record reaches that architecture.
- helper coverage: covered, level 3, score 2.61, confidence 0.61

### Security

- assessment and evidence: Repository and excluded-root snapshots use `lstat`, retain link target text without following it, and classify special entries without opening payloads. Setup forbids network, provider, and credential operations. CR-007 permits a terminal phase to replace Git index data with an ungraded indirection or container, weakening the evidence boundary without requiring an unsafe read.
- helper coverage: covered, level 3, score 2.75, confidence 0.75

### Performance

- assessment and evidence: Snapshot work is linear in fixture entries and ordinary-file bytes, runs only around terminal phases, and uses no network or retry loop. Recording an index kind while ignoring volatile ordinary-file bytes is constant work; traversing index descendants only when it is unexpectedly a directory is bounded by the throwaway repository. No performance finding remains.
- helper coverage: covered, level 3, score 2.94, confidence 0.94

## Verification Story

- command or inspection: Complete `origin/main...HEAD` diff and 41-commit log; all changed non-task files; task, plan, and artifacts 13-22; independent Standards and Spec passes; focused Node tests; a 108-transition excluded-root matrix; targeted `.git/index` reproduction; aggregate tests; portable build/validation; inventory; commit subjects; diff whitespace; fresh live OMP scenarios; retained regrading; and retained-manifest inspection
- result: Focused tests passed 32/32; the root transition matrix passed 108/108; `npm test` passed 168 tests; portable validation passed 44 skills; inventory returned 44 canonical skills, 7 workers, and 37 plugin skills; all 41 subjects and `git diff --check` passed. Fresh run `20260920-140507` passed all 3 scenarios and 9 terminal phases, regraded 3/3, and retained unchanged `.agents`, `.git`, `.omp`, and Git-config evidence in every phase; the run was removed afterward. Replacing `.git/index` with a directory containing `payload` returned `beforeIndex: null`, `afterIndex: null`, and `changedPaths: []`.
- manual, screenshot, or before-and-after evidence: Temporary matrix, index-reproduction, portable, live-run, and regrade output were removed. Source inspection confirms overlays and prompt writes precede before-capture; answer, stderr, and task evidence copies follow after-capture, so those harness writes do not self-induce excluded-root diffs. No interface screenshot applies.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-007 Git-index exclusion erases entry-type and descendant mutations

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/run.mjs:48-52`, `evals/lib.mjs:57-60`
- failure mode: A terminal phase can replace the ordinary `.git/index` file with a directory, symlink, dangling symlink, FIFO, or absence and still pass live grading and retained regrading. The `.git` excluded-root snapshot excludes `.git/index` before `snapshotEntry` records its type and before directory traversal, while the ordinary repository snapshot excludes all of `.git`. The documented reason justifies ignoring volatile ordinary index bytes after read-only Git commands, not erasing stable entry-kind and non-file structure changes. This leaves a concrete exception to the plan's “no mutation under excluded harness paths” requirement without a diagnostic.
- evidence or reproduction: In a temporary root, create `.git/index` as an ordinary file and snapshot `.git` with the production exclusions. Replace the file with `.git/index/payload` inside a new directory and snapshot again. Both manifests omitted `.git/index`; `diffRepositorySnapshots` returned `changedPaths: []` and the after manifest contained only the `.git` root record. `tests/evals-excluded-roots.test.mjs:126-140` passes because it asserts full omission and tests bytes only.
- fix direction: Narrow the exception to volatile bytes of an ordinary `.git/index` file. Retain a type-only record for an ordinary index, and retain safe symlink target, directory/descendant, absence, and special-entry shapes so type and lifecycle changes fail both live grading and regrading. Add index regressions for ordinary-file byte churn as the sole no-op plus file-to/from absence, directory, valid/dangling symlink, and FIFO transitions.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none. `buildPortable` is called by the runtime CLI; snapshot helpers are consumed by live execution and regrading; setup references are installed, validated, documented, and published.
- dependency findings: no package or lockfile changes. Added behavior uses Node standard-library filesystem, path, crypto, utility, test, and child-process APIs.

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested setup skill and fixes the six prior concrete defects, but the terminal evidence boundary still contains one reproducible mutation blind spot inside the newly added excluded-root grading.
- rationale: Setup behavior, ordinary snapshots, excluded-root records, independent Git config, live/regrade timing, installer/inventory/build/docs consumers, aggregate tests, portable output, and fresh live evidence pass. CR-007 remains major because a terminal phase can change `.git/index` from an ordinary file into a different filesystem object with retained payload and produce no live or regraded diagnostic.

## Review Limits

- blocked or unavailable checks: LSP diagnostics reject the requested external worktree because it is outside this session's cwd. Node syntax, focused tests, aggregate tests, portable validation, live evals, and retained regrading passed.
- residual manual verification: Authenticated provider behavior remains intentionally outside first-release scope. The review did not treat volatile ordinary `.git/index` bytes as a failure; only the ungraded lifecycle, type, and descendant states are CR-007.
