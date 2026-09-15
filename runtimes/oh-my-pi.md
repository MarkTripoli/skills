# Oh My Pi

## Skill notes

Invoke a skill by typing `/<name>` in the Oh My Pi prompt, for example `/create-plan @03-plan-verbose-cli-flag.md`.
Child workers: call the `task` tool with one item `{ "agent": "agent-<role>", "task": "<assignment>" }`; the result auto-delivers when the worker yields. Read its final message before using any claim.
Reply files: when a prompt names a reply path under `.agents/tasks/<slug>/replies/`, write the complete final reply there with the `write` tool after printing it.
Herdr agent kind: `omp`.

## Install

1. Build the tree: `npm run build -- --runtime oh-my-pi` (writes `dist/oh-my-pi/`).
2. Skills: `cp -R dist/oh-my-pi/skills/* ~/.agents/skills/` (Oh My Pi reads this directory for every project).
3. Workers: `cp dist/oh-my-pi/agents/*.md ~/.omp/agent/agents/` for every project, or `cp dist/oh-my-pi/agents/*.md <repo>/.omp/agents/` for one project. Project agents win over user agents with the same name.
4. Start a new session; `/agents` lists the workers and `/` lists the skills.
