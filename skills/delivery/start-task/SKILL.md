---
name: start-task
description: Run for /start-task requests. Read a request, pick the workflow that fits it (or none), ask when the choice is unclear, create the task, and hand off.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Start Task

The entry point when you know what you want but not which chain fits. Given a request, decide between doing it directly, a `oneshot`, `lean`, `full`, or `prd` task, or an epic; ask up to three questions when the request leaves that open; create the task directory; hand off with one command. This skill decides and writes `task.md`; it never researches, plans, or implements.

## Arguments

- Free text: the request. It may name a type (`oneshot`, `lean`, `full`, `prd`, `epic`) or say `quick`, `just do it`, or `direct`; an explicit choice is followed, not second-guessed.
- `@<file>`: a file holding the request (an issue export, a ticket, notes). Read it completely; it becomes the task body.
- No argument: ask for the request in one message and stop.

## Steps

1. **Read the request** and note what it fixes for the route: whether the expected behavior is stated, how many places in the code it touches (name them only when the request does), whether more than one approach is plausible, and whether it is one deliverable or several. Read at most three files, and only when the request names them; the phases do the reading.

2. **Choose the route** with the first matching row. When two rows fit and the request does not settle it, go to step 3 instead.

   | Route | Choose when | What happens next |
   |---|---|---|
   | `direct` | A question, an explanation, or a single edit whose location and content are already known: a typo, a rename, a version bump, a config value, one line with a known fix. Nothing to verify beyond an existing check. | No task directory. The change is made in this session by a plain message. |
   | `oneshot` | A bug fix or small change with a stated expected behavior, a way to verify it (a test, a command, a screen), no design choice, and a small footprint (about three files or fewer). | One session implements, verifies, and commits; `describe-pr` follows. |
   | `lean` | A feature or change whose shape is clear but that needs a short look at the code and a stepwise outline: several files, an ordering, a test strategy; no competing designs. | research questions, research, structure outline (gate), implementation (gate), pull request. |
   | `full` | Competing approaches, cross-module impact, migrations, a new or changed interface others depend on (an API, a schema, a file format, a manifest), or the user asks for a design review. | research questions, research, design discussion (gate), plan (gate), worktree, implementation (gate), pull request. |
   | `prd` | The requirement itself is open: what it should do, for whom, how it should behave at the edges. Product-facing work, or stakeholders beyond the requester. | research, PRD (interactive, gate), TDD (interactive, gate), plan (gate), worktree, implementation (gate), pull request. |
   | `epic` | Several independently mergeable deliverables, a change that would need more than about eight plan phases, or work for more than one person. | `create-epic-plan` splits it into child tasks, each with its own type; `start-epic-delivery` starts the first wave. |

   Explicit words override the table: a named type wins; `quick`, `just do it`, or `direct` mean `direct` when the edit is known and `oneshot` otherwise. A request that mentions a code review or video proof adds `with: [review-code]`, `with: [record-evidence]`, or both to the task (not for `direct` or `epic`).

3. **Ask only what decides the route**, at most three questions, in one message, each with the answer that would pick each route, for example:
   - "Is the expected behavior fully known, or should we write it down first?" (known: `oneshot` or `lean`; not known: `prd`)
   - "Is there more than one reasonable way to do this?" (yes: `full`; no: `lean`)
   - "Is this one deliverable or several that could merge separately?" (several: `epic`)
   Use the runtime's question tool when it has one; otherwise ask in plain text. Wait for the answer. Do not ask about anything the phases will find out.

4. **Create the task** (every route but `direct`). The project root is the git top level. When `node` is available and the `run-task` skill's directory is known, run:

   ```bash
   node <run-task skill dir>/scripts/workflow.mjs create-task <project root> --workflow <oneshot|lean|full|prd> --slug <slug> [--with <skill,...>] "<request>"
   ```

   `<slug>` is two to four kebab-case words naming the outcome (`missing-number-error`, `json-output-flag`), not the first words of the request.

   An epic is created with `--workflow full` (the parent task never runs a chain of its own). Without `node`, write `task.md` per the conventions by hand. Never create a task when one for the same request already exists under `.agents/tasks/`; name the existing directory instead.

5. **Reply** from the matching template, filled in; nothing else:
   - `direct`: `references/route_direct_answer.md`.
   - `oneshot`, `lean`, `full`, `prd`: `references/route_task_answer.md`, with `{first_command}` set to the chain's first command (`/create-research-questions` for `lean` and `full`, `/create-research` for `prd`, and for `oneshot` the sentence "the oneshot prompt `run-task` sends").
   - `epic`: `references/route_epic_answer.md`.
   `{reason}` is one sentence naming the row's signal that decided; `{task_dir}` is the relative task directory; `{with_note}` is `, with: <skills>` when optional phases were added and empty otherwise.

6. If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.

## Rules

- Decide from the request and the answers, not from reading the codebase; a route chosen after an hour of research has already spent the research.
- One question message at most. When the answers still leave two routes, take the lighter one and say so; a `lean` task that turns out to need a design discussion can hand off to `/create-design-discussion` from its research reply.
- `direct` creates nothing and changes nothing. Its reply names no artifact and ends the way it started: the user asks for the change in this session.

## References

Read from this skill directory:

- `references/route_direct_answer.md`
- `references/route_task_answer.md`
- `references/route_epic_answer.md`
