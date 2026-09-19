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

Skills do not need Atomic. Add `--atomic` to install all portable skills and its optional `delivery` workflow. Ordinary Pi sessions still use the handoffs above.

Follow [Atomic setup](../docs/getting-started.md#add-optional-atomic-orchestration) to launch. Atomic runs the shared skills in new sessions. Answer approvals with `/workflow connect <run-id>`. Runs without an interactive screen need `gates=none`. See [pause, quit, and resume](../workflows/delivery.md#gates-and-native-controls).
