---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 15-code-review-repository-onboarding.md
reviewed_head_sha: 2d375b49ac92b3de3bc77d6f28cdf84f3d5a229e
fixed_head_sha: 563058dbfaaa254174042643bbceee1b4d5cd7ec
status: complete
summary: "CR-003 is fixed. Repository and local Git-config snapshots now retain explicit file kinds and compare complete records, while four regressions cover equal-digest regular-file-to-symlink and symlink-to-regular-file transitions. Focused tests, 150 aggregate tests, portable validation, and commit-subject validation passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review covered implementation HEAD `2d375b49ac92b3de3bc77d6f28cdf84f3d5a229e`; commit `f9bd01a` added only review artifact 15 before fix commit `563058d`. The `origin/main` merge target remained unchanged.
- unrelated changes preserved: None were present or modified.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-003

- disposition: fixed
- evidence: Before production edits, `node --test tests/evals-terminal-phase.test.mjs` failed all four new transition tests: repository transitions returned no modified path, and Git-config transitions returned `false`. Snapshot records now include `kind: "file"` or `kind: "symlink"`; `diffRepositorySnapshots` and `gitConfigChanged` compare complete records with `isDeepStrictEqual`. File records retain `bytes` and `sha256`; symlink records retain `linkTarget` and `sha256`. Capture still uses `lstatSync` and `readlinkSync`, so links are not dereferenced and broken repository links remain safe.
- files changed: `evals/lib.mjs`; `tests/evals-terminal-phase.test.mjs`
- regression check: `node --test tests/evals-terminal-phase.test.mjs` passed 14 tests, including both transition directions at repository and `.git/config` seams with identical file-byte and link-target digests.

## Advisory Decisions

None.

## Verification

- command: `node --check evals/lib.mjs && node --check evals/run.mjs && node --check tests/evals-terminal-phase.test.mjs`
- result: Passed with no syntax errors.
- command: `node --test tests/evals-terminal-phase.test.mjs`
- result: Passed 14 tests, 0 failed.
- command: `npm test`
- result: Passed repository validation for 44 skills, plugin sync, and 150 tests with 0 failures.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with 0 banned tokens.
- command: `node scripts/check-commits.mjs --title "fix(evals): detect snapshot entry type changes"`
- result: Passed 1 subject before implementation commit `563058d`.

## Remaining Blocks

- None.
