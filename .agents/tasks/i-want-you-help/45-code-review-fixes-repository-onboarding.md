---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 44-code-review-repository-onboarding.md
reviewed_head_sha: 4976917ba7d31cbe80d126c473b8932fbe1bc781
fixed_head_sha: 5552f25de78894764426c7ebb0851de93085c9d9
status: complete
summary: "CR-029 through CR-031 are fixed. Semantic index capture disables repository-local command helpers, retained regrading rejects every symlink or special entry before reads, and all manifest paths reject NUL; focused, aggregate, portable, static, live, and retained gates passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 44 used merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` and reviewed HEAD `4976917ba7d31cbe80d126c473b8932fbe1bc781`. The merge base is unchanged. Commits `c3f3668`, `d4c0473`, and `5552f25` address its findings.
- unrelated changes preserved: None.

## Finding Dispositions

### CR-029

- disposition: fixed
- evidence: Semantic index commands override local `core.fsmonitor` and `core.hooksPath`; diff probes pass `--no-ext-diff`.
- files changed: `evals/git-index.mjs`, `tests/evals-git-index.test.mjs`
- regression check: A repository-local fsmonitor script no longer executes during `snapshotGitIndex()`.

### CR-030

- disposition: fixed
- evidence: `retainedTreeProblem()` recursively lstat-validates the canonical completed-run tree before `summary.json` or any other retained input is read. Only regular files and directories are accepted.
- files changed: `evals/run.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: Symlinked summary, pinned `.dist`, report, phase directory, answer, status, manifest, and task copy all fail before phase grading.

### CR-031

- disposition: fixed
- evidence: The shared normalized relative-path parser rejects NUL before repository, excluded-root, or Git-index records enter retained grading.
- files changed: `evals/manifest.mjs`, `tests/evals-manifest.test.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: Unit and equal-before/after retained-regrade cases reject repository and excluded-root NUL paths.

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: Current retained checks consume persisted manifests rather than mutable reconstructed fixture state. Exact prepared-source persistence belongs with a future check that needs it.

## Verification

- command: Focused red tests for local fsmonitor execution, retained input symlinks, and repository/excluded-root NUL paths
- result: Regressions failed against reviewed code for their intended reasons.
- command: Focused Git-index, manifest, and retained-regrade suites
- result: Passed 47 focused checks.
- command: `npm test`
- result: Passed validation, plugin synchronization, and 247/247 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with zero workers.
- command: `node --check` and `deno check --no-lock --node-modules-dir=auto` for changed eval modules
- result: Passed without output or generated lockfile.
- command: Retained regrade of five-scenario run `20260920-205454`
- result: Passed 5/5 scenarios, including all 14 safety phases.
- command: Fresh live and retained `setup-repository-basic` run `20260920-212053`
- result: Passed both phases live and during retained regrade.
- command: `node scripts/check-commits.mjs origin/main..HEAD` and `GIT_MASTER=1 git diff --check`
- result: Passed 98 commit subjects and diff whitespace checks.
- command: LSP diagnostics
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path; Node, Deno, focused, aggregate, portable, live, and retained gates passed instead.

## Remaining Blocks

- None.
