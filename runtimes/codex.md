# Codex

## Skill notes

Invoke a skill by typing `$<name>` in the Codex prompt, for example `$create-plan @03-plan-verbose-flag-cli.md`. Handoff fences still show `/<name>`; type the `$` form.
Child workers: use the multi-agent spawn tool with the custom agent `agent-<role>` and the assignment text as the message; wait for the agent and read its final message before using any claim. If the spawn tool is unavailable, perform the role inline and say so.

## Install

`npx github:MarkTripoli/skills codex` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Build the tree: `npm run build -- --runtime codex` (writes `dist/codex/`).
2. Skills: `cp -R dist/codex/skills/* ~/.agents/skills/` for every project, or `cp -R dist/codex/skills/* <repo>/.agents/skills/` for one project. Each skill ships `agents/openai.yaml` with its display name.
3. Workers: `cp dist/codex/agents/*.toml ~/.codex/agents/` (or `<repo>/.codex/agents/`). Current Codex releases load every TOML file in that directory; if your `~/.codex/config.toml` registers agents with `[agents.<name>] config_file = ...` tables, append `dist/codex/config.snippet.toml` to it.
4. Confirm `[features] multi_agent = true` (the default) in `~/.codex/config.toml`, then start a new session and type `$` to see the skills.

## Archon

Codex is an Archon provider: the native packs under `.archon/workflows/delivery/` run each `prompt:` node in a fresh Codex session. Set it as the default assistant with `archon setup` or `archon ai default codex`. The Codex skills install into `~/.agents/skills/`, which is the packs' `skills_dir` default, so no input is needed.

Start a run with `archon workflow run delivery-<type> --branch <name> "<request>"`; it exits at each gate, `archon workflow approve <run-id> --detach` or `reject <run-id> --detach "<text>"` continues it, and `archon workflow wait <run-id>` blocks until the next decision. `--input gates=none` runs unattended. The task directory is committed on the branch. The loop and the gate names are in [workflows/delivery.md](../workflows/delivery.md#steering-a-run).
