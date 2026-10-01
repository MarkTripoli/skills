---
type: slice-review
summary: "One or two sentences: the verdict, the blocking findings, and what the builder must do next."
checkpoint: phase-1
reviewed_artifact: "<plan checkpoint: full task-relative canonical plan path; omit otherwise>"
reviewed_artifact_sha256: "<plan checkpoint: validated SHA-256; omit otherwise>"
reviewed_commit: "<git rev-parse HEAD at the start>"
reviewer_model: "<observed model id, or unobserved: <requested>>"
round: 1
revision: "<contract.mjs revision output at the start>"
status: approve
---

# Slice Review, Round 1

Scope: `<range>`. Previous round: `<record file, or none>`.

## Checks

| Command | Exit | Result |
|---|---|---|
| `<command you ran>` | 0 | <one line> |

## Acceptance criteria

- <criterion>: met | unmet | unproven. <evidence>

## Findings

Heading form `### <id> blocking|follow-up <title>`. A `blocking` finding needs an `Evidence:` line; `status` is `approve` only when none is blocking, and `changes` otherwise. Write `None.` when empty.

### F1 blocking Short title

- Evidence: `<command and output, or path:line>`
- Fix: <one line>

### F2 follow-up Short title

- Evidence: `<path:line>`

## Earlier findings

Round two and later: each earlier blocking id with the builder's disposition (`fixed`, `disputed: <evidence>`) and your verdict (`closed`, `still blocking`). `None.` in round one.
