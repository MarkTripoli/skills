---
name: agent-slack-control-plane
description: Protocol for operating Slack visibility on agent work in one of three modes (the slack-coordinator CLI, a direct feature thread for a /deliver task, or per-ticket threads in a Jira orchestration run). Use when /deliver, /describe-pr, /resolve-pr-reviews or a Jira orchestration run that enables Slack needs Slack status or owner steering; not for implementing product work, and not for operating the coordinator CLI alone (slack-coordinator).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Agent Slack Control Plane

Choose one mode for a task, in this order, and keep it across stages. Never post or edit the same thread through both the coordinator CLI and the direct Web API.

1. `task.md` has `slack_run_id`, or an explicitly opted-in new task has a configured slack-coordinator executable and daemon: [coordinator mode](#coordinator-mode).
2. `task.md` has `slack_thread_ts`, or a new `deliver` task with no `slack_run_id` and an existing Slack token file: feature-thread mode. Read [references/feature-thread.md](references/feature-thread.md#feature-thread-mode). It posts rarely and reads only owner answers to its own blockers.
3. A Jira orchestration run that explicitly enables Slack visibility and steering: Jira-run mode. Read [references/jira-run.md](references/jira-run.md). Slack is a control surface and public progress log; the orchestration ledger remains the source of truth.
4. Otherwise: no Slack; say so once.

## Coordinator mode

Enable this mode explicitly for an opted-in delivery when the CLI and daemon are configured. Existing task slack_run_id records the opt-in; never create another run or switch its transport. The daemon retains personal assistant, DM and standing-task behavior.

Use only the `slack-coordinator` CLI, never `curl` or the token file, for a task with `slack_run_id` in `task.md`. Read the [standalone skill](../../slack-coordinator/SKILL.md) and its command contract when installed; the steps below are the minimum protocol for a partial skill install. The `slack_run_id` is the durable cross-stage key; `slack_channel` and `slack_thread_ts` may also be saved from `run start` for a human-readable link, but they do not authorize direct API calls.

1. After `deliver` writes a new `task.md` and before any stage runs, call `slack-coordinator run start --work <title> --goal <observable goal> --scope <task and branch> --link <Jira URL when present>`. Select `--dm` only when the request or repository guidance calls for the owner DM; otherwise follow the coordinator's channel-selection rules. Capture the JSON `run_id`, `channel_id`, `thread_ts`, and `permalink`. Save `slack_run_id: "<run_id>"` in `task.md`. Reuse that ID for every later stage. A reused task with `slack_run_id` never starts another run.
2. The orchestrator (or a skill run by hand) reads `slack_run_id` from `task.md` and calls `slack-coordinator run event --run-id <id> --current <stage and current work> --next <next concrete action>`. This updates the persisted thread status card at the daemon's cadence; the compact root stays fixed; it does not create a new parent message. Report a newly discovered blocker with `--blocker`, and report its clearance in the next event. Workers and reviewers never send events; one owner controls the run ID.
3. Run `slack-coordinator run check --run-id <id>` immediately before each state-changing action, including edits, commits, pushes, PR operations, and uploads. Exit `10` requires reading the owner message, applying or rejecting it, replying with `run resolve`, then checking again. Exit `11` pauses the action until coordination recovers; exit `12` permits work without further Slack calls after an operator disabled the run. Do not treat a successful earlier check as permission for a later action. See the command contract for exact exit behavior.
4. When the delivery brief requests PR follow-up, `describe-pr` sends an event with the PR URL and current state; it does not finish the run. The orchestrator, or the skill run by hand that observes the current-head pipeline and discussions, sends the next event. Call `run finish --outcome completed` only after the requested evidence, checks, and PR follow-up are complete. Use `failed` or `cancelled` only for a terminal failed or cancelled task, with unresolved work stated. A blocker awaiting an owner answer is an active run, not a finished one.

If `run start` fails before returning a run ID, do not invent `slack_run_id`: record the error in `## Decisions`, then use feature-thread mode when its token file exists, else continue without Slack; stop only when the request made Slack a gate. Once a run ID is saved, coordinator checks and failure handling govern that task; do not fall back to a direct Web API post. The coordinator daemon and token setup are operator work, per its skill.

## Token file

Load Slack settings immediately before each Slack API call, in the same shell command, from the operator-controlled file `${SLACK_AGENT_ENV_FILE:-$HOME/.config/agent-slack/env}`:

```bash
set -a; . "${SLACK_AGENT_ENV_FILE:-$HOME/.config/agent-slack/env}"; set +a
```

The file lives outside every repository and is readable only by the operator (`chmod 600`). It supplies:

- `SLACK_AGENT_BOT_TOKEN`: the bot OAuth token (`xoxb-…`). Required by direct feature-thread and Jira-run modes.
- `SLACK_AGENT_CHANNEL_ID`: the channel ID that feature-thread mode posts to, for example `C012ABC34`. Jira-run mode ignores it and uses the channel the orchestrator supplies.
- `SLACK_AGENT_OWNER_ID`: optional. The project owner's Slack member ID, for example `U012ABC34`, not a display name. It lets feature-thread mode [read blocker answers](references/feature-thread.md#wait-for-the-answer) from the thread. Jira-run mode ignores it and uses the owner ID the orchestrator supplies.

Direct modes require `curl` and `node`. Run `bash <skill-dir>/scripts/slack-post.sh post <message-file> [channel]` for a parent, `reply <message-file> <channel> <thread-ts>` for a blocker, or `update <message-file> <channel> <ts>` for the existing root. Run `bash <skill-dir>/scripts/slack-read.sh <channel> <thread-ts> <oldest-ts>` only for an authorized thread. These helpers source the operator token file and reject Slack API errors. Never print, log, commit, copy, rotate or request the token; never source repository-controlled `.env`. Missing settings degrade Slack, not product delivery unless expressly gated.

## API and failure rules

Use the bot OAuth token (`xoxb-…`) with `Authorization: Bearer "$SLACK_AGENT_BOT_TOKEN"`. `chat.postMessage` and `chat.update` are required API operations and need the `chat:write` scope. Owner steering and feature-thread blocker answers also use `conversations.replies`, which needs `channels:history` for a public channel or `groups:history` for a private one. Validate errors from Slack's JSON response rather than treating a successful HTTP connection as a successful post/read.

Classify missing scope, bot-not-in-channel, invalid token, an invalid supplied channel ID, or API failure as a Slack harness/configuration issue. Record the exact Slack error and the smallest owner action needed, then continue the product workflow with Slack disabled or degraded. Do not mark a ticket, implementation subagent, or the run goal `blocked` for this unless the prompter explicitly made Slack a delivery gate. Do not make unrequested Slack app, scope, channel-membership, credential, or workspace changes to recover.

All Slack operations target the supplied channel ID. Do not perform discovery or request discovery scopes such as `groups:read`. Reply polling, when enabled, uses only the access Slack requires for that configured channel.

## Handoff

The orchestration ledger and final report include the configured channel, optional project-owner member ID, each ticket's thread permalink, latest status timestamp, last processed reply timestamp, accepted instructions, rejected instructions with reasons, and any non-blocking Slack-control-plane configuration issue.

## Post a blocker

In coordinator mode use `run event --blocker` and keep the run active for owner input. Direct feature-thread mode follows [its blocker protocol](references/feature-thread.md#post-a-blocker); ordinary gates and handoffs are not blockers.
