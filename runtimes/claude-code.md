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

## Optional publication guard

The installed Claude plugin registers `hooks/hooks.json` as a Bash `PreToolUse` hook. Set `SKILLS_PUBLICATION_TASK_DIR` to the absolute directory of the selected task (with `task.md`) before starting Claude to opt in; without it the hook makes no decision. The hook applies only when that task and the Bash call's working repository match. Direct `gh` or `./gh pr create --draft` remains available solely for hosting the capture; `gh pr create` without draft is denied until a draft exists. `gh pr ready [number]` reads the existing draft and calls the shared `publication-proof.mjs` CLI; only `ready: true` with passing proof permits it. Unsupported targeted PR syntax is denied for a clear manual path. An override cannot promote incomplete evidence.

This guards only the observed Claude Bash tool-call shape, not direct shell commands outside Claude, other tools, or publication by other runtimes. Follow `/describe-pr` for the final comment/body sequence and independent publication checks.

## Model routing

Run `/configure-model-routing` when no valid profile exists. Claude Code skills use the shared `route-model` helper through Node with explicit caller or configured exact candidates. Claude Code has no private-catalog discovery path here; this collection does not scrape catalogs, proxy requests, or store credentials.

## Optional Atomic orchestration

Skills and workers do not need Atomic. Add `--atomic` to install all portable skills and its optional `delivery` workflow. This does not make Claude Code an Atomic stage provider.

Follow [Atomic setup](../docs/getting-started.md#add-optional-atomic-orchestration) to launch. Atomic runs the shared skills in new sessions; there is no Claude Code-specific workflow. Answer approvals with `/workflow connect <run-id>`. Runs without an interactive screen need `gates=none`. See [pause, quit, and resume](../workflows/delivery.md#gates-and-native-controls).
