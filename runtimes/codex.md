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

## Optional Atomic orchestration

Codex skills and workers work without Atomic. `npx github:MarkTripoli/skills codex --atomic` additionally installs the optional `delivery` workflow. The shared `.agents/skills` destination holds canonical portable skills when Atomic is selected; standalone Codex installs keep their runtime notes.

Open Atomic in the project and use `/workflow delivery request="<request>" workflow=full gates=all`. Native stages run inside Atomic with fresh contexts and read the canonical skills; there is no Codex-specific workflow fork. Ordinary Codex sessions still use the manual `$<name>` skill handoffs above.

Answer approvals in Atomic's native UI via `/workflow connect <run-id>`. Use `/workflow status <run-id>`, `/workflow pause <run-id>`, `/workflow quit <run-id>`, and `/workflow resume <run-id>` for inspection and resumable control. Headless runs require `gates=none`. Inputs and installation paths are in [workflows/delivery.md](../workflows/delivery.md).
