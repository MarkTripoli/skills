---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: bdd43b813827ae88fa1172bf3f27b29459e25aae
status: findings
summary: "Review of all 34 commits and 47 paths in origin/main...bdd43b8 confirms CR-004 and the earlier snapshot repairs, but finds one major remaining terminal-eval integrity gap: repository snapshots omit empty directories and special filesystem entries, while Git-config snapshots collapse those entry types to absence. Record every encountered entry type without reading unsafe payloads, add directory and other-type transition regressions, then review the complete branch again."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `bdd43b813827ae88fa1172bf3f27b29459e25aae`
- commits: 34 commits from `3bfe746` through `bdd43b8`
- staged and unstaged changes: none before this artifact
- task-owned untracked files: none before this artifact
- excluded changes: The 19 files under `.agents/tasks/i-want-you-help/` were requirements, prior findings, fix receipts, and evidence inputs rather than implementation review subjects. Every changed non-task file was inspected.

## Previous Round

- previous artifact: `17-code-review-repository-onboarding.md`; fix receipt: `18-code-review-fixes-repository-onboarding.md`
- CR-004 Dangling Git-config symlinks are indistinguishable from absence: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`; artifacts 13-18 supplied prior findings and claimed fixes, which were checked against source, tests, commit diffs, and fresh reproductions
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`. The independent Standards pass found no documented-standard violation; its low-confidence duplicated-code observation in live/regrade context assembly has no demonstrated defect and is not raised. The independent Spec pass found no missing requirement, contradiction, or scope creep.

## Change Profile

