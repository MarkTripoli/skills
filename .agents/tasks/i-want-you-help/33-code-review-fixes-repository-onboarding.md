---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 32-code-review-repository-onboarding.md
reviewed_head_sha: 236b5017b68d425c32503441e5ea33f129402a85
fixed_head_sha: 30f5382415491e06ec2380f5acd6a5674283fc4d
status: complete
summary: "CR-012, CR-013, and CR-014 are fixed. Invalid-JSON leakage now fails offline, `latest` publishes only complete runs while incomplete explicit grading fails, and retained live evidence covers unresolved inference, schema-1 revision-0 migration, and invalid managed-version type preservation. Focused, repeated concurrency, live, retained-regrade, aggregate, portable, Node, Deno, inventory, diff, and commit gates passed; LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 32 used merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` and reviewed HEAD `236b5017b68d425c32503441e5ea33f129402a85`. Commit `e4d87aa` added review artifact 32; commits `d506a0f`, `88bdccf`, `2781d55`, and `30f5382` address its three findings.
- unrelated changes preserved: None.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-012

- disposition: fixed
- evidence: The safety scenario now has separate `invalidJsonSentinel` and `managedSecretSentinel` constants matching their fixtures. The offline scenario-check test invokes the invalid-JSON phase with retained-style repository manifests and an otherwise valid answer containing `phase-three-secret-value`; it failed before the fix with zero problems and now returns the source-redaction failure.
- files changed: `evals/scenarios/setup-repository-safety.mjs`, `tests/evals-terminal-phase.test.mjs`
- regression check: `node --test --test-name-pattern="invalid JSON phase rejects leaked source sentinel" tests/evals-terminal-phase.test.mjs` passed 1/1 after reproducing the false green.

### CR-013

- disposition: fixed
- evidence: A run now writes every scenario report and `summary.json` before atomically replacing `latest` through its process-owned temporary symlink. Regrading a selected scenario directory with a missing `answer.md` records a failed incomplete phase instead of breaking with an empty green result. The delayed fake OMP regression proves `latest` continues to resolve the prior complete run, explicit active-directory grading is non-green, run allocation remains exclusive under one root, and post-completion `latest` contains both summary and report.
- files changed: `evals/run.mjs`, `tests/evals-concurrent-runner.test.mjs`
- regression check: The named active-run regression passed three consecutive runs, then both concurrency tests passed together and in the aggregate suite.

### CR-014

- disposition: fixed
- evidence: `setup-repository-unresolved` runs with no configured remote and requires the exact onboarding-only document, both provider choices unresolved, and zero operations. Migration phases overlay schema 1/revision 0, deep-compare foreign top-level state, require the exact current onboarding subtree, and prove the rerun byte-stable. The safety scenario overlays a string `schemaVersion`, requires exact unchanged bytes and zero paths, the managed JSON path and invalid-type conflict, no write, unchanged-byte verification, and zero operations. Each independent case supplies its own overlay before execution.
- files changed: `evals/scenarios/setup-repository-unresolved.mjs`, `evals/scenarios/setup-repository-migration.mjs`, `evals/scenarios/setup-repository-safety.mjs`, `evals/fixtures/setup-repository-migration-revision-zero/ai-utilities.json`, `evals/fixtures/setup-repository-safety/invalid-version/ai-utilities.json`, `docs/testing.md`
- regression check: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-safety --keep` passed 4/4 scenarios and 15/15 terminal phases in retained run `20260920-160743`; grading that run again passed all 15 phases.

## Advisory Decisions

None.

## Verification

- command: `node --test tests/setup-repository-contract.test.mjs tests/evals-terminal-phase.test.mjs tests/evals-concurrent-runner.test.mjs`
- result: Passed 36/36 focused tests.
- command: Three consecutive runs of `node --test --test-name-pattern="latest excludes active runs and explicit incomplete grading fails" tests/evals-concurrent-runner.test.mjs`
- result: Passed 1/1 each time without timing sleeps or shared-root collisions.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-safety --keep`
- result: Passed 4/4 scenarios and 15/15 terminal phases; retained run `evals/results/20260920-160743/`.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-safety --grade 20260920-160743`
- result: Passed 4/4 retained scenarios and all 15 recorded phases.
- command: `npm test`
- result: Passed validation, plugin sync, and 182/182 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with zero workers; generated `dist/` was removed afterward.
- command: `node --check` for the runner, three changed scenarios, and two changed tests
- result: Passed all Node syntax checks.
- command: `deno check --node-modules-dir=auto` for the runner, three changed scenarios, and two changed tests
- result: Passed all Deno checks; generated `deno.lock` was removed afterward.
- command: Static 44-skill, 7-agent, 37-plugin inventory assertion
- result: Passed.
- command: `GIT_MASTER=1 git diff --check && GIT_MASTER=1 node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed whitespace validation and all 65 implementation-history commit subjects before the receipt commit.
- command: LSP diagnostics for six changed JavaScript modules
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, and retained-regrade gates passed.

## Remaining Blocks

- None.
