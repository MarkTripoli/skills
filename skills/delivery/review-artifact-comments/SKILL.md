---
name: review-artifact-comments
description: Run for /review-artifact-comments requests. Address feedback on a task artifact one item at a time.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Review Artifact Comments

Address feedback on a task artifact. Move one item at a time. Read, summarize, ask how to proceed, apply edits in place. Edits require direct user instruction.

## Setup

Locate the task directory and read `task.md` per the conventions, including the create-when-missing rule. Use the task directory listing and the task slug to resolve artifact names.

## Input

1. Prompt has a `<feedback>` block: work from it.
2. No block, but the message names an artifact and carries feedback: work from the message.
3. Feedback lives in a file the user names: read that file completely.
4. None of these: ask, wait.

A `<feedback>` block or feedback file holds the artifact name and one entry per item, each quoting the artifact text it targets and stating the requested change.

## Workflow

1. **Read artifact.** Read the target artifact from the task directory completely before deciding. The target is the artifact the feedback names; when the feedback names none, the newest artifact of the type the feedback describes; when that is unclear, ask.

2. **List items.** Number every feedback item with the artifact text it targets and the requested change. Skip items the user marked as already handled.

3. **Ask unless instructed.** No action given for an item: stop after reading, ask. Keep the choices concise and grounded in the items you saw.

4. **Follow action.** One item at a time.
   - Edit: same artifact unless user wants new, preserve frontmatter/structure unless correction needed, save the file in place without a new number.
   - Not applied: say why, in the reply.

5. **Note when useful.** Most need no artifact. If user asks or complex: read `references/comments_template.md`, take the next artifact number, write `NN-comment-review-<slug>.md`, save the file in the task directory. When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): comment-review artifact`.

6. **Final.** Read `references/comments_final_answer.md`. Use template. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`; when no receipt was saved, link the edited artifact. End with one fenced `text` block: `/iterate-implementation`.

## Rules

- Ask before editing when the requested change is ambiguous.
- No batch of unrelated items with different decisions.
- No unrelated artifacts.
- No new artifact unless it helps the workflow.
- Keep item numbering stable within the reply.
