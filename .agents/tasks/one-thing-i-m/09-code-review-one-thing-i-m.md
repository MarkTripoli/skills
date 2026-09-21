---
type: code-review
date: 2026-09-20
branch: one-thing-i-m
base_branch: origin/main
base_sha: 530928c
head_sha: dd3a528
status: clean
summary: "The pinned diff adds caller-owned model availability without weakening the existing economy-first and fail-closed JEV policy. Focused and full tests cover the changed selector behavior; no critical, major, or advisory findings remain."
---

# Code Review

## Scope

- merge base: `origin/main` at `530928c`
- reviewed HEAD: `dd3a528`
- commits: 11 commits after the merge base, including the task artifacts and focused implementation commits
- staged and unstaged changes: none before this review artifact
- task-owned untracked files: none
- excluded changes: task artifacts under `.agents/tasks/one-thing-i-m/` were not review subjects

## Previous Round

- previous artifact: None.
- CR-001 Short title: None.

`None.` in the first round.

## Requirements and Standards

- task or ticket: `.agents/tasks/one-thing-i-m/task.md`
- implementation source: `.agents/tasks/one-thing-i-m/05-plan-one-thing-i-m.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`

## Change Profile

- intent and expected behavior: Keep economical defaults, allow JEV escalation only for eligible phases, and constrain selection to caller-provided available models.
- change description quality: The task and plan state the availability ownership, compatibility path, escalation boundary, and fail-closed cases.
- implementation model and review model: Implementation was performed inline in Pi; no separate worker tool was available. Review was performed in a fresh read-only pass; JEV axis coverage was requested below.
- changed-line size and logical cohesion: 61 selector/test lines plus 12 wiring/documentation lines; cohesive across the selector boundary and its workflow transport.
- resulting large-file concerns: None. The selector and existing test fixture remain small and focused.
- dependency or lockfile changes: None. `npm ci` installed existing lockfile dependencies; no lockfile diff.

## Tests Reviewed First

- behavior claimed by tests: Existing typed JEV envelope validation, fixed/policy routing, economy/reasoning choice, and service failure remain covered; new tests cover duplicate normalization, unavailable reasoning, unavailable economy, explicit empty availability, and fixed-mode enforcement (`tests/atomic-model-routing.test.mjs:70-159`).
- missing or misleading coverage: No live provider/account probe exists by design. The caller-owned availability contract is documented and inspected, not proven against an external account.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, 2182 tokens in / 73 out

### Correctness

- assessment and evidence: The selector validates availability before routing, refuses a missing economy candidate, avoids JEV when reasoning is unavailable, and preserves the existing typed choice validation. Full tests passed with 155 tests.
- helper coverage: covered, level 3, confidence 0.95

### Readability and Simplicity

- assessment and evidence: Candidate normalization and economy validation are local to `models.mjs`; workflow transport adds one input and one selector option without a new abstraction layer.
- helper coverage: covered, level 3, confidence 0.81

### Architecture

- assessment and evidence: Availability is owned by the caller and enforced at the shared selector, while runtime adapters remain provider-neutral. The controller includes availability in checkpoint arguments and selector options.
- helper coverage: covered, level 3, confidence 0.91

### Security

- assessment and evidence: The new list contains model identifiers only; no provider credentials or responses enter the selection record. The repository does not probe provider accounts or add a secret-bearing integration.
- helper coverage: covered, level 3, confidence 0.70

### Performance

- assessment and evidence: Availability filtering is an in-memory de-duplication and membership check; unavailable reasoning avoids a network JEV call. No additional provider request or retry loop is introduced.
- helper coverage: covered, level 3, confidence 0.90

## Verification Story

- command or inspection: `npm test`; `npm run check-commits -- origin/main..HEAD`; read-only diff and surrounding selector/controller code.
- result: 155 tests passed; 11 commit subjects passed validation; the diff is cohesive and no test was deleted, skipped, or weakened.
- manual, screenshot, or before-and-after evidence: Not applicable to this non-UI routing change.

## Critical and Required Findings

None.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: None. All new fields are consumed by selection records, checkpoint arguments, documentation, or tests.
- dependency findings: None.

## Verdict

- decision: approve
- overall code-health change: The change adds one explicit capability boundary while preserving existing routing policy and fail-closed behavior.
- rationale: The implementation matches the plan, tests cover the new failure and escalation paths, and no actionable issue remains in the pinned scope.

## Review Limits

- blocked or unavailable checks: No required check was blocked.
- residual manual verification: Provider/account availability is caller-supplied and was not tested against a live account.
