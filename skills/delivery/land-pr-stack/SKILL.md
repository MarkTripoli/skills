---
name: land-pr-stack
description: Lands a selected stack of pull requests in dependency order, preserving each reviewed delta and verifying any repository-required package release before dependent requests merge. Use when the user runs /land-pr-stack or asks to merge an epic or ticket stack; not for a single PR's review threads (use /resolve-pr-reviews).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Land a PR stack

Use `/land-pr-stack <epic-or-ticket-list> [PR URLs]` when the request is to **merge** related PRs. This is a standalone operation after delivery and review, not a stage in the delivery workflow. An invocation that asks to land the set authorizes in-scope rebases, branch pushes, handled discussion resolution, dependency updates, and merges. Never self-approve or bypass host protections. Preserve owner worktrees and unrelated edits.

GitHub is the default: use the selected remote's repository and authenticated `gh` session. Run `git --version` and `gh auth status`, and verify access to each selected repository. For an explicitly selected GitLab repository, use its existing authenticated `glab` session and provider protocol; do not silently switch hosts or accounts. Missing authentication or access is a blocker, not a missing-PR skip. Never print tokens.

Copy this checklist and tick each item:

```text
- [ ] set established
- [ ] run record saved
- [ ] prerequisite PRs merged or skipped
- [ ] required package versions verified, or not applicable
- [ ] dependent PRs merged or skipped
- [ ] final report
```

## Establish the complete set

1. Read every supplied epic, ticket, child ticket, dependency link, and PR. Use the available issue connector or authenticated CLI; unavailable essential ticket content blocks scope discovery. Search only the named repositories and issue keys. Record each PR's full host/repository/number identity, URL, state, source and target branches, head SHA, ticket, and dependencies. Record stale links and tickets with no accessible matching PR separately.
2. Establish repository roles from code and tickets, not fixed repository names. Include only the selected epic or ticket set. A prerequisite outside that set requires scope authority before mutation.
3. Build the dependency graph from PR targets, branch ancestry, reviewed diffs, and source-backed issue dependencies. A child targeting another PR's source follows that parent; retargeting does not remove a genuine dependency. Epic membership alone does not establish order. Reconcile conflicting edges before merging; process ready prerequisites in topological order, including multi-level chains. Complete producer changes before dependent package consumers when the repository requires a release boundary.
4. Save an ignored local run record under the configured task-root contract with the frozen selection, dependency evidence, pinned source/target SHAs, current checks, discussion IDs and post-rebase cutoffs, outcomes, and skips. If the task uses an indexed artifact for that record, allocate immutable successors rather than editing recorded bytes. Update unindexed working state after each push, merge, and skip; reuse it on resume.
5. Before the first merge, record and print the ordered plan with target, parent, ticket, edge evidence, and known skips. Continue without waiting unless essential scope or dependency evidence conflicts.

Check every PR at discovery and again at its turn. A host-confirmed already-merged PR needs no rebase or merge; record its target and merge commit. A genuinely missing PR is a recorded skip. An unmerged missing prerequisite does not satisfy a child's dependency: land that child only if its reviewed delta can safely stand alone within the authorized scope; otherwise skip the child and continue independent work. Report every skip.

## Merge prerequisites and dependents

Use an isolated clean worktree and the [merge procedure](references/merge-procedure.md) for each ready PR. Resolve the intended target from the request and repository default branch, not a hardcoded branch. Merge parents first, verify their actual target commits, then preserve only each child's reviewed delta onto the refreshed target. A squash changes ancestry: compare the net diff and resulting tree so merged history is neither duplicated nor lost.

A queued PR is not merged. Do not release a child until host readback confirms its parent reached the intended target. Follow required merge queues/trains; never enqueue a child merely to wait for an unmerged prerequisite. Host rejection or stale checks block that PR, not independent ready PRs.

## Verify required package releases

Use [the package publication procedure](references/package-publication.md) only when code or tickets establish a producer/consumer package boundary. Use the repositories' existing release jobs, package names, registries, and dependency tooling. Do not introduce a package publication phase into a stack that has none.

Verify the selected package version is actually hosted and resolves in the consumer before replacing a local dependency. A backend merge, release tag, version string, or green producer checks alone do not prove package availability. Publication failure blocks the affected consumer; continue independent PRs. When no new package is required, verify the existing hosted version satisfies the reviewed consumer change.

## Finish

Verify every merged PR reached its intended target. Report merge order, target/source SHAs, current check results, required package publication or existing-version proof, consumer dependency changes, and every already-merged, missing, queued, blocked, or skipped PR with its reason. Do not report queued enrollment or an older passing pipeline as completion. Retain incomplete run state for resumption; never remove owner worktrees or historical task artifacts.
