---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 34-code-review-repository-onboarding.md
reviewed_head_sha: 85e3fc3
fixed_head_sha: d9b79ad32daa231816b0a186f617abf43d24be5f
status: complete
summary: "CR-015 and CR-016 are fixed. Regrading now requires valid run-completion evidence and fails damaged terminal recordings, while live and retained grading compare stable semantic Git-index manifests that detect persistent flags without reacting to stat-cache refreshes. Repeated focused, live, retained-regrade, aggregate, portable, Node, Deno, inventory, diff, and commit gates passed; LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 34 used merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` and reviewed HEAD `85e3fc3`. Commit `d702fac` added review artifact 34; commits `34fe1a2`, `555cea4`, and `d9b79ad` address its findings and documentation.
- unrelated changes preserved: None.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-015

- disposition: fixed
- evidence: `summary.json` is now the run-completion authority. Regrading rejects absent, invalid, empty, duplicate, incomplete, or report-mismatched completion metadata and selected scenarios absent from the completed run. Missing or invalid required terminal manifests produce failed incomplete phases instead of skipped results. Intentional scenario subsets remain valid when the completed summary contains them.
- files changed: `evals/run.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: Both regressions failed against the reviewed implementation with exit status 0, then passed three consecutive combined runs. The active multi-scenario case grades a completed selected scenario while another scenario remains blocked and `summary.json` is absent. The damaged-run case removes `repository-after.json` from a completed recording and requires nonzero with an incomplete-evidence diagnostic.

### CR-016

- disposition: fixed
- evidence: `evals/git-index.mjs` captures tracked path, stage, mode, object identity, and assume-unchanged, skip-worktree, and representable intent-to-add flags from NUL-delimited Git plumbing output. It excludes volatile stat-cache fields and file payloads. Terminal phases persist `git-index-before.json` and `git-index-after.json`; live and retained grading reject semantic differences. Git-root replacement records a null after-state without invoking Git through an unsafe root.
- files changed: `evals/git-index.mjs`, `evals/run.mjs`, `tests/evals-git-index.test.mjs`, `tests/evals-git-index-runner.test.mjs`
- regression check: The initial assume-unchanged regression failed because the snapshot exports did not exist. Unit checks now detect `git update-index --assume-unchanged README.md`, retain skip-worktree and intent-to-add, and remain byte-stable across read-only `git status` and `git diff`. The runner integration retains the before/after semantic manifests and fails both live and retained grading.

## Advisory Decisions

None.

## Verification

- command: Three consecutive runs of `node --test tests/evals-regrade-integrity.test.mjs tests/evals-git-index.test.mjs`
- result: Passed 5/5 tests in every run without timing sleeps or shared-root collisions.
- command: `node --test tests/setup-repository-contract.test.mjs tests/evals-terminal-phase.test.mjs tests/evals-concurrent-runner.test.mjs tests/evals-git-root-runner.test.mjs tests/evals-git-index-runner.test.mjs tests/evals-regrade-integrity.test.mjs tests/evals-git-index.test.mjs`
- result: Passed 43/43 focused tests before the semantic snapshot extraction; the post-extraction focused suite passed 6/6 and the CR-016 runner/root suite passed 5/5.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-safety --keep`
- result: Passed 4/4 scenarios and all 15 terminal phases in retained run `evals/results/20260920-163706/`.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-safety --grade 20260920-163706`
- result: Passed 4/4 retained scenarios and all 15 recorded phases.
- command: `npm test`
- result: Passed validation, plugin sync, and 188/188 tests after the final code structure.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with zero workers; generated `dist/` was removed afterward.
- command: `node --check` and `deno check --no-lock --node-modules-dir=auto` for the changed runner, snapshot module, library, and tests
- result: Passed all Node and Deno checks without generating `deno.lock`.
- command: Static 44-skill, 7-agent, 37-plugin inventory assertion
- result: Passed.
- command: `GIT_MASTER=1 git diff --check && GIT_MASTER=1 node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed whitespace validation and all 70 implementation-history commit subjects before the receipt commit.
- command: LSP diagnostics for changed JavaScript modules
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, and retained-regrade gates passed.

## Remaining Blocks

- None.
