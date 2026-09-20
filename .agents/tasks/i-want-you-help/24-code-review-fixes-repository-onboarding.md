---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 23-code-review-repository-onboarding.md
reviewed_head_sha: 5d08738d3625c147dde57ef721bd281f3e821aad
fixed_head_sha: 31b73c72e8f84b31f9d4388d613308bf06d35125
status: complete
summary: "CR-007 is fixed: ordinary `.git/index` files retain stable type evidence while volatile bytes are omitted, and every lifecycle, kind, link-target, directory-descendant, and special-entry change remains graded. Focused and aggregate tests, portable validation, all three live setup scenarios, retained regrading, Deno checks, and 44 commit subjects passed; LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains at review base `4458fbf21e199dad45376b8164f78c2165ac1d20`. Review artifact 23 was committed as `91a5444` after reviewed head `5d08738`; implementation commit `319afa5` and documentation commit `31b73c7` then repaired CR-007.
- unrelated changes preserved: None.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-007

- disposition: fixed
- evidence: Before edits, replacing an ordinary `.git/index` file with `.git/index/payload` produced `beforeIndex: null`, `afterIndex: null`, `afterPayload: null`, and `changedPaths: []`. `snapshotNamedRoot` now accepts exact paths whose ordinary-file contents are omitted; those files retain `{ "kind": "file" }`, while absence, directories and descendants, symlinks and link targets, and special entries continue through existing typed capture. The live `.git` spec excludes only independently graded `.git/config` and applies content omission only to ordinary `.git/index` files. Symlinks remain non-dereferenced and FIFO payloads remain unopened.
- files changed: `evals/lib.mjs`, `evals/run.mjs`, `tests/evals-excluded-roots.test.mjs`, and `docs/testing.md`
- regression check: The focused suite proves ordinary index byte churn is the sole no-op and detects file-to/from absence, directory with descendants, valid symlink, dangling symlink, and FIFO transitions. Run `20260920-141911` passed all nine live terminal phases and retained regrading; retained manifests were unchanged in 9/9 phases, with type-only ordinary index records and independently absent Git-config records.

## Advisory Decisions

None.

## Verification

- command: Pre-fix temporary-repository ordinary-file to directory reproduction
- result: Reproduced CR-007 with no retained index records or changed paths; temporary output was removed.
- command: Red `node --test tests/evals-excluded-roots.test.mjs`
- result: Seven tests passed and the ordinary-index-content test failed because snapshots still retained volatile bytes and digests instead of only file kind.
- command: `node --check evals/lib.mjs && node --check evals/run.mjs`
- result: Passed.
- command: `deno check evals/lib.mjs evals/run.mjs tests/evals-excluded-roots.test.mjs tests/evals-terminal-phase.test.mjs`
- result: Passed.
- command: `node --test tests/evals-terminal-phase.test.mjs tests/evals-excluded-roots.test.mjs`
- result: Passed 36 tests.
- command: `npm test`
- result: Passed validation for 44 skills, plugin synchronization for 37 skills and 7 agents, and 172 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills; generated output was removed.
- command: `npm run evals -- setup-repository-basic setup-repository-migration setup-repository-safety --keep --max-time 8`
- result: Run `20260920-141911` passed 3/3 live scenarios and all nine terminal phases without an index false positive.
- command: `npm run evals -- setup-repository-basic setup-repository-migration setup-repository-safety --grade 20260920-141911`
- result: Passed 3/3 retained regrades and all nine terminal phases. Manifest inspection confirmed unchanged excluded roots and type-only ordinary index records in 9/9 phases. Retained run output, `latest`, and temporary repositories were removed.
- command: `node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed 44 subjects through `31b73c7`.
- command: `git diff --check origin/main...HEAD`
- result: Passed.
- command: LSP diagnostics for the three changed JavaScript files
- result: Unavailable because the LSP tool rejected paths outside the session working directory. Node, Deno, focused, aggregate, portable, live, retained-regrade, and commit executable checks passed.

## Remaining Blocks

- None.
