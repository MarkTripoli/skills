# Findings-driven correction mode

Use when new session gets selected queue + read-only findings Markdown doc, not original delivery conversation. Findings doc, architecture doc, Figma file stay read-only; all run state go in ignored orchestration evidence dir.

The selected Story's requirements or Bug's reported failure and expected behavior remain correction scope and QA target. An implementation child tracks ownership only. Epic descriptions supply queue context; they never broaden correction scope.

## Intake and classification

1. Read the selected queue, affected requirements and implementation children first, then every finding. Resolve each cited repo, PR, source branch, target branch, architecture section or Figma file/page/node, supporting evidence. Check current remote PR state + source/target commit SHAs; no trust stale local checkout or prior-agent summary.
   Skip tickets currently `On Hold` or `On-Hold`, preserving findings and adopted work as `skipped_on_hold`. A requested Bug plan gate also applies before the next new correction cycle.
2. One ledger row per finding: Jira ticket, finding ID, source-doc location, affected PR, source/target SHAs, expected state, observed drift, cited architecture/Figma evidence if supplied, candidate repos, downstream requirements, state, owner, replacement evidence.
3. Compare only mapped Story source nodes/sections and record their authority resolution. For Bugs, verify the report's expected behavior; linked designs aid diagnosis but do not override it. An unresolved material scope or behavior choice goes to the owner under recorded decision authority while independent work continues.
4. Group findings only if shared root cause AND same PR branch ownership. Else make ordered correction tasks; orchestrator, not prompter, sets scope + dependency.

## Mutable unmerged-PR boundary

Before dispatch, diff each affected PR source branch vs target. Artifacts introduced only by that unmerged PR = mutable: edit, rename, delete original migration, API/client artifact, component, test, config so final PR diff correct. No compensating migration or compat layer to keep intermediate PR state.

Artifacts on target branch, merged, deployed, or externally consumed = not covered; follow repo normal compat + forward-migration policy. Origin unclear → check merge base + source/target diff first. Prefer new correction commit on PR source branch; no force-push or remote history rewrite unless explicitly authorized.

## Dispatch and branch ownership

Update existing PR source branch + existing PR; default no correction branch, stacked PR, parallel review path, replacement worktree. Find and reuse original PR worktree, give correction agent as exclusive write surface. Correction agent never touch target branch. Only if original worktree truly unavailable/unusable, orchestrator may recreate local checkout of exact existing source branch; log reason in ledger.

Give the agent the finding, orchestrator-selected scope, expected-versus-observed statement, cited source locations, existing PR URL and source/target SHAs, relevant decision-log entries, and explicit acceptance criteria. Require `video-iterative-development`, including assigned-scope validation, repository-convention inspection, and the real-user-path evidence rules. It must replace invalid or superseded final evidence with proof of the corrected behavior and return any consequential choice as a `decision_request`.

## Closure and downstream effects

For every correction, verify the final PR diff matches the selected ticket and applicable authority, the correction commit is pushed to its existing source branch, and the description links current-head final proof. Recheck the finding and its affected acceptance behavior on every assigned surface or API boundary. Reuse one passing recording only when it meets the unchanged source/proof identity contract; otherwise replace it. A stale head, changed actor or invalid proof returns to recovery.

If downstream worktrees were created from a faulty source head, assess them explicitly: recreate them from the corrected remote head, queue dependent corrections, or document why they are unaffected. Do not mark a finding resolved while its known downstream impact is unaddressed. A pending, missing, or failed PR pipeline does not delay `submitted_verified`; record its status if already available. Deployments and approvals remain non-blocking.
