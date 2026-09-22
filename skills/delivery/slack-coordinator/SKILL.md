---
name: slack-coordinator
description: Post one Slack thread per run through the local slack-coordinator daemon, check for owner steering before state-changing work, and stop when Slack coordination is unavailable.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Slack coordinator

Use this skill to report one run of agent work in one Slack thread and to let the run owner steer it from that thread. The `slack-coordinator` executable is the only way the agent touches Slack: the per-user daemon holds the tokens and the state database; the CLI talks to the daemon over a local socket. The skill works independently from Atomic and the other delivery skills.

Confirm that the `slack-coordinator` executable is available before operating it (`command -v slack-coordinator`). If it is missing, build `./tools/slack-coordinator/cmd/slack-coordinator` from a checkout of this collection; `scripts/install.mjs` installs only this agent skill. Do not download or install a binary implicitly.

Run `slack-coordinator run check --run-id <id>` immediately before every state-changing action: an edit, a commit, a push, a command that changes a system. Exit `0` means proceed. Exit `10` means the owner replied: read the reply, apply or reject it, answer with `run resolve`, then check again. Exit `11` means Slack coordination is unavailable: pause, retry the check after a short wait, and report the reason; never take the action while the check fails. Exit `12` means an operator disabled Slack for this run; proceed without further Slack calls. The check is never skipped, guessed, or replaced with a cached answer.

Read [references/commands.md](references/commands.md) for the command flow and exit codes, [references/channel-selection.md](references/channel-selection.md) for when to pass `--channel`, and [references/messages.md](references/messages.md) for the fields each message renders.
