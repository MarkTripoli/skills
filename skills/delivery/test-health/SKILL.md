---
name: test-health
description: Report opt-in changed-code coverage and bounded, explicitly selected mutation evidence without treating either as correctness.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Test Health

This is optional evidence. It is not a CI gate and does not run during ordinary verification. Coverage percentage is not a correctness score. Missing or incomplete tools/data remain `unknown` or `incomplete`, never green.

## Run

From the repository root, provide LCOV data from existing test tooling and a baseline revision. LCOV files supplied alone can be parsed for defects but cannot substantiate a measured percentage or delta: LCOV carries no source-revision or test-execution lineage. For a measured comparison, use two clean, separate Git worktrees pinned to HEAD and the merge base of `--base` and HEAD. Provide fresh, absent output paths and direct Node `--test` argv commands whose passing test suites write LCOV to the `TEST_HEALTH_LCOV_PATH` environment variable. Other runners currently remain unverified rather than producing measured coverage:

```sh
node <installed-skills-dir>/test-health/scripts/test-health.mjs --base <merge-base> \
  --coverage <fresh-current.info> --current-command '["node","--test","tests/coverage.test.mjs"]' \
  --baseline-root <baseline-worktree> --baseline-coverage <fresh-baseline.info> \
  --baseline-command '["node","--test","tests/coverage.test.mjs"]'
```

`--coverage` and `--baseline-coverage` remain optional for inspecting supplied LCOV; without matching in-process executions, percentages and delta are `unknown`, not measured. The script rejects pre-existing output paths, failed commands, untracked or changed tracked source, a baseline worktree at the wrong revision, and missing or reused output paths. It requires a completed nonempty Node test-runner summary, and records the executed argv, Git revision, and SHA-256 of each newly produced LCOV file. A supplied path that cannot be read is incomplete, including a directory path. The report uses `git diff <base>...HEAD` to select changed source files; the current percentage covers added executable lines, while a percentage-point delta uses only executable lines surviving unchanged on both revisions and is unknown without a common cohort. For renamed files, current coverage uses the new path and baseline coverage maps the Git rename's old path to that new path. Duplicate LCOV source, `DA`, or `BRDA` records are incomplete rather than silently replacing earlier counters. `LF`/`LH` and `BRF`/`BRH` summaries are checked against detailed counters; disagreement is incomplete. A changed file absent from an LCOV input is incomplete; missing data is unknown. Uncovered LCOV branch counters, including unknown `-` hit counts, are listed by file and branch identity. LCOV does not identify source-level branch expressions reliably, so correlate those identities with source when reporting uncovered changed branches.

Mutation analysis is opt-in and requires every mutation target to be explicitly selected from changed files:

```sh
node <installed-skills-dir>/test-health/scripts/test-health.mjs --base <merge-base> --mutate --file path/to/changed.py
```

No mutation adapter currently meets the contract of restricting both targets and result identities to the explicitly selected files and this invocation. When `--mutate` is requested, the script records `unknown` rather than invoking an unbounded or cache-contaminated `mutmut` run; installed-tool version provenance is recorded when available. No installation is attempted. Deleted files cannot be selected. Survivors are never inferred from generic command output or treated as correctness.

## Report contract

JSON schema version 1 reports repository path, HEAD revision, base revision, changed, deleted, and renamed source file lists, coverage status and reason, input paths, independently executed run command/revision/LCOV digest when available, invalid records, baseline/current percentages and percentage-point delta only for verified in-process executions, line totals and uncovered branch identities, mutation status, selected-file/tool provenance, survivors and skipped reasons. Status values are `available`, `unknown`, `incomplete`, or `not-requested`. An unavailable baseline or current report prevents a delta; it never produces a zero or a pass. This evidence supplements the verification record and existing tests; it does not replace them.
