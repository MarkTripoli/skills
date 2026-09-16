# Pi

## Skill notes

Invoke a skill by typing `/<name>` in the Pi prompt, for example `/create-plan @03-plan-verbose-cli-flag.md`.
Child workers: Pi has no worker tool of its own. Perform the role inline after reading the installed `agent-<role>` skill, and say so in the reply; when a subagent extension is installed, give it the same assignment text and read its final message before using any claim.
Reply files: when a prompt names a reply path under `.agents/tasks/<slug>/replies/`, write the complete final reply there with the `write` tool after printing it.

## Install

`npx github:MarkTripoli/skills pi` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Skills: Pi reads `~/.agents/skills/` and `<project>/.agents/skills/` natively, so the portable install is enough: `cp -R skills/delivery/* skills/show-me ~/.agents/skills/` from a checkout. For the Pi notes inserted into every skill, build `npm run build -- --runtime pi` and copy `dist/pi/skills/*` to `~/.pi/agent/skills/` instead.
2. Workers: none are generated; the notes above tell each phase to perform worker roles inline.
3. Extension (optional). From a checkout, add its directory to `"extensions"` in `~/.pi/agent/settings.json` (`"~/Development/skills/runtimes/pi/run-task"`); loaded that way it uses the checkout's `skills/` and needs no other install. Or copy it: `mkdir -p ~/.pi/agent/extensions && cp -R runtimes/pi/run-task ~/.pi/agent/extensions/run-task`; the copy needs the skills from step 1. See below.
4. Restart Pi or `/reload`; `/` lists the skills and, with the extension, the `/run-task` command.

## Extension

`runtimes/pi/run-task/index.js` is a Pi extension that registers the `/run-task` command and a `task_status` tool. It loads `scripts/plugin.mjs` and `scripts/workflow.mjs` from the installed `run-task` skill (it looks in the checkout, the built tree, `<project>/.agents/skills/`, `<project>/.pi/skills/`, `~/.agents/skills/`, and the agent directory's `skills/`), so the skills stay the single source of truth and the extension spends no tokens of its own.

`/run-task @<task dir>`, `/run-task <request>`, or `/run-task` alone (which lists the tasks under `.agents/tasks/`) runs the task's chain the same way the Oh My Pi extension does, with one difference in mechanics: Pi replaces the whole extension runtime when a session is replaced, so a run lives in `replies/run.json` in the task directory instead of in memory. Each phase is one step: the command records the phase and opens a new session with the phase prompt; when that session settles with the reply file present, the new instance records the session's context usage in `replies/phases.jsonl`, shows the gate dialog if the phase was a gate, and re-dispatches `/run-task --continue` to open the next session.

- You watch every phase live and answer an interactive phase's questions in its session; the run continues when the reply file appears.
- A gate offers approve, request changes (asks for the feedback, then runs the matching `iterate-*` skill with it), run another command (`/review-code`, `/record-evidence`), or stop.
- Because the state is on disk, a run survives quitting Pi: `/run-task @<task dir>` in a new Pi completes a phase whose reply exists (its context usage is then unknown and recorded as null), restarts a phase that has no reply, and continues a run stopped at a gate, which records the approval.
- Flags: `--step`, `--status`, `--with review-code,record-evidence`, `--model <provider/id>` (applied by the instance that owns each phase session), `--workflow <type>`. `/run-task stop` marks the run inactive; the phase in progress finishes on its own and is not followed.

The `task_status` tool returns the same status report to the model. The extension needs the TUI or RPC mode for its dialogs; in print mode it reports that and stops.