- intent and expected behavior: Add an idempotent, local-only `/setup-repository` skill; preserve foreign state; fail closed on unsafe managed state; support explicit managed reset; and extend terminal evals with retained repository and Git-config evidence for live grading and regrading.
- change description quality: Commit subjects isolate eval infrastructure, skill behavior, migrations, safety, provider contracts, snapshot repairs, documentation, and artifacts. All 34 subjects pass the repository checker.
- implementation model and review model: implementation model not recorded; review model `openai/gpt-5.6-sol`, with independent Standards and Spec explorer passes
- changed-line size and logical cohesion: 3,829 additions and 20 deletions across 47 paths, including task history. The 28 non-task paths contain 1,448 additions and 20 deletions for one onboarding feature across the skill, eval adapter, tests, fixtures, installation, runtime build, inventory, docs, and changeset.
- resulting large-file concerns: `evals/run.mjs` is 467 lines and `scripts/validate.mjs` is 577 lines, but the branch adds bounded behavior within their existing ownership. No file-size concern causes the reproduced failure.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: ordinary file create/content/delete; root harness exclusions; nested reserved paths; regular and valid/dangling symlink Git config; file and directory symlink privacy; link-target changes; equal-digest file/symlink transitions; terminal allowlists and answer shape; current-state rerun classification; setup semantics; five-runtime installation; provider outcomes; inventory; and portable validation
- missing or misleading coverage: `tests/evals-terminal-phase.test.mjs:33-243` never creates an empty directory, FIFO, socket, or other non-file entry as the repository path or `.git/config`. The passing suite therefore does not exercise the two absence-collapsing branches in CR-005.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3646` in / `73` out

### Correctness

- assessment and evidence: CR-001 through CR-004 are fixed on their covered paths. Repository and Git-config records distinguish ordinary files, valid and dangling symlinks, link-target changes, equal-digest type transitions, creation, deletion, and content changes; old records without `kind` still compare correctly; live and regrade paths consume the same retained shapes. `snapshotRepository` traverses directories but records only files and symlinks, so a newly created empty directory or FIFO produces no changed path. `snapshotGitConfig` returns `null` for every non-file, non-symlink entry, making absence, directory, and other types equal. CR-005 records the fresh reproduction.
- helper coverage: covered, level 3, score 2.99, confidence 0.99

### Readability and Simplicity

- assessment and evidence: Snapshot record constructors, complete-record comparison, the setup flow, migration table, provider categories, scenarios, and release wiring use direct names and explicit boundaries. Live/regrade context assembly is similar, but both paths call the same snapshot/diff helpers and no divergence was found. The remaining failure is a missing discriminant branch, not unclear flow.
- helper coverage: covered, level 3, score 2.78, confidence 0.78

### Architecture

- assessment and evidence: Canonical skill ownership, generated plugin inventory, independent installation, portable build, optional orchestration boundary, terminal/artifact split, and retained regrading remain intact. Typed records already provide the correct seam; extending them with non-payload `directory` and `other` kinds keeps capture, persistence, live grading, and regrading aligned.
- helper coverage: covered, level 3, score 2.75, confidence 0.75

### Security

- assessment and evidence: File, directory, valid, broken, and changed-target symlinks retain only target text and never target bytes. Secret-shaped managed fields are rejected without receipt disclosure, and setup performs no provider or credential operation. CR-005 permits an undeclared FIFO, socket, device, or empty directory to survive a terminal run without appearing in retained evidence; the fix must classify these entries without opening or traversing unsafe payloads.
- helper coverage: covered, level 3, score 2.80, confidence 0.80

### Performance

- assessment and evidence: Snapshot work remains linear in fixture entries and ordinary-file bytes, uses no network or retry loop, and runs only around terminal eval phases. Recording a constant-size kind record for directories and other entries adds constant work per entry and requires no payload read; no performance finding remains.
- helper coverage: covered, level 3, score 2.94, confidence 0.94

## Verification Story

- command or inspection: Full `origin/main...HEAD` diff and 34-commit log; all 28 changed non-task files; task, plan, and artifacts 13-18; consumers of repository and Git-config records; independent Standards and Spec passes; a temporary Node state-transition matrix; focused terminal tests; aggregate tests; portable build/validation; inventory; and commit-subject checks
- result: Focused tests passed 16/16; `npm test` passed validation, plugin synchronization, and 152 tests; a temporary portable tree built and validated 44 skills; inventory returned 44 skills, 7 workers, and 37 plugin skills; all 34 subjects passed. Fresh reproductions confirmed file, valid/dangling symlink, content, link-target, equal-digest type, create/delete, privacy, ENOENT-only rethrow, legacy no-`kind`, and retained JSON-roundtrip behavior. Creating an empty repository directory or FIFO returned `changedPaths: []`; `snapshotGitConfig` returned `null` for absent, directory, and FIFO states, and both absence transitions returned `false`.
- manual, screenshot, or before-and-after evidence: Reproductions used one `os.tmpdir()` tree and removed it. Portable output used a temporary external directory removed by an exit trap. No interface screenshot applies.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-005 Directory and special-file mutations disappear from terminal snapshots

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/lib.mjs:39`, `evals/lib.mjs:47-65`
- failure mode: A terminal skill can create an undeclared empty directory, FIFO, socket, device, or other non-file entry in the repository and pass exact changed-path grading because `snapshotRepository` records only regular files and symlinks. `snapshotGitConfig` similarly maps directories and every other non-file entry to `null`, the same value as absence, so those states and transitions cannot be retained or regraded. Live checks cover only root `.agents` and `.omp`; they do not provide a second detector for general repository paths.
- evidence or reproduction: In a temporary root, compare an empty snapshot with a snapshot after `mkdir entry`; `changedPaths` was `[]`. Repeating after `mkfifo entry` also returned `[]`. For `.git/config`, absent, directory, and FIFO each produced `null`; `gitConfigChanged(absent, directory)` and `gitConfigChanged(absent, fifo)` both returned `false`. The same run confirmed regular files, valid/dangling symlinks, equal-digest file/symlink transitions, and link-target changes remain detected, so the defect is isolated to unrepresented entry kinds.
- fix direction: Retain a typed record for every encountered entry. Record directories as `{ kind: "directory" }`; record other entries with a safe kind such as `{ kind: "other", type: <bounded lstat classification> }` without opening payloads. Apply the same shape to Git config or reject unsupported config types as a visible changed/error state. Add repository and Git-config regressions for absent/create/delete and transitions among regular file, valid/dangling symlink, directory, and at least one special type; keep privacy and equal-digest assertions.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none. `buildPortable` is used by `scripts/build-runtimes.mjs`; snapshot and Git-config helpers are consumed by live execution and regrading; setup references are installed and published.
- dependency findings: no package or lockfile changes. Added runtime behavior uses Node standard-library filesystem, path, crypto, utility, and process APIs.

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested setup skill and fixes all four prior concrete defects, but terminal repository evidence still omits two filesystem entry classes required for exact mutation grading.
- rationale: Aggregate, portable, inventory, installation, setup-contract, and focused tests pass. CR-005 remains major because the terminal contract claims exact allowed-path enforcement and retained regrading while concrete undeclared repository mutations produce no changed path or record.

## Review Limits

- blocked or unavailable checks: LSP diagnostics cannot run against this external worktree from the session root; changed JavaScript passed executable Node checks, and this review adds only Markdown.
- residual manual verification: Authenticated provider behavior remains intentionally outside first-release scope. Live OMP scenarios were not rerun because the defect is below the model boundary and has a direct deterministic reproduction.
