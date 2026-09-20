---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 28-code-review-repository-onboarding.md
reviewed_head_sha: 7a00fd81bee17ca78cfb2a191f8491d8ce9c64ae
fixed_head_sha: 6bed284180ab57d74eb8af1af2c9cc98caa55db8
status: complete
summary: "CR-009 is fixed by exclusive same-second run-directory reservation and atomic `latest` replacement. A deterministic two-process regression proves separate `.dist`, recording, report, and summary trees, retained regrading for both runs, and a complete `latest` target. Focused repetitions, 179 offline tests, Node and Deno checks, portable validation, and diff checks passed; LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The `origin/main` merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`. Commit `2239d80` added review artifact 28 after reviewed HEAD `7a00fd81bee17ca78cfb2a191f8491d8ce9c64ae`; implementation commit `13e495e` and documentation commit `6bed284` address CR-009.
- unrelated changes preserved: None.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-009

- disposition: fixed
- evidence: Before edits, two concurrent runners fixed to one timestamp and results root produced one run directory; one process crashed with `EEXIST` while creating the shared `.dist/skills/agent-codebase-analyzer`. `evals/run.mjs` now reserves the timestamp or a numeric-suffix candidate through exclusive non-recursive `mkdirSync`, uses the successful filesystem creation as ownership authority, and atomically renames a random process-owned temporary symlink over `latest`. The failure cleanup removes only that invocation's temporary link.
- files changed: `evals/run.mjs`, `tests/evals-concurrent-runner.test.mjs`, `docs/testing.md`
- regression check: `tests/evals-concurrent-runner.test.mjs` fixes both child clocks to the same second, launches both runners against one temporary `SKILLS_EVAL_RESULTS_ROOT`, and verifies their expected scenario-failure exits come from grading rather than infrastructure. It asserts distinct run directories and `.dist` inodes, complete independent recordings/reports/summaries, matching retained-regrade verdicts, and a valid `latest` symlink to one complete run. Reverting the allocation fix produces one directory instead of two.

## Advisory Decisions

None.

## Verification

- command: Pre-edit two-process reproduction with shared `SKILLS_EVAL_RESULTS_ROOT`, fixed fake `omp`, and same-second startup
- result: Reproduced `EEXIST` in the shared run's `.dist/skills/agent-codebase-analyzer`; the sibling reached scenario grading.
- command: `node --test tests/evals-concurrent-runner.test.mjs` before the production edit
- result: Failed at the distinct-run assertion with one directory instead of two.
- command: `for i in 1 2 3 4 5; do node --test tests/evals-concurrent-runner.test.mjs || exit 1; done`
- result: Passed 5/5 repeated same-root two-process runs; every invocation also regraded both retained runs.
- command: `node --test tests/evals-concurrent-runner.test.mjs tests/evals-git-root-runner.test.mjs tests/setup-repository-contract.test.mjs`
- result: Passed 7/7 focused tests.
- command: `node --check evals/run.mjs && node --check tests/evals-concurrent-runner.test.mjs && deno check evals/run.mjs tests/evals-concurrent-runner.test.mjs`
- result: Passed Node syntax and Deno static checks.
- command: `npm test`
- result: Passed validation, plugin sync, and 179/179 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills; generated output was removed afterward.
- command: `git diff --check`
- result: Passed.
- command: LSP diagnostics for `evals/run.mjs` and `tests/evals-concurrent-runner.test.mjs`
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path. Node, Deno, focused, aggregate, and portable gates passed.

## Remaining Blocks

- None.
