# Resume and source reconciliation

Run this intake for every eligible selected ticket before creating any worktree. Its job is to preserve interrupted work, adopt one existing write surface, and identify design-source changes that affect open work. It adds no user input and does not mutate Jira, branches, worktrees, PRs, Figma, or design documents during discovery.

Jira status is the primary routing signal. A ticket in `In Progress` or `Code Review` is `resume_required`: assume implementation already exists and do not create a new branch from base. `Code Review` should normally resolve to an open PR source branch; `In Progress` may have only a local worktree, local branch, or remote branch. Tickets in `Backlog` or `Selected for Development` follow new-delivery setup only after discovery confirms they do not already have linked work that must be preserved.

## Discover and adopt existing work

Inspect Jira-linked open PRs and repository state together. In every candidate repository, inspect `git worktree list --porcelain`, ticket-key branches with `git for-each-ref`, the expected target and merge base, and the current remote PR source/target heads. For each existing worktree candidate, capture `git status --porcelain=v2 --branch`, HEAD, base SHA, staged/unstaged/untracked presence, and a SHA-256 fingerprint of the staged and unstaged diffs without printing or storing secret-bearing file contents.

For a `resume_required` ticket, choose the write surface in this order:

1. the source branch/worktree of the open PR explicitly linked to the selected ticket;
2. the unique open PR whose title, description, or source branch links that ticket and targets the expected base;
3. the unique local or remote branch whose name contains the exact ticket key;
4. if no candidate exists after exhaustive discovery, mark `resume_source_missing`, continue source/requirement analysis and unrelated tickets, and request the smallest recovery input; do not silently replace presumed interrupted work with a new branch.

For `Backlog` or `Selected for Development`, preserve any discovered candidates and adopt one when it is explicitly linked to the ticket. Otherwise create the normal new-delivery worktree.

Reuse the existing worktree when present, including a dirty worktree whose inspected changes belong to the selected ticket. Give it to one implementation agent as its exclusive write surface. Never reset, clean, discard, stash, force-push, or replace interrupted work merely to obtain a clean checkout. If the source branch has no usable local worktree, recreate a checkout of that exact branch rather than starting from base. Record when uncommitted work could not be recovered because the original worktree no longer exists.

If multiple candidates have equal authority or a dirty diff has unclear ownership, preserve all candidates and mark the ticket `resume_needs_lineage`. Do not dispatch two writers or select by recency alone. Compare their diffs read-only and continue unrelated tickets. Ask for the smallest lineage choice only if Jira, PR, target-branch, and ticket-conformance evidence cannot establish the intended source.

Store the inventory at `.agent-evidence/orchestration/<epic-key>/resume-state.json`. For each selected ticket record repository, adopted worktree/branch, PR, target branch, base/head SHAs, worktree fingerprint and dirty state, alternative candidates, adoption reason, exclusive owner, and last observed time. This ignored local file is a rebuildable cache; Jira, Git, and current remote PR reality remain authoritative when it is stale or absent.

## Detect design-source changes

Store rebuildable source history at `.agent-evidence/orchestration/<epic-key>/source-index.json`. It reverse-maps each mapped design-document section fingerprint and Figma bundle/node fingerprint to feature-contract requirement IDs, Jira tickets, adopted branches/worktrees, and PRs. Never store document bodies, Figma images, signed URLs, or credentials in this index.

For every supplied design document, compare mapped-section SHA-256 values with the most recent index. A whole-document hash change alone never affects a ticket. For every supplied Figma root, extract a new bundle in the current run directory and compare mapped node IDs, dimensions, hierarchy, `selection_sha256`, and per-node `content_sha256` values with the prior bundle. Never overwrite the prior bundle before comparison. A missing prior value creates a baseline. A changed PNG or selection hash triggers inspection; only a confirmed material visual or behavioral change becomes an update.

Classify every mapped requirement:

- `unchanged` — mapped source fingerprints are unchanged;
- `update_detected` — a mapped section or node changed and impact analysis is pending;
- `reconciliation_active` — the change affects behavior within the existing ticket scope;
- `reconciled` — the adopted branch and replacement evidence conform to the current sources;
- `source_unavailable` — the supplied source link is invalid, missing, unauthorized, or otherwise unreadable.

Record the classification in `source_change` on the contract row. Readable source updates are work signals, not implementation stop gates: continue unaffected rows and tickets. `source_unavailable` blocks the affected ticket—do not use an older snapshot as authority, invent missing behavior, or dispatch its implementation agent; report the broken source and smallest access/link fix while unrelated tickets continue. For `reconciliation_active`, update the adopted existing branch/PR using the unmerged-artifact rules and replace only affected evidence. Figma remains authoritative for mapped visual and interaction behavior. Content not mapped to a selected ticket is context and receives no source-change state.

Refresh `source-index.json` only after the current manifests, contract mappings, adopted branch/PR identities, and source-change classifications have been validated. Keep the previous fingerprints in bounded history so another interrupted run can explain what changed.

For GitHub and tracker-neutral queues, use the observed project status and explicitly linked existing PR/branch/worktree as resume signals; do not invent Jira status names. Apply the same source-authority precedence, exclusive owner and dirty-work preservation. Inspect the latest indexed contract/conformance/closure receipts alongside live remote state. A changed head, target, proof reference or contract invalidates the old submission claim until it is independently re-probed and recorded as a new immutable receipt.
