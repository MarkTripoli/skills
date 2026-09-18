# Pi

## Skill notes

Invoke a skill by typing `/<name>` in the Pi prompt, for example `/create-plan @03-plan-verbose-flag-cli.md`.
Child workers: Pi has no worker tool of its own. Perform the role inline after reading the installed `agent-<role>` skill, and say so in the reply; when a subagent tool has been added to Pi, give it the same assignment text and read its final message before using any claim.
Long-running commands (an `archon workflow run` that exits at its first gate): run them in the foreground with the bash tool's timeout raised to at least an hour and read the output when the command exits. Never `--detach`.

## Install

`npx github:MarkTripoli/skills pi` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Skills: Pi reads `~/.agents/skills/` and `<project>/.agents/skills/` natively, so the portable install is enough: `cp -R skills/delivery/* skills/show-me ~/.agents/skills/` from a checkout. For the Pi notes inserted into every skill, build `npm run build -- --runtime pi` and copy `dist/pi/skills/*` to `~/.pi/agent/skills/` instead.
2. Workers: none are generated; the notes above tell each phase to perform worker roles inline.
3. Restart Pi or `/reload`; `/` lists the skills.

## Archon

Pi is an Archon provider: the native packs under `.archon/workflows/delivery/` run each `prompt:` node in a fresh Pi session. Set it as the default assistant with `archon setup`, which also picks Pi's backend and model. Pi reads `~/.agents/skills/`, the packs' `skills_dir` default, so the portable install is enough; pass `--input skills_dir=~/.pi/agent/skills` to use the tree built for Pi.

Start a run with `archon workflow run delivery-<type> --branch <name> "<request>"`; it exits at each gate, `archon workflow approve <run-id> --detach` or `reject <run-id> --detach "<text>"` continues it, and `archon workflow wait <run-id>` blocks until the next decision. `--input gates=none` runs unattended. The task directory is committed on the branch. The loop and the gate names are in [workflows/delivery.md](../workflows/delivery.md#steering-a-run).
