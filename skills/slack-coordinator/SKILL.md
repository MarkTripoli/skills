---
name: slack-coordinator
description: Post one Slack thread per run through the local slack-coordinator daemon, check for owner steering before state-changing work, and stop when Slack coordination is unavailable. Talk to that daemon only through the slack-coordinator CLI.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Slack coordinator

Use this skill to report one run of agent work in one Slack thread and to let the run owner steer it from that thread. The `slack-coordinator` executable is the only way the agent touches Slack: the per-user daemon holds the tokens and the state database; the CLI talks to the daemon over a local socket. The skill works independently from Atomic and the other delivery skills.

Confirm that the `slack-coordinator` executable is available before operating it (`command -v slack-coordinator`). If it is missing, build `./tools/slack-coordinator/cmd/slack-coordinator` from a checkout of this collection; `scripts/install.mjs` installs only this agent skill. Operators set up the daemon with `slack-coordinator onboard` (or `setup` non-interactively). Do not download or install a binary implicitly.

Run `slack-coordinator run check --run-id <id>` immediately before every state-changing action: an edit, a commit, a push, a command that changes a system. Exit `0` means proceed. Exit `10` means the owner replied: read the reply, apply or reject it, answer with `run resolve`, then check again. Exit `11` means Slack coordination is unavailable: pause, retry the check after a short wait, and report the reason; never take the action while the check fails. Exit `12` means an operator disabled Slack for this run; proceed without further Slack calls. The check is never skipped, guessed, or replaced with a cached answer.

## Talking to the daemon

There are two roles. Do not mix them.

A coding agent in a repository reports the run and reads the owner's steering. It never calls the Slack API, never opens Socket Mode, and never reads `config.yaml` or the tokens in it. The daemon holds the tokens and `state.sqlite`. The only interface is the `slack-coordinator` executable, which talks to the daemon over the Unix socket at `$SLACK_COORDINATOR_HOME/socket` (default `~/.slack-coordinator/socket`).

The sequence is fixed:

1. `slack-coordinator run start` once, before the first state-changing action. Use `--dm` for a private run thread in the owner's bot DM; otherwise use the configured channel. Keep the printed `run_id`.
2. `slack-coordinator run check --run-id <id>` immediately before every later state-changing action.
3. On exit `10`, read `input.text`, act on it, then `slack-coordinator run resolve --run-id <id> --message-ts <input.message_ts> --outcome applied|rejected|answered --reply <s>`, then check again.
4. `slack-coordinator run event` when the phase changes or a blocker starts or clears. Blockers are delivered immediately; routine status edits use this run's cadence (three hours by default).
5. `slack-coordinator run finish` once, with `--outcome completed|failed|cancelled`; it updates the root message and reacts with an outcome emoji.

An idle agent may use `slack-coordinator run wait --run-id <id>` to hear about input without busy-looping; it does not replace the mandatory gate. `run cadence` changes the active run's routine update interval. Use `run react` to add a reaction, and `run content` to inspect files, bookmarks, tabs, and canvas metadata in the run channel. `run list-items` reads a page from a List shared in that channel; `run upload` shares a local file in the run thread after a write gate. See [references/commands.md](references/commands.md) for limits and details. Slack does not expose canvas bodies or folder contents through its documented Web API; report that boundary rather than treating a permalink as body content.
Exit `0` proceeds. Exit `10` is owner input and returns to the check. Exit `11` means the daemon or Slack is unavailable: do not take the action, say why, wait, and check again. Do not run `onboard`, `setup`, `daemon start`, or `service install` to get past it. Exit `12` means an operator turned Slack off for this run only; continue with no further Slack calls. Exit `2` is a bad invocation; report the message and fix the command. Never pipe `yes` into `run disable-slack`.

A headless assistant has a different working directory: `<root>/workspace/runs/<id>`, with a `prompt.md` the daemon wrote. That process does not run `slack-coordinator` and does not contact Slack. It reads `prompt.md` and `messages.jsonl`, writes the owner's reply to `result.md`, and writes `proposal.json` only when proposing a standing task. The file shapes are in the prompt and in [ASSISTANT.md](../../tools/slack-coordinator/internal/assistant/skill/ASSISTANT.md).

Installing, upgrading, rotating tokens, and restarting the daemon are operator work, documented in [docs/slack-coordinator.md](../../docs/slack-coordinator.md). An agent reports that the daemon is down; it does not repair it.

Read [references/commands.md](references/commands.md) for the command flow and exit codes, [references/channel-selection.md](references/channel-selection.md) for when to pass `--channel`, and [references/messages.md](references/messages.md) for the fields each message renders.
