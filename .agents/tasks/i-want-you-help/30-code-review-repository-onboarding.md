---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 85146fb40bf0adb614fc2844b7325dbdbc940c14
status: findings
summary: "The complete repository-onboarding diff has two major findings. Fail-closed behavior lacks live proof for secret-shaped managed keys and newer schemas in reset mode, while portable validation builds different skill bytes than the portable installer ships."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `85146fb40bf0adb614fc2844b7325dbdbc940c14`
- commits: 56 commits after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product-code findings.

## Previous Round

- previous artifact: `28-code-review-repository-onboarding.md`
- CR-009 Concurrent eval runs share one recording directory: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add an independently installable, idempotent `/setup-repository` skill that owns only local onboarding metadata, fails closed on unsafe state, preserves foreign state, and leaves a provider-specific seam without remote operations.
- change description quality: The task, plan, implementation receipts, verification artifact, and review-fix receipts state behavior, evidence, and release limits. The newest verification predates CR-001 through CR-009; current review used later receipts, current source, and rerun checks.
- implementation model and review model: Implementation model was not retained in artifacts. Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: 32 product files, 2,273 insertions, and 25 deletions. The skill, terminal-eval infrastructure, runtime build support, fixtures, tests, docs, and release metadata form one release slice but required repeated safety hardening.
- resulting large-file concerns: `evals/run.mjs` is 528 lines and `tests/evals-terminal-phase.test.mjs` is 451 lines. No blocking split is required because orchestration and scenario assertions remain grouped by one responsibility each.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: 179 offline tests cover installation, metadata/provider contracts, repository and excluded-root snapshots, Git-root privacy, retained regrading, and same-root concurrent eval isolation. Retained live scenarios cover first run, no-op rerun, migration, invalid JSON, newer-schema reconciliation, provider preservation, supported reset, and reset rerun.
- missing or misleading coverage: The live safety scenario never executes a valid document containing a secret-shaped nested `onboarding` key and never runs a newer schema through `reset-managed`. The portable release command validates a generated tree whose `SKILL.md` bytes differ from portable installer output.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 3005 in / 73 out

### Correctness

- assessment and evidence: Current and migration behavior, owned-state preservation, exact-mode handling, and CR-001 through CR-009 regressions are covered. CR-010 and CR-011 leave two claimed release behaviors unproven or validated against the wrong artifact.
- helper coverage: covered, level 3, confidence 0.93

### Readability and Simplicity

- assessment and evidence: Skill steps and metadata ownership rules use direct ordered flows. Snapshot records distinguish files, directories, symlinks, and special entries without speculative compatibility paths.
- helper coverage: covered, level 2, confidence 0.80

### Architecture

- assessment and evidence: Canonical skills remain the source and runtime adapters own runtime notes. CR-011 violates that boundary by maintaining separate portable build paths with different output semantics.
- helper coverage: covered, level 2, confidence 0.57

### Security

- assessment and evidence: Snapshot capture avoids following symlinks or opening special files, and Git-config capture requires a real local Git directory. CR-010 leaves the secret-shaped managed-key redaction branch unproven against the model-executed skill.
- helper coverage: covered, level 3, confidence 0.64

### Performance

- assessment and evidence: Filesystem scans are bounded to throwaway repositories and skill trees; concurrent runs use exclusive directory reservation without locks or retries of complete runs. No task-caused scalability regression was found.
- helper coverage: covered, level 3, confidence 0.61

## Verification Story

- command or inspection: `for i in 1 2 3; do node --test tests/evals-concurrent-runner.test.mjs || exit 1; done`; `npm test`; portable build and validation; Node and Deno checks; commit validation; complete diff and source inspection.
- result: Concurrent proof passed 3/3; 179 tests passed; 44 portable skills validated; syntax/static checks passed; 56 commit subjects passed. Direct byte comparison established that CLI portable build inserts `Runtime: Portable.` while portable installation copies canonical `SKILL.md` unchanged.
- manual, screenshot, or before-and-after evidence: No interface changed. Prior live eval evidence covers nine phases, but neither CR-010 branch is among them.

## Critical and Required Findings

### CR-010 Fail-closed branches lack behavioral evidence

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/scenarios/setup-repository-safety.mjs:60`
- failure mode: A valid document containing a secret-shaped key under `onboarding` may be rewritten or echoed, and `reset-managed` may downgrade an unsupported newer schema, without any live release gate detecting either violation.
- evidence or reproduction: `skills/setup-repository/SKILL.md:21` requires secret-shaped managed keys to conflict without exposing values. `skills/setup-repository/references/repository-metadata.md:75` requires newer schemas to remain blocked in both modes. The safety scenario runs invalid JSON, newer-schema `reconcile`, provider-state `reconcile`, supported `reset-managed`, and a reset rerun only. Because the implementation is model-executed instructions, static provider-fixture key rejection does not exercise these branches.
- fix direction: Add terminal fixtures/phases for a valid document with a nested secret-shaped managed key and for schema version 2 under exact `reset-managed`. Require unchanged bytes, zero writes and operations, redacted secret output, and supported/observed version evidence.

### CR-011 Portable proof validates different bytes than installation

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `scripts/lib/build.mjs:80`
- failure mode: `npm run build -- --runtime portable` can pass while the actual portable installer ships a different skill tree, so the documented release gate does not verify the installed artifact.
- evidence or reproduction: `buildPortable()` inserts `Runtime: Portable.` into every `SKILL.md` at `scripts/lib/build.mjs:90`. `buildTrees()` independently copies canonical portable skills unchanged at `scripts/install.mjs:364-368`. A temporary installation/build comparison reports unequal `setup-repository/SKILL.md` bytes, with the runtime marker present only in CLI output.
- fix direction: Route both CLI portable builds and installer portable trees through one builder, then add a byte-parity test between both entry points while preserving selected-skill installation behavior.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the requested skill and materially hardens eval isolation, but two release-proof gaps remain.
- rationale: CR-010 leaves security-sensitive fail-closed behavior unexercised. CR-011 proves a generated portable artifact rather than the installer output users receive.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, and commit checks replaced it.
- residual manual verification: Authenticated provider behavior remains intentionally deferred and unclaimed.
