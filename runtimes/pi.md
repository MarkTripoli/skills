# Pi

## Skill notes

Invoke a skill by typing `/<name>` in the Pi prompt, for example `/create-plan @03-plan-verbose-flag-cli.md`.
Child workers: Pi has no worker tool of its own. Perform the role inline after reading the installed `agent-<role>` skill, and say so in the reply; when a subagent tool has been added to Pi, give it the same assignment text and read its final message before using any claim.

## Install

`npx github:MarkTripoli/skills pi` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Skills: Pi reads `~/.agents/skills/` and `<project>/.agents/skills/` natively, so the portable install is enough: `cp -R skills/delivery/* skills/show-me ~/.agents/skills/` from a checkout. For the Pi notes inserted into every skill, build `npm run build -- --runtime pi` and copy `dist/pi/skills/*` to `~/.pi/agent/skills/` instead.
2. Workers: none are generated; the notes above tell each phase to perform worker roles inline.
3. Restart Pi or `/reload`; `/` lists the skills.

## Optional Atomic orchestration

Pi skills work without Atomic. `npx github:MarkTripoli/skills pi --atomic` additionally installs canonical portable skills and the optional `delivery` workflow. Pi remains an independent manual runtime.

Open Atomic in the project and use `/workflow delivery request="<request>" workflow=full gates=all`. Native stages run inside Atomic with fresh contexts and read the canonical skills; there is no Pi-specific workflow fork. Ordinary Pi sessions still use the manual skill handoffs above.

Answer approvals in Atomic's native UI via `/workflow connect <run-id>`. Use `/workflow status <run-id>`, `/workflow pause <run-id>`, `/workflow quit <run-id>`, and `/workflow resume <run-id>` for inspection and resumable control. Headless runs require `gates=none`. Inputs and installation paths are in [workflows/delivery.md](../workflows/delivery.md).
