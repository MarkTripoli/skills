# Oh My Pi

## Skill notes

Invoke a skill by typing `/<name>` in the Oh My Pi prompt, for example `/create-plan @03-plan-verbose-flag-cli.md`.
Child workers: call the `task` tool with one item `{ "agent": "agent-<role>", "task": "<assignment>" }`; the result auto-delivers when the worker yields. Read its final message before using any claim.

## Install

`npx github:MarkTripoli/skills oh-my-pi` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Build the tree: `npm run build -- --runtime oh-my-pi` (writes `dist/oh-my-pi/`).
2. Skills: `cp -R dist/oh-my-pi/skills/* ~/.omp/agent/skills/` (the native user directory, which wins over same-named skills from other directories; `~/.agents/skills/` also works).
3. Workers: `cp dist/oh-my-pi/agents/*.md ~/.omp/agent/agents/` for every project, or `cp dist/oh-my-pi/agents/*.md <repo>/.omp/agents/` for one project. Project agents win over user agents with the same name.
4. Start a new session; `/agents` lists the workers and `/` lists the skills.

## Model routing

Standalone Oh My Pi skills may call the shared `route-model` helper through Node. Use OMP's stable public model catalog command only when the installed OMP version documents it; otherwise pass exact `{model,cost,description}` candidates explicitly. Do not scrape provider-private registries.

## Optional Atomic orchestration

Skills and workers do not need Atomic. Add `--atomic` to install all portable skills and its optional `delivery` workflow. It does not launch `omp` subprocess stages.

Follow [Atomic setup](../docs/getting-started.md#add-optional-atomic-orchestration) to launch. Atomic runs the shared skills in new sessions; there is no Oh My Pi-specific workflow. Ordinary sessions still use the handoffs and `task` workers above. Answer approvals with `/workflow connect <run-id>`. Runs without an interactive screen need `gates=none`. See [pause, quit, and resume](../workflows/delivery.md#gates-and-native-controls).
