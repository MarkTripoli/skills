---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 95b73aa
status: findings
summary: "The complete repository-onboarding diff has five major findings. Retained manifests still accept invalid path domains and mismatched digests; setup can dereference unsafe metadata entries; permission-only changes evade grading; inherited Git routing can snapshot another repository; and unreadable regular files can abort evidence capture."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `95b73aa`
- commits: 78 commits after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product-code findings.

## Previous Round

- previous artifact: `36-code-review-repository-onboarding.md`
- CR-017 Retained grading accepts invalid execution evidence: fixed for status and record shapes; domain and digest validation remains separate below
- CR-018 Corrupt regular Git index aborts evidence capture: fixed
- CR-019 Git-config manifests retain raw sensitive bytes: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add a local-only setup skill plus live and retained evidence that detects every unauthorized repository or Git-state mutation without exposing external or sensitive bytes.
- change description quality: Prior receipts cover typed status, record schemas, index errors, and config digests. They do not cover manifest path ownership, payload/digest consistency, metadata entry types, permission bits, Git environment routing, or unreadable-file capture.
- implementation model and review model: Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: Skill behavior, eval infrastructure/scenarios, build/install integration, tests, docs, and release metadata remain one release slice.
- resulting large-file concerns: New validation should remain in focused modules; no additional orchestration belongs in `evals/run.mjs` unless lifecycle-specific.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: 206 offline tests cover setup behavior, strict record shapes, retained process status, bounded index failures, config redaction, concurrency, and portable parity.
- missing or misleading coverage: Equal malformed manifests with invalid path domains or mismatched hashes can pass. No scenarios cover metadata symlink/FIFO entries, chmod-only mutations, inherited Git routing, or unreadable regular-file capture.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, second pass tokens 3325 in / 73 out

### Correctness

- assessment and evidence: Existing accepted paths are covered. CR-020 and CR-022 permit malformed or changed state to compare equal; CR-023 can snapshot the wrong repository.
- helper coverage: covered, level 3, confidence 0.95

### Readability and Simplicity

- assessment and evidence: Extracted modules clarify ownership. Validators need explicit path-domain and payload-integrity contracts rather than syntax-only checks.
- helper coverage: covered, level 2, confidence 0.82

### Architecture

- assessment and evidence: Snapshot modules are the responsible boundary for typed failure evidence and normalized metadata. Setup instructions must validate entry type before content parsing.
- helper coverage: covered, level 2, confidence 0.70

### Security

- assessment and evidence: CR-021 can expose an external symlink target or block on a FIFO; CR-022 can widen permissions on metadata; CR-023 honors hostile repository-routing variables; CR-024 can suppress retained diagnostics.
- helper coverage: covered, level 3, confidence 0.95

### Performance

- assessment and evidence: Path-domain checks inspect each retained key once. Digest verification hashes bytes already retained in each record and does not reopen repository files. Permission capture reuses each existing `lstat`; Git-environment sanitization changes only child-process options. Bounded read errors replace thrown reads without retries. These repairs add no repository traversal, network call, unbounded collection, or N+1 subprocess loop beyond the existing per-phase snapshots.
- helper coverage: covered, level 3, confidence 0.87

## Verification Story

- command or inspection: Fresh 206-test aggregate; focused suite three times; portable validation; Node/Deno and commit checks; direct validator, symlink/FIFO, chmod, redirected-Git, and unreadable-file probes.
- result: Existing gates pass. Validators accept traversal/mis-bucketed paths and mismatched hashes; chmod-only snapshots compare equal; `GIT_DIR` redirects index capture; unsafe metadata entry reads and unreadable snapshot reads remain unguarded.
- manual, screenshot, or before-and-after evidence: No visual surface changed. Live evidence covers four scenarios and 15 phases.

## Critical and Required Findings

### CR-020 Retained manifest integrity is incomplete

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/manifest.mjs:57`
- failure mode: Equal corrupted before/after evidence can reach normal grading despite parent traversal, repository entries under excluded roots, records in the wrong excluded-root bucket, or hashes that do not match retained bytes/link targets.
- evidence or reproduction: Validators return no problem for `../outside`, `.git/config` in a repository manifest, `README.md` in the `.agents` bucket, and mismatched file or symlink SHA-256 values.
- fix direction: Enforce normalized relative path domains for repository and each excluded-root bucket, reject traversal and reserved roots, and recompute digests from retained payload or link target. Add equal-before/after retained-regrade regressions.

### CR-021 Setup can dereference unsafe metadata entries

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `skills/setup-repository/SKILL.md:20`
- failure mode: Reading `ai-utilities.json` before checking its entry type can disclose an external symlink target or block indefinitely on a FIFO.
- evidence or reproduction: Skill instructions require reading bytes whenever the path exists, then validate parsed content. No lstat/type gate or symlink/FIFO scenario exists.
- fix direction: Require lstat before any read; accept only absent or regular non-symlink files. Reject directory, symlink, FIFO, socket, and device entries with redacted conflict, zero reads/writes, and zero external operations. Add valid/dangling/external symlink and FIFO evidence.

### CR-022 Permission-only mutations evade grading

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/lib.mjs:40`
- failure mode: A phase can widen `ai-utilities.json` from `0600` to `0644` while bytes remain unchanged and terminal grading passes.
- evidence or reproduction: File and directory records omit normalized permission bits; before/after deep equality therefore ignores chmod-only changes.
- fix direction: Record and validate normalized permission bits for regular files and directories. Require setup atomic replacement to preserve an existing metadata file's permissions. Add chmod-only and no-op regressions.

### CR-023 Git-index capture inherits repository routing

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/git-index.mjs:42`
- failure mode: Inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, common-dir, or object-directory variables can make evidence describe another repository.
- evidence or reproduction: With `GIT_DIR` pointing at repository B, `snapshotGitIndex(repositoryA)` returns B's tracked path despite validating A's `.git` entry.
- fix direction: Invoke Git with explicit repository paths and a sanitized environment that removes repository-routing/object overrides. Add redirected-environment tests.

### CR-024 Unreadable regular files abort evidence capture

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `evals/git-config.mjs:44`
- failure mode: Making a repository or Git-config file unreadable causes post-phase capture to throw before answer, report, summary, and diagnostics are retained.
- evidence or reproduction: Regular-file reads in repository and config snapshots have no bounded error conversion; mode `000` reproduces `EACCES` on non-root execution.
- fix direction: Convert read failures into bounded typed evidence with entry kind, operation, safe error class, digest only when readable, and no payload/raw error text. Extend schemas and live/regrade tests.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: The setup and evidence pipeline is substantially hardened, but five integrity and privacy boundaries remain bypassable.
- rationale: Each finding can create a false green, disclose external data, or prevent diagnostic evidence from being retained.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, retained-regrade, and direct probes were used instead.
- residual manual verification: Authenticated provider behavior remains intentionally deferred and unclaimed. One unchanged native-test case flaked in an independent worker and passed immediately in isolation; main-thread aggregate passed 206/206.
