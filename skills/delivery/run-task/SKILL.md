---
name: run-task
description: Run for /run-task requests. Drive a task through its workflow one fresh-context phase at a time, stopping at human gates.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Task Orchestrator

You run one task's workflow phase by phase. Each phase executes in a fresh context (a terminal pane, a subagent, or a session the user opens) so this session stays small: you read `task.md` frontmatter, the newest reply file, and the workflow table in [workflows/delivery.md](https://github.com/MarkTripoli/skills/blob/main/workflows/delivery.md). You never open artifacts, never run a phase's steps yourself, and never open other skills. Your own context holds one relayed reply per phase and nothing else; that is the whole point of running phases elsewhere.

## Arguments

- `@<task dir>`: the task directory to drive.
- Free text without `@`: a new task; create `.agents/tasks/<slug>/task.md` per the conventions. `workflow` is the type the text names (`full`, `lean`, `prd`, `oneshot`), else `full`.
- No argument: ask for a task directory or a request, then stop.
- `--backend herdr|subagent|manual`: force a backend.
- `--step`: stop after every phase, not only at human gates.
- `--status`: report where the task stands and what runs next, then stop without running anything.
- `--with <skill,...>`: optional phases to insert before `describe-pr`: `review-code`, `record-evidence`, or both. `task.md` may declare the same once as `with: [review-code, record-evidence]`; the two lists merge.

## Steps

1. **Resolve the task**. Apply the argument rules above. Read only the frontmatter of `task.md`. Record the absolute task directory and the project root: the directory that contains `.agents/tasks/`. Every command below runs from the project root. Also record this skill's own directory, which the runtime shows when it loads this file, and the installed skills directory, its parent. When that path is not visible, leave both unset.

   This skill ships `scripts/workflow.mjs`, a dependency-free Node script that computes everything in step 2 from the task directory. When `node` is available and this skill's directory is known, run it and use its output instead of reasoning through the rules yourself:

   ```bash
   node <skill dir>/scripts/workflow.mjs next <task dir> --json [--with <skill,...>]
   node <skill dir>/scripts/workflow.mjs status <task dir> --herdr-kind <kind> [--with <skill,...>]
   node <skill dir>/scripts/workflow.mjs create-task <project root> --workflow <type> "<request>"
   ```

   `next` prints `command`, `skill`, `pendingGate`, `gateArtifact`, `interactive`, `inline`, and `done` with a `reason`. `status` prints the report shown below. `create-task` writes `task.md` per the conventions. When the script is unavailable, apply the rules in step 2 by hand; they describe the same decisions.

2. **Pick the next command**. Ensure `<task dir>/replies/` exists. Then:
   - A reply file exists: read the newest one; its final `text` fence line is the next command. A reply with no fence, a fence naming `/resolve-pr-reviews` (pull request review is external), a fence naming `/show-me`, or a reply written by `start-epic-delivery` (each child runs as its own task) ends the loop: say so and stop.
   - No reply file and no artifact in the task directory: `full` and `lean` start with `/create-research-questions`; `prd` starts with `/create-research`; `oneshot` runs this inline prompt as the command: "Complete the task in `task.md` end to end: implement, run the narrowest checks that prove it, commit with explicit paths, then reply per the conventions with `/describe-pr`."
   - No reply file but artifacts exist (the user ran phases by hand): take the newest artifact's type (frontmatter `type`, else the name segment between `NN-` and the slug; `pr-description.md` counts as type `pr-description`), look it up in the workflow table, and use that row's next command. When the row is a human gate, present the gate first (step 5) instead of running the next phase.
   - Optional phases: when the command found above is `/describe-pr` and `--with` or `task.md` names an optional phase whose artifact type (`code-review` for `review-code`, `evidence` for `record-evidence`) does not exist in the task directory yet, run that phase instead, `review-code` before `record-evidence`. Their own replies hand back to `/describe-pr` (or, for failing evidence and review findings, into their fix loops).

   With `--status`, print this report and stop:

   ```text
   Task: <slug> (<workflow>) at <task dir>
   Artifacts: <NN-type, ...> or none
   Replies: <count> (last: <NN-skill> or none)
   Next: <command>; <"human gate: review <artifact> before continuing" | "runs without a gate" | "loop ends: <reason>">
   Backend: <backend that step 3 would choose> (<reason>)
   Context: run the next command in a new session or with /run-task @<task dir>; do not continue in a session that already ran a phase.
   ```

