---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 85e3fc3
status: findings
summary: "The complete repository-onboarding diff has two major false-green paths. Regrading can accept an incomplete or damaged retained run, and terminal grading does not detect persistent semantic Git-index flag changes such as `assume-unchanged`."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `85e3fc3`
- commits: 66 commits after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product-code findings.

## Previous Round

- previous artifact: `32-code-review-repository-onboarding.md`
- CR-012 Invalid-JSON redaction assertion is inert: fixed
- CR-013 Active latest run can regrade as success: fixed for `latest`, still open for explicitly selected incomplete runs and raised below as CR-015
- CR-014 Required model branches lack behavioral evidence: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add an idempotent, local-only `/setup-repository` skill and release-grade terminal evidence that rejects repository, harness-root, and Git-state side effects.
- change description quality: Artifacts identify prior fixes and evidence. Fix receipt 33 does not cover completed-subset grading during a multi-scenario run or semantic Git-index flags.
- implementation model and review model: Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: 38 product files across skill behavior, eval infrastructure/scenarios, installer/build integration, tests, docs, and release metadata.
- resulting large-file concerns: `evals/run.mjs` and terminal tests are large but remain cohesive; no split is required for these findings.
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: 182 offline tests plus retained live evidence cover setup modes, migrations, safety branches, snapshots, portable parity, and run concurrency.
- missing or misleading coverage: Active-run coverage blocks the sole selected scenario before `answer.md`; it does not cover a completed selected scenario while another scenario keeps the run incomplete. Missing terminal manifests are marked skipped and removed from failure aggregation. Index tests intentionally omit ordinary file bytes but do not retain semantic flags.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 2752 in / 73 out

### Correctness

- assessment and evidence: Setup behavior and required model branches are covered. CR-015 allows incomplete evidence to satisfy a regrade; CR-016 allows repository state to escape the no-mutation contract.
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: Current flows are direct. Regrade uses absence as both legacy-skip and corruption/incompletion, making success semantics ambiguous.
- helper coverage: covered, level 2, confidence 0.87

### Architecture

- assessment and evidence: `summary.json` is the natural run-completion boundary but regrade does not require it. Git-index semantic state needs a separate stable snapshot instead of reopening raw volatile bytes.
- helper coverage: covered, level 2, confidence 0.72

### Security

- assessment and evidence: Symlink, special-file, Git-root, config, and secret-redaction protections remain. CR-016 permits a persistent index concealment flag that can hide later repository changes from ordinary Git status.
- helper coverage: covered, level 2, confidence 0.51

### Performance

- assessment and evidence: Required repairs can use one run-completion file check and one bounded Git-index semantic snapshot per terminal phase. No current hot-path scalability regression was found.
- helper coverage: covered, level 3, confidence 0.52

## Verification Story

- command or inspection: Fresh `npm test`; focused changed-surface tests; portable validation; complete source/test inspection; explicit partial-run regrade reproduction; retained recording with one terminal manifest removed; `git update-index --assume-unchanged README.md` reproduction.
- result: 182 tests pass, but completed-subset grading exits 0 without `summary.json`; missing-manifest grading prints `0/0 scenarios passed` and exits 0; index flag mutation survives both phases while the scenario passes.
- manual, screenshot, or before-and-after evidence: No visual surface changed. Live setup evidence covers four scenarios and 15 phases.

## Critical and Required Findings

### CR-015 Incomplete retained runs can regrade green

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `evals/run.mjs:487`
- failure mode: An explicitly selected active multi-scenario run can grade a completed subset and exit 0 before run completion. A completed recording missing required terminal manifests is marked skipped, removed from failures, and also exits 0.
- evidence or reproduction: `summary.json` is written only after every scenario completes, but grade mode does not require it. Regrading a completed basic scenario while another selected scenario remained blocked exited 0 with no summary. Deleting `repository-after.json` from a completed terminal recording produced `0/0 scenarios passed (1 not recorded)` and exit 0.
- fix direction: Require run-level completion evidence before any regrade. Treat missing required manifests in a completed run as a failed incomplete phase, not a successful skip. Add regressions for both active multi-scenario subset grading and damaged retained evidence.

### CR-016 Semantic Git-index mutations evade grading

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `evals/run.mjs:58`
- failure mode: A terminal skill can set persistent index flags such as `assume-unchanged`, causing later changes to be hidden from normal Git status, while repository setup evidence passes.
- evidence or reproduction: Ordinary `.git/index` contents are intentionally reduced to a type-only record. Running `git update-index --assume-unchanged README.md` during the scenario leaves `git ls-files -v README.md` reporting lowercase `h`, while both terminal phases pass because HEAD, worktree bytes, config, and index entry type remain unchanged.
- fix direction: Retain and compare a stable semantic Git-index snapshot that covers tracked path, stage/mode/object identity, and persistent flags while excluding volatile stat-cache fields. Add positive no-op and flag-mutation regressions without reintroducing raw-index byte false positives.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: The requested skill is implemented, but eval evidence can still report success despite incomplete recordings or persistent Git-index state changes.
- rationale: Both findings invalidate the release gate rather than optional polish.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live, retained-regrade, and direct reproductions were used instead.
- residual manual verification: Authenticated provider behavior remains intentionally deferred and unclaimed.
