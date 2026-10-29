---
name: static-implementation-audit
description: Audits selected Jira tickets against committed source, mapped design requirements and submitted frontend videos, then posts one findings comment per ticket. Use when the user runs /static-implementation-audit or requests a static ticket implementation audit; not for runtime verification (use verify-implementation) or source repair (use iterate-implementation).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Static Implementation Audit

Audit the selected Jira tickets in one run. Compare the currently committed implementation in their local worktrees with each ticket's requirements, applicable design and design-document material, and the participating repositories' guidance and established patterns. Inspect submitted video evidence in relevant frontend MRs. Publish **one new findings comment per selected Jira ticket**. This skill is independent of `video-iterative-orchestration`; it does not enter its lifecycle or update its artifacts.

## Boundary

This is static source analysis plus passive review of already submitted evidence. Read files, Git history and diffs, Jira and design sources, existing test code, MR descriptions and comments, and submitted videos as context. Do not run tests, analyzers, linters, validators, builds, generators, implementation apps, servers, migrations, or verification scripts. Do not record new evidence or change source, task artifacts, feature contracts, design manifests, Jira issue fields, MRs, or local audit files. New Jira comments are the only writes. Do not claim that watching a video verifies unseen behavior, backend effects, or the current code's runtime result.

Use each worktree's committed `HEAD` as the implementation under review; ignore uncommitted content and state that limit when it matters. Read the complete relevant code path, including existing code outside the diff when necessary. A diff helps locate changes but does not define the full behavior.

## Inputs and source authority

Accept explicit Jira issue keys or links, or an epic key or link optionally narrowed to named tickets in that epic. For an epic without a narrower selection, use its in-scope implementation tickets as identified by Jira and the existing orchestration records. Resolve the selected issue set once, deduplicate it, and confirm every issue key and summary in Jira. If ownership of a requirement or its comment destination remains ambiguous, resolve that issue before posting its comment; continue other selected tickets. Never post to an epic, parent Story, or implementation Subtask merely because it is nearby; each comment belongs on the issue whose requirements it evaluates.

Reuse available orchestration material for each selected ticket: feature-contract rows, source mappings, decision log, design-document manifest, Figma bundle metadata, assigned worktrees, and MR or branch identities. Read the underlying Jira criteria, mapped design material, and repository guidance needed to check those records. These artifacts are inputs and claims, not proof that code conforms. Keep each ticket's boundary and recorded source-authority decisions; flag a citation or mapping that does not support its stated requirement. Do not create requirements from unrelated epic text or unmapped design content. Shared code can be inspected once, but attribute a finding to each affected ticket requirement rather than copying unrelated findings across tickets.

Resolve task roots per the conventions. When an index exists, validate its ledger and use only current digest-validated source records, preserving their exact source revision, committed head, observed model and checkpoint bindings. An old review or video receipt is historical evidence, never proof of the current implementation. Read committed files with `git show <pinned-HEAD>:<path>` rather than the working-tree copy; never change indexed artifacts.

When an expected source or worktree is missing, continue any inspection that remains possible and mark the affected requirement `unassessed`. Missing material cannot support a clean conclusion. Do not invent a design decision or silently use a stale source.

## Inspect the committed implementation

For each selected ticket requirement, trace the relevant source path from entry point through the code that produces the stated behavior. Inspect API and state boundaries, failure and lifecycle paths, and any `must_not` rule the contract records. Compare the implementation with the mapped design assertion and the applicable repository rule or established local pattern. Read test source only to understand intended coverage or a possible gap; never execute it or treat its presence as passing evidence.

Record a finding only when a specific requirement or repository rule and committed code support it. Each finding needs the expected behavior with its source, the actual behavior with repository-relative `path:line` evidence and commit identity, the consequence, and the smallest corrective direction. Distinguish a demonstrated contradiction from an inference or an unassessed item. Report material additions outside ticket scope separately; do not call unrelated pre-existing code a ticket defect.

Check every selected requirement, not just suspicious files. Separate design conformance from repository-pattern conformance so a stylistic preference does not masquerade as a design defect. If no actionable finding remains, say that no issue was found in the inspected source and retain the coverage and static-inspection limits.

## Inspect submitted frontend videos

For every selected ticket with frontend behavior, find its relevant frontend MR from the ticket and orchestration records. Read the MR description and evidence comments to identify the final submitted video links; do not substitute a local recording or an implementation receipt. Inspect each relevant final video through an available player or preview, without running the app or downloading remote media to work around preview restrictions. Match the observed journey and visible states to the ticket requirement and mapped design, and cite the MR, video URL, and timestamp for a visible discrepancy. Also check whether the video covers the claimed user entry path and result. Apply the repository's stated video-evidence rules when they are relevant; do not turn an optional visual supplement into a required gate.

Separate video findings from source findings. A video can show a visible mismatch or an evidence gap, but cannot prove the recorded run used the current committed code or that hidden behavior works. Compare the MR source commit with the local committed HEAD when both are available; report a mismatch as an evidence limit. If the final video is absent, inaccessible, or cannot be previewed, mark the affected visual or journey claim `unassessed` and report the reason. Record an evidence-gap finding when that video was required by the ticket or contract. Backend-only tickets need no invented video requirement.

## Publish on Jira

Compose a concise comment for each selected issue with:

1. `Static implementation and submitted evidence audit` and the ticket key; list each reviewed repository, worktree branch, committed HEAD, and relevant frontend MR.
2. The requirement/design sources and repository guidance actually inspected, plus the final video links inspected when applicable.
3. Source and video findings ordered by impact, each with expected, observed, consequence, and exact source locations or video timestamps. Say `None` when there are no findings.
4. Requirements or video claims not assessed and why, plus the limits of static source and submitted-video inspection.

Use the available Jira comment operation to **add one new comment per confirmed issue**. With Atlassian Rovo, call `addCommentToJiraIssue` without `commentId`. Do not edit a prior comment or update the issue description or any other field. The request to run this skill authorizes these comments; no separate conversational approval is needed. Read each new comment back and verify its issue key and body. If a post result is uncertain, read that issue's comments before retrying so the same audit is not duplicated. A failure on one issue does not prevent publication on other selected issues. If Jira cannot be read or a comment cannot be published, report that issue's prepared findings in the final reply and state that publication did not occur; never substitute a description edit.

End with one line per selected issue: Jira comment link or ID when posted, number of findings, and any unassessed requirements or video claims. Do not hand off to a delivery or repair skill.
