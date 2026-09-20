---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 5ac3521de79b1910deb1a68d6104c41c5fecdc7f
status: findings
summary: "The full `origin/main...HEAD` review found three major evidence-boundary defects. The eval runner inherits Git redirection/configuration, retained summary names can escape the run directory and expose parser excerpts, and Git-index manifests still accept modes and identities Git cannot emit."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `5ac3521de79b1910deb1a68d6104c41c5fecdc7f`
- commits: 89 commits after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product findings.

## Previous Round

- previous artifact: `40-code-review-repository-onboarding.md`
- CR-025 Git-index manifest identity validation is incomplete: fixed for normalized paths, exact object-ID lengths, and duplicate path-stage identities; additional impossible index values remain under CR-028

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add local-only repository setup plus live and retained evidence that fails closed without mutating unrelated state or leaking retained input.
- change description quality: Task artifacts explain all prior review fixes. Current tests omit runner-wide Git environment isolation, retained summary containment, and the remaining Git-index identity constraints.
- implementation model and review model: Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: The release remains one setup-skill slice with supporting eval infrastructure, tests, docs, installation, and release metadata.
- resulting large-file concerns: `evals/run.mjs` and several integration suites are large but the findings belong at their existing boundary owners; no unrelated split is required.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: 227 tests cover setup reconciliation, filesystem evidence, semantic Git-index changes, retained regrade, concurrency, and portable parity.
- missing or misleading coverage: No test injects Git routing/configuration into the whole runner, escapes through retained summary names or symlinks, or rejects invalid index modes, NUL and `.git` paths, and mixed object-ID widths.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 2812 in / 73 out

### Correctness

- assessment and evidence: Setup behavior is covered, but runner preparation can target a different repository and retained completion metadata can authorize the wrong paths.
- helper coverage: covered, level 3, confidence 0.87

### Readability and Simplicity

- assessment and evidence: Validation ownership is identifiable. One shared Git-environment helper and one contained retained-path boundary avoid scattered checks.
- helper coverage: covered, level 2, confidence 0.73

### Architecture

- assessment and evidence: Git process isolation belongs in a shared eval helper used by runner and index capture; retained run ownership belongs before any path construction or file read.
- helper coverage: covered, level 3, confidence 0.63

### Security

- assessment and evidence: Untrusted environment and retained JSON can redirect writes, execute configured helpers, read outside the run, and expose JSON parser excerpts.
- helper coverage: covered, level 3, confidence 0.86

### Performance

- assessment and evidence: Environment filtering, set equality, path containment, and index set checks are linear in already-bounded inputs and add no material I/O.
- helper coverage: covered, level 3, confidence 0.62

## Verification Story

- command or inspection: Two independent complete-diff reviews, focused runner/index tests, direct validator probes, `git diff --check`, and commit validation.
- result: Focused tests passed but direct probes reproduced all three defects. Main-thread pre-review gates passed 227/227 tests and all five live/retained setup scenarios.
- manual, screenshot, or before-and-after evidence: No visual surface changed. Authenticated provider behavior remains intentionally deferred.

## Critical and Required Findings

### CR-026 Eval runner inherits Git routing and configuration

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/run.mjs:86`
- failure mode: Inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_CONFIG_*`, hooks, or fsmonitor configuration can redirect fixture preparation and OMP Git operations or execute an inherited helper.
- evidence or reproduction: Runner probes with redirected repository variables targeted an external repository before fixture commit failure. An injected `core.fsmonitor` configuration executed during semantic index capture. Only `snapshotGitIndex()` removes a partial routing-variable list.
- fix direction: Build one sanitized Git environment, remove all inherited `GIT_*` values, disable system/global configuration, and use it for runner Git commands, OMP, and index capture. Add redirected-routing and injected-config runner regressions.

### CR-027 Retained summary names can escape the run directory

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/run.mjs:348`
- failure mode: A retained summary name such as `../../outside` or a symlinked scenario directory can make regrade read outside the selected run. Raw `JSON.parse` error excerpts can disclose external file prefixes.
- evidence or reproduction: A retained summary containing `../../outside` caused regrade to open the external `report.json` and print its leading content in the parser error.
- fix direction: Require summary names to equal the selected scenario set exactly, reject duplicates/extras, reject symlinked scenario directories, enforce contained report paths before reads, and return bounded JSON errors without parser excerpts.

### CR-028 Git-index manifests accept impossible identities

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/manifest.mjs:5`
- failure mode: Equal malformed manifests can regrade green with arbitrary six-digit octal modes, NUL or `.git` paths, or mixed SHA-1/SHA-256 object-ID widths that one Git index cannot emit.
- evidence or reproduction: Direct probes returned no problem for mode `777777`, `.git/config`, a NUL-containing path, and one manifest mixing 40- and 64-character object IDs.
- fix direction: Accept only Git-emittable index modes, reject NUL and `.git` paths, require one object-ID width per manifest, and add unit plus equal-manifest retained-regrade cases.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: Requested setup behavior works, but eval isolation and retained-evidence integrity remain incomplete.
- rationale: Each defect can create a false-green result, mutate unrelated Git state, or read data outside the retained run.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. One independent aggregate run hit the known untouched native-helper timing flake; the same test passed alone and main-thread aggregate passed 227/227.
- residual manual verification: Authenticated provider behavior remains intentionally deferred and unclaimed.
