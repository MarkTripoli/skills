---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 7a00fd81bee17ca78cfb2a191f8491d8ce9c64ae
status: findings
summary: "Review of all 52 commits and 59 paths in origin/main...7a00fd8 confirms CR-008 and the earlier snapshot fixes, but finds one major same-root concurrency defect in eval run allocation. Two normal runs started in the same second select one run directory, race while building its private `.dist`, and can also race while replacing `latest`; allocate run directories exclusively and update `latest` without a remove-create race."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `7a00fd81bee17ca78cfb2a191f8491d8ce9c64ae`
- commits: 52 commits from `3bfe746` through `7a00fd8`
- staged and unstaged changes: none before this artifact
- task-owned untracked files: none before this artifact
- excluded changes: The prior numbered artifacts and `task.md` under `.agents/tasks/i-want-you-help/` were requirements, reviews, fix receipts, and evidence inputs rather than implementation review subjects. All changed non-task paths were inspected.

## Previous Round

- previous artifact: `25-code-review-repository-onboarding.md`; fix receipt: `26-code-review-fixes-repository-onboarding.md`; implementation receipt: `27-implementation-repository-onboarding.md`
- CR-008 Git-config capture follows or crashes on Git-root type changes: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`; artifacts 13-27 supplied prior findings and claimed fixes, which were checked against the complete branch, source, tests, aggregate validation, portable output, and a fresh two-process reproduction
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add an idempotent local-only `/setup-repository` skill, preserve foreign metadata, fail closed on unsafe managed state, support explicit managed reset, and retain terminal-eval evidence for exact allowlist grading and regrading.
- change description quality: Commit subjects separate eval infrastructure, setup behavior, migrations, safety, provider contracts, snapshot repairs, documentation, and task artifacts. The current 52-commit range passes diff whitespace inspection.
- implementation model and review model: implementation model not recorded; review model `openai/gpt-5.6-sol`
- changed-line size and logical cohesion: 5,299 additions and 21 deletions across 59 paths including task history. Non-task changes form one onboarding feature across eval infrastructure, skill instructions, tests, fixtures, runtime build, installation, inventory, documentation, and release metadata.
- resulting large-file concerns: `evals/run.mjs` is 512 lines and coordinates scenario loading, capture, grading, run allocation, and retained regrading. CR-009 concerns its run-allocation boundary, not file size by itself.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: Exact repository allowlists; typed ordinary and excluded-root snapshots; Git index and config privacy; live and retained regrading; setup create, migrate, reset, and privacy semantics; five-runtime installation; provider outcomes; inventory; portable validation; and integration-test isolation through a per-test `SKILLS_EVAL_RESULTS_ROOT`.
- missing or misleading coverage: `tests/evals-git-root-runner.test.mjs` proves two test processes pass when each owns a different results root. It does not run two eval processes against the same selected root, so it cannot prove the runner comment that each concurrent run gets a private run tree.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3296` in / `73` out

### Correctness

- assessment and evidence: CR-001 through CR-008 are fixed on their covered paths. Run naming still truncates ISO timestamps to seconds and accepts an already-existing directory with recursive creation, so concurrent normal runs can share a run tree. CR-009 reproduces the resulting build failure.
- helper coverage: covered, level 3, score 2.97, confidence 0.97

### Readability and Simplicity

- assessment and evidence: Snapshot constructors, provider categories, setup instructions, installer wiring, and scenario checks use direct names and explicit boundaries. The results-root override is documented and resolved once, but the nearby comment promises private concurrent run trees without an exclusive allocation operation.
- helper coverage: covered, level 2, score 2.39, confidence 0.61

### Architecture

- assessment and evidence: Canonical skill ownership, portable installation, terminal/artifact separation, and retained regrading remain intact. Process-level isolation belongs at run-directory allocation; test-only separation of results roots bypasses rather than enforces that production boundary.
- helper coverage: covered, level 3, score 2.75, confidence 0.75

### Security