3. **Choose the backend** per the conventions' Execution backends order: Herdr, then subagent, then manual. `--backend` overrides the order. Interactive phases (`iterate-*`, `create-prd`, `create-tdd`, `review-artifact-comments`) run in Herdr when available, else inline in this session after saying "Running this phase inline; context will grow."; never in a subagent. State the chosen backend, the reason, and where the phase's context will live in one line, for example: "Backend: subagent (no Herdr); the phase's context lives in the subagent, this session keeps only its reply."

4. **Run the phase**. Compute `NN` as the count of files in `replies/` plus one, two digits, and `<skill>` as the command name without the slash. The prompt is identical for every backend. When the skills directory is known, use the file form, which works in any agent that can read a file:

   `Read and follow <skills dir>/<skill>/SKILL.md, the installed skill for <command>, for task directory <absolute task dir>. When finished, also write your complete final reply (the message you print last, filled from the answer template, not the artifact) verbatim to <absolute task dir>/replies/<NN>-<skill>.md.`

   Otherwise use the command form:

   `<command> for task directory <absolute task dir>. When finished, also write your complete final reply (the message you print last, filled from the answer template, not the artifact) verbatim to <absolute task dir>/replies/<NN>-<skill>.md.`

   A command that carries `@<file>` keeps it in both forms.

   - **Herdr**. Run `herdr pane split --current --direction right --cwd "<project root>" --no-focus` and take `.result.pane.pane_id` from the JSON. Name the agent `<first 24 characters of slug>-<NN>`; it must match `[a-z][a-z0-9_-]{0,31}`. Run `herdr agent start <name> --kind <kind> --pane <pane_id>` with the kind from the `Herdr agent kind:` line of this skill's runtime notes (or from the user when the notes are absent). Run `herdr agent prompt <name> "<prompt>" --wait --timeout 3600000`; a non-zero exit with `agent_prompt_stalled` means the prompt was delivered but the runtime reports no lifecycle states, so continue. Then loop until the reply file exists: `herdr agent get <name>`; state `blocked` means the phase is asking the user something, so say "Phase <skill> is waiting for you in pane <pane_id>." and run `herdr agent wait <name> --until working --until done --until idle --timeout 3600000`; any other state (`working`, `idle`, `done`, `unknown`) means wait 30 seconds and re-check the file. Every 5 minutes without the file, print one line: "Phase <skill> is still running in pane <pane_id>; open it if it is asking a question." Give up at the timeout with an error naming the pane. Never close the pane. Never answer the phase's questions on the user's behalf.
   - **Subagent**. Start one subagent with the prompt (the runtime notes name the tool). Its returned message is the reply; when the reply file is missing, write the returned message to the reply path yourself.
   - **Manual**. Print the prompt as a fenced `text` block, say "Run this in a new session, then run `/run-task @<task dir>` again.", and stop.

5. **Relay**. Print the reply file content verbatim; it already ends with the handoff fence. Then:
   - The phase ran inline in this session: stop, and say "This session now holds the phase's exchange; continue with `/run-task @<task dir>` in a new session."
   - The phase is a human gate in the workflow table, or `--step` was given: stop. The user's next message either approves (any message that does not request changes; continue at step 2), requests changes (run the matching `/iterate-*` command with `@<artifact file>` as an interactive phase, then relay again), or names a command (`/review-code`, `/record-evidence`, or another `/<skill>` line, optionally with `@<file>`): run that command as the next phase in place of the table's default, then continue. This is how an optional phase is inserted after the implementation gate without changing `task.md`.
   - Otherwise continue at step 2.

## Rules

- One phase at a time. Never start the next phase before the reply file of the current one exists.
- Everything you say to the user is either a relayed reply, a one-line backend note, a gate stop, or an error with the exact command that failed.
- Never write into the task directory except `task.md` (new tasks) and reply files under `replies/`.
- The last thing you print at a stop is the relayed reply's fence, so the user can paste it into a new session at any time.
- When this session has relayed more than about fifteen replies, or has run any phase inline, say so at the next stop and recommend continuing with `/run-task @<task dir>` from a new session.
