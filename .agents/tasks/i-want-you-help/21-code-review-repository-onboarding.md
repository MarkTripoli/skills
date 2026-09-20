---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: d2c8502e681b21bd9e9a12c55737e6d09f5fd782
status: findings
summary: "Review of all 37 commits and 49 paths in origin/main...d2c8502 confirms CR-005 and the earlier filesystem-record fixes, but finds one major excluded-harness integrity gap: ignored mutations under root .agents or .omp and .git mutations outside config can escape both retained snapshots and live grading. Add independent typed snapshots for every excluded harness root, cover ignored and Git-internal mutations, then review the complete branch again."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `d2c8502e681b21bd9e9a12c55737e6d09f5fd782`
- commits: 37 commits from `3bfe746` through `d2c8502`
- staged and unstaged changes: none before this artifact
- task-owned untracked files: none before this artifact
- excluded changes: The 20 prior numbered artifacts and `task.md` under `.agents/tasks/i-want-you-help/` were requirements, prior findings, fix receipts, and evidence inputs rather than implementation review subjects. Every one of the 29 changed non-task paths was inspected.

## Previous Round

- previous artifact: `19-code-review-repository-onboarding.md`; fix receipt: `20-code-review-fixes-repository-onboarding.md`
- CR-005 Directory and special-file mutations disappear from terminal snapshots: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`; artifacts 13-20 supplied prior findings and claimed fixes, which were checked against the complete source, tests, commit history, and fresh filesystem matrices rather than accepted as proof
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`. The independent Standards pass found no documented-standard violation or actionable Fowler smell. The independent Spec pass found no missing setup, installer, inventory, build, documentation, changeset, or provider-boundary requirement apart from CR-006.

## Change Profile

- intent and expected behavior: Add an idempotent local-only `/setup-repository` skill, preserve foreign metadata, fail closed on unsafe managed state, support explicit managed reset, and retain complete terminal-eval evidence for exact allowlist grading and regrading.
- change description quality: Commit subjects separate runner support, setup behavior, migrations, safety, provider contracts, snapshot repairs, documentation, and artifacts. All 37 subjects pass the repository checker.
- implementation model and review model: implementation model not recorded; review model `openai/gpt-5.6-sol`, with independent Standards and Spec explorer passes
- changed-line size and logical cohesion: 4,186 additions and 20 deletions across 49 paths including task history. The 29 non-task paths form one onboarding feature across eval infrastructure, skill instructions, tests, fixtures, runtime build, installation, inventory, documentation, and release metadata.
- resulting large-file concerns: `evals/run.mjs` is 467 lines, `scripts/validate.mjs` is 577 lines, and the focused snapshot test is 451 lines. Their added branches remain cohesive with existing owners; no size-only issue is raised.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: ordinary file create/content/delete; valid and dangling symlinks without dereference; empty and non-empty directory lifecycle; FIFO lifecycle; file, symlink, directory, and FIFO type transitions; nested reserved names; root harness exclusions; local Git-config records; exact allowlists; retained JSON shapes; valid-current reruns; setup migration/reset/privacy; five-runtime installation; provider outcomes; inventory; and portable validation
- missing or misleading coverage: `tests/evals-terminal-phase.test.mjs:57-77` proves root harness paths are absent from repository manifests, but no test mutates an ignored root `.agents` or `.omp` entry or a `.git` path outside `config`. The live fallback at `evals/run.mjs:231-232` uses Git status, which intentionally omits ignored files, so the passing suite does not prove the plan's no-mutation rule for excluded roots.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3693` in / `73` out

### Correctness

- assessment and evidence: CR-001 through CR-005 are fixed on their covered paths. A fresh 49-transition repository matrix and 36-transition Git-config matrix detected every tested create, delete, content, link-target, and entry-type change. Mixed allowed/disallowed nested-tree changes retained the undeclared child, proving directory-ancestor suppression does not erase a sibling violation. Legacy no-`kind` records remained stable, typed transitions were detected, and typed records survived JSON round trips. CR-006 remains because excluded-root integrity is not represented by those manifests and Git status is not an exhaustive filesystem snapshot.
- helper coverage: covered, level 3, score 2.95, confidence 0.95

### Readability and Simplicity

- assessment and evidence: Typed record constructors, full-record comparison, ancestor suppression, the setup flow, migration table, provider categories, installer/build changes, and scenario checks use direct names and bounded responsibilities. No actionable readability defect or speculative abstraction remains.
- helper coverage: covered, level 3, score 2.73, confidence 0.73

### Architecture

- assessment and evidence: Canonical skill ownership, generated plugin inventory, selected installation, portable build, optional orchestration, terminal/artifact eval separation, and retained regrading remain intact. The architecture has one incomplete boundary: repository manifests exclude three harness roots, but only `.git/config` receives retained evidence and `.agents`/`.omp` rely on live Git status, so live and regraded integrity guarantees differ.
- helper coverage: covered, level 3, score 2.76, confidence 0.76

