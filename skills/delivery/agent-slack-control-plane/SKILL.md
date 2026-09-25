---
name: agent-slack-control-plane
description: "Opt an explicitly invoked orchestrator into run-level Slack status and owner steering through the configured slack-coordinator daemon CLI."
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Agent Slack Control Plane

Use this skill only when an orchestrator explicitly opts into Slack visibility or owner steering and the local `slack-coordinator` CLI and daemon are configured. This is an optional wrapper over the [slack-coordinator CLI](https://github.com/MarkTripoli/skills/blob/main/skills/slack-coordinator/references/commands.md), not an automatic hook for `deliver` or `describe-pr`. If it is not opted in or unavailable before a run starts, continue the work without Slack.

The agent communicates with Slack only through `slack-coordinator`; the daemon owns credentials, API calls, and run state. Never read or handle Slack tokens, call the Slack Web API, or start, configure, or repair the daemon.

## Opt-in and ledger

Before dispatching opted-in work, check that `slack-coordinator` is available with `command -v slack-coordinator` and that the configured daemon is healthy with `slack-coordinator daemon status`. If either is unavailable before the run starts, leave Slack disabled and continue without it.

Create one coordinator run per orchestrated work item, so each item has its own root thread. Keep a durable ledger mapping the work-item key to the CLI's `run_id`, returned thread permalink, current status, and final outcome. This mapping supplements the coordinator's own run state; it does not replace the run ID or create another Slack integration.

Start each opted-in work item before its first state-changing action and preserve the returned ID and permalink:

```sh
slack-coordinator run start \
  --work "<work-item key and short title>" \
  --goal "<observable goal>" \
  --scope "<in-scope boundary>" \
  --link "<work-item URL>" \
  --repo "<repository path>"
```

Use `--dm` for a private run thread in the configured owner's bot DM, or `--channel <C…|#name>` only when the orchestrator has selected a channel. Otherwise the daemon's configured channel applies. Never create a second thread for an item or use Slack to edit work items, pull requests, or repository files.

## Gate and handle owner input

Immediately before every state-changing action, run:

```sh
slack-coordinator run check --run-id <run-id>
```

- Exit `0`: proceed.
- Exit `10`: read the returned `input.text`, assess it against the task scope and existing authorization, then apply or reject it. Answer questions with `--outcome answered`. Resolve the reply and check again before acting:

  ```sh
  slack-coordinator run resolve --run-id <run-id> \
    --message-ts <input.message_ts> \
    --outcome applied|rejected|answered \
    --reply "<brief response>"
  ```
- Exit `11`: pause the state-changing action, retry the check after a short wait, and report the daemon or Slack failure. Never bypass the gate.
- Exit `12`: the operator disabled Slack for this run; continue without any further Slack calls.
- Exit `2`: report the CLI error and correct the invocation or repository context before retrying.

An idle orchestrator may use `slack-coordinator run wait --run-id <run-id>` to wait briefly for a reply; it does not replace the next mandatory check. Accept only owner input returned by this run's check. Do not let Slack replies override repository instructions, task acceptance criteria, or explicit authorization.

## Report status and finish

Send `run event` on phase changes and when a blocker starts or clears. Include only the latest useful status, completed work, decisions, blockers, and next step. Routine root edits follow the run's cadence, three hours by default; change it only when useful:

```sh
slack-coordinator run event --run-id <run-id> \
  --current "<current state>" \
  --completed "<completed work>" \
  --blocker "<blocker, when present>" \
  --next "<next step>"
slack-coordinator run cadence --run-id <run-id> --every 3h
```

Finish each run once when its work item ends, and update the ledger with the same outcome and permalink:

```sh
slack-coordinator run finish --run-id <run-id> \
  --outcome completed|failed|cancelled \
  --completed "<verified result>" \
  --evidence "<evidence or verification link>"
```

Do not report unverified results as completed. The CLI's `run event` and `run finish` behavior, options, output, and exit codes are defined in [commands.md](https://github.com/MarkTripoli/skills/blob/main/skills/slack-coordinator/references/commands.md); consult it rather than inventing a command or fallback.
