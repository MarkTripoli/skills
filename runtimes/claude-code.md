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

## Model routing

Run `/configure-model-routing` when no valid profile exists. Claude Code skills use the shared `route-model` helper through Node with explicit caller or configured exact candidates. Claude Code has no private-catalog discovery path here; this collection does not scrape catalogs, proxy requests, or store credentials.

## Optional Atomic orchestration

Skills and workers do not need Atomic. Add `--atomic` to install all portable skills and its optional `delivery` workflow. This does not make Claude Code an Atomic stage provider.

Follow [Atomic setup](../docs/getting-started.md#add-optional-atomic-orchestration) to launch. Atomic runs the shared skills in new sessions; there is no Claude Code-specific workflow. Answer approvals with `/workflow connect <run-id>`. Runs without an interactive screen need `gates=none`. See [pause, quit, and resume](../workflows/delivery.md#gates-and-native-controls).
