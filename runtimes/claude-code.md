# Claude Code

## Skill notes

Invoke a skill by typing `/<name>` in the Claude Code prompt, for example `/create-plan @03-plan-verbose-flag-cli.md`.
Child workers: call the `Task` tool with `subagent_type: "agent-<role>"` and the assignment text as `prompt`. The worker's final message is the tool result; read it before using any claim.

## Install

`npx github:MarkTripoli/skills claude-code` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Build the tree: `npm run build -- --runtime claude-code` (writes `dist/claude-code/`).
2. Skills: `cp -R dist/claude-code/skills/* ~/.claude/skills/` for every project, or `cp -R dist/claude-code/skills/* <repo>/.claude/skills/` for one project.
3. Workers: `cp dist/claude-code/agents/*.md ~/.claude/agents/` (or `<repo>/.claude/agents/`). Claude Code lists them under `/agents`.
4. Start a new session; type `/` to see the skills.

## Optional Atomic orchestration

Claude Code skills and workers work without Atomic. `npx github:MarkTripoli/skills claude-code --atomic` additionally installs the canonical portable skills and the optional `delivery` workflow; it does not make Claude Code an Atomic stage provider.

Open Atomic in the project and use `/workflow delivery request="<request>" workflow=full gates=all`. Native stages run inside Atomic with fresh contexts and read the canonical skills; there is no Claude-specific workflow fork. Ordinary Claude Code sessions still use the manual skill handoffs above.

Answer approvals in Atomic's native UI via `/workflow connect <run-id>`. Use `/workflow status <run-id>`, `/workflow pause <run-id>`, `/workflow quit <run-id>`, and `/workflow resume <run-id>` for inspection and resumable control. Headless runs require `gates=none`. Inputs and installation paths are in [workflows/delivery.md](../workflows/delivery.md).
