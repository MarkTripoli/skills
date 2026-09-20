---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: a67feac25870e049a8f5f9ce0a9c944c71bdd76c
status: findings
summary: "Review of all 31 commits and 45 paths in origin/main...a67feac confirms the three prior snapshot findings are fixed on their covered paths, but finds one remaining major Git-config integrity gap: creating or deleting a dangling `.git/config` symlink is recorded as absent and can pass terminal grading. Fix existence detection to use non-dereferencing metadata, add dangling-link regressions, then review the complete branch again."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `a67feac25870e049a8f5f9ce0a9c944c71bdd76c`
- commits: 31 commits from `3bfe746` through `a67feac`
- staged and unstaged changes: none before this artifact
- task-owned untracked files: none before this artifact
- excluded changes: The 17 files under `.agents/tasks/i-want-you-help/` were requirements, prior findings, fix receipts, and evidence inputs rather than implementation review subjects. Every changed non-task file was inspected.

## Previous Round

- previous artifacts: `13-code-review-repository-onboarding.md` with fix receipt `14-code-review-fixes-repository-onboarding.md`; `15-code-review-repository-onboarding.md` with fix receipt `16-code-review-fixes-repository-onboarding.md`
- CR-001 Terminal grading misses Git-config and nested reserved-directory mutations: fixed
- CR-002 Repository snapshots dereference symlinks into retained evidence: fixed
- CR-003 Snapshot hashes do not distinguish regular files from symlinks: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`; artifacts 13-16 supplied prior findings and claimed fixes, which were checked against source, tests, commit diffs, and fresh reproductions
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`. The independent Standards pass found no documented-standard violation; its optional duplicated-code concern in live/regrade context assembly had no demonstrated failure and is not raised. The independent Spec pass found no omission, but the targeted Git-config boundary reproduction below disproved complete type-transition handling.

## Change Profile

- intent and expected behavior: Add an idempotent, local-only `/setup-repository` skill; preserve foreign state; fail closed on unsafe managed state; support explicit managed reset; and extend terminal evals with retained repository and Git-config evidence for live grading and regrading.
- change description quality: Commit subjects isolate eval infrastructure, skill behavior, migrations, safety, provider contracts, snapshot repairs, documentation, and artifacts. All 31 subjects pass the repository checker.
- implementation model and review model: implementation model not recorded; review model `openai/gpt-5.6-sol`, with independent Standards and Spec explorer passes
- changed-line size and logical cohesion: 3,619 additions and 20 deletions across 45 paths including task history. Non-task changes remain one onboarding feature across the skill, eval adapter, tests, fixtures, installation, runtime build, inventory, docs, and changeset.
- resulting large-file concerns: `evals/run.mjs` is 467 lines and `scripts/validate.mjs` is 577 lines, but the branch adds bounded logic within their existing ownership. No size concern causes the reproduced failure.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: ordinary file bytes and digests; sorted create/modify/delete diffs; root harness exclusions; nested `.agents` and `.omp` paths; local Git-config byte changes; file, directory, and broken repository symlinks without dereference; changed link targets; both equal-digest file/symlink transition directions for repository entries and valid Git config; terminal allowlists and answer shape; setup semantics; five-runtime installation; provider outcomes; inventory; and portable validation
- missing or misleading coverage: `tests/evals-terminal-phase.test.mjs:91-205` covers existing regular files and valid symlinks but not a dangling `.git/config` symlink. Because `snapshotGitConfig` checks existence with a target-following API before `lstatSync`, absent-to-dangling and dangling-to-absent transitions collapse to `null` on both sides.

## Five-Axis Assessment

- helper axis-coverage: all five axes `covered` at level 3. Correctness score 2.99/confidence 0.99; readability 2.52/0.52; architecture 2.82/0.82; security 2.75/0.75; performance 2.90/0.90. Judge: model `jev-1.13.0`, 3640 tokens in / 73 out.

### Correctness

- assessment and evidence: Typed snapshot records preserve ordinary bytes and symlink target text; complete-record comparison detects both equal-digest transition directions; old retained records without `kind` still compare and feed scenario byte consumers; root-only exclusions retain nested reserved names; live and regrade paths consume the same manifests. Ordinary Git-config create, delete, byte change, and valid file/symlink transitions are detected. A dangling Git-config symlink is not: `fs.existsSync` at `evals/lib.mjs:31` follows the missing target and returns false before `lstatSync`, so creation or deletion is reported unchanged. CR-004 records the direct reproduction.
- helper coverage: `covered`, level 3, score 2.99, confidence 0.99

### Readability and Simplicity

- assessment and evidence: Snapshot record constructors, complete-record comparison, setup flow, migration table, provider categories, scenarios, and release wiring use direct names and explicit boundaries. Live/regrade terminal context construction repeats some shape assembly, but both consume the same helpers and no concrete divergence was found.
- helper coverage: `covered`, level 3, score 2.52, confidence 0.52

