---
type: slice-review
summary: "One or two sentences: the verdict, the blocking findings, and what the builder must do next."
checkpoint: phase-1
reviewed_artifact: "<plan or phase slice: current task-relative canonical plan path; omit for final>"
reviewed_artifact_sha256: "<plan or phase slice: validated current plan SHA-256; omit for final>"
reviewed_commit: "<git rev-parse HEAD at the start>"
reviewer_model: "<observed model id, or unobserved: <requested>>"
round: "<review-next next_round; immutable iteration number is not the round>"
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

Heading form `### <id> blocking|follow-up <title>`. A `blocking` finding needs an `Evidence:` line; `status` is `approve` only when no finding blocks and every current check exited 0, and `changes` otherwise. Record every command actually run in Checks, including failed exits. Retained baseline failures not run by this reviewer belong in acceptance context, with their source pointer. Write `None.` when empty.

### F1 blocking Short title

- Evidence: `<command and output, or path:line>`
- Fix: <one line>

### F2 follow-up Short title

- Evidence: `<path:line>`

## Earlier findings

Round two and later: each earlier valid blocking id with the builder's disposition (`fixed`, `disputed: <evidence>`) and your verdict (`closed`, `still blocking`). `None.` when no earlier valid blockers exist. A contract-invalid attempt is preserved but consumes no round; a new plan digest never resets valid checkpoint rounds.
