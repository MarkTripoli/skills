# Feature-contract review adapter

Use this adapter before `locally_verified`. It keeps feature-contract interpretation inside `video-iterative-orchestration`; the shared `agent-implementation-reviewer` remains a generic plan-to-diff reviewer.

## Prepare the review plan

Write an ignored `implementation-review-plan.md` beside the feature contract. Include only the relevant ticket rows. For each row, record:

- requirement ID, ticket, selected write surface, and observable behavior;
- API, lifecycle, and `must_not` boundaries;
- required evidence and its exact paths or links;
- mapped Figma nodes or design-document sections and their recorded source resolution;
- current decision, disposition, source-change state, adopted baseline, and final PR.

Do not add requirements from the epic, unmapped design content, or repository observations. The review plan adapts the existing contract; it does not replace or broaden it.

## Dispatch the unchanged reviewer

Use a fresh read-only reviewer session on the strongest compatible configured model, never the builder economy session. Give `agent-implementation-reviewer` this adapter path, the generated review-plan path as its plan, the task directory, base branch or adopted PR baseline, final diff, and named evidence packet. Ask for its standard plan-to-diff report. Do not request a feature-contract mode, a custom output structure, a product decision, or a deviation approval.

The reviewer reports implemented items, deviations, additions, and missing work. It does not mutate the contract or assign lifecycle, decision, blocker, or delivery states.

## Map the report to contract outcomes

The orchestrator reads the complete reviewer report and assigns exactly one outcome per row:

- `implemented + evidence` only when the diff implements the row, every required proof is present, and the report identifies no unresolved deviation or missing work for it;
- `approved deviation` only when the feature contract already records `approved_deviation` with its approval reference and the diff and evidence match that recorded departure;
- `deferred` or `not in release` only when the feature contract already records that status and disposition;
- `not implemented` otherwise.

Treat `update_detected`, `reconciliation_active`, or `source_unavailable` as `not implemented` for delivery. A ticket-only row needs no external design evidence. For mapped sources, apply the contract's recorded authority resolution; do not let the generic reviewer or its plan reopen a valid orchestrator decision. The orchestrator updates the contract, runs delivery validation, and returns repairable gaps to the existing implementation owner.

Pin the review to the digest-validated current contract receipt, exact JSON snapshot/hash, final head and diff fingerprint. A material source, contract or diff change invalidates the review and requires a new receipt and focused independent review. Save the mapped outcome in a new `feature-conformance` (`review.conformance`) iteration, never by editing a prior record.
