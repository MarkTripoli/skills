---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 19-code-review-repository-onboarding.md
reviewed_head_sha: bdd43b813827ae88fa1172bf3f27b29459e25aae
fixed_head_sha: 27973fe
status: complete
summary: "CR-005 is fixed. Repository and Git-config snapshots now retain typed directory and bounded special-entry records without opening special payloads; directory and FIFO lifecycle and type-transition regressions pass alongside all 164 aggregate tests, portable validation, and 36 commit subjects."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Artifact 19 reviewed `bdd43b8` and was committed as `9cef362`; implementation commit `27973fe` applies only CR-005 after that review artifact.
- unrelated changes preserved: The worktree was clean before repair. No setup-repository behavior, dependency, prior artifact, or unrelated source changed.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-005

- disposition: fixed
- evidence: Pre-fix focused runs reproduced all missing discriminants: three repository-directory tests failed 0/3, repository FIFO creation failed 0/1, Git-config directory creation failed 0/1, and Git-config FIFO creation failed 0/1. `snapshotRepository` now retains `{ kind: "directory" }` while traversing descendants and `{ kind: "other", type }` for bounded `lstat` classifications. `snapshotGitConfig` retains the same non-payload records. FIFO records contain neither `bytes` nor `linkTarget`; only regular files are opened. Snapshot diffs compare complete records and suppress created or deleted non-empty directory ancestors when their changed descendants already identify the lifecycle mutation.
- files changed: `evals/lib.mjs`; `tests/evals-terminal-phase.test.mjs`
- regression check: The 28 focused tests cover empty-directory create/delete, non-empty-directory create/delete without duplicate changed paths, FIFO create/delete, directory-to-FIFO transitions, Git-config absence-to/from-directory, absence-to/from-FIFO, and directory-to-FIFO transitions. Existing file bytes, file/symlink equal-digest transitions, dangling symlinks, symlink privacy, nested reserved names, root harness exclusions, and terminal behavior remain green.

## Advisory Decisions

None.

## Verification

- command: `node --test --test-name-pattern='repository snapshots detect an empty directory|repository snapshots report non-empty directory' tests/evals-terminal-phase.test.mjs`
- result: Red before source edits, 0 passed and 3 failed because directories were absent from repository records.
- command: `node --test --test-name-pattern='local Git configuration detects a directory created from absence' tests/evals-terminal-phase.test.mjs`
- result: Red before the Git-config directory fix, 0 passed and 1 failed because absence and directory both compared as `null`.
- command: `node --test --test-name-pattern='repository snapshots detect a FIFO created from absence' tests/evals-terminal-phase.test.mjs`
- result: Red before the special-entry fix, 0 passed and 1 failed because the FIFO was omitted.
- command: `node --test --test-name-pattern='local Git configuration detects a FIFO created from absence' tests/evals-terminal-phase.test.mjs`
- result: Red before the Git-config special-entry fix, 0 passed and 1 failed because absence and FIFO both compared as `null`.
- command: `node --check evals/lib.mjs && node --check tests/evals-terminal-phase.test.mjs`
- result: Passed with no output.
- command: `node --test tests/evals-terminal-phase.test.mjs`
- result: Passed 28 tests with 0 failures and 0 skips on macOS; FIFO tests use `mkfifo` without a shell and skip only on Windows.
- command: `npm test`
- result: Passed validation for 44 skills, plugin synchronization for 37 skills and 7 agents, and 164 tests with 0 failures or skips.
- command: `dest=$(mktemp -d "/var/folders/7l/pvl0yj795ll6nkf367vztvnc0000gn/T/opencode/cr005-portable.XXXXXX") && trap 'rm -rf "$dest"' EXIT && npm run build -- --runtime portable --dest "$dest" && node scripts/validate.mjs --root "$dest"`
- result: Built 44 portable skills and validated 44 skills, 58 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, and 0 banned tokens; the exit trap removed output.
- command: `npm run check-commits -- origin/main..HEAD`
- result: Passed all 36 subjects through implementation commit `27973fe`.
- command: LSP diagnostics for both changed JavaScript files
- result: Unavailable because the session tool rejects paths outside `/Users/marktripoli/Development/skills`; executable Node syntax and test gates passed in the task worktree.

## Remaining Blocks

- None.
