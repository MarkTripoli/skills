---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 40-code-review-repository-onboarding.md
reviewed_head_sha: 8803aa98f9f2096e854a65a15f9ceb80f6f114a5
fixed_head_sha: 9587e6ef10a61cb8b700a9ea9523b40ccd94632f
status: complete
summary: "CR-025 is fixed. Retained Git-index manifests now reject non-normalized paths, impossible object-ID lengths, and duplicate path-stage identities; focused, aggregate, portable, static, live, and retained-regrade gates passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 40 used merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` and reviewed HEAD `8803aa98f9f2096e854a65a15f9ceb80f6f114a5`. The merge base is unchanged. Commit `297e91d` records review 40; commit `9587e6e` fixes CR-025.
- unrelated changes preserved: None.

## Finding Dispositions

### CR-025

- disposition: fixed
- evidence: `gitIndexManifestProblem()` applies the existing normalized repository-relative path contract to each index path, accepts only exact 40- or 64-character hexadecimal object IDs, and rejects duplicate `(path, stage)` identities before retained evidence reaches scenario grading.
- files changed: `evals/manifest.mjs`, `tests/evals-manifest.test.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: Unit cases reject traversal, absolute and Windows-absolute paths, 39-, 41-, 63-, and 65-character object IDs, and duplicate identities while accepting distinct stages and both supported object-ID lengths. Equal malformed before/after retained manifests now fail regrading for path, object-ID, and duplicate-identity cases.

## Advisory Decisions

None.

## Verification

- command: `node --test tests/evals-manifest.test.mjs` and `node --test tests/evals-regrade-integrity.test.mjs` before the production edit
- result: Unit validation failed on `../outside`; retained regrade incorrectly returned status 0 for path, 41-character object ID, and duplicate-identity cases.
- command: Same focused suites after the production edit
- result: Passed 6/6 manifest tests and 16/16 retained-regrade tests.
- command: `npm test`
- result: Passed validation, plugin synchronization, and 227/227 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with zero workers.
- command: `node --check` and `deno check --no-lock --node-modules-dir=auto` for the changed module and tests
- result: Passed without output or a generated lockfile.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-read-errors setup-repository-safety --keep --max-time 25` and retained regrade of run `20260920-185733`
- result: Passed all five scenarios live and during retained regrade; all 14 setup safety phases passed in both modes.
- command: `GIT_MASTER=1 git diff --check` and `node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed before the fix commits; final branch checks run after this receipt commit.
- command: LSP diagnostics for the changed JavaScript module and tests
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, and retained-regrade gates passed instead.

## Remaining Blocks

- None.
