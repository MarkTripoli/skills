---
type: group-review-context
date:
host:
summary: "Name the request set, the requirement sources read and missed, and the highest-risk leads."
---

# Group Review Context

## Sources

- connectors available:
- request descriptions: `mr-<number>.md` beside this file
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

## Stack and pinned SHAs

| Request | Ticket | Source branch (head) | Target branch | Base SHA |
|---|---|---|---|---|

Review each request as `git diff <remote>/<target>...<remote>/<source>`. Generated code: check only that it matches its inputs.

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
