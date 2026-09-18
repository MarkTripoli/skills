# Claude Code

## Skill notes

Invoke a skill by typing `/<name>` in the Claude Code prompt, for example `/create-plan @03-plan-verbose-flag-cli.md`.
Child workers: call the `Task` tool with `subagent_type: "agent-<role>"` and the assignment text as `prompt`. The worker's final message is the tool result; read it before using any claim.
Long-running commands (an `archon workflow run` that exits at its first gate): run them with `Bash` and `run_in_background: true`, then read the result with `BashOutput` until the command exits. Never `--detach`.

## Install

`npx github:MarkTripoli/skills claude-code` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Build the tree: `npm run build -- --runtime claude-code` (writes `dist/claude-code/`).
2. Skills: `cp -R dist/claude-code/skills/* ~/.claude/skills/` for every project, or `cp -R dist/claude-code/skills/* <repo>/.claude/skills/` for one project.
3. Workers: `cp dist/claude-code/agents/*.md ~/.claude/agents/` (or `<repo>/.claude/agents/`). Claude Code lists them under `/agents`.
4. Start a new session; type `/` to see the skills.

## Archon

Claude Code is an Archon provider: the native packs under `.archon/workflows/delivery/` run each `prompt:` node in a fresh Claude Code session. Set it as the default assistant with `archon setup` or `archon ai default claude`. The packs read skills from `skills_dir` (`~/.agents/skills` by default); point it at `~/.claude/skills` with `--input skills_dir=~/.claude/skills` to use the tree built for Claude Code, whose worker calls use the `Task` tool.

Start a run with `archon workflow run delivery-<type> --branch <name> "<request>"`; it exits at each gate, `archon workflow approve <run-id> --detach` or `reject <run-id> --detach "<text>"` continues it, and `archon workflow wait <run-id>` blocks until the next decision. `--input gates=none` runs unattended. The task directory is committed on the branch. The loop and the gate names are in [workflows/delivery.md](../workflows/delivery.md#steering-a-run).
