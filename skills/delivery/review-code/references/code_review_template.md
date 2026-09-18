---
type: code-review
date:
branch:
base_branch:
base_sha:
head_sha:
status: findings
summary: "State the reviewed scope, the highest-risk result, and what the next phase must do."
---

# Code Review

## Scope

- merge base:
- reviewed HEAD:
- commits:
- staged and unstaged changes:
- task-owned untracked files:
- excluded changes:

## Previous Round

- previous artifact:
- CR-001 Short title: fixed | still open | declined

`None.` in the first round. Identifiers and titles only, from the previous artifact's `## Critical and Required Findings`; a finding still open is raised again below under a new identifier.

## Requirements and Standards

- task or ticket:
- implementation source:
- repository instructions:

## Change Profile

- intent and expected behavior:
- change description quality:
- implementation model and review model:
- changed-line size and logical cohesion:
- resulting large-file concerns:
- dependency or lockfile changes:

## Tests Reviewed First

- behavior claimed by tests:
- missing or misleading coverage:

## Five-Axis Assessment

- helper axis-coverage: model `<model>`, tokens `<n>` in / `<m>` out (or `unavailable`)

### Correctness

- assessment and evidence:
- helper coverage: covered | asserted | skipped | unclear, level 0-3, confidence 0.00 (or `unavailable`)

### Readability and Simplicity

- assessment and evidence:
- helper coverage: covered | asserted | skipped | unclear, level 0-3, confidence 0.00 (or `unavailable`)

### Architecture

- assessment and evidence:
- helper coverage: covered | asserted | skipped | unclear, level 0-3, confidence 0.00 (or `unavailable`)

### Security

- assessment and evidence:
- helper coverage: covered | asserted | skipped | unclear, level 0-3, confidence 0.00 (or `unavailable`)

### Performance

- assessment and evidence:
- helper coverage: covered | asserted | skipped | unclear, level 0-3, confidence 0.00 (or `unavailable`)

## Verification Story

- command or inspection:
- result:
- manual, screenshot, or before-and-after evidence:

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 Short title

- type: Nitpick | Potential issue | Refactor suggestion
- severity: critical | major
- category: Functional correctness | Security and privacy | Data integrity and integration | Performance and scalability | Stability and availability | Maintainability and code quality
- location: `path:line`
- failure mode:
- evidence or reproduction:
- fix direction:

Use `None.` only after the complete pinned scope has been reviewed and every suspected issue has been rejected with evidence.

## Advisories

### ADV-001 Short title

- type: Nitpick | Potential issue | Refactor suggestion
- severity: minor | trivial | info
- category: Functional correctness | Security and privacy | Data integrity and integration | Performance and scalability | Stability and availability | Maintainability and code quality
- location: `path:line`
- evidence:
- suggestion:

Use `None.` when there are no non-blocking notes. Advisories do not trigger a fix round.

## Dead Code and Dependency Review

- newly orphaned code:
- dependency findings:

## Verdict

- decision: approve | request_changes | blocked
- overall code-health change:
- rationale:

## Review Limits

- blocked or unavailable checks:
- residual manual verification:
