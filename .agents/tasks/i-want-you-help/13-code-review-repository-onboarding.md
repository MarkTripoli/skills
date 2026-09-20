---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: f8ad9bebe0bc18a124275293d599d75bcb99b31d
status: findings
summary: "Review of all 24 commits and 41 paths in origin/main...f8ad9be found two major terminal-eval snapshot defects: Git-config and nested reserved-directory mutations can escape grading, and symlinks can copy host-file bytes into retained manifests. The implementation otherwise matches the repository standards and onboarding plan; fix both snapshot boundaries, add focused regressions, then review the resulting diff again."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `f8ad9bebe0bc18a124275293d599d75bcb99b31d`
- commits: 24 commits from `3bfe746` through `f8ad9be`
- staged and unstaged changes: none
- task-owned untracked files: none
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were requirements and evidence inputs, not implementation review subjects.

## Previous Round

None.

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`; passed independent evidence in `12-verification-repository-onboarding.md` was read but the diff was assessed independently.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`. The Standards axis found no documented-standard or actionable Fowler-smell violation. The Spec axis found no missing requirement or scope creep in the skill, inventory, installer, docs, changeset, or portable build; the two findings below are fresh eval-runner defects found by targeted review.

## Change Profile

- intent and expected behavior: Add a standalone, local-only, idempotent `/setup-repository` skill; preserve foreign ownership, fail closed on unsafe managed state, retain terminal eval snapshots for regrading, and publish/install the new skill across supported runtimes.
- change description quality: Commit subjects separate eval infrastructure, skill behavior, documentation, migrations, safety, provider contracts, repairs, and evidence. Task artifacts record the rationale and limits.
- implementation model and review model: implementation model not recorded; review model `openai/gpt-5.6-sol`, with independent Standards and Spec explorer passes.
- changed-line size and logical cohesion: 3,097 additions and 20 deletions across 41 paths, including task history. Non-artifact changes remain grouped around the skill, eval adapter, release inventory, installation, tests, and documentation.
- resulting large-file concerns: `evals/run.mjs` grows to 452 lines, but the added terminal branch remains within the existing runner ownership. No new source file exceeds 250 lines.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: snapshot create/modify/delete/no-op behavior, root harness exclusions, allowlists, terminal-answer shape, current-state rerun classification, five-runtime install/uninstall, provider outcome safety, and nine retained live setup phases.
- missing or misleading coverage: no test mutates local Git configuration, writes under a nested `.agents`/`.omp` directory, or snapshots a symlink. Those omissions permit both major failures below despite the passing aggregate and live evidence.

## Five-Axis Assessment

- helper axis-coverage: unavailable pending helper run

### Correctness

- assessment and evidence: Skill behavior, idempotency, owned-subtree migration/reset, fail-closed validation, terminal regrading, inventory, install/uninstall, docs, and changeset match the plan. `evals/lib.mjs:16` excludes reserved directory names at every depth, while `evals/run.mjs:228` checks only root `.agents` and `.omp`; a write to `nested/.agents/hidden.txt` produced an empty snapshot diff. `evals/run.mjs:228` also omits `.git`, and changing local Git config produced an empty snapshot diff.
- helper coverage: unavailable

### Readability and Simplicity

- assessment and evidence: Names, ordered skill flow, migration table, provider categories, scenarios, and focused helpers are direct. The unplanned `buildPortable` extraction in `scripts/lib/build.mjs:70-94` is required by the approved portable validation command and does not introduce an actionable readability defect.
- helper coverage: unavailable

### Architecture

- assessment and evidence: Canonical skill ownership, generated plugin inventory, selected installation, optional orchestration boundary, and terminal/artifact eval split remain intact. Snapshot policy is centralized in `snapshotRepository`, but the policy and the separate live checks do not jointly cover all repository mutations; CR-001 names the minimal boundary repair.
- helper coverage: unavailable

### Security

