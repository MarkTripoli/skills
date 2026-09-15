---
name: start-epic-delivery
description: Run for /start-epic-delivery requests. Create child task directories from an approved epic plan and start the first ready wave.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Epic Delivery Start

You turn an approved epic plan into one task directory per child and tell the user which children can start now. Running this skill records approval of the epic plan.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions. The epic's slug is the parent slug for every child.

2. **Select the epic plan**. Use the file the user named with `@...`; otherwise the newest artifact of type `epic-plan` in the task directory. Read it completely. Stop and ask when there is no epic plan.

3. **Parse the children**. Take the JSON fence under `## Children`. Each entry has `name`, `workflow`, `depends_on`, and `prompt`. Check every entry before writing anything: `name` is 1 to 120 characters; `workflow` is one of `full`, `lean`, `prd`, `oneshot`; `prompt` is 1 to 10000 characters; every `depends_on` entry names another child in the same list; no dependency cycles. Stop with the exact violations when any check fails; the user fixes the epic plan with `/create-epic-plan` follow-up edits and runs this skill again.

4. **Check for conflicts**. Compute each child's slug as the kebab-case form of its `name`, trimmed to at most four words. List `.agents/tasks/`. If any child directory already exists, stop and list every conflict; create nothing.

5. **Create the child task directories**. For each child, write `.agents/tasks/<child slug>/task.md` with frontmatter `slug`, `title` (the child `name`), `workflow`, `created` (today, ISO date), `parent` (the epic slug), and `depends_on` (a YAML list of the dependency slugs, empty list when none). The body is the child `prompt` verbatim.

6. **Compute waves**. Wave 1 is every child with no dependencies. Wave N+1 is every child whose dependencies are all in waves 1 to N. Every child lands in exactly one wave; a child whose dependencies never resolve is a violation from step 3.

7. **Write the receipt**. Take the next artifact number and write `NN-epic-delivery-<epic slug>.md` from `references/epic_delivery_template.md`: the children created with their paths, the waves, and the Human Review section.

8. **Final answer**. Read `references/epic_delivery_final_answer.md` and respond using that template only. Fill `{artifact_link}` with a relative Markdown link to the receipt. List each wave-1 child with its start command, which always names the child's task directory so the phase cannot pick another task: `/create-research-questions @.agents/tasks/<child slug>` for `full` and `lean`, `/create-research @.agents/tasks/<child slug>` for `prd`, and `/run-task @.agents/tasks/<child slug>` for `oneshot` (the orchestrator runs the child's prompt inline; a bare prompt is not a valid handoff). End with one fenced `text` block containing the first wave-1 child's start command.

9. If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.

## Rules

- Never edit the epic plan; report violations and stop.
- Never start a child's phases from this session. Each child runs in its own fresh context, one at a time or in parallel per wave.
- Children in later waves start only after every dependency's pull request is merged; say so in the receipt.
- Commits never include `.agents/tasks/`.
