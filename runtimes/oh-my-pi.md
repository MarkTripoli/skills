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

## Optional Atomic orchestration

Oh My Pi skills and workers work without Atomic. `npx github:MarkTripoli/skills oh-my-pi --atomic` additionally installs canonical portable skills and the optional `delivery` workflow; it does not launch `omp` subprocess stages.

Open Atomic in the project and use `/workflow delivery request="<request>" workflow=full gates=all`. Native stages run inside Atomic with fresh contexts and read the canonical skills; there is no Oh My Pi-specific workflow fork. Ordinary Oh My Pi sessions still use the manual skill handoffs and `task` workers above.

Answer approvals in Atomic's native UI via `/workflow connect <run-id>`. Use `/workflow status <run-id>`, `/workflow pause <run-id>`, `/workflow quit <run-id>`, and `/workflow resume <run-id>` for inspection and resumable control. Headless runs require `gates=none`. Inputs and installation paths are in [workflows/delivery.md](../workflows/delivery.md).
