---
name: review-artifact-comments
description: Walks through feedback on a saved task artifact one item at a time, asking what to do with each, then applies the chosen edits in place. Use when the user runs /review-artifact-comments, pastes a feedback block, or names a file of review comments on a plan, PRD, design or other artifact; not for revising an artifact from a new request (use the matching /iterate-* skill).
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

3. **Take the instruction.** For each item, the user's instruction is one of `edit`, `decline` or `skip`. With no instruction, stop after listing the items and ask which, offering those three.

4. **Follow action.** One item at a time.
   - Edit: copy current artifact to the next iteration in its canonical series, preserve frontmatter/structure, and record it through the conventions. Never overwrite indexed history.
   - Not applied: say why, in the reply.

5. **Note when useful.** Most need no artifact. If user asks or the review is complex, record the next immutable `review.comments` iteration through the conventions' Recording an artifact flow using `references/comments_template.md`.

6. **Final**: Use `references/comments_final_answer.md`. Link the canonical worktree-relative receipt path, or the edited artifact when no receipt was needed. Set `{next_command}` from the table and use the canonical edited artifact path for its argument; keep the single final command fence.

## Next command

The edits are already applied, so hand off to the command the edited artifact's own phase offers next. The artifact's `type` selects it; add `@<edited file name>` where the table shows it.

| Type | Next command |
|---|---|
| `research-questions` | `/create-research @<file>` |
| `research` | `/create-design-discussion` for workflow `full`, `/create-structure-outline` for `lean`, `/create-prd` for `prd` or `program`, `/create-epic-plan` for `epic` |
| `design-discussion` | `/create-plan @<file>` |
| `design-prd` | `/create-tdd @<file>` |
| `design-tdd` | `/create-plan @<file>` |
| `structure-outline` | `/implement-outline @<file>` |
| `plan` | `/implement-plan @<file>` |
| `epic-plan` | `/start-epic-delivery @<file>` |
| `reproduction` | `/fix-bug` when `status: reproduced`, else `/reproduce-bug` |
| `implementation` | `/verify-implementation` when no phase remains, else the plan's or outline's implement command with `@<plan or outline>` |
| `fix`, `code-review-fixes` | `/verify-implementation` |
| any other | the command that artifact's own final answer names |

## Rules

- Ask before editing when the requested change is ambiguous.
