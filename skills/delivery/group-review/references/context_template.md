---
type: group-review-context
slug:
date:
host:
summary: "Name the request set, the requirement sources read and missed, and the highest-risk leads."
---

# Group Review Context

## Sources

- connectors available:
- request descriptions: `<workspace>/mr-<number>.md` (unindexed working data)
- tickets (connector):
- epic (connector):
- product and design documents (connector):
- UI designs (connector):
- recordings (connector):
- repository documents (path and ref): None.
- unreachable sources: None.

## Reviewer checkout

- user branch:
- user HEAD:
- worktree root:

## Repository review rules

Read from the pinned `<start_sha>` target. Rules are heuristics unless the repository says they gate.

- rule index: `.code-review/README.md` (how rules apply, what is out of scope), or None.
- convention files the rules cite:

| Request | Rule files that apply | Why (topic the diff touches) |
|---|---|---|

- rule files a request changes: None.

## Stack and pinned SHAs

| Request | Ticket | Source branch (head) | Target branch | Base SHA |
|---|---|---|---|---|

Review each request as `git diff <base_sha> <head_sha>`. Generated code: check only that it matches its inputs.

## Product frame

- What the feature is and the product rules the code must honor, with the source of each rule.
- Out of scope for these tickets.
- Places where the product document and the tickets disagree.

## Ticket acceptance criteria

### <TICKET> <title> (<request>)

- Contract, including any amendment that supersedes earlier criteria.
- AC1

## Leads to verify

1. `path:line`: what looked wrong on first read and what would confirm it.
