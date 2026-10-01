# Codex

## Skill notes

Invoke a skill by typing `$<name>` in the Codex prompt, for example `$create-plan @03-plan-verbose-flag-cli.md`. Handoff fences still show `/<name>`; type the `$` form.
Child workers: use the multi-agent spawn tool with the custom agent `agent-<role>` and the assignment text as the message; wait for the agent and read its final message before using any claim. Without spawning, ordinary phase roles run inline and say so.

## Install

`npx git+github:MarkTripoli/skills codex` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Build the tree: `npm run build -- --runtime codex` (writes `dist/codex/`).
2. Skills: `cp -R dist/codex/skills/* ~/.agents/skills/` for every project, or `cp -R dist/codex/skills/* <repo>/.agents/skills/` for one project. Each skill ships `agents/openai.yaml` with its display name.
3. Workers: `cp dist/codex/agents/*.toml ~/.codex/agents/` (or `<repo>/.codex/agents/`). Current Codex releases load every TOML file in that directory. If `~/.codex/config.toml` registers agents with `[agents.<name>] config_file = ...` tables, append `dist/codex/config.snippet.toml` to it.
4. Confirm `[features] multi_agent = true` (the default) in `~/.codex/config.toml`, then start a new session and type `$` to see the skills.

## Model routing

Run `$configure-model-routing` when no valid profile exists. Codex uses the `$` invocation form. Codex skills use the shared `route-model` helper through Node with explicit caller or configured exact candidates. Codex has no private-catalog discovery path here; this collection does not scrape catalogs, proxy requests, or store credentials.
