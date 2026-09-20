---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 17-code-review-repository-onboarding.md
reviewed_head_sha: a67feac25870e049a8f5f9ce0a9c944c71bdd76c
fixed_head_sha: b0896c922f113c5be35005b5735f85d99e28a4da
status: complete
summary: "CR-004 is fixed: Git-config snapshots now detect dangling symlink creation and deletion through non-dereferencing metadata while mapping only ENOENT to absence. The two regressions failed before the patch and passed afterward; focused tests, 152 aggregate tests, portable validation for 44 skills, syntax checks, and all 33 commit subjects passed. LSP remained unavailable because the task worktree is outside the session cwd."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review inspected `a67feac25870e049a8f5f9ce0a9c944c71bdd76c`; artifact 17 was then committed as `c198069`, and the CR-004 implementation was committed as `b0896c9`. `origin/main` and the merge base remain `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: No unrelated working-tree changes were present or modified. The fix changes only `evals/lib.mjs` and `tests/evals-terminal-phase.test.mjs`.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-004

- disposition: fixed
- evidence: `snapshotGitConfig` now calls `lstatSync` directly, returns `null` only when the thrown error code is `ENOENT`, and rethrows every other error. Dangling symlinks reach the existing `readlinkSync` record path, which retains only `kind`, link-target text, and its digest without reading target bytes.
- files changed: `evals/lib.mjs`; `tests/evals-terminal-phase.test.mjs`
- regression check: `node --test --test-name-pattern='dangling symlink' tests/evals-terminal-phase.test.mjs` failed both new tests before the source edit because both transitions reported unchanged. The same command passed 2/2 after the edit, and `node --test tests/evals-terminal-phase.test.mjs` passed 16/16 including regular-file, valid-symlink, equal-digest type-transition, broken repository-link, typed-record, and privacy checks.

## Advisory Decisions

None.

## Verification

- command: `node --check evals/lib.mjs && node --check tests/evals-terminal-phase.test.mjs`
- result: Passed with no output.
- command: `node --test tests/evals-terminal-phase.test.mjs`
- result: Passed 16 tests with 0 failures.
- command: `npm test`
- result: Passed validation for 44 skills, plugin synchronization, and 152 tests with 0 failures.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated the portable runtime with 44 skills, 58 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, and 0 banned tokens. Generated `dist/portable` output was removed afterward.
- command: `node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed all 33 committed subjects through implementation commit `b0896c9`.
- command: `lsp_diagnostics` for both changed `.mjs` files
- result: Unavailable because the external task worktree is outside the session cwd; direct Node syntax checks and repository gates passed instead.

## Remaining Blocks

- None.
