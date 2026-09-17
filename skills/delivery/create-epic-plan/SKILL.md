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
- `workflow` per child is one of `full`, `lean`, `prd`, `oneshot`, `bugfix`: `oneshot` for a bounded change with a clear spec, `bugfix` for a reported defect to reproduce and fix, `full` when research or design is needed, `lean` or `prd` only when the task asks for them.
- `depends_on` lists sibling names whose merged pull request the child needs. Keep it minimal so independent children run together.

## Output

1. Save the file.
2. Re-check every child against the Child Rules: `name` is at most 120 characters, `prompt` is at most 10000 characters, `workflow` is one of `full`, `lean`, `prd`, `oneshot`, `bugfix`, and every `depends_on` entry names an existing sibling. Fix each violation in the file and save again before replying.
3. Check each child's `workflow` with the typed-judgment helper. Write the children as `[{name, prompt}]` to a temporary JSON file outside the repository (`mktemp`), run `node <skills dir>/typed-judgment/judge.mjs route-workflow --children <file> --json` where `<skills dir>` is the directory that contains this skill, then delete the file. For every child whose `workflow` differs from the helper's `workflow`, adopt the helper's when its `confidence` is at least 0.8, unless the epic's request names the pack for that child; the request wins. Fill the `## Workflow judgments` table with every child's `suggested` workflow and `confidence`, and save again. When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), keep your own choices, write `Helper unavailable; workflows chosen by this skill.` in place of the table, and add a `### Known limits` item saying judgments were skipped so the reply carries it in one line.
4. Reply following `references/epic_plan_final_answer.md` exactly; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-epic-plan-slug.md](.agents/tasks/<slug>/NN-epic-plan-slug.md)`, and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): epic-plan artifact`.

## Feedback

When an epic plan artifact already exists and the user (or the invoking prompt) supplies feedback, revise that file in place: verify each item against the repository, apply it to the affected children or waves, re-run the Output checks, and reply with the same template. Never write a second epic plan.
