---
name: create-epic-plan
description: Run for /create-epic-plan requests. Decompose an epic into child tasks with workflow types and dependencies.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Create Epic Plan

Split an epic into child tasks that ship as separate pull requests. The epic plan is the last artifact before delivery creates the children and starts the ready ones.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Read primary inputs fully, others by summary**:
   - Read `references/epic_plan_template.md` and `references/epic_plan_final_answer.md`.
   - Read completely: `task.md` or `ticket.md`, plus the newest artifact of type `research`.
   - Other artifacts in the task directory listing: use the `summary` field. Open only when research leaves a gap.

3. **Read relevant source files**:
   - Open source files named in research that decide where a child's change lands.
   - Verify file paths before naming them in a child prompt.

4. **Write the epic plan**:
   - Take the next artifact number.
   - Write `NN-epic-plan-<slug>.md` in the task directory following the template.
   - Fill the `## Children` JSON fence with one entry per child.
   - Derive `## Ordering` waves from `depends_on`.

## Child Rules

- One child per independently mergeable change. Name each child by its outcome.
- A child's `prompt` is a self-contained task description. It never references the epic's artifact directory; the child session cannot read it.
- `workflow` per child is one of `full`, `lean`, `prd`, `oneshot`: `oneshot` for a bounded change with a clear spec, `full` when research or design is needed, `lean` or `prd` only when the task asks for them.
- `depends_on` lists sibling names whose merged pull request the child needs. Keep it minimal so independent children run together.

## Output

1. Save the file.
2. Re-check every child against the Child Rules: `name` is at most 120 characters, `prompt` is at most 10000 characters, `workflow` is one of `full`, `lean`, `prd`, `oneshot`, and every `depends_on` entry names an existing sibling. Fix each violation in the file and save again before replying.
3. Reply following `references/epic_plan_final_answer.md` exactly; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-epic-plan-slug.md](.agents/tasks/<slug>/NN-epic-plan-slug.md)`, and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists.
4. If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
