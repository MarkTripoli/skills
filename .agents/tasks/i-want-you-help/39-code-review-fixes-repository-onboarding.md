---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 38-code-review-repository-onboarding.md
reviewed_head_sha: 95b73aa
fixed_head_sha: 12f37ca6253e0a6d775da8af3938db42cd84fc9e
status: complete
summary: "CR-020 through CR-024 are fixed. Retained manifests enforce path ownership, payload integrity, normalized modes, and bounded read failures; setup rejects non-regular metadata entries before reads; Git-index capture ignores inherited routing. Offline, portable, live, retained-regrade, Node, Deno, inventory, diff, and commit gates passed; LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 38 used merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` and reviewed HEAD `95b73aa`. The current merge base is `fd28a8e868e4aac524652d6939d10aa7e0dba2c3`. Commit `6546451` added review artifact 38; commits `0088f0f`, `5c9dc63`, `eacc874`, `85cc1d0`, `1ab3594`, and `12f37ca` address its findings.
- unrelated changes preserved: None.

## Finding Dispositions

### CR-020

- disposition: fixed
- evidence: Retained repository paths must be normalized relative paths outside reserved harness roots. Excluded-root entries must remain inside their assigned bucket. File and symlink digests are recomputed from retained payloads, and malformed equal before/after evidence fails before scenario grading.
- files changed: `evals/manifest.mjs`, `tests/evals-manifest.test.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: Unit and retained-regrade cases reject traversal, reserved roots, wrong-bucket entries, mismatched payload digests, and raw error fields.

### CR-021

- disposition: fixed
- evidence: Setup now requires `lstat` before reading `ai-utilities.json`, accepts only absence or a regular non-symlink file, and rejects directories, valid or dangling links, FIFOs, sockets, and devices without reading payloads or writing state.
- files changed: `skills/setup-repository/SKILL.md`, `skills/setup-repository/references/repository-metadata.md`, `evals/scenarios/setup-repository-safety.mjs`, `tests/evals-terminal-phase.test.mjs`, `README.md`
- regression check: Fourteen live safety phases cover directory, valid, dangling, and external symlinks, FIFO, and socket entries; live and retained grading pass while linked sentinels remain redacted.

### CR-022

- disposition: fixed
- evidence: Repository, excluded-root, and Git-config regular-file and directory records retain normalized four-digit permission modes. Setup preserves existing metadata permissions during replacement and requests safe `0600` permissions for first creation.
- files changed: `evals/file-evidence.mjs`, `evals/lib.mjs`, `evals/git-config.mjs`, `evals/manifest.mjs`, `evals/scenarios/setup-repository-migration.mjs`, `skills/setup-repository/SKILL.md`, `skills/setup-repository/references/repository-metadata.md`, `tests/evals-excluded-roots.test.mjs`, `tests/evals-terminal-phase.test.mjs`, `tests/evals-git-root-runner.test.mjs`
- regression check: Permission-only repository, excluded-root, and Git-config changes are detected; migration proves metadata mode preservation.

### CR-023

- disposition: fixed
- evidence: Git-index commands use explicit `--git-dir` and `--work-tree` arguments after removing inherited repository, index, common-directory, namespace, replacement, shallow, graft, ceiling, and object-routing variables from the child environment.
- files changed: `evals/git-index.mjs`, `tests/evals-git-index.test.mjs`
- regression check: A redirected environment containing `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, and object-directory overrides still snapshots only the requested repository.

### CR-024

- disposition: fixed
- evidence: Repository and Git-config read failures become bounded `file-error` records containing normalized mode, `read-file` operation, safe error class, and null digest. Payload bytes and raw error messages are omitted. Runner injection provides deterministic live coverage without depending on process privileges.
- files changed: `evals/file-evidence.mjs`, `evals/lib.mjs`, `evals/git-config.mjs`, `evals/run.mjs`, `evals/scenarios/setup-repository-read-errors.mjs`, `evals/manifest.mjs`, `tests/evals-terminal-phase.test.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: Snapshot units and the two-phase read-error scenario retain answers, exit status, reports, summaries, and schema-valid bounded evidence live and during regrade.

## Advisory Decisions

- Review 38 contained no advisories.

## Verification

- command: Focused manifest, snapshot, Git-index, terminal, runner, and retained-regrade Node suites during red/green implementation
- result: New regressions failed against the reviewed implementation and passed after each responsible fix.
- command: `npm test`
- result: Passed validation, plugin synchronization, and 223/223 tests.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with zero workers; generated `dist/` was removed.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-read-errors --keep --max-time 25` and retained regrade
- result: Passed all four scenarios live and during retained regrade in transient run `20260920-174536`.
- command: `npm run evals -- setup-repository-safety --keep --max-time 25` and `npm run evals -- setup-repository-safety --grade 20260920-182804`
- result: Passed all 14 safety phases live and during retained regrade; transient recordings and fixture repositories were removed.
- command: `node --check` and `deno check --no-lock --node-modules-dir=auto` for changed eval modules and tests
- result: Passed without generating a lockfile.
- command: Static inventory assertion using `scanSkills()` and `.claude-plugin/plugin.json`
- result: Passed with 44 skills, 7 agent skills, and 37 plugin skills.
- command: `GIT_MASTER=1 git diff --check`
- result: Passed before commits.
- command: LSP diagnostics for changed JavaScript modules
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, and retained-regrade gates passed instead.

## Remaining Blocks

- None.
