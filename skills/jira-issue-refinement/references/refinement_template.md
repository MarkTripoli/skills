---
type: jira-refinement
status: draft
summary: "[Issue key, QA classification, confirmed planning changes, and unresolved requirements.]"
---

# Jira issue refinement

## Source snapshot

- Issue: [key and URL]
- Site/cloudId: [site URL resolved from the issue URL or Jira connection]
- Fetched at: [timestamp]
- Issue updated at: [timestamp or unknown]
- Original HTML SHA-256: [hash or unavailable]
- Rating: [High, Medium, Low, N/A; supplied or self-rated]
- Sources: [issue, comments, linked pages/threads, each with pointer]
- Unseen attachments: [what could not be inspected, or None]

## Proposed ticket

### QA header

[Panel kind, exact header, observed fix state, and prerequisite.]

### Summary and expected result

[Plain-language problem and source-backed expected outcome.]

### Functional specifications

| ID | Checkable behavior | Source | Status |
|---|---|---|---|
| F1 | [Outcome] | [pointer] | confirmed / proposed; confirm with product |

### Background, change, related, and found-in

[Only applicable source-backed facts; omit inapplicable sections in the Jira draft.]

### Open questions

- [Question, owner if known, and impact on implementation; or None.]

### QA guide

- What you need: [setup, devices, build, roles, data, network, tools]
- Steps: [numbered, one action and observation per step]
- Pass: [observable outcome]
- Fail: [observable defect]
- Report: [step, build, screenshots/logs/timings as relevant]
- Extra checks: [separate regression checks, or None]

## Planning impact

- Existing plan or outline: [path and observed revision, or None]
- Confirmed changes to plan before implementation: [each source-backed correction and target criterion/phase, or None]
- Proposed additions requiring product confirmation: [each proposal, or None]
- QA observations to verify during implementation: [each step/outcome, or None]
- Implementation blockers: [critical unknowns not settled by codebase examples, or None]
- Plan reconciliation: pending / applied in [artifact path and revision] / needs-human: [question] / not needed

## Jira write state

- Draft only. No Jira description changed.
- Approved keys: none until explicit user approval.
- On approved apply, re-fetch original HTML, check drift, append it verbatim inside `<details>`, write description only, and verify readback.
