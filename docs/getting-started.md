# Getting started

This guide takes one request from idea to pull request with the delivery workflow. It assumes the skills are installed for your runtime (see the [README install matrix](../README.md#install)) and that you are in a git checkout of the project you want to change.

Commands are written as `/name`. Codex users type `$name`; the handoff fences still show `/`.

## The one rule

Every phase runs in its own session. A phase reads `task.md` and the artifacts it needs from disk, writes one artifact, and ends with a command fence naming the next phase. You run that command in a new session, or you let `/run-task` do it for you. You never carry a conversation from one phase into the next. [Context management](context-management.md) explains why this matters and what goes wrong when you skip it.

## Pick how you want to drive

| Mode | You type | Fresh context comes from | Best for |
|---|---|---|---|
| By hand | each phase command yourself | you opening a new session each time | learning the workflow, small tasks |
| `/run-task` | `/run-task @<task dir>` once per gate | subagents (or a manual prompt) | most tasks |
| `/run-task` with Herdr | the same | one terminal pane per phase, visible beside you | tasks where you want to watch or answer questions mid-phase |

All three produce the same files, so you can switch modes at any point.

## Walkthrough: by hand

1. Start a session and run the first phase with your request:

   ```text
   /create-research-questions Add a --verbose flag to the CLI that prints each command before running it
   ```

   The skill creates `.agents/tasks/verbose-cli-flag/task.md` (the slug is derived from the request), adds `.agents/tasks/` to `.gitignore` when the file exists, writes `01-research-questions-verbose-cli-flag.md`, and ends with:

   ```text
   /create-research
   ```

2. Open a new session: `/clear` in Claude Code, `/new` in Codex, `/new` in Oh My Pi. Paste the command. Each phase finds the task directory from the newest matching `task.md`; if you have several tasks in flight, add the task directory: `/create-research @.agents/tasks/verbose-cli-flag`.

3. Keep going until a phase stops at a human gate. A gate reply looks like this:

   ````markdown
   The plan is ready for review.

   Review artifact: [03-plan-verbose-cli-flag.md](.agents/tasks/verbose-cli-flag/03-plan-verbose-cli-flag.md)

   Check:
   - Phase 1 adds the flag and a test that asserts the echoed command
   - Phase 2 threads the flag through the config loader
   Known limits:
   - Windows shells are not covered by the test

   Reply with the changes you want, or run `/iterate-plan @03-plan-verbose-cli-flag.md`.
   Running the next command records approval of the plan.

   Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one.

   ```text
   /setup-worktree @03-plan-verbose-cli-flag.md
   ```
   ````

   Read the artifact file. To approve, run the fenced command in a new session. To change it, either reply in the same session (the phase applies your feedback and re-prints the gate) or run `/iterate-plan @03-plan-verbose-cli-flag.md` in a new session, which is the better choice when the review took many turns.

4. Implementation runs phase by phase. `implement-plan` (or `implement-outline` for `lean`) implements the first unchecked phase through a child worker, runs the plan's automated checks, ticks the checkboxes, commits with explicit paths, and stops with a receipt. Run the same command again in a new session for the next phase; the last phase hands off to `/describe-pr`.

5. `describe-pr` writes and publishes the pull request description. `resolve-pr-reviews` works through review threads until reviewers approve.

## Walkthrough: with `/run-task`

1. In a fresh session:

   ```text
   /run-task Add a --verbose flag to the CLI that prints each command before running it
   ```

   or, for an existing task, `/run-task @.agents/tasks/verbose-cli-flag`. Name a type in the request text (`lean`, `prd`, `oneshot`) to pick a chain other than `full`.

2. The orchestrator prints one line naming the backend and where the phase's context lives, runs the phase there, and prints the phase's reply verbatim. It continues through non-gate phases on its own and stops at every human gate.

3. At a gate, read the artifact. Reply with changes (the orchestrator runs the matching `iterate-*` skill as an interactive phase) or with anything else to approve and continue.

4. Useful flags:
   - `--status`: where the task stands, what runs next, whether it is a gate, and which backend would be used. Run this first when you come back to a task.
   - `--step`: stop after every phase, gate or not.
   - `--backend herdr|subagent|manual`: force a backend. `manual` prints the exact prompt for you to paste into a new session.

5. After an interactive phase ran inline, or after many phases, the orchestrator tells you to continue from a new session. Do that: open one and run `/run-task @<task dir>` again. Nothing is lost; the reply files under `replies/` are the orchestrator's memory.

## Walkthrough: with Herdr

When [Herdr](https://github.com/herdr) is running (`HERDR_ENV=1`) and the skills were built for your runtime, `/run-task` opens a pane beside your session for each phase, starts an agent of your runtime in it, and waits for the phase's reply file. You can watch the phase work and answer its questions in the pane. Interactive phases (`iterate-*`, `create-prd`, `create-tdd`, `review-artifact-comments`) run there instead of inline, so the orchestrator's session stays small even during long reviews. The orchestrator never closes a pane; close it yourself when the phase is done.

## What the task directory holds

```text
.agents/tasks/verbose-cli-flag/
  task.md                                   request, slug, workflow, created
  01-research-questions-verbose-cli-flag.md
  02-research-verbose-cli-flag.md
  03-design-discussion-verbose-cli-flag.md
  04-plan-verbose-cli-flag.md
  05-worktree-setup-verbose-cli-flag.md
  06-implementation-verbose-cli-flag.md     one per completed implementation phase
  pr-description.md
  replies/
    01-create-research-questions.md         one per phase run, written by the phase
    02-create-research.md
```

Artifacts are the memory between phases. Each has frontmatter with `type` and `summary`; later phases read the full text of the artifacts they select and only `summary` from the rest. Revisions edit a file in place; numbers are never reused for a revision. The directory is excluded from commits.

## Choosing a workflow type

`workflow` in `task.md` selects the chain. Set it when you create the task, or name it in the request you give `/run-task`.

| Type | Use when | First command |
|---|---|---|
| `full` | the change needs research and a design decision before planning (default) | `/create-research-questions` |
| `lean` | the change is bounded and a phased outline is enough | `/create-research-questions` |
| `prd` | product and technical decisions need interactive sessions with you | `/create-research` |
| `oneshot` | the request is fully specified; implement, verify, commit in one session | `/run-task` runs it directly |

The chains and the phase table are in [workflows/delivery.md](../workflows/delivery.md).

## Giving feedback

- At a gate, replying in the same session applies the feedback and re-prints the gate. Fine for one or two rounds.
- `/iterate-<phase> @<artifact file>` in a new session applies feedback from your message with a fresh context. Use it after a long review, or when you come back later.
- `/review-artifact-comments @<artifact file>` applies a list of feedback items one at a time when you have many small notes, for example pasted from a document review.

Feedback is your message text or a file you name. There are no comment identifiers to manage.

## Worktrees

`create-plan` and `create-structure-outline` end by handing off to `/setup-worktree`, which creates a git worktree for the task from `.agents/workspace.json` (a default is written when the file is missing) and hands off to the implementation skill. To implement in the current checkout instead, run `/configure-workspaces` once and set `disabled: true`, or run the phases from inside an existing worktree; the plan skills detect both and skip the worktree step.

## Epics

For a request too large for one task, run `/create-epic-plan`. It splits the work into child tasks with their own workflow types and dependencies. `/start-epic-delivery @<epic plan>` creates one task directory per child and lists the start command for each child in the first wave. Each child then runs its own chain, one fresh session per phase, with `/run-task @.agents/tasks/<child slug>` or by hand.

## When something looks wrong

- **The reply has no command fence.** The phase did not finish its template. Ask it to "print the final answer from the template" in the same session, then continue from the fence.
- **A phase cannot find the skill it names.** The skills are not installed for that runtime, or a subagent runtime cannot invoke skills by name. `/run-task` handles the second case by telling the subagent to read the installed `SKILL.md` directly; when running by hand, paste the skill file path instead of the command.
- **The agent asks you to restate the task.** It is reading conversation instead of `task.md`. Point it at the task directory: `/create-plan @.agents/tasks/<slug>`.
- **The session feels slow, repetitive, or forgetful.** You are in a degraded context. Save and restart: see [Context management](context-management.md#recognizing-a-degraded-context).