### Security

- assessment and evidence: File, directory, valid, and dangling symlinks retain only target text; FIFO and other special entries retain bounded type records without opening payloads. Setup forbids provider, network, and credential operations and redacts secret-shaped managed fields. CR-006 permits a terminal phase to leave an ignored payload under excluded harness state without retained evidence, and `.git` changes outside `config` have no detector.
- helper coverage: covered, level 3, score 2.61, confidence 0.61

### Performance

- assessment and evidence: Snapshot work is linear in fixture entries and ordinary-file bytes, runs only around terminal phases, performs no network work, and stores constant-size records for non-file entries. Directory ancestor suppression avoids duplicate lifecycle paths. No performance finding remains.
- helper coverage: covered, level 3, score 2.74, confidence 0.74

## Verification Story

- command or inspection: Complete `origin/main...HEAD` diff and 37-commit log; all 29 changed non-task files; task, plan, and artifacts 13-20; independent Standards and Spec passes; targeted filesystem/allowlist/legacy-record reproductions; Node syntax checks; focused tests; aggregate tests; portable build/validation; inventory; commit-subject checks; and diff whitespace validation
- result: The targeted matrices passed 49 repository transitions and 36 Git-config transitions; a tree with one allowed and one denied child still reported the denied child. Legacy records, typed JSON round trips, and exact allowlists behaved as intended. The focused suite passed 28 tests; `npm test` passed 164 tests; portable validation passed 44 skills; inventory returned 44 canonical skills, 7 workers, and 37 plugin skills; all 37 subjects and `git diff --check` passed. A separate temporary-repository reproduction created an ignored root `.agents` file: repository `changedPaths` remained empty and `git status --porcelain -- .agents .omp` remained clean.
- manual, screenshot, or before-and-after evidence: Temporary matrix and excluded-root repositories were removed. Portable output was removed after validation. No interface screenshot applies.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-006 Excluded harness roots are not exhaustively compared

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/run.mjs:225-232`
- failure mode: A terminal phase can create or modify an ignored file under root `.agents` or `.omp` and pass live grading because repository manifests exclude those roots and the fallback `git status --porcelain -- .agents .omp` omits ignored entries. Regrading has no Git checkout and therefore cannot run that fallback at all. Root `.git` is also excluded, while only `.git/config` receives a retained snapshot, so hooks, attributes, refs, and other Git-internal mutations have no complete before/after detector. This contradicts the plan's requirement that terminal phases cause “no mutation under excluded harness paths” and that retained manifests support regrading.
- evidence or reproduction: In a temporary Git repository with tracked `.agents/tasks/task.md` and `.omp/agents/a.md`, ordinary tracked edits, untracked files, deletions, and a directory-to-file transition appeared in Git status. After adding an ignore rule and creating the ignored root `.agents/ignored.txt`, `snapshotRepository` still returned no changed path and `git status --porcelain -- .agents .omp` returned empty, reproducing a passing live boundary. Source inspection confirms `commonChecks` skips the Git-status fallback when `ctx.live` is false and captures only `.git/config` separately.
- fix direction: Retain typed before/after snapshots for each excluded root, or one explicit excluded-state manifest, using the same non-dereferencing file/symlink/directory/special-entry records. Compare them in both live grading and regrading. Add regressions for tracked, untracked, ignored, deleted, and type-changing `.agents`/`.omp` entries plus at least one `.git` path outside `config`; keep root exclusions out of the ordinary repository allowlist.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none. `buildPortable` is called by the runtime CLI; snapshot and Git-config helpers are consumed by live execution and regrading; setup references are installed, validated, documented, and published.
- dependency findings: no package or lockfile changes. Added behavior uses Node standard-library filesystem, path, crypto, utility, test, and child-process APIs.

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested setup skill and fixes all five prior concrete snapshot defects, but terminal evidence still has one reproducible blind spot at the deliberately excluded harness roots.
- rationale: Setup semantics, typed filesystem records, ancestor suppression, local Git config, retained JSON, legacy records, installer/inventory/build/docs consumers, aggregate tests, and portable output all pass. CR-006 remains major because exact terminal grading and retained regrading claim no excluded-root mutation while an ignored harness write can pass with no evidence.

## Review Limits

- blocked or unavailable checks: LSP diagnostics cannot address the external task worktree from this session root. Executable Node syntax, focused, aggregate, portable, inventory, commit, and diff checks passed. The axis helper covered all five axes.
- residual manual verification: Authenticated provider behavior remains intentionally outside first-release scope. Live OMP scenarios were not rerun; their model outputs cannot prove the deterministic excluded-root boundary and no retained recordings were needed for the direct reproduction.
