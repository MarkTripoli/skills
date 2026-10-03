---
name: babysit
description: Supervises scoped pull requests in dependency order, repairs authorized CI and review failures, and merges under explicit authority. Use when the user runs /babysit or resumes a saved babysit selection.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Babysit ordered pull requests

Keep the selected PRs moving toward the owner's goal. Choose investigation, repair, delegation and verification to fit the problem; keep precise safeguards around publication, history rewriting and merging. This is an active-session workflow, not a daemon or a mandatory delivery pipeline.

## Scope and authority

Accept `/babysit <PR URLs or scoped request>` or `/babysit @<checkpoint>`. Resolve exact host/repository/number identities and freeze the selection; retain project-scoped IIDs for an explicitly selected GitLab repository. GitHub is the default, through its authenticated `gh` session. Use source-backed prerequisites, including external PRs; membership alone is not dependency order.

Observe-only grants no writes. “Fix and merge these until complete” authorizes scoped repairs, safe merging and cancellation of unsafe enrollment. Bare “babysit” does not authorize merging. Record additional history-rewrite, retargeting, description and issue-specific Jira authority when needed. Preserve unrelated worktrees and owner changes; ask only for consequential decisions unavailable from sources.

## Work the ready frontier

1. Reconcile current heads, dependencies and previous operations. When a checkpoint is needed, locate or create its task under the configured task root and record immutable `supervision.babysit` iterations. Resume the validated current index record with the same frozen selection; only a genuinely unindexed legacy task keeps numbered checkpoints.
2. Inspect current-head CI on ready prerequisites before their reviews or descendant work. Read failed required-job logs, identify the cause and make an authorized repair against the actual source. Keep independent safe PRs moving.
3. Triage actionable bot/human review, including edited and non-resolvable notes. Choose appropriate checks and review depth; resolve items after handling, not merely because they are old. Keep one writer per source branch.
4. After a repair, run the deciding check and relevant regressions, push only when authorized, and refresh host head/required CI. Missing old task artifacts, optional helpers or recordings are not automatic blockers. Honor additional verification/evidence requirements explicitly imposed by the owner, repository or original task.
5. Before enrollment/merge, refetch source SHA, required CI, reviews and host readiness. Require scoped authority, all transitive prerequisites host-confirmed merged, and applicable host protections. Prefer the configured native queue/train; ordinary SHA-guarded merging requires verified-disabled queues/trains. On GitHub use `gh pr merge <number> --repo <host/owner/repo> --match-head-commit <source-sha>` with the configured merge method, never `--admin`. Accepted enrollment is queued, not merged; release children only after host readback confirms merged.
6. If queued work becomes unsafe, cancel within authority and confirm removal before source edits. Adapt polling and debugging to observed progress. Escalate a concrete blocker or repeated unexplained failure rather than repeating identical attempts. Stop on completion, cancellation, an essential unavailable prerequisite or the session ending.

Full delivery verification, independent review, baseline capture, sealed evidence, inspection and publication apply when explicitly required—not after every routine repair. Preserve a required contract; do not fabricate missing proof. `/deliver` retains its own never-merge and proof rules.

## Read details when needed

- **Host commands or merge readiness:** use the installed `resolve-pr-reviews` GitHub protocol for head/check/thread reads; load [the GitLab reference](references/gitlab.md) only for an explicitly selected GitLab repository.
- **CI/review repair or required delivery evidence:** [repair guidance](references/repairs.md).
- **Resume, parallel writers or uncertain operations:** [checkpoint rules](references/state.md); [ledger starting point](references/babysit_template.md).
- **Requested/configured Slack, Jira or description breadcrumbs:** [visibility ownership](references/visibility.md).
- **Final status:** [suggested answer](references/babysit_final_answer.md); adapt it to actual outcomes and omit empty categories.

Report observed merged/queued/blocked/remaining PRs, deciding checks and next actions. State whether monitoring is active; session exit ends it unless an actual scheduler remains active. Never substitute summaries for host readback.
