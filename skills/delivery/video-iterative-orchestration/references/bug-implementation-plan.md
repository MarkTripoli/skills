# Per-Bug implementation-plan approval

Apply this gate only when the owner requests it for named Bugs or all selected Bugs. Newly discovered Bugs inherit it only when that authorization covers them. The gate controls the next new implementation or correction cycle, not already adopted history. Stories and other Bugs continue normally.

## Obtain and review a proposal

After eligibility, dependency and resume intake, dispatch the same ticket owner in `planning` mode with a complete assignment and `plan_review_required: true`. Permit read-only inspection and non-mutating diagnostics; prohibit new product, test, generated-code, fixture or harness edits, commits, pushes, PR submission and runtime acquisition. Do not reserve a shared runtime while approval waits.

The worker returns one short proposal:

```text
PROJ-123 implementation plan v1
Problem: <reported failure>
Approach: <plain-language intended correction>
Expected result: <what should work afterward>
Uncertainty: <material unresolved choice or risk, only when present>
```

Do not require file lists, test commands or an unproved root cause in this owner-facing proposal. The orchestrator checks it against the ticket contract before presenting it. A proposal that changes scope or expected behavior first becomes a recorded decision request.

In indexed tasks allocate and register each revision as the current `plan` in canonical `planning.plan`, at `artifacts/planning/plan/NNNN.md` within the task directory. Follow the immutable artifact contract; never overwrite a recorded proposal or register a series alias. Only genuinely unindexed legacy tasks save revisions with exclusive creation under the ignored orchestration `plans/<bug-key>/<revision>.md` directory. Bind the exact proposal digest, source/contract receipt, adopted head and dirty-diff fingerprint. Preserve earlier approvals and rejections as immutable decisions rather than editing their historical records.

## Present every arrival immediately

Independent planning workers may run concurrently. On each completed plan handoff, review that proposal, ask its question and record `awaiting_plan_approval` before waiting for another worker. Never collect every planning result behind an all-workers barrier or combine several Bugs into one approval. Revised proposals follow the same arrival path. An approved Bug can proceed while another waits.

The orchestrator posts the concise proposal in the active owner chat using a non-blocking native question control when available. Otherwise save the pending question with the immutable proposal and post it in the conversation; continue independent work. This gate adds no Slack bot, daemon or scheduling dependency.

Ask for `Approve PROJ-123 v1` or `Reject PROJ-123 v1: <reason>`. Bind a native answer to its displayed question. A free-form answer must identify the Bug and revision when several proposals are pending; rejection needs a reason. Only the authorized owner can answer. Silence, elapsed time, a worker statement and successful question delivery are not approval.

## Authorize only the approved revision

Record the first valid owner answer with Bug, revision, actor, message/question ID, time, feedback and exact input fingerprints. Conflicting decisions hold only this Bug until clarified; duplicates for decided revisions are stale. Later stop/change instructions are fresh steering, not retroactive edits to approval history. Reconcile recorded unanswered questions on resume rather than assuming silence approved them.

On rejection, return that Bug to `planning` and send its reasons to the same worker for the next immutable proposal. Rejection grants no mutation authority. On approval, refresh eligibility, source contract, head and adopted diff. Authorize that same worker with the approved revision and fingerprint. A material input change invalidates approval and requires a revised proposal. Use the worker assignment validator before new implementation.

On resume, select the digest-validated current indexed plan and approval decision. Without a valid matching approval restore the gate. Keep `planning` and `awaiting_plan_approval` non-terminal, never blockers. Plan approval does not add another permission request for ordinary submission actions already authorized by the assignment.
