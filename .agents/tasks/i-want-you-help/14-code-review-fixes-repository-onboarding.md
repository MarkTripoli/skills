---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 13-code-review-repository-onboarding.md
reviewed_head_sha: f8ad9bebe0bc18a124275293d599d75bcb99b31d
fixed_head_sha: f6dc65fc75ff608a2df6385645d4f3c166374883
status: complete
summary: "CR-001 and CR-002 are fixed. Focused tests, 146 aggregate tests, Node and Deno checks, portable build validation, and 27 commit-subject checks passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`. Commit `17fa170` added review artifact 13 after reviewed head `f8ad9be`; fix commits `c1e48de` and `f6dc65f` then changed only the reviewed eval boundary, its tests, and testing documentation.
- unrelated changes preserved: None were present. `git status --short --branch` was clean before the fixes.

## Finding Dispositions

### CR-001

- disposition: fixed
- evidence: The nested reserved-directory reproduction first failed with `changedPaths: []`. The local Git-config regression first failed because no separate config snapshot API existed. Root-only exclusions now retain `nested/.agents/**` and `nested/.omp/**` in repository manifests, while live root `.agents` and `.omp` checks remain unchanged. Terminal phases retain and compare separate `git-config-before.json` and `git-config-after.json` snapshots during live grading and regrading; `.git/**` remains absent from repository manifests.
- files changed: `evals/lib.mjs`, `evals/run.mjs`, `tests/evals-terminal-phase.test.mjs`, `docs/testing.md`
- regression check: `node --test --test-name-pattern='local Git configuration snapshots|nested directories named after harness paths|byte-stable no-op and exclude harness paths' tests/evals-terminal-phase.test.mjs` passed 3 tests after the failing runs.

### CR-002

- disposition: fixed
- evidence: The original file-link reproduction copied host bytes and the directory-link reproduction raised `EISDIR`. The focused file-link test failed before implementation because retained metadata lacked `linkTarget`. Repository snapshots now use `lstatSync` and `readlinkSync`; file and directory links retain only target text plus its digest, ordinary-file entries keep the existing `bytes` and `sha256` shape, and changed targets produce a modified path.
- files changed: `evals/lib.mjs`, `tests/evals-terminal-phase.test.mjs`
- regression check: `node --test --test-name-pattern='directory-link targets|changed link targets|file-link targets' tests/evals-terminal-phase.test.mjs` passed 3 tests.

## Advisory Decisions

None.

## Verification

- command: `node --check evals/lib.mjs && node --check evals/run.mjs && node --check tests/evals-terminal-phase.test.mjs`
- result: Passed with no syntax errors.
- command: `deno check evals/lib.mjs evals/run.mjs tests/evals-terminal-phase.test.mjs`
- result: Passed with no diagnostics.
- command: `node --test tests/evals-terminal-phase.test.mjs`
- result: Passed 10 tests.
- command: `npm test`
- result: Passed validation, plugin synchronization, and 146 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with 0 banned tokens.
- command: `node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed 27 commit subjects through `f6dc65f`.

## Remaining Blocks

- None.
