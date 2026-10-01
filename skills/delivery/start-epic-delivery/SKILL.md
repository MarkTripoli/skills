---
name: start-epic-delivery
description: Run for /start-epic-delivery requests. Create child task directories from an approved epic plan and provide manual handoffs for the first ready wave.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Epic Delivery Start

Approved epic plan → one task directory per child; tell user which children start now. Running skill = records epic plan approval.

## Steps

1. **Locate the task directory and read `task.md`** per conventions. Epic slug = parent slug for all children.

2. **Read the epic branch**: `git rev-parse --abbrev-ref HEAD`. Stop when it prints `HEAD`, `main`, or `master`: the epic must use its own branch because children base their code worktrees on it. Tell the user to create the epic branch with `git switch -c epic-<epic slug>` before rerunning this skill. Record the current name as `<epic branch>`. Child task files stay local and must be copied into each child worktree at handoff.

3. **Select the epic plan**. Use explicit `@file`; otherwise current `planning.epic` from `index.json`. Read it completely. Stop when no epic plan exists.

4. **Parse the children**. Take the JSON fence under `## Children`. Each entry has `name`, `workflow`, `slice`, `depends_on`, `acceptance`, and `prompt`, and may have `flag`. Check every entry before writing anything: `name` is 1 to 120 characters; `workflow` is one of `full`, `lean`, `prd`, `oneshot`, `bugfix`; `slice` is `vertical` or `enabler`; re-validate the recorded `slice` against `shared/SLICING.md`'s slice definition without re-sizing it, since sizing was decided in `create-epic-plan`; `acceptance` is a list of one to five sentences; `prompt` is 1 to 10000 characters; every `depends_on` entry names another child in the same list; no dependency cycles. Stop with the exact violations when any check fails; the user fixes the epic plan with `/create-epic-plan` follow-up edits and runs this skill again.

5. **Check for conflicts**. Resolve `<task-root>` per the conventions. Compute each child's slug as the kebab-case form of its `name`, trimmed to at most four words. Check `<task-root>/`; if any child directory exists, stop and list every conflict; create nothing.

6. **Create child task directories**. For each child, write `<task-root>/<child slug>/task.md` with the existing frontmatter/body contract, and initialize a valid empty `index.json` beside it. Child tasks are indexed from creation; never copy the epic's artifact history into them.

7. **Compute waves**. Wave 1 = no dependencies. Wave N+1 = all dependencies in waves 1..N. Each child exactly one wave; never-resolving dependencies = step 4 violation.

8. **Open one GitHub issue per child**. Run this step only when authenticated to the GitHub origin (`gh auth status`); otherwise record the existing Known limits line. Process waves in order so dependency issue numbers are known. For each child, create the issue with `gh issue create`, including its title, prompt, acceptance criteria, dependency issue numbers (or `none`), epic reference, and `Task directory: <task-root>/<child slug>`. Add the returned issue number to that child's `task.md`; continue after an individual issue failure and report each failure in Known limits.

9. **Keep child tasks local**: do not stage or commit their `task.md` or `index.json`. Each child's first handoff opens its worktree from the epic branch and copies both files from the epic worktree into the same task-root path before running a skill. Existing child worktrees retain their own local files.

10. **Write the receipt**. Record the next immutable `delivery.epic` iteration through the conventions' Recording an artifact flow using `references/epic_delivery_template.md`. Keep the receipt and index local to the epic worktree.

11. **Final answer**. Use `references/epic_delivery_final_answer.md` exactly. Fill `{artifact_link}` with the local receipt path. List each wave-1 child's slug, configured task directory, issue, and first manual skill. Build `{child_start_command}` with `<task-root>/<child slug>/`. Each child starts a fresh session in its own worktree from the epic branch after copying its `task.md` and `index.json`; later waves use the same handoff after their dependencies merge. No child phases start in this skill.

## Rules

- Never edit the epic plan; report violations and stop.
- Never start a child's phases from this session. Each child uses independent skill sessions, one at a time or in parallel within a ready wave. Optional automated launching belongs to the workflow, not this skill.
- Children in later waves start only after every dependency's pull request is merged; say so in the receipt.
- `issue` in a child's `task.md` is always the number `gh issue create` returned; never guess one, and never fail the run because issues could not be created.
- This skill never stages or commits task files; only source changes made by separate implementation phases belong in Git.
