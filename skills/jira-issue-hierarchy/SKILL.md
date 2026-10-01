---
name: jira-issue-hierarchy
description: Author Jira Epics and Stories from an approved feature requirement, create implementation Sub-tasks when Story work starts, or check Story QA readiness using local policy and issue-body templates.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Jira issue hierarchy

For a sparse **existing** issue that needs source-backed functional specifications and QA steps before implementation, use the separate `jira-issue-refinement` skill. This skill owns hierarchy authoring and Story QA readiness, not retrospective description rewrites.

[Local hierarchy policy](references/jira-issue-templates/README.md) and its linked Markdown bodies are the source of truth. Read that policy and the needed bodies completely. No external policy document is needed at runtime. For live Jira operations, use Jira/Atlassian MCP to inspect issue types, required fields, parents, existing issues, and transitions; stop with the observed blocker when access is unavailable. For a draft or read-only check based on supplied source material, proceed without live Jira access but mark unverified issue fields and states as unknown, not observed. This skill works independently of delivery. Resolve the project from the supplied issue or request; inspect its conventions and fields before using these portable bodies. No company project is the default.

Choose one operation from the request:

1. **Break down an approved requirement document.** Read the whole document and its requirement sections before drafting. Map every required behavior and constraint to atomic Stories under feature-piece Epics; preserve the document's wording and deep links. Use [epic.md](references/jira-issue-templates/epic.md) and [story.md](references/jira-issue-templates/story.md). Set the Story summary prefix, Component, and parent in Jira fields, not just description. Flag ambiguous or missing criteria. Produce Epics and Stories only, with no Sub-tasks. Check existing matching issues to avoid duplicates. Create or update Jira issues only when the user authorized that action; otherwise return a reviewable draft and its source links.
2. **Start work on an existing Story.** Read its complete scope, criteria, parent, and existing Sub-tasks. Check readiness per the local policy. Create only implementation children needed now, each sized for one developer, reusing matching children. Decide independent testability before writing a body: [subtask.md](references/jira-issue-templates/subtask.md) for testable work, [subtask-not-testable.md](references/jira-issue-templates/subtask-not-testable.md) plus Jira's existing `no_qa` label otherwise. Preserve each template's exact first line. Set Jira parent to the Story. Ask for authorization before Jira creation if the user only asked for a draft; never reparent unrelated existing work.
3. **Check Story QA readiness.** Compare the Story and children with the local policy's readiness list and report each observed pass or missing prerequisite. QA reviews the Story, not agent-owned Sub-tasks. Do not infer a merge, deployment, available test data, or transition from submitted PR evidence. Do not merge, deploy, close issues, or move a ticket into a QA status without separate authority.

For other issue types, [task.md](references/jira-issue-templates/task.md) and [bug.md](references/jira-issue-templates/bug.md) are optional authoring aids, not stages of the new-feature hierarchy. In the final reply, give created or proposed issue keys and links, which template was used, any unresolved criteria, and the exact QA readiness state when checked. Never claim a draft was created in Jira.

## Record source-bound operation receipts

Resolve the task directory and configured root through the collection conventions. Record a breakdown as `jira-breakdown` (`planning.jira`), Story-start work as `jira-story-start` (`implementation.jira`), and a QA-readiness check as `qa-readiness` (`review.qa`). Each receipt includes frontmatter `type`, `status`, and factual `summary`, the selected project/issue or supplied document identity and observed revision/hash, mapped criteria and source pointers, operation authority, proposed versus actually written fields, and verified readiness outcomes or unknowns.

Use `status: draft` for `jira-breakdown` and `jira-story-start` proposals, and `status: applied` only after authorized Jira writes and readback. Use `status: passed` or `status: blocked` for `qa-readiness`, with one observed outcome per prerequisite and unknowns reported as missing evidence.

For indexed tasks, digest-validate `index.json`, select its current record, and allocate/record the next immutable iteration with the optional adjacent task-artifact helper or exact manual conventions. Never edit an earlier receipt or fall back to directory scanning on an invalid index. Numbered records apply only to genuinely unindexed legacy tasks. Keep task records local and uncommitted; final replies link the canonical receipt path returned by recording. A draft receipt does not imply Jira creation, transition, merge, deployment, or QA readiness.
