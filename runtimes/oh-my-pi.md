# Oh My Pi

## Skill notes

Invoke a skill by typing `/<name>` in the Oh My Pi prompt, for example `/create-plan @03-plan-verbose-cli-flag.md`.
Child workers: call the `task` tool with one item `{ "agent": "agent-<role>", "task": "<assignment>" }`; the result auto-delivers when the worker yields. Read its final message before using any claim.
Reply files: when a prompt names a reply path under `.agents/tasks/<slug>/replies/`, write the complete final reply there with the `write` tool after printing it.
Herdr agent kind: `omp`.

## Install

1. Build the tree: `npm run build -- --runtime oh-my-pi` (writes `dist/oh-my-pi/`).
2. Skills: `cp -R dist/oh-my-pi/skills/* ~/.agents/skills/` (Oh My Pi reads this directory for every project).
3. Workers: `cp dist/oh-my-pi/agents/*.md ~/.omp/agent/agents/` for every project, or `cp dist/oh-my-pi/agents/*.md <repo>/.omp/agents/` for one project. Project agents win over user agents with the same name.
4. Extension (optional). From a checkout, add its directory to `extensions:` in `~/.omp/agent/config.yml` (`- ~/Development/skills/runtimes/oh-my-pi/run-task`); loaded that way it uses the checkout's `skills/` and needs no other install. Or copy the built one: `mkdir -p ~/.omp/agent/extensions && cp -R dist/oh-my-pi/extensions/run-task ~/.omp/agent/extensions/run-task`; the copy needs the skills from step 2. It replaces the `run-task` skill's orchestrator session with a slash command that runs each phase in a new session of the TUI; see below.
5. Start a new session; `/agents` lists the workers and `/` lists the skills and, with the extension, the `/run-task` command.

## Extension

`runtimes/oh-my-pi/run-task/index.js` is an Oh My Pi extension that registers the `/run-task` command and a `task_status` tool. It loads `scripts/plugin.mjs` and `scripts/workflow.mjs` from the installed `run-task` skill (it looks in the checkout, the built tree, `<project>/.agents/skills/`, `~/.agents/skills/`, and the agent directory's `skills/`), so the skills stay the single source of truth and the extension spends no tokens of its own. The Pi extension in `runtimes/pi/run-task/` is the same wiring for Pi's lifecycle.

`/run-task @<task dir>`, `/run-task <request>`, or `/run-task` alone (which lists the tasks under `.agents/tasks/`) runs the task's chain:

- Each phase opens a new session (`/new`) and receives the same file-form prompt the `run-task` skill uses. You watch the phase live, and an interactive phase can ask you questions in that session; the run continues when the phase's reply file appears under `replies/`.
- A human gate shows a dialog: approve (runs the next command), request changes (asks for the feedback, then runs the matching `iterate-*` skill with it), run another command instead (for `/review-code` or `/record-evidence`), or stop. Stopping leaves the task on disk; `/run-task @<task dir>` later continues, and running it records the approval, exactly as with the skill.
- After every phase it appends one line to `replies/phases.jsonl`: skill, command, timing, model, the session's context tokens and percentage, whether the phase or the extension wrote the reply file, and the session file. That is the per-phase context meter.
- Flags: `--step` (stop after every phase), `--status` (report and stop), `--with review-code,record-evidence`, `--model <spec>` (model for the phase sessions), `--workflow <type>` for a new task. `/run-task stop` ends a run after the phase in progress.

The `task_status` tool returns the same status report to the model, for a session that is asked where a task stands.

The extension needs the interactive TUI or RPC mode for its dialogs; in print mode it reports that and stops. Herdr panes and subagents are not used by the extension; the phase session is the fresh context.
