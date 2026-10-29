# Choose a structure by reader use

Use these starting points only for a new document without a required template. They apply the collection writing guide to common reader tasks. Do not add empty sections to match an outline.

| Reader's task | Start with | Supporting material | End with |
|---|---|---|---|
| Decide whether to proceed | Recommendation and deciding constraint | Evidence, alternatives, costs, and consequences | The decision still needed and its owner |
| Resume someone else's work | Completed outcome and present state | Relevant decisions, remaining work, and locations of inputs | One executable next action or exact blocker |
| Trust a verification result | Result and the tested boundary | Requirement-to-observation mapping and reproducible receipts | Untested boundaries and how to obtain missing proof |
| Repair a defect found in review | User-visible failure and location | Trigger, evidence, and affected behavior | Required correction, distinct from optional polish |
| Understand a behavior | A concrete situation and its observable result | States or causes in the order they occur | The conditions where the explanation does not apply |
| Carry out a procedure | Goal, target, and prerequisites | Ordered actions, warnings, and observable outcomes | Success condition and supported recovery path |
| Pick up a ticket | Required outcome for the affected person | Acceptance criteria and scope boundary | Unresolved dependency or decision, if any |
| Answer a request | The requested outcome and why it matters | Inputs, constraints, and the requested recipient's part | Where the recipient should return the answer |

## Summarize without concealing evidence

A status update is a snapshot, not a growing log. Group related work so the reader can distinguish completion, active work, blockers, and decisions. Verify the source of a status before carrying it into a new update. Give each issue or pull request a short descriptive title rather than a bare identifier.

A verification report distinguishes an observed pass, an observed failure, and an unperformed check. Name the tested version and environment when they affect the result. Link the captured output or evidence record. A sentence saying "verified" is not itself proof.

A cost report states the accounting period, included usage, pricing basis, and whether the total is measured or estimated. Compare like-for-like figures. Keep a missing usage source visible rather than treating it as zero.

## Separate the current answer from its history

A handoff should let the next reader act without reconstructing the conversation. Keep decisions that still constrain the work. Put chronological detail in a linked log only when that log is useful.

For an indexed task, the current semantic record identifies the current answer. Older iterations remain immutable history. A fresh summary does not authorize modifying its source receipts or rewriting prior decisions.

## Translate engineering detail for another reader

Choose details by their effect on that reader's decision. A product reader may need the permission boundary and failure behavior, while an engineer also needs the responsible module. Do not remove a material limitation merely because its mechanism is technical. Explain its consequence in plain words.

If one document serves distinct readers, put shared outcomes first and separate the specialized detail. Create separate documents only when the tasks genuinely differ or the user requests them. Do not multiply outputs to satisfy an arbitrary audience count.

## Keep a request distinct from a specification

A request to a colleague identifies the desired outcome, reason, and relevant constraints. It need not dictate an implementation method unless that method is itself a requirement.

A specification needs testable conditions and observable responses. Do not turn an uncertain suggestion into a requirement or imply that editorial cleanup supplies missing product authority. Record the unanswered choice for its owner.
