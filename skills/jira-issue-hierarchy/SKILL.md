---
name: jira-issue-hierarchy
description: Authors KIT Jira Epics and Stories from an approved requirement document, creates implementation Sub-tasks when Story work starts, and checks Story QA readiness from local templates. Use when asked to break down an RFC or spec into Epics and Stories, start a Story, or check QA readiness; not for rewriting a thin existing ticket, which uses jira-issue-refinement.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Jira issue hierarchy

For a sparse **existing** issue that needs source-backed functional specifications and QA steps before implementation, use the separate `jira-issue-refinement` skill. This skill owns hierarchy authoring and Story QA readiness, not retrospective description rewrites. It works independently of delivery.

The [local hierarchy policy](references/jira-issue-templates/README.md) is the source of truth; read it completely, then the bodies you need. Operate on the KIT Jira project; inspect project conventions before using the bodies elsewhere.

For a live Jira operation, inspect issue types, required fields, parents, existing issues, and transitions; if access is unavailable, stop with the observed blocker. If the request supplies source material for a draft or read-only check, proceed without Jira and mark unverified fields `unknown`, not observed.

For live Jira operations use the Atlassian MCP tools as `<server>:<tool>`, where `<server>` is the name your runtime registered for that server (`claude_ai_Atlassian_Rovo` in Claude Code): `<server>:getJiraProjectIssueTypesMetadata`, `<server>:getJiraIssueTypeMetaWithFields`, `<server>:searchJiraIssuesUsingJql`, `<server>:getJiraIssue`, `<server>:createJiraIssue`, `<server>:editJiraIssue`, `<server>:getTransitionsForJiraIssue`. Call `<server>:getContentFormatGuide` before writing a description.

Choose one operation from the request:

1. Break down an approved requirement document into Epics and Stories only, with [epic.md](references/jira-issue-templates/epic.md) and [story.md](references/jira-issue-templates/story.md): [policy](references/jira-issue-templates/README.md#break-down-an-approved-requirement-document). Check existing matching issues to avoid duplicates.
2. Start work on an existing Story by creating implementation Sub-tasks, with [subtask.md](references/jira-issue-templates/subtask.md) for testable work and [subtask-not-testable.md](references/jira-issue-templates/subtask-not-testable.md) plus the `no_qa` label otherwise: [policy](references/jira-issue-templates/README.md#start-work-on-a-story). Preserve each template's exact first line.
3. Check Story QA readiness and report each observed pass or missing prerequisite: [policy](references/jira-issue-templates/README.md#story-qa-readiness). Do not infer a merge, deployment, test data, or transition from submitted PR evidence, and do not merge, deploy, close issues, or move an issue into a QA status without separate authority.

For other KIT issue types, [task.md](references/jira-issue-templates/task.md) and [bug.md](references/jira-issue-templates/bug.md) are optional authoring aids, not stages of the new-feature hierarchy.

For other issue types, [task.md](references/jira-issue-templates/task.md) and [bug.md](references/jira-issue-templates/bug.md) are optional authoring aids, not stages of the new-feature hierarchy. In the final reply, give created or proposed issue keys and links, which template was used, any unresolved criteria, and the exact QA readiness state when checked. Never claim a draft was created in Jira.

## Record source-bound operation receipts

Resolve the task directory and configured root through the collection conventions. Record a breakdown as `jira-breakdown` (`planning.jira`), Story-start work as `jira-story-start` (`implementation.jira`), and a QA-readiness check as `qa-readiness` (`review.qa`). Each receipt includes frontmatter `type`, `status`, and factual `summary`, the selected project/issue or supplied document identity and observed revision/hash, mapped criteria and source pointers, operation authority, proposed versus actually written fields, and verified readiness outcomes or unknowns.

Use `status: draft` for `jira-breakdown` and `jira-story-start` proposals, and `status: applied` only after authorized Jira writes and readback. Use `status: passed` or `status: blocked` for `qa-readiness`, with one observed outcome per prerequisite and unknowns reported as missing evidence.

For indexed tasks, digest-validate `index.json`, select its current record, and allocate/record the next immutable iteration with the optional adjacent task-artifact helper or exact manual conventions. Never edit an earlier receipt or fall back to directory scanning on an invalid index. Numbered records apply only to genuinely unindexed legacy tasks. Keep task records local and uncommitted; final replies link the canonical receipt path returned by recording. A draft receipt does not imply Jira creation, transition, merge, deployment, or QA readiness.
