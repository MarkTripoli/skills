---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 6d4c846f033f6922abdd77ac0be23394d151d246
status: findings
summary: "Review of all 45 commits and 54 paths in origin/main...6d4c846 confirms CR-007 and earlier snapshot repairs, but finds one major unsafe Git-root transition: replacing `.git` with a non-directory crashes config capture, while replacing it with a directory symlink copies external config bytes into retained evidence. Make Git-config capture conditional on a non-symlink `.git` directory, add root-transition privacy regressions, then review the complete branch again."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `6d4c846f033f6922abdd77ac0be23394d151d246`
- commits: 45 commits from `3bfe746` through `6d4c846`, including CR-007 implementation `319afa5`, documentation `31b73c7`, and fix receipt `6d4c846`
- staged and unstaged changes: none before this artifact
- task-owned untracked files: none before this artifact
- excluded changes: The 24 prior numbered artifacts and `task.md` under `.agents/tasks/i-want-you-help/` were requirements, prior reviews, fix receipts, and evidence inputs rather than implementation review subjects. Every one of the 29 changed non-task paths was inspected.

## Previous Round

- previous artifact: `23-code-review-repository-onboarding.md`; fix receipt: `24-code-review-fixes-repository-onboarding.md`
- CR-007 Git-index exclusion erases entry-type and descendant mutations: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`; artifacts 13-24 supplied prior findings and claimed fixes, which were checked against the complete branch, source, tests, fresh filesystem transitions, and a fresh live run rather than accepted as proof
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`. The independent Standards and Spec axes raised no validated blocker after repository rules and the plan's explicit standalone-skill and portable-build requirements were applied. Repeated live/regrade context assembly remains a non-blocking judgment call without a demonstrated divergence.

## Change Profile

