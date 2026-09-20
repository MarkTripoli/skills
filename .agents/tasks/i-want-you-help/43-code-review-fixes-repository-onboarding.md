---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 42-code-review-repository-onboarding.md
reviewed_head_sha: 5ac3521de79b1910deb1a68d6104c41c5fecdc7f
fixed_head_sha: ce77415b022cb6d75eca42cf57d28677678627b9
status: complete
summary: "CR-026 through CR-028 are fixed. Eval Git processes now use a sanitized environment, retained completion metadata is confined to selected non-symlink scenario paths with bounded parse errors, and Git-index manifests reject values live Git cannot emit; focused, aggregate, portable, static, live, and retained-regrade gates passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 42 used merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` and reviewed HEAD `5ac3521de79b1910deb1a68d6104c41c5fecdc7f`. The merge base is unchanged. Commits `cccbd62`, `16a105e`, and `ce77415` address its findings.
- unrelated changes preserved: None.

## Finding Dispositions

### CR-026

- disposition: fixed
- evidence: `sanitizedGitEnvironment()` preserves non-Git environment values, removes inherited `GIT_*` routing and configuration, and disables system/global Git configuration. Runner-owned Git, spawned OMP, and semantic index capture use that environment.
- files changed: `evals/git-environment.mjs`, `evals/git-index.mjs`, `evals/run.mjs`, `tests/evals-git-index.test.mjs`, `tests/evals-runner-git-environment.test.mjs`
- regression check: Redirected `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` no longer move fixture or OMP operations; injected `core.fsmonitor` does not execute.

### CR-027

- disposition: fixed
- evidence: Completion validation requires summary entries to equal the selected scenario set, rejects duplicate/extra names, requires regular non-symlink scenario directories and reports under the canonical run directory, and emits bounded invalid-JSON diagnostics without parser excerpts.
- files changed: `evals/run.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: Traversal names cannot open external reports or expose their contents, and symlinked scenario directories fail before phase grading.

### CR-028

- disposition: fixed
- evidence: Git-index manifests accept only modes `040000`, `100644`, `100755`, `120000`, and `160000`; reject NUL and `.git` paths; and require one 40- or 64-character object-ID width per manifest.
- files changed: `evals/manifest.mjs`, `tests/evals-manifest.test.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: Unit and equal-before/after retained-regrade cases reject invalid modes, reserved and NUL paths, and mixed object formats while preserving valid sparse-directory, file, executable, symlink, and gitlink modes.

## Advisory Decisions

None.

## Verification

- command: Focused red tests for Git routing/config injection, retained traversal and symlink paths, parser leakage, invalid index modes and paths, and mixed object formats
- result: Each regression failed against reviewed code for its intended reason.
- command: `node --test tests/evals-regrade-integrity.test.mjs tests/evals-git-index.test.mjs tests/evals-runner-git-environment.test.mjs tests/evals-manifest.test.mjs`
- result: Passed 36/36 focused tests.
- command: `npm test`
- result: Passed validation, plugin synchronization, and 235/235 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with zero workers.
- command: `node --check` and `deno check --no-lock --node-modules-dir=auto` for changed eval modules
- result: Passed without output or a generated lockfile.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-read-errors setup-repository-safety --keep --max-time 25` and retained regrade of run `20260920-205454`
- result: Passed all five scenarios live and during retained regrade; all 14 setup safety phases passed in both modes.
- command: `node scripts/check-commits.mjs origin/main..HEAD` and `GIT_MASTER=1 git diff --check`
- result: Passed 93 commit subjects and diff whitespace checks.
- command: LSP diagnostics for changed JavaScript modules and tests
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, and retained-regrade gates passed instead.

## Remaining Blocks

- None.
