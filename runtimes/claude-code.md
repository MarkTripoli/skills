# Claude Code

## Skill notes

Invoke a skill by typing `/<name>` in the Claude Code prompt, for example `/create-plan @03-plan-verbose-cli-flag.md`.
Child workers: call the `Task` tool with `subagent_type: "agent-<role>"` and the assignment text as `prompt`. The worker's final message is the tool result; read it before using any claim.
Reply files: when a prompt names a reply path under `.agents/tasks/<slug>/replies/`, write the complete final reply there with the `Write` tool after printing it.
Herdr agent kind: `claude`.

## Install

1. Build the tree: `npm run build -- --runtime claude-code` (writes `dist/claude-code/`).
2. Skills: `cp -R dist/claude-code/skills/* ~/.claude/skills/` for every project, or `cp -R dist/claude-code/skills/* <repo>/.claude/skills/` for one project.
3. Workers: `cp dist/claude-code/agents/*.md ~/.claude/agents/` (or `<repo>/.claude/agents/`). Claude Code lists them under `/agents`.
4. Start a new session; type `/` to see the skills.
