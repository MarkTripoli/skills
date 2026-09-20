---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 2e005c1
status: findings
summary: "The complete repository-onboarding diff has three major findings. Retained grading loses live process failures and accepts malformed manifest shapes, corrupt regular Git indexes abort evidence capture, and Git-config manifests retain raw credential-shaped bytes."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `2e005c1`
- commits: 71 commits after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product-code findings.

## Previous Round

- previous artifact: `34-code-review-repository-onboarding.md`
- CR-015 Incomplete retained runs can regrade green: fixed for completion and missing-manifest checks; retained exit status and manifest shape remain separate findings below
- CR-016 Semantic Git-index mutations evade grading: fixed; corrupt regular-index handling remains separate below

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add an idempotent, local-only setup skill and trustworthy live/retained evidence that fails on process, repository, harness-root, and Git-state violations.
- change description quality: Fix receipts accurately describe completion and semantic-index checks but do not cover process-status retention, manifest schemas, or raw Git-config persistence.
- implementation model and review model: Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: Skill behavior, eval infrastructure/scenarios, runtime build integration, tests, docs, and release metadata remain one release slice.
- resulting large-file concerns: `evals/run.mjs` is now over 600 lines but still owns one runner lifecycle. No structural split is required before these correctness fixes.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: 188 offline tests cover setup behavior, run completion, semantic index flags, Git-root privacy, portable parity, and concurrency.
- missing or misleading coverage: No retained phase stores its OMP exit code; required manifests are parsed but not shape-validated; malformed regular index bytes and credential-shaped Git-config retention have no regression checks.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, second pass tokens 3169 in / 73 out

### Correctness

- assessment and evidence: Completion metadata and semantic index comparisons work for tested shapes. CR-017 permits live failure to become retained success and malformed evidence to compare equal.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: Runner stages remain ordered, but implicit manifest object shapes now exceed what presence-plus-JSON parsing can safely enforce.
- helper coverage: covered, level 2, confidence 0.82

### Architecture

- assessment and evidence: Live and retained grading share checks but not the process exit input. Snapshot boundaries should emit typed failure evidence rather than crash the run.
- helper coverage: covered, level 2, confidence 0.69

### Security

- assessment and evidence: Symlink and external-root protections remain. CR-019 persists raw local Git-config bytes although grading needs only type and equality evidence.
- helper coverage: covered, level 3, confidence 0.85

### Performance

- assessment and evidence: Each terminal phase already performs one repository snapshot, one excluded-root snapshot, and bounded Git plumbing against its throwaway repository. Persisting one numeric exit code and validating in-memory JSON shapes is linear in existing manifest size. Replacing Git-config payload retention with one SHA-256 digest reduces retained bytes. Converting a failed index command into typed evidence adds no retry or extra scan. No network path, unbounded queue, N+1 loop, or task-caused scalability regression was found.
- helper coverage: covered, level 3, confidence 0.93

## Verification Story

- command or inspection: Fresh 188-test aggregate; focused races three times; portable validation; Node/Deno and commit checks; direct exit-status, malformed-manifest, corrupt-index, and credential-sentinel reproductions.
- result: Existing gates pass. A live phase exiting 7 regrades green; equal `{}` index manifests regrade green; malformed `.git/index` aborts the runner; Git-config sentinel appears base64-encoded in retained manifests.
- manual, screenshot, or before-and-after evidence: No visual surface changed. Four live scenarios and 15 phases remain retained.

## Critical and Required Findings

### CR-017 Retained grading accepts invalid execution evidence

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/run.mjs:553`
- failure mode: A phase that produced expected files and receipt but exited nonzero fails live and passes retained grading. Valid JSON with invalid manifest shape can also compare equal and pass.
- evidence or reproduction: Live grading passes the real OMP code to `grade()`, while regrade hard-codes `0`. Replacing both semantic-index manifests with `{}` still passes because required manifests are checked only for presence and JSON syntax before deep equality.
- fix direction: Persist each phase exit status and use it during regrade. Define and validate the expected schema for every retained manifest before grading. Add regressions for nonzero exit and equal malformed manifests.

### CR-018 Corrupt regular Git index aborts evidence capture

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `evals/git-index.mjs:8`
- failure mode: A phase can replace `.git/index` with corrupt regular-file bytes. Post-phase semantic capture invokes Git, throws status 128, and prevents answer, report, summary, and diagnostic evidence from being written.
- evidence or reproduction: A regular `corrupt-index` payload produces `fatal: .git/index: index file smaller than expected`. Type-only excluded-root capture sees no kind change, and `snapshotGitIndex()` does not convert command/parser failure into typed evidence.
- fix direction: Capture Git command/parser failures as bounded typed semantic-index evidence, complete the recording, and grade before/after mismatch. Add live and retained regressions for corrupt regular-index bytes.

### CR-019 Git-config manifests retain raw sensitive bytes

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/lib.mjs:72`
- failure mode: Local `.git/config` may contain credential-bearing remote URLs or helper material, and both before/after manifests persist its complete bytes as base64.
- evidence or reproduction: `snapshotGitConfig()` delegates regular files to the generic byte-retaining snapshot. Grading uses only equality, so persisted payload bytes are unnecessary. A credential-shaped sentinel remains recoverable from `git-config-before.json`.
- fix direction: Persist regular Git-config type, size if needed, and cryptographic digest only; keep symlink/special-file shape diagnostics without following links. Prove credential sentinels never appear while byte mutations remain detectable.

## Advisories

### ADV-001 CLI parser accepts malformed options

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `evals/run.mjs:66`
- evidence: Unknown `--*` tokens are discarded from scenario names, and value-taking flags may consume another flag. This behavior is task-adjacent but not part of setup acceptance.
- suggestion: Parse once, reject unknown flags, and validate required values when touching this CLI next.

### ADV-002 Testing docs retain stale legacy-skip wording

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `docs/testing.md:87`
- evidence: Earlier text says invalid retained terminal manifests fail; later text says legacy recordings without snapshots are skipped.
- suggestion: Remove the stale legacy-skip sentence while updating retained-evidence documentation.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: Setup behavior is covered, but retained evidence can still lose failures, crash before recording diagnostics, or retain sensitive local configuration bytes.
- rationale: Each major finding invalidates evidence integrity or privacy guarantees.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, retained-regrade, and direct reproductions were used instead.
- residual manual verification: Authenticated provider behavior remains intentionally deferred and unclaimed. Model identity retention was not required by the task or approved plan and was not raised as a finding.
