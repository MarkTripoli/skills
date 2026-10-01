# Engineering guidance review

Run this read-only review in a fresh independent session on the strongest compatible configured model after implementation and before `locally_verified`. It supplements the feature-contract review; it does not change the ticket, source authority, required evidence, or the shared `agent-implementation-reviewer`.

## Pin the reviewed change

Record the ticket, participating repositories, PR target or adopted baseline, source branch and HEAD, and a fingerprint of committed and uncommitted changes. Read the applicable `AGENTS.md`, engineering guides, final diff, changed tests and documentation, and the worker's verification results. Inspect recent comparable code only where it clarifies a changed design choice.

## Ask where the change joins existing behavior

Use these questions when applicable to the selected ticket; none is an automatic pass/fail rule:

- Where does new data enter an existing creation, sending, scheduling, or draft flow? If a parallel path was added, what concrete behavior requires it?
- Are required defaults combined with user choices and deduplicated at the request boundary? Can state be derived from identifiers or saved content instead of another flag?
- Do similar content types retain the same success and failure semantics? Are shared form fields using established controls and validation?
- Do responsibilities remain with their owning layers and modules? Are specialized rules beside the feature that owns them? Did the final diff leave obsolete scaffolding or duplicate paths?
- For changed endpoints, do access filtering, schema introspection, pagination, and generated clients follow relevant repository conventions or have a concrete reason to differ?
- Do focused tests inspect submitted payloads and meaningful input combinations? When the ticket affects them, are delayed and copied paths covered? Do tests and documentation describe the final behavior?

## Report consequences and resolve findings

Record the review and each disposition in a new immutable `feature-conformance` (`review.conformance`) receipt, alongside the row-scoped outcome. Preserve the exact final head and diff fingerprint; do not overwrite earlier review evidence. For each observation, name the repository, file and line, applicable guidance, observed behavior, concrete consequence, and suggested smallest correction. Mark a guideline departure with a sound reason as advisory. Do not raise a finding merely because the implementation differs from a preferred pattern.

The orchestrator records one disposition per observation: request the missing rationale for a new parallel path; correct an evidence-backed in-scope defect or maintenance risk with the same implementation owner; accept a justified exception with its reason; or place a genuine outside-ticket issue in separate follow-up work. An unexplained parallel path is an open review question until its owner shows the distinct requirement or folds it into the shared flow. A product or scope choice remains an orchestrator decision. Do not broaden the ticket or make CI pipeline color a gate.

After a correction, rerun the affected repository checks and review the changed slice plus its interactions. A material change after review invalidates the old diff fingerprint and requires a focused repeat. Continue until no actionable in-scope finding remains or the orchestrator has resolved an authority or recovery question. Advisories do not prevent `locally_verified`.
