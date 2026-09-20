---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 21-code-review-repository-onboarding.md
reviewed_head_sha: d2c8502e681b21bd9e9a12c55737e6d09f5fd782
fixed_head_sha: 4f42de2082b4f5f7aedfb7a7e2f3467576719f44
status: complete
summary: "CR-006 is fixed with retained typed snapshots for root `.agents`, `.omp`, and `.git` state in live grading and regrading. Focused tests, 168 aggregate tests, portable validation, all three live setup scenarios, retained regrading, Deno checks, and 40 commit subjects passed; LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review artifact 21 was committed as `13b2590` after its reviewed head `d2c8502`; no implementation changed before this repair. The fix adds `1d78b9b` and documentation adds `4f42de2`.
- unrelated changes preserved: None.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-006

- disposition: fixed
- evidence: Before source edits, a temporary repository created ignored `.agents/ignored.txt`, ignored `.omp/ignored.txt`, and `.git/hooks/outside-config`; `snapshotRepository` returned `changedPaths: []` and `git status --porcelain -- .agents .omp` returned an empty string. `snapshotNamedRoot` now records a named root and every descendant as the existing typed file, directory, symlink, or special-entry record without following symlinks or opening special payloads. `runScenario` writes `excluded-roots-before.json` and `excluded-roots-after.json` after overlays and prompt preparation, brackets OMP directly, and passes the same three-root diff into `commonChecks`; `gradeScenario` loads those manifests and applies the same check. Ordinary repository manifests and `allowedChangedPaths` still exclude all three roots.
- files changed: `evals/lib.mjs`, `evals/run.mjs`, `tests/evals-excluded-roots.test.mjs`, and `docs/testing.md`
- regression check: `node --test tests/evals-terminal-phase.test.mjs tests/evals-excluded-roots.test.mjs` passed 32 tests covering tracked deletion, untracked and ignored creation, root exclusion from ordinary `changedPaths`, file/directory/symlink/FIFO transitions, dangling and valid symlink records, `.git/hooks/outside-config`, retained JSON round trips, and legacy no-`kind` records. All nine live terminal phases and their retained regrade passed with `.agents`, `.git`, and `.omp` manifests present and unchanged.

The `.git` excluded-root manifest omits two exact paths. `.git/config` keeps its independent typed before/after snapshot and diagnostic. A temporary repository proved read-only `git rev-parse`, `git status --porcelain`, and `git diff --name-only` changed `.git/index` bytes from SHA-256 `02b28837807488701c8588d1e0f0259f7c49ed004822988bcaecd3f983fc7d96` to `40102e4c7610342da68979cf162c9cddd448679e9218d856ca0d03c35162327b`; the runner therefore excludes only `.git/index` as demonstrated harness volatility. Every other Git-internal path remains exact-byte graded.

## Advisory Decisions

None.

## Verification

- command: Pre-fix temporary-repository reproduction for ignored `.agents`/`.omp` files and `.git/hooks/outside-config`
- result: Reproduced the blind boundary with empty repository `changedPaths` and empty Git status output before implementation.
- command: Temporary-repository `.git/index` read-only Git-command probe
- result: Index bytes and mtime changed, establishing the documented exact-path volatility exclusion.
- command: `node --check evals/lib.mjs && node --check evals/run.mjs`
- result: Passed.
- command: `deno check evals/lib.mjs evals/run.mjs tests/evals-excluded-roots.test.mjs tests/evals-terminal-phase.test.mjs`
- result: Passed.
- command: `node --test tests/evals-terminal-phase.test.mjs tests/evals-excluded-roots.test.mjs`
- result: Passed 32 tests.
- command: `npm test`
- result: Passed validation for 44 skills, plugin synchronization for 37 skills and 7 agents, and 168 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills. Generated output was removed after validation.
- command: `npm run evals -- setup-repository-basic setup-repository-migration setup-repository-safety --max-time 8`
- result: Passed 3 of 3 live scenarios and all 9 terminal phases under run `20260920-135332`; no excluded-root false positive occurred.
- command: `npm run evals -- setup-repository-basic setup-repository-migration setup-repository-safety --grade 20260920-135332`
- result: Passed 3 of 3 retained regrades and all 9 terminal phases. A follow-up manifest inspection found all three named roots in every phase and no change. The retained run and `latest` link were removed after recording this evidence.
- command: `node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed 40 subjects through `4f42de2`.
- command: `git diff --check origin/main...HEAD`
- result: Passed.
- command: LSP diagnostics for the three changed JavaScript files
- result: Unavailable because the LSP tool rejected paths outside the session working directory; artifact 21 records the same external-worktree limitation. Node, Deno, focused, aggregate, portable, live, and regrade executable checks passed.

## Remaining Blocks

- None.
