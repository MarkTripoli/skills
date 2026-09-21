---
name: start-epic-delivery
description: Run for /start-epic-delivery requests. Create child task directories from an approved epic plan and provide manual handoffs for the first ready wave.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Epic Delivery Start

You turn an approved epic plan into one task directory per child and tell the user which children can start now. Running this skill records approval of the epic plan.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions. The epic's slug is the parent slug for every child.

2. **Read the epic branch**: `git rev-parse --abbrev-ref HEAD`. Stop when it prints `HEAD`, `main`, or `master`: the epic must use its own branch because the children cut their worktrees from its committed task files. Tell the user to create the epic branch with `git switch -c epic-<epic slug>` before rerunning this skill. Record the current name as `<epic branch>`.

3. **Select the epic plan**. Use explicit `@file`; otherwise current `planning.epic` from `index.json`. Read it completely. Stop when no epic plan exists.

4. **Parse the children**. Take the JSON fence under `## Children`. Each entry has `name`, `workflow`, `slice`, `depends_on`, `acceptance`, and `prompt`, and may have `flag`. Check every entry before writing anything: `name` is 1 to 120 characters; `workflow` is one of `full`, `lean`, `prd`, `oneshot`, `bugfix`; `slice` is `vertical` or `enabler`; `acceptance` is a list of one to five sentences; `prompt` is 1 to 10000 characters; every `depends_on` entry names another child in the same list; no dependency cycles. Stop with the exact violations when any check fails; the user fixes the epic plan with `/create-epic-plan` follow-up edits and runs this skill again.

5. **Check for conflicts**. Resolve `<task-root>` per the conventions. Compute each child's slug as the kebab-case form of its `name`, trimmed to at most four words. Check `<task-root>/`; if any child directory exists, stop and list every conflict; create nothing.

6. **Create child task directories**. For each child, write `<task-root>/<child slug>/task.md` with the existing frontmatter/body contract, and initialize a valid empty `index.json` beside it. Child tasks are indexed from creation; never copy the epic's artifact history into them.

7. **Compute waves**. Wave 1 is every child with no dependencies. Wave N+1 is every child whose dependencies are all in waves 1 to N. Every child lands in exactly one wave; a child whose dependencies never resolve is a violation from step 4.

8. **Open one GitHub issue per child**. Run only when authenticated against a GitHub origin; otherwise record the existing Known limits line. Keep the existing wave/dependency issue process, but write `Task directory: <task-root>/<child slug>` in each issue. Add successful issue numbers to child `task.md`; continue past individual issue failures.

9. **Commit child task files**: explicitly stage each child's `task.md` and `index.json`, then commit `docs(task): open epic children`. They must be in the epic branch before child worktrees start.

10. **Write the receipt**. Record the next immutable `delivery.epic` iteration through the conventions' Recording an artifact flow using `references/epic_delivery_template.md`. Commit its canonical path and `index.json` explicitly as `docs(task): epic-delivery artifact`.

11. **Final answer**. Use `references/epic_delivery_final_answer.md` exactly. Fill `{artifact_link}` with the canonical receipt path. List each wave-1 child's slug, configured task directory, issue, and first manual skill. Build `{child_start_command}` with `<task-root>/<child slug>/`. Each child opens a fresh session in its own worktree from the epic branch. These are human handoffs, not commands this skill executes.

## Rules

- Never edit the epic plan; report violations and stop.
- Never start a child's phases from this session. Each child uses independent skill sessions, one at a time or in parallel within a ready wave. Optional automated launching belongs to the workflow, not this skill.
- Children in later waves start only after every dependency's pull request is merged; say so in the receipt.
- `issue` in a child's `task.md` is always the number `gh issue create` returned; never guess one, and never fail the run because issues could not be created.
- The only commits this skill makes are `docs(task): open epic children` and the receipt commit; it never stages code.
