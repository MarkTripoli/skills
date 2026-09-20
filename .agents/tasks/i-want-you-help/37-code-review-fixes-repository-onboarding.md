---
type: code-review-fixes
date: 2026-09-20
branch: i-want-you-help
review_artifact: 36-code-review-repository-onboarding.md
reviewed_head_sha: 2e005c1
fixed_head_sha: f9536762bb0ebb85a2a197a4aef0c6e5ce3ca843
status: complete
summary: "CR-017, CR-018, and CR-019 are fixed. Retained grading now preserves typed process status and validates every manifest, corrupt regular indexes produce bounded typed mismatch evidence, and Git-config files retain only SHA-256 digests. ADV-001 and ADV-002 are accepted; repeated focused, aggregate, portable, live, retained-regrade, Node, Deno, inventory, diff, and commit gates passed, while LSP remained unavailable for the external task worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 36 used merge base `4458fbf21e199dad45376b8164f78c2165ac1d20` and reviewed HEAD `2e005c1`. Commit `972dab6` added review artifact 36; commits `51f06de`, `b23b8e6`, `a36be78`, `029c404`, and `f953676` address its findings and advisories.
- unrelated changes preserved: None.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-017

- disposition: fixed
- evidence: Every live phase writes `exit-status.json` as an `exit` or `signal` record. Regrading requires and validates that record, then passes it to the same `grade()` path used live. `evals/manifest.mjs` validates repository, excluded-root, Git-config, and Git-index evidence with closed record kinds and fields before scenario checks. Recordings without typed status or schema-valid manifests fail closed.
- files changed: `evals/run.mjs`, `evals/manifest.mjs`, `tests/evals-regrade-integrity.test.mjs`
- regression check: The new regressions failed against the reviewed implementation because an OMP exit 7 regraded green and equal malformed repository, excluded-root, Git-config, and Git-index manifests passed. All cases now fail live or retained grading as required; three consecutive 25-test focused runs passed.

### CR-018

- disposition: fixed
- evidence: `snapshotGitIndex()` preflights `.git` with `lstat` and never invokes Git through absent, symlinked, or non-directory roots. Git command and parser failures return bounded `error` evidence with operation, stable code, and regular-index SHA-256 digest. Raw stderr and index bytes are omitted. Valid-before versus corrupt-after evidence compares changed; equal errors compare unchanged only when class, code, operation, and digest match.
- files changed: `evals/git-index.mjs`, `tests/evals-git-index.test.mjs`, `tests/evals-git-index-runner.test.mjs`, `evals/run.mjs`
- regression check: Unit coverage corrupts a regular index and checks `exit-128`, digest retention, redaction, and changed comparison. Runner coverage proves report completion plus live and retained semantic-index failure. Unsafe-root coverage proves typed unavailability without Git invocation.

### CR-019

- disposition: fixed
- evidence: `evals/git-config.mjs` owns local Git-config snapshots. Regular files retain only `{ kind: "file", sha256 }`; directories, symlinks, and special entries retain their prior typed diagnostics without dereferencing. `evals/lib.mjs` re-exports the public helpers while remaining below 250 pure LOC.
- files changed: `evals/git-config.mjs`, `evals/lib.mjs`, `tests/evals-git-root-runner.test.mjs`
- regression check: A live worker writes a credential-shaped remote URL. Before and after digests differ, both live and retained grading fail the mutation, and retained JSON contains neither plaintext nor base64 sentinel.

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: `evals/cli.mjs` parses arguments once. It preserves scenario names, `--keep`, `--model`, `--max-time`, and `--grade [dir]`, while rejecting unknown or duplicate options, missing or flag-valued required arguments, non-positive or non-finite time limits, scenarios after options, and tokens after `--grade [dir]`. Eight CLI process-boundary regressions pass.

### ADV-002

- disposition: accepted
- reason: `docs/testing.md` removes legacy-skip guidance and documents required typed exit status, schema validation, digest-only Git-config evidence, bounded Git-index errors, and fail-closed legacy recordings.

## Verification

- command: Initial red run of `node --test tests/evals-cli.test.mjs tests/evals-regrade-integrity.test.mjs tests/evals-git-index.test.mjs tests/evals-git-index-runner.test.mjs tests/evals-git-root-runner.test.mjs`
- result: Failed 15/25 checks for the reviewed defects, including exit-status loss, all four malformed manifest families, corrupt-index crashes, unsafe-root Git invocation, raw config bytes, and malformed CLI handling.
- command: Three total consecutive runs of the same focused suite after fixes
- result: Passed 25/25 on every run.
- command: `node --test tests/setup-repository-contract.test.mjs tests/evals-terminal-phase.test.mjs tests/evals-excluded-roots.test.mjs tests/evals-concurrent-runner.test.mjs tests/evals-git-root-runner.test.mjs tests/evals-git-index-runner.test.mjs tests/evals-regrade-integrity.test.mjs tests/evals-git-index.test.mjs tests/evals-cli.test.mjs`
- result: Passed 69/69 focused setup and runner tests.
- command: `npm test`
- result: Passed validation, plugin sync, and 206/206 tests after the final extraction.
- command: `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- result: Built and validated 44 portable skills with zero workers; generated `dist/` was removed.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-safety --keep --max-time 25`
- result: Passed 4/4 live scenarios and all 15 phases in transient run `20260920-170934`; generated recordings and fixture repositories were removed after retained regrade.
- command: `npm run evals -- setup-repository-basic setup-repository-unresolved setup-repository-migration setup-repository-safety --grade 20260920-170934`
- result: Passed 4/4 retained scenarios and all 15 phases before cleanup.
- command: `node --check` and `deno check --no-lock --node-modules-dir=auto` for changed eval modules and tests
- result: Passed without generating `deno.lock`.
- command: Static 44-skill, 7-agent, 37-plugin inventory assertion
- result: Passed.
- command: Pure-LOC audit for changed JavaScript modules
- result: New modules remain at 48 to 143 pure LOC; `evals/lib.mjs` is 228. Existing `evals/run.mjs` remains a reviewed single-lifecycle exception at 580 pure LOC.
- command: `GIT_MASTER=1 git diff --check && node scripts/check-commits.mjs origin/main..HEAD`
- result: Passed whitespace and 77 implementation-history commit subjects before this receipt.
- command: LSP diagnostics for changed JavaScript modules
- result: Unavailable because the configured LSP workspace rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, and retained-regrade gates passed.

## Remaining Blocks

- None.