- intent and expected behavior: Add an idempotent local-only `/setup-repository` skill, preserve foreign metadata, fail closed on unsafe managed state, support explicit managed reset, and retain terminal-eval evidence for exact allowlist grading and regrading.
- change description quality: Commit subjects separate eval infrastructure, setup behavior, migrations, safety, provider contracts, snapshot repairs, documentation, and artifacts. All 45 subjects pass the repository checker.
- implementation model and review model: implementation model not recorded; review model `openai/gpt-5.6-sol`, with independent Standards and Spec explorer passes
- changed-line size and logical cohesion: 4,828 additions and 20 deletions across 54 paths including task history. The 29 non-task paths form one onboarding feature across eval infrastructure, skill instructions, tests, fixtures, runtime build, installation, inventory, documentation, and release metadata.
- resulting large-file concerns: `evals/run.mjs` is 502 lines, `scripts/validate.mjs` is 577 lines, and `tests/evals-terminal-phase.test.mjs` is 451 lines. Their changed behavior remains cohesive with existing ownership; no size-only finding is raised.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: ordinary file creation/content/deletion; exact allowlists; absent and nested roots; tracked, untracked, ignored, and deleted excluded entries; file/directory/symlink/dangling-symlink/FIFO lifecycle and type transitions; non-dereferencing entry capture; `.git/config` independence; ordinary-index byte normalization; index lifecycle/type/descendant grading; retained JSON and regrading; setup create/migrate/reset/privacy semantics; five-runtime installation; provider outcomes; inventory; and portable validation
- missing or misleading coverage: The focused suites exercise `.git/config` entry transitions while `.git` remains a directory, and exercise excluded `.git` records separately. No test replaces the `.git` root with a regular file, FIFO, or directory symlink before `snapshotGitConfig`; therefore 36 focused tests pass despite CR-008.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3896` in / `73` out

### Correctness

- assessment and evidence: CR-001 through CR-007 are fixed on their covered paths. Exact allowlists compare complete repository-relative strings; root-only ordinary exclusions retain nested reserved names; ancestor suppression removes only newly created or deleted non-empty directory duplicates and retains modified type records and changed descendants; ordinary `.git/index` bytes alone normalize while every tested lifecycle and type change remains visible. Live capture occurs after overlays and prompt preparation and before OMP, and retained regrading consumes the same repository, config, and excluded-root records. CR-008 remains because config capture assumes `.git` is still a real directory and runs before the excluded-root after-snapshot can diagnose a root type change.
- helper coverage: covered, level 3, score 2.99, confidence 0.99

### Readability and Simplicity

- assessment and evidence: Snapshot record constructors, complete-record comparison, ancestor suppression, setup instructions, migration rules, provider categories, installer/build wiring, and scenario checks use direct names and explicit boundaries. Live and regrade context assembly repeat a coordinated shape, but both call the same helpers and no concrete divergence or required refactor was found.
- helper coverage: covered, level 3, score 2.66, confidence 0.66

### Architecture

- assessment and evidence: Canonical standalone skill ownership, generated plugin inventory, selected installation, portable build, optional orchestration, terminal/artifact separation, and retained regrading remain intact. Separate Git-config capture correctly avoids ordinary `.git` manifest exclusion, but it bypasses the non-dereferencing root classification already owned by `snapshotNamedRoot`; CR-008 requires those boundaries to compose safely.
- helper coverage: covered, level 3, score 2.94, confidence 0.94

### Security

- assessment and evidence: Ordinary repository and excluded-root snapshots use `lstat`, retain link target text without following it, and classify special entries without opening payloads. Setup forbids network, provider, and credential operations and redacts secret-shaped managed values. `snapshotGitConfig` instead resolves `.git/config` through a symlinked `.git` parent and reads the external target bytes; the direct reproduction retained `host-private-config\n` in its base64 record. CR-008 is the remaining privacy defect.
- helper coverage: covered, level 3, score 2.97, confidence 0.97

### Performance

- assessment and evidence: Snapshot work is linear in fixture entries and ordinary-file bytes, runs only around terminal phases, and uses no network or retry loop. Type-checking `.git` before config capture is constant work and can reuse the excluded-root boundary; no performance finding remains.
- helper coverage: covered, level 3, score 2.88, confidence 0.88

## Verification Story

- command or inspection: Complete `origin/main...HEAD` diff and 45-commit log; all changed non-task files; task, plan, and artifacts 13-24; independent Standards and Spec passes; 36 focused filesystem tests; targeted Git-root transition reproduction; `npm test`; portable build/validation; 44/7/37 inventory; commit subjects; diff whitespace; fresh live OMP scenarios; retained regrading; and cleanup inspection
- result: Focused tests passed 36/36; `npm test` passed 172 tests; portable validation passed 44 skills; inventory returned 44 canonical skills, 7 workers, and 37 plugin skills; all 45 subjects and `git diff --check` passed. Fresh run `20260920-143040` passed all 3 scenarios and 9 terminal phases and regraded 3/3; retained output was removed afterward. Replacing `.git` with a regular file made `snapshotGitConfig` throw `ENOTDIR`; replacing it with a symlink to an external directory retained that directory's `config` bytes while the excluded-root record retained only the link target.
- manual, screenshot, or before-and-after evidence: Temporary root-transition, portable, live-run, and regrade output was removed. No interface screenshot applies.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-008 Git-config capture follows or crashes on Git-root type changes

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/lib.mjs:72-81`, `evals/run.mjs:323-335`
- failure mode: A terminal phase can replace the root `.git` directory with another filesystem type before after-capture. A regular file, FIFO, or similar non-directory makes `lstat(<root>/.git/config)` throw `ENOTDIR`, aborting the runner before it records the after manifests or reports the excluded-root mutation. A symlinked `.git` directory is followed while resolving `.git/config`; if its external target contains `config`, `snapshotEntry` reads and base64-retains bytes outside the fixture repository before excluded-root grading reports the root link change. This violates the retained-evidence privacy boundary and converts an unsafe terminal mutation into either host-byte disclosure or an ungraded runner crash.
- evidence or reproduction: In a temporary repository root, replace `.git` with an ordinary file and call `snapshotGitConfig`; Node returned `ENOTDIR: not a directory, lstat '<root>/.git/config'`. Replace `.git` with a directory symlink to a temporary external directory containing `config: host-private-config\n`; `snapshotNamedRoot` safely recorded only `{ kind: "symlink", linkTarget, sha256 }`, but `snapshotGitConfig` returned a file record whose decoded bytes were `host-private-config\n`. Existing tests cover config entry types under a stable directory and `.git` root records independently, so both paths remain green.
- fix direction: Classify the `.git` root with non-dereferencing metadata before resolving its child config. Capture `.git/config` only when `.git` is an ordinary directory; for absent or non-directory roots, retain no config payload and let the excluded-root typed diff report the root mutation. Treat `ENOTDIR` as an unsafe root state rather than a runner exception, and never follow a symlinked parent. Add root-directory-to/from absence, regular file, valid and dangling symlink, directory symlink, and FIFO regressions proving no crash, no external-byte retention, and a live/regraded excluded-root diagnostic.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none. `buildPortable` is called by the runtime CLI; snapshot helpers are consumed by live execution and regrading; setup references are installed, validated, documented, and published.
- dependency findings: no package or lockfile changes. Added behavior uses Node standard-library filesystem, path, crypto, utility, test, and child-process APIs.

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested setup skill and fixes the seven prior concrete defects, but the terminal evidence boundary still mishandles one excluded-root transition class with a reproducible privacy and availability failure.
- rationale: Setup behavior, ordinary and excluded snapshots, exact path grading, index normalization, retained regrading, installer/inventory/build/docs consumers, aggregate tests, portable output, and fresh live evidence pass. CR-008 remains major because after-capture can retain host bytes or terminate before grading when `.git` changes type.

## Review Limits

- blocked or unavailable checks: LSP diagnostics reject the requested external worktree because it is outside this session's cwd. Node syntax, focused tests, aggregate tests, portable validation, live evals, retained regrading, commit checks, and direct reproductions passed.
- residual manual verification: Authenticated provider behavior remains intentionally outside first-release scope. The fresh live scenarios do not mutate the root `.git` entry and therefore do not exercise CR-008.
