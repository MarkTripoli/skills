---
type: code-review
date: 2026-09-21
branch: i-want-do-something
base_branch: main
reviewed_commits:
  - fb4134f
  - 739b0b7
status: clean
summary: "Reviewed R15/R16 iterate-evidence fixes for image-payload binding, sequential media reads, and action-labelled flow parsing. No critical, major, or advisory findings remain; focused tests, full tests, and fresh Codex saved grading cover the changed contracts."
---

# Code Review

## Scope

- reviewed source commits: `fb4134f fix(iterate-evidence): require image payload reads`; `739b0b7 fix(iterate-evidence): serialize media evidence reads`
- reviewed artifact context: `24-implementation-iterate-evidence-image-payload.md`, `25-implementation-iterate-evidence.md`, retained grading results named below, and this PR description refresh
- excluded changes: ignored eval media/output bytes, prior artifacts `23`, `24`, and `25`, and source outside the two reviewed commits
- implementation model constraint: this review was produced in the current OpenAI Codex session; no non-Codex reviewer or subagent was used

## Requirements and Standards

- R15 requirement: required evidence-frame inspection must bind returned image payloads through bare retained image-path reads or bare retained video timestamp reads; `?q=` image questions can only supplement interpretation when paired with a bare binding read.
- R16 requirement: every required bare image-path read or bare video timestamp read must be standalone and sequential, with no concurrent tool call; action-labelled Add one flow IDs must map to increment without weakening conflict-closed mixed-label behavior.
- repository standards: task artifacts stay under `.agents/tasks/i-want-do-something/`, source and task-artifact commits stay separate, user-facing skill changes carry changesets, and focused artifact commits stage explicit paths.

## Change Profile

- `fb4134f` changes the canonical skill, inspection reference, live testing docs, focused tests, and a patch changeset so required frame evidence binds to returned image bytes instead of text-only interpretation.
- `739b0b7` adds the standalone sequential media-read rule to canonical docs, extends `flowName()` for action-labelled Add one variants, preserves conflict rejection for mixed labels, adds `F_COVERAGE_PARSE_R16`, and records a patch changeset.
- The changes are narrow and cohesive. They do not relax viewer authorization, retained-path checks, source mutation rules, or scenario expectations.

## Tests Reviewed First

- focused command: `node --test tests/evals.test.mjs`
- focused result: 19 tests, 19 pass, 0 fail
- full command: `npm test`
- full result: 191 tests, 191 pass, 0 fail
- first fresh valid Codex saved grading: `npm run evals -- iterate-evidence iterate-evidence-label-disagreement iterate-evidence-viewer-blocked iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-no-progress iterate-evidence-continuation --grade evals/results/20260921-033850`
- first fresh valid result: 5/7 passed; primary, label-disagreement after parser fix, viewer-blocked, zero-limit, and three-rounds passed; no-progress and continuation exposed concurrent media-read findings
- targeted fresh Codex saved grading: `npm run evals -- iterate-evidence-no-progress iterate-evidence-continuation --grade evals/results/20260921-042117`
- targeted fresh result: 2/2 passed after R16
- combined fresh Codex evidence: 7/7 accepted across the two retained runs

## Findings

### Correctness

Clean. R15 closes the exact image-payload gap by naming bare image/video timestamp reads as the binding operation and demoting `?q=` to supplemental interpretation. R16 closes the exact viewer lifetime gap by making each required media read a standalone sequential operation and keeps action-labelled flow parsing narrow to Add one/reset synonyms.

### Readability and Simplicity

Clean. The rule text lives beside the existing frame-identity and per-flow inspection rules instead of adding a second inspection model. The parser change is a small normalization extension with explicit conflict coverage.

### Architecture

Clean. Canonical skill docs, acceptance reference, test guidance, evaluator parsing, and focused tests agree on one contract: image payload identity is bound by bare reads, and viewer temporary files must belong to one completed media read lifetime.

### Security and Safety

Clean. The changes do not broaden allowed paths, weaken fail-closed viewer authorization, alter worker delegation authority, or let text answers substitute for recorded pixels. Sequential reads reduce ambiguous temp-file attribution.

### Performance

Clean. R15/R16 add instruction and parser checks only; no hot runtime loop or unbounded scan is introduced. The parser adds two regular expressions over receipt-local labels during grading.

## Critical and Required Findings

None.

## Advisories

None.

## Verification Story

- `node --test tests/evals.test.mjs`: 19/19 focused tests passed.
- `npm test`: 191/191 full tests passed.
- `evals/results/20260921-033850`: fresh valid Codex saved grading passed 5/7, proving primary, label-disagreement after parser fix, viewer-blocked, zero-limit, and three-rounds.
- `evals/results/20260921-042117`: targeted fresh Codex saved grading passed 2/2, proving no-progress and continuation after R16.
- Combined evidence: 7/7 fresh Codex scenarios accepted across the two runs.

## Review Limits

- The seven accepted scenarios are split across two fresh Codex runs, not one single seven-scenario run.
- Retained eval media and review outputs under `evals/results/` are ignored local evidence. This review records paths, commands, and outcomes but does not commit those bytes.

## Verdict

- decision: approve
- overall code-health change: improves
- rationale: R15/R16 replace ambiguous inspection behavior with enforceable image-payload and sequential-read requirements, add focused regressions for both gaps, preserve fail-closed semantics, and are covered by 19/19 focused tests, 191/191 full tests, and 7/7 combined fresh Codex saved grading.
