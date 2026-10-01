---
name: agent-slack-control-plane
description: "Operate Slack visibility for agent work. A /deliver task can use the slack-coordinator CLI for owner steering across stages, or the direct feature thread for status-only visibility. Jira-run mode supports video-iterative-orchestration. It does not implement product work."
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Agent Slack Control Plane

This skill has three modes. Choose one for a task and keep it across stages. Never post or edit the same thread through both the coordinator CLI and the direct Web API.

- **Coordinator mode** uses the standalone [slack-coordinator skill](../../slack-coordinator/SKILL.md) when its executable and daemon are configured. It reads owner steering and gates state-changing work. See [Coordinator mode](#coordinator-mode).
- **Feature-thread mode** runs for a `deliver` task when coordinator mode is not selected and the operator's Slack file is configured. It posts rarely and reads only owner answers to its own blockers. See [Feature-thread mode](#feature-thread-mode).
- **Jira-run mode** runs only when a Jira-driven orchestration run explicitly enables Slack visibility and steering. Slack is a control surface and public progress log; the orchestration ledger remains the source of truth. It starts at [Jira-run configuration](#jira-run-configuration).

## Coordinator mode

Enable this mode explicitly for an opted-in delivery when the CLI and daemon are configured. Existing task slack_run_id records the opt-in; never create another run or switch its transport. The daemon retains personal assistant, DM and standing-task behavior.

Use only the `slack-coordinator` CLI, never `curl` or the token file, for a task with `slack_run_id` in `task.md`. Read the [standalone skill](../../slack-coordinator/SKILL.md) and its command contract when installed; the steps below are the minimum protocol for a partial skill install. The `slack_run_id` is the durable cross-stage key; `slack_channel` and `slack_thread_ts` may also be saved from `run start` for a human-readable link, but they do not authorize direct API calls.

1. After `deliver` writes a new `task.md` and before any stage runs, call `slack-coordinator run start --work <title> --goal <observable goal> --scope <task and branch> --link <Jira URL when present>`. Select `--dm` only when the request or repository guidance calls for the owner DM; otherwise follow the coordinator's channel-selection rules. Capture the JSON `run_id`, `channel_id`, `thread_ts`, and `permalink`. Save `slack_run_id: "<run_id>"` in `task.md`. Reuse that ID for every later stage. A reused task with `slack_run_id` never starts another run.
2. The orchestrator (or a skill run by hand) reads `slack_run_id` from `task.md` and calls `slack-coordinator run event --run-id <id> --current <stage and current work> --next <next concrete action>`. This updates the persisted thread status card at the daemon's cadence; the compact root stays fixed; it does not create a new parent message. Report a newly discovered blocker with `--blocker`, and report its clearance in the next event. Workers and reviewers never send events; one owner controls the run ID.
3. Run `slack-coordinator run check --run-id <id>` immediately before each state-changing action, including edits, commits, pushes, PR operations, and uploads. Exit `10` requires reading the owner message, applying or rejecting it, replying with `run resolve`, then checking again. Exit `11` pauses the action until coordination recovers; exit `12` permits work without further Slack calls after an operator disabled the run. Do not treat a successful earlier check as permission for a later action. See the command contract for exact exit behavior.
4. When the delivery brief requests PR follow-up, `describe-pr` sends an event with the PR URL and current state; it does not finish the run. The orchestrator, or the skill run by hand that observes the current-head pipeline and discussions, sends the next event. Call `run finish --outcome completed` only after the requested evidence, checks, and PR follow-up are complete. Use `failed` or `cancelled` only for a terminal failed or cancelled task, with unresolved work stated. A blocker awaiting an owner answer is an active run, not a finished one.

If `run start` fails before returning a run ID, do not invent `slack_run_id`: record the error in `## Decisions`, then use feature-thread mode when configured, else continue without Slack; stop only when the request made Slack a gate. Once a run ID is saved, coordinator checks and failure handling govern that task; do not fall back to a direct Web API post. The coordinator daemon and token setup are operator work, per its skill.

## Feature-thread mode

Read [the direct feature-thread protocol](references/direct-feature-thread.md) completely before using this mode. It requires the operator-controlled Slack configuration and no coordinator run ID. Preserve one task root thread, post only genuine human blockers, accept only the configured owner, and update the root with observed GitHub PR state. It never shares a coordinator thread or grants product/Jira mutation authority.

## Jira-run configuration

Read [the Jira-run protocol](references/jira-run.md) completely only for explicitly enabled Jira-run visibility. Use the orchestrator's supplied channel and durable ledger, one thread per ticket, owner-only steering and sparse status. Missing Slack configuration remains non-blocking unless the user made it a gate. Credentials and short-lived test codes never travel through Slack.

## Post a blocker

In coordinator mode use run event --blocker and keep the run active for owner input. Direct feature-thread mode follows [its blocker protocol](references/direct-feature-thread.md#post-a-blocker); ordinary gates and handoffs are not blockers.
