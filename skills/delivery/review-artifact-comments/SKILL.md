---
name: review-artifact-comments
description: Run for /review-artifact-comments requests. Address feedback on a task artifact one item at a time.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Review Artifact Comments

Address feedback on a task artifact one item at a time. Read, summarize, ask how to proceed, and record an immutable revised iteration after direct user instruction.

## Setup

Locate the task directory and read `task.md` per the conventions. Resolve current artifacts through `index.json`; explicit canonical paths may select historical input.

## Input

1. Prompt has a `<feedback>` block: work from it.
2. No block, but the message names an artifact and carries feedback: work from the message.
3. Feedback lives in a file the user names: read that file completely.
4. None of these: ask, wait.

A `<feedback>` block or feedback file holds the artifact name and one entry per item, each quoting the artifact text it targets and stating the requested change.

## Workflow

1. **Read artifact.** Read the named artifact completely; otherwise select the current record of the described type through `index.json`. Ask only when the type is unclear.

2. **List items.** Number every feedback item with the artifact text it targets and the requested change. Skip items the user marked as already handled.

3. **Ask unless instructed.** No action given for an item: stop after reading, ask. Keep the choices concise and grounded in the items you saw.

4. **Follow action.** One item at a time.
   - Edit: copy current artifact to the next iteration in its canonical series, preserve frontmatter/structure, and record it through the conventions. Never overwrite indexed history.
   - Not applied: say why, in the reply.

5. **Note when useful.** Most need no artifact. If user asks or the review is complex, record the next immutable `review.comments` iteration through the conventions' Recording an artifact flow using `references/comments_template.md`. Commit its canonical path and `index.json` explicitly as `docs(task): comment-review artifact`.

6. **Final.** Read `references/comments_final_answer.md`. Fill `{artifact_link}` with the saved canonical task-root-relative path; when no receipt was saved, link the edited artifact. End with one fenced `text` block: `/iterate-implementation`. A legacy task without `index.json` follows the conventions' legacy rules.

## Rules

- Ask before editing when the requested change is ambiguous.
- No batch of unrelated items with different decisions.
- No unrelated artifacts.
- No new artifact unless it helps the workflow.
- Keep item numbering stable within the reply.
