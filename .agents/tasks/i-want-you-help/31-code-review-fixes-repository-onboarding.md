---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 30-code-review-repository-onboarding.md
reviewed_head_sha: 85146fb40bf0adb614fc2844b7325dbdbc940c14
fixed_head_sha: 13baae1153f405772db3415149bd7369cc514d79
status: complete
summary: "CR-010 is fixed with two retained-grade terminal phases proving secret-shaped managed-key redaction and newer-schema reset blocking; the existing instructions passed both without changes. CR-011 is fixed by routing installer portable trees through `buildPortable()` and comparing every selected path and file byte against the CLI builder. Focused, live, retained-regrade, aggregate, portable, Node, Deno, diff, and commit gates passed; LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review used merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` and reviewed HEAD `85146fb40bf0adb614fc2844b7325dbdbc940c14`. Commit `9ae670c` added review artifact 30; commits `bea25f8` and `13baae1` address CR-010 and CR-011.
- unrelated changes preserved: None.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-010

- disposition: fixed
- evidence: The safety scenario now overlays valid JSON containing nested `onboarding.providers.github.repository-labels.configuration.api_key` with the non-secret sentinel `non-secret-test-sentinel`. Its terminal check requires exact repository bytes, zero changed paths, a secret-key conflict class and full managed JSON path, `Written: none`, unchanged-byte verification, `External operations: 0`, and absence of the sentinel from the answer. A separate exact `reset-managed` phase reapplies the schema-2 fixture and requires unchanged bytes, supported 1/observed 2 evidence, no write, and zero operations. Every later mutating phase supplies its own overlay, preventing state leakage.
- files changed: `evals/fixtures/setup-repository-safety/secret-shaped-managed-key/ai-utilities.json`, `evals/scenarios/setup-repository-safety.mjs`
- regression check: `npm run evals -- setup-repository-safety --keep` passed 7/7 phases with the existing skill instructions. `node evals/run.mjs --grade 20260920-153712` passed the retained 7-phase recording. No instruction edit was required.

### CR-011

- disposition: fixed
- evidence: `buildTrees()` now calls exported `buildPortable(dest, { skillNames: planned.names })`; the independent canonical-copy branch is removed. The recursive parity regression builds two selected skills through the CLI builder and installer entry point, then compares every directory path, file path, and file byte. It also proves the selected set is exact and no worker tree exists. Existing installer tests continue to prove foreign sibling preservation, scoped uninstall ownership, dependency selection, and portable installation behavior.
- files changed: `scripts/install.mjs`, `tests/install.test.mjs`, `tests/portable-build-parity.test.mjs`
- regression check: Before the production edit, `node --test tests/portable-build-parity.test.mjs` failed because installer `SKILL.md` bytes lacked `Runtime: Portable.`. After the edit, `node --test tests/portable-build-parity.test.mjs tests/install.test.mjs` passed 15/15 tests.

## Advisory Decisions

None.

## Verification

- command: `node --test tests/setup-repository-contract.test.mjs tests/evals-terminal-phase.test.mjs tests/install.test.mjs tests/portable-build-parity.test.mjs`
- result: Passed 48/48 focused tests.
- command: `npm run evals -- setup-repository-safety --keep`
- result: Passed 1/1 scenario and all 7 terminal phases; both new fail-closed phases passed without instruction changes.
- command: `node evals/run.mjs --grade 20260920-153712`
- result: Passed 1/1 retained scenario and all 7 recorded phases.
- command: `npm test`
- result: Passed validation, plugin sync, and 180/180 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with zero workers; generated output was removed afterward.
- command: `node --check evals/scenarios/setup-repository-safety.mjs && node --check scripts/install.mjs && node --check tests/install.test.mjs && node --check tests/portable-build-parity.test.mjs`
- result: Passed Node syntax checks.
- command: `deno check --node-modules-dir=auto evals/scenarios/setup-repository-safety.mjs scripts/install.mjs tests/install.test.mjs tests/portable-build-parity.test.mjs`
- result: Passed Deno static checks. The first check without automatic npm materialization reported missing `@types/node`; the successful command materialized it transiently, and the generated lockfile was removed.
- command: `GIT_MASTER=1 node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed all 59 commit subjects before this artifact commit.
- command: `git diff --check`
- result: Passed.
- command: LSP diagnostics for the three changed JavaScript modules
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, and retained-regrade gates passed.

## Remaining Blocks

- None.
