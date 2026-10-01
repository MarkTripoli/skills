# Findings-driven correction mode

Use when new session gets selected queue + read-only findings Markdown doc, not original delivery conversation. Findings doc, architecture doc, Figma file stay read-only; all run state go in ignored orchestration evidence dir.

Selected Jira Story requirements + acceptance criteria = correction scope. Agent-owned Subtask = implementation ownership only, not separate QA target. Epic description = queue context only; no create correction, no broaden one, no turn epic-vs-ticket mismatch into blocker.

## Intake and classification

1. Read the selected queue, affected requirements and implementation children first, then every finding. Resolve each cited repo, PR, source branch, target branch, architecture section or Figma file/page/node, supporting evidence. Check current remote PR state + source/target commit SHAs; no trust stale local checkout or prior-agent summary.
2. One ledger row per finding: Jira ticket, finding ID, source-doc location, affected PR, source/target SHAs, expected state, observed drift, cited architecture/Figma evidence if supplied, candidate repos, downstream requirements, state, owner, replacement evidence.
3. Compare only source nodes and sections mapped to the selected Story. Mapped Figma resolves ambiguous or conflicting ticket details and overrides a conflicting architecture document; record the automatic resolution in `decision-log.md`. Only a remaining choice that materially changes scope or user behavior becomes `needs_product_decision`; keep unrelated work moving.
4. Group findings only if shared root cause AND same PR branch ownership. Else make ordered correction tasks; orchestrator, not prompter, sets scope + dependency.

## Mutable unmerged-PR boundary

Before dispatch, diff each affected PR source branch vs target. Artifacts introduced only by that unmerged PR = mutable: edit, rename, delete original migration, API/client artifact, component, test, config so final PR diff correct. No compensating migration or compat layer to keep intermediate PR state.

Artifacts on target branch, merged, deployed, or externally consumed = not covered; follow repo normal compat + forward-migration policy. Origin unclear → check merge base + source/target diff first. Prefer new correction commit on PR source branch; no force-push or remote history rewrite unless explicitly authorized.

## Dispatch and branch ownership

Update existing PR source branch + existing PR; default no correction branch, stacked PR, parallel review path, replacement worktree. Find and reuse original PR worktree, give correction agent as exclusive write surface. Correction agent never touch target branch. Only if original worktree truly unavailable/unusable, orchestrator may recreate local checkout of exact existing source branch; log reason in ledger.

Give the agent the finding, orchestrator-selected scope, expected-versus-observed statement, cited source locations, existing PR URL and source/target SHAs, relevant decision-log entries, and explicit acceptance criteria. Require `video-iterative-development`, including assigned-scope validation, repository-convention inspection, and the real-user-path evidence rules. It must replace invalid or superseded final evidence with proof of the corrected behavior and return any consequential choice as a `decision_request`.

## Closure and downstream effects

For every correction, verify the final PR diff now matches the cited design source, the correction commit is pushed to the existing PR source branch, and the PR description links the replacement final proof. UI drift needs fresh reviewer-ready Android evidence; backend drift needs renewed applicable contract proof. Re-check the specific finding and its affected original acceptance criteria before marking it `resolved`.

If downstream worktrees were created from a faulty source head, assess them explicitly: recreate them from the corrected remote head, queue dependent corrections, or document why they are unaffected. Do not mark a finding resolved while its known downstream impact is unaddressed. A pending, missing, or failed PR pipeline does not delay `submitted_verified`; record its status if already available. Deployments and approvals remain non-blocking.
