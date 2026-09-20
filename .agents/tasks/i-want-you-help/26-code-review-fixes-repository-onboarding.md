---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 25-code-review-repository-onboarding.md
reviewed_head_sha: 6d4c846f033f6922abdd77ac0be23394d151d246
fixed_head_sha: 3b0118081d375c46b3c807319182f0bb8bd6a918
status: complete
summary: "CR-008 is fixed: Git-config capture classifies `.git` with `lstat`, reads config only beneath a real non-symlink directory, and retains no config payload for absent, special, file, or symlink roots. Focused and aggregate tests, Node and Deno checks, portable validation, live setup scenarios, retained regrading, inventory, and commit checks passed; LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains at review base `4458fbf21e199dad45376b8164f78c2165ac1d20`. Review artifact 25 was committed as `ab92cda` after reviewed head `6d4c846`; implementation commits `a651e75` and `3f2eab1`, then documentation commit `3b01180`, repaired CR-008.
- unrelated changes preserved: None.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-008

- disposition: fixed
- evidence: Before edits, a regular-file `.git` made config capture throw `ENOTDIR`, while a `.git` directory symlink returned a file snapshot whose decoded payload was `host-private-config`. `snapshotGitConfig` now classifies `.git` itself with non-dereferencing metadata and returns null unless that entry is a real directory. Config-entry capture remains unchanged beneath real directories, including file bytes, directory shape, valid and dangling symlinks, and FIFO types. The runner persists repository and excluded-root manifests before config capture, reports typed `.git` mutations without calling Git through an unsafe root, and consumes the same records during retained regrade.
- files changed: `evals/lib.mjs`, `evals/run.mjs`, `tests/evals-git-root-safety.test.mjs`, `tests/evals-git-root-runner.test.mjs`, and `docs/testing.md`
- regression check: The root-safety suite covers real directory to absence, regular file, FIFO, valid symlink, dangling symlink, and external-directory symlink states. The runner regression replaces `.git` with a symlink to an external directory containing private config bytes, then proves live and retained-regrade diagnostics, null config payload, persisted manifests, and absence of external bytes.

## Advisory Decisions

None.

## Verification

- command: Pre-fix temporary-repository regular-file and external-directory-symlink reproduction
- result: Reproduced `ENOTDIR` and decoded retained `host-private-config`; temporary output was removed.
- command: Red `node --test tests/evals-git-root-safety.test.mjs`
- result: Two tests passed; regular-file and FIFO roots threw `ENOTDIR`, and the external-directory symlink retained host config bytes.
- command: `node --check evals/lib.mjs && node --check evals/run.mjs && node --check tests/evals-git-root-safety.test.mjs && node --check tests/evals-git-root-runner.test.mjs`
- result: Passed.
- command: `deno check evals/lib.mjs evals/run.mjs tests/evals-git-root-safety.test.mjs tests/evals-git-root-runner.test.mjs`
- result: Passed.
- command: `node --test tests/evals-git-root-safety.test.mjs tests/evals-git-root-runner.test.mjs tests/evals-terminal-phase.test.mjs tests/evals-excluded-roots.test.mjs`
- result: Passed 42 tests, including live and retained-regrade unsafe-root capture.
- command: `npm test`
- result: Passed validation for 44 skills, plugin synchronization for 37 skills and 7 agents, and 178 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills; generated output was removed.
- command: Skill and plugin inventory assertion
- result: Passed with 44 canonical skills, 7 workers, and 37 plugin skills.
- command: `npm run evals -- setup-repository-basic setup-repository-migration setup-repository-safety`
- result: Run `20260920-144839` passed 3/3 live scenarios and all nine terminal phases.
- command: `npm run evals -- setup-repository-basic setup-repository-migration setup-repository-safety --grade 20260920-144839`
- result: Passed 3/3 retained regrades and all nine terminal phases. Retained run output and `latest` were removed.
- command: `node scripts/check-commits.mjs ab92cda..HEAD`
- result: Passed the three implementation and documentation subjects through `3b01180`; the artifact subject is checked after its commit.
- command: `git diff --check`
- result: Passed.
- command: LSP diagnostics for the three changed JavaScript files
- result: Unavailable because the LSP tool rejected paths outside the session working directory. Node, Deno, focused, aggregate, portable, live, retained-regrade, inventory, and commit executable checks passed.

## Remaining Blocks

- None.
