# Resume without guessing

Keep a compact ignored `type: babysit` checkpoint for a multi-PR or interrupted run. In indexed tasks, select current `supervision.babysit`; reserve and record a successor at each consequential boundary, retaining prior action outcomes and immutable bytes. Legacy no-index tasks keep their numbered format. The ledger is only a starting point, not a mandatory full table/JSON schema.

## Selection and dependency facts

Key GitHub PRs by `<host>/<owner>/<repo>#<number>`; retain `<host>/<full-project-path>!<iid>` for explicitly selected GitLab repositories. Record selected identities, authority, source branches/heads, source-backed prerequisites, current outcome and next action. Freeze discovered membership; add members only within an owner-approved scope change. External prerequisites may be observed but are outside selected-set mutation authority.

Use native blocker records, explicit PR links, resolved task dependencies or owner decisions for order. A target-to-source branch edge applies only within a project. Preserve uncertain/cyclic dependencies as blockers on affected paths, while independent work continues. The ready frontier contains unfinished nodes whose transitive prerequisites are host-confirmed merged.

Record additional fields only when they affect the next action: worker locks, queue membership, review versions, required evidence or publication state. Unknown essential readiness blocks that action; an unused optional field does not block the run.

## Reconcile consequential actions

Before push, merge/enrollment, cancellation, review resolution or publication, save the identity, intended action and expected head. Save returned IDs/outcomes and confirm through readback. After interruption, inspect host state before retrying an uncertain write; preserve existing worker locks and reconcile orphaned work. A changed head makes a worker result stale. Avoid duplicate replies/publications when their returned IDs already prove completion.

Track handled review by note ID, update time/body hash and revision. Observing a note does not mark it handled; edited old notes remain actionable until disposition/reply/readback. Keep required proof requirements/results separate from optional helper inventories.

## Continue according to progress

Record the last failure, attempted fix and deciding result. Change the approach when new evidence warrants it; escalate an unchanged unexplained failure instead of repeating it indefinitely. A new session does not erase prior attempts, explicit owner limits or unresolved operations. Auth/infrastructure failures identify missing prerequisites, not permission to weaken CI.

Use a sensible polling interval (30 seconds is a starting point), back off when nothing changes and respect a configured coordinator's inbox cadence. Running required jobs are waits, not failed repairs. Record whether monitoring is actually active and where to resume; do not imply an unobserved scheduler.