- assessment and evidence: The skill forbids provider calls and credential lookup, redacts invalid secret-shaped managed fields, and performs zero external operations. The eval snapshotter accepts symlinks at `evals/lib.mjs:23` and reads them with `fs.readFileSync` at line 24; a repository symlink to a host-only file caused its contents to appear base64-encoded in the manifest. CR-002 requires non-dereferencing capture.
- helper coverage: unavailable

### Performance

- assessment and evidence: Snapshot and diff work is linear in fixture file count and bytes, runs only around opt-in terminal phases, and uses no network or unbounded retry. No performance finding remains after accounting for controlled eval repositories; preventing symlink dereference also removes the unbounded external-target read.
- helper coverage: unavailable

## Verification Story

- command or inspection: Full `origin/main...HEAD` diff and commit history; every changed non-task path; plan, task, and verification 12; Standards and Spec explorer passes; targeted Node reproductions against `snapshotRepository`.
- result: Verification 12 records `npm test` with 141 passes, portable build/validation, inventory checks, commit checks, and nine live phases as passed. Fresh reproduction returned `{"changedPaths":[],"gitConfig":"undetected"}` after a local Git-config mutation, and `{"symlinkDecoded":"host-only-secret\n","nestedChange":[]}` for symlink and nested-reserved-directory cases.
- manual, screenshot, or before-and-after evidence: Read-only reproductions used temporary directories and removed them. No screenshot applies.

## Critical and Required Findings

### CR-001 Terminal grading misses Git-config and nested reserved-directory mutations

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/lib.mjs:16`, `evals/run.mjs:228`
- failure mode: A terminal skill can modify `.git/config` or a repository path such as `nested/.agents/hidden.txt` and still pass exact changed-path grading. Snapshots exclude every directory named `.git`, `.agents`, or `.omp`, while the live fallback checks only root `.agents` and `.omp`; `.git` has no separate check. This contradicts the terminal contract that excluded harness paths are checked separately and the setup scenario requirement that Git configuration remain unchanged.
- evidence or reproduction: In a temporary Git repository, snapshot before, run `git config --local review.mutation undetected`, snapshot after: `changedPaths` was `[]` although the config value existed. In a second temporary tree, adding `nested/.agents/hidden.txt` also returned no changed path. `tests/evals-terminal-phase.test.mjs:55-75` proves exclusion, but never proves excluded-state mutation is rejected.
- fix direction: Restrict snapshot exclusions to the root harness directories, and capture/compare mutable local Git configuration separately for live terminal phases. Add focused tests that mutate `.git/config`, root harness state, and nested `.agents`/`.omp` paths and require each undeclared mutation to fail.

### CR-002 Repository snapshots dereference symlinks into retained evidence

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/lib.mjs:23-27`
- failure mode: `snapshotRepository` treats a symbolic link as a file and `readFileSync` follows it. A terminal phase can leave a link to a host file, causing arbitrary host bytes to be copied into `repository-after.json`; a directory link can instead crash snapshot collection. Retained eval evidence can therefore contain data outside the fixture repository.
- evidence or reproduction: A temporary repository containing `linked-secret -> ../host-secret` produced a manifest whose `linked-secret.bytes` decoded to `host-only-secret\n`. Existing snapshot tests cover ordinary files and excluded directories only.
- fix direction: Use `lstat`/`readlink` for symbolic links and record or hash the link target text without following it; alternatively reject symlinks with a clear phase failure. Add file-link and directory-link regressions proving no external bytes are read and snapshot collection does not crash.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none.
- dependency findings: no dependency or lockfile changes. `buildPortable` is called by `scripts/build-runtimes.mjs` for the required portable target; it is not orphaned.

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested local-only setup contract and stronger eval evidence, but its new snapshot boundary creates two major integrity/security gaps in the eval runner.
- rationale: Passing tests and live phases do not exercise the blind spots. Both findings have direct temporary-directory reproductions and narrow fixes at snapshot/check ownership.

## Review Limits

- blocked or unavailable checks: Graft was present as a repository convention but had no graph for this worktree; direct diff inspection was used. Axis helper not yet run.
- residual manual verification: Authenticated provider behavior remains intentionally outside scope. After fixes, rerun the focused terminal snapshot tests plus the repository's aggregate and portable gates.