### Architecture

- assessment and evidence: Canonical skill ownership, generated plugin inventory, independent installation, portable build, optional orchestration boundary, terminal/artifact split, and retained regrading remain intact. The remaining failure is localized to the Git-config capture seam; using `lstatSync` with an `ENOENT` branch preserves the existing typed-record architecture.
- helper coverage: `covered`, level 3, score 2.82, confidence 0.82

### Security

- assessment and evidence: Repository symlinks retain only link target text and never target bytes, including file, directory, and broken links. Secret-shaped managed fields are rejected without receipt disclosure, and setup performs no provider or credential operation. CR-004 allows an undeclared `.git/config` redirection to a nonexistent target to evade evidence, weakening the integrity boundary but not dereferencing or retaining host bytes.
- helper coverage: `covered`, level 3, score 2.75, confidence 0.75

### Performance

- assessment and evidence: Snapshot work remains linear in fixture entries and ordinary-file bytes, uses no network or retry loop, and runs only around terminal eval phases. Complete-record comparison and non-dereferencing Git-config metadata add constant work per entry; no performance finding remains.
- helper coverage: `covered`, level 3, score 2.90, confidence 0.90

## Verification Story

- command or inspection: Full `git diff origin/main...HEAD`, complete 31-commit log, all changed non-task files, task and plan, artifacts 13-16, fix commits `c1e48de` and `563058d`, independent Standards and Spec passes, focused snapshot tests, aggregate tests, portable build/validation, inventory, commit-subject checks, and targeted Node reproductions
- result: Focused Node tests passed 33 tests; `npm test` passed 150 tests; portable validation passed 44 skills; inventory returned 44 skills, 7 workers, and 37 plugin skills; all 31 subjects passed. Fresh checks confirmed ordinary Git-config create/delete/type transitions, both equal-digest repository transition directions, nested reserved paths, and old no-`kind` manifest no-ops. The absent-to-dangling Git-config reproduction returned `{"absent":null,"dangling":null,"gitConfigChanged":false}`.
- manual, screenshot, or before-and-after evidence: Temporary reproductions used `os.tmpdir()` and removed their directories. No interface screenshot applies. Retained live setup recordings were not present in this worktree, so compatibility was checked through the regrade data shapes and old-record targeted reproduction rather than rerunning a model.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-004 Dangling Git-config symlinks are indistinguishable from absence

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/lib.mjs:29-35`
- failure mode: A terminal phase can create `.git/config` as a dangling symlink, or remove an existing dangling config link, without triggering `gitConfigChanged`. `fs.existsSync(config)` follows the symlink target and returns false when that target is absent, so `snapshotGitConfig` returns `null` instead of the typed symlink record that `lstatSync` and `readlinkSync` can capture. Repository manifests intentionally exclude `.git`, leaving no second detector. This violates the terminal contract that local Git configuration changes fail live grading and regrading.
- evidence or reproduction: In a temporary root with an empty `.git` directory, `snapshotGitConfig(root)` returned `null`. After `symlinkSync("missing-target", ".git/config")`, it still returned `null`, and `gitConfigChanged(before, after)` returned `false`. Ordinary absent-to-file, file-to-absent, and valid symlink/file transitions returned `true`, so the defect is specific to dangling links and is not covered by `tests/evals-terminal-phase.test.mjs:91-205`.
- fix direction: Remove the target-following `existsSync` guard. Call `lstatSync` directly, map only `ENOENT` to `null`, and retain every symlink through `readlinkSync` whether its target exists. Add absent-to-dangling and dangling-to-absent Git-config regressions; keep the existing ordinary and equal-digest transition tests.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none. `buildPortable` is used by `scripts/build-runtimes.mjs`; snapshot and Git-config helpers are consumed by live execution and regrading; setup references are installed and published.
- dependency findings: no package or lockfile changes. Added runtime behavior uses Node standard-library filesystem, path, crypto, utility, and process APIs.

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested setup skill and fixes all three prior concrete defects, but the terminal-eval Git-config boundary still has one reproducible non-dereferencing existence gap.
- rationale: Aggregate, portable, inventory, installation, setup-contract, and focused tests pass. CR-004 remains major because exact terminal grading promises to reject every local Git-config mutation, while a concrete config type creation or deletion can pass both live grading and retained regrading.

## Review Limits

- blocked or unavailable checks: LSP diagnostics cannot run because the requested worktree is outside this session's cwd; this review changes only Markdown.
- residual manual verification: Authenticated provider behavior remains intentionally outside first-release scope. Live OMP scenarios were not rerun; no retained terminal manifests were available in this worktree.