- assessment and evidence: Git-root capture now uses non-dereferencing classification and does not retain external config bytes. Setup forbids network, provider, and credential operations and redacts secret-shaped managed values. No critical or major security finding remains.
- helper coverage: covered, level 3, score 2.59, confidence 0.59

### Performance

- assessment and evidence: Snapshot work is linear in fixture entries and file bytes and runs only around terminal phases. CR-009 can duplicate work and terminate one concurrent run, but its gate is stability and data integrity rather than throughput; no separate performance finding remains.
- helper coverage: covered, level 3, score 2.57, confidence 0.57

## Verification Story

- command or inspection: Complete `origin/main...HEAD` diff and 52-commit log; all changed non-task files; task, plan, and artifacts 13-27; 42 focused eval tests; `npm test`; portable build and validation; diff whitespace; and a fresh same-root two-process reproduction with a temporary fake `omp`
- result: Focused tests passed 42/42; `npm test` passed 178/178; portable output built and validated 44 skills; `git diff --check origin/main...HEAD` passed. The two-process reproduction started both runners against one temporary `SKILLS_EVAL_RESULTS_ROOT` in the same second: one reported `results/20260920-151234`, while the other aborted with `EEXIST` creating that run's `.dist/skills/agent-codebase-analyzer`.
- manual, screenshot, or before-and-after evidence: Temporary reproduction and generated portable output were removed. No interface screenshot applies.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-009 Same-second eval runs share and corrupt one run tree

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `evals/run.mjs:493-503`
- failure mode: Two ordinary eval invocations using the same results root and starting within one second derive the same `stamp`. Recursive `mkdirSync` treats the first process's directory as valid, so both processes build and write the same supposedly private `.dist`, scenario recordings, reports, and summary. Either process can fail or corrupt retained evidence. Even after unique run allocation, the current `rmSync(latest)` followed by `symlinkSync` remains a remove-create race in which one process can delete or collide with the other process's link.
- evidence or reproduction: A fresh reproduction launched two `node evals/run.mjs setup-repository-basic --keep --max-time 1` processes concurrently with the same temporary `SKILLS_EVAL_RESULTS_ROOT` and fake `omp`. Both selected second `20260920-151234`; one reached the recordings message, while the other aborted with `EEXIST: file already exists, mkdir '<root>/results/20260920-151234/.dist/skills/agent-codebase-analyzer'`. Lines 496-497 explicitly require `.dist` to be private because a concurrent run must not rebuild or change another run's guidance. The integration test now avoids this path by assigning each test process a distinct root.
- fix direction: Reserve each run directory atomically. Keep the readable timestamp but use exclusive non-recursive creation with a collision suffix or a unique `mkdtemp`-style name, then build only inside the directory that process reserved. Replace `latest` through a uniquely named temporary symlink and atomic rename, or another same-root synchronization strategy that cannot fail between unlink and creation. Add an integration regression that launches two runners against one results root in the same second and proves distinct run directories, independent `.dist` trees and summaries, successful retained regrades, and a valid `latest` link.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none. Runtime builders, snapshot helpers, setup references, fixtures, and scenario checks have active consumers.
- dependency findings: no package or lockfile changes. Added behavior uses Node standard-library APIs.

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested setup skill and fixes eight prior concrete defects, but the eval runner still violates its own process-isolation contract under normal same-root concurrency.
- rationale: Setup behavior, snapshot privacy, exact grading, retained regrading, installer and portable consumers, aggregate tests, and prior fixes pass. CR-009 remains major because one normal run can abort or alter another run's supposedly private recordings without unusual input or privileges.

## Review Limits

- blocked or unavailable checks: LSP diagnostics reject the external task worktree because it is outside this session's configured workspace. Node tests, aggregate validation, portable build validation, diff checks, and the direct concurrency reproduction passed.
- residual manual verification: Authenticated provider behavior remains intentionally outside first-release scope. No paid live-model eval was rerun because the defect reproduces before model execution and prior live evidence covers setup behavior.
