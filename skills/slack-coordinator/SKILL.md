---
name: slack-coordinator
description: Post one Slack thread per run through the local slack-coordinator daemon, read owner replies at least once a minute and before state-changing work, and, once a run has started, pause coordination while it is unavailable. Talk to that daemon only through the slack-coordinator CLI.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Slack coordinator

Use this skill to report one run of agent work in one Slack thread and to let the run owner steer it from that thread. The `slack-coordinator` executable is the only way the agent touches Slack: the per-user daemon holds the tokens and the state database; the CLI talks to the daemon over a local socket. The skill works independently from the other delivery skills.

Confirm that the `slack-coordinator` executable is available before operating it (`command -v slack-coordinator`). If it is missing, build `./tools/slack-coordinator/cmd/slack-coordinator` from a checkout of this collection; `scripts/install.mjs` installs only this agent skill. Operators set up the daemon with `slack-coordinator onboard` (or `setup` non-interactively). Do not download or install a binary implicitly.

Start one run with `slack-coordinator run start` and keep its `run_id`. Use `--dm` to open a separate run thread in the owner's bot DM; otherwise the repository's configured channel is used. A run can receive owner replies in either thread, or through `!to <run-id> <message>` in a top-level bot DM. Run `slack-coordinator run check --run-id <id>` immediately before every state-changing action: an edit, a commit, a push, a command that changes a system. Exit `0` means proceed. Exit `10` means the owner replied: read the reply, apply or reject it, answer with `run resolve`, then check again. Exit `11` means Slack coordination is unavailable: pause, retry the check after a short wait, and report the reason; never take the action while the check fails. Exit `12` means an operator disabled Slack for this run; proceed without further Slack calls. The check is never skipped, guessed, or replaced with a cached answer.

Owner replies wait in the daemon until the agent reads them; nothing pushes them into a busy or idle session. While the run is active, read the inbox at least once a minute, not only before changes:

- While working, run `run check` between steps whenever a minute may have passed since the last read. Start a command expected to run longer than a minute in the background when the runtime allows, and check while it runs.
- While waiting on CI, a review, or a blocker answer, repeat `run wait --run-id <id> --for <duration>` instead of ending the turn. Keep the duration below your tool's command timeout; the wait returns within a second of a reply, with the same exits as `run check`.
- A runtime with background child workers may give this cadence to one watcher that repeats `run wait` and returns the first `owner_input` unresolved. The parent handles and resolves it, and still runs `run check` before every change.
- Call `run finish` before the session ends. Replies to a run left active with no agent are never read. A blocked run does not end its session during the [blocker watch](#blocked-runs).

For a `/deliver` task, save the returned `run_id` as `slack_run_id` in the task's `task.md` before work begins. The orchestrator (or a skill run by hand) reads that same key, calls `run event --run-id <id> --current <stage and current work> --next <next action>`, and keeps the existing thread. Only the orchestrator (or a skill run by hand) consumes owner replies and sends events; workers and reviewers report to it. `describe-pr` reports an opened PR with `run event` when follow-up remains. After the requested evidence, current-head pipeline, and discussions are checked, the orchestrator calls `run finish` with the observed outcome. A pending human blocker keeps the run active. See [the delivery bridge](../delivery/agent-slack-control-plane/SKILL.md#coordinator-mode).

For channel content, `run content --run-id <id>` lists paged file metadata, bookmarks (including links), channel tabs, and the channel canvas permalink. `run list-items --run-id <id> --list-id <F…>` reads a page from a List shared in that channel. `run upload --run-id <id> --path <file>` shares a local file into the run thread after an internal write gate; also check the gate yourself immediately before invoking it. The daemon must be able to read the path. See [references/commands.md](references/commands.md) for limits. Slack does not expose canvas bodies or folder contents through its documented Web API; report that boundary rather than treating a permalink as body content.

Routine status is coalesced into one editable thread card every three hours by default; blockers are separate immediate replies, and completion replaces the card. Links appear as embedded labels, including Jira issue keys instead of raw URLs. To change the interval for your active run at runtime, call `slack-coordinator run cadence --run-id <id> --every <duration>` (for example, `1h` or `3h`); it affects only that run. Agents mark the root at any point with `slack-coordinator run react --run-id <id> --emoji <name>`; `run finish` also reacts by outcome unless overridden or disabled.

## Blocked runs

A blocker is a question only the owner can answer; `run event --blocker <s>` posts it as an immediate thread reply. The daemon adds a direct mention of the configured owner (`slack.owner_user_id`) to every blocker reply, so Slack notifies them. Do not add your own mention or a second message.

Before posting, make every option in the question one you can carry out. If your runtime's permission mode or a repository hook may refuse the action an answer authorizes (a history rewrite, a force push, a command outside the allowlist), say so in the same blocker. Offer the permission rule or the exact command for the owner to run as options, so one reply unblocks the run. Continue any work that does not depend on the answer.

After posting, keep the run active and watch it for seven days from the blocker's post time. Never pause, finish, or end the session because a reply is slow.

1. While the session is active, repeat `run wait` as above.
2. When the session would otherwise go idle, arm an hourly wake with the runtime's scheduler (for example Claude Code `CronCreate` or `ScheduleWakeup`, or native Codex scheduling). Each wake runs `run check`. Re-arm the wake after each firing and after any scheduler expiry until the watch ends. Never give a watcher its own shorter deadline, such as "overnight" or eight hours: when it expires, re-arm it. Background commands and session schedulers die with the agent process, so a resumed session re-arms the watch before anything else. When no scheduler exists, keep repeating `run wait` in the session; report the capability gap once. Do not start a daemon or hidden process instead.
3. After each of the first six 24-hour periods with no owner reply, post a follow-up with `run event --current <current> --blocker "No reply in 24 hours (day <n> of 7): <blocker>"`. The day number keeps each follow-up distinct, so the daemon posts it and mentions the owner. Keep watching.
4. When seven days pass with no reply, post one final follow-up with `run event --current <current> --blocker "No guidance in 7 days; stopping the watcher: <blocker>"`. Then run `run finish --outcome cancelled --unresolved <blocker>` and delete any wake you armed.
5. When a reply arrives, handle it as exit `10`, delete the wake, and continue. If an authorized action is still refused, that is a new blocker: post it, and the seven-day watch starts again.

## Other roles

A headless assistant has a different working directory: `<root>/workspace/runs/<id>`, with a `prompt.md` the daemon wrote. That process does not run `slack-coordinator` and does not contact Slack. It reads `prompt.md` and `messages.jsonl`, writes the owner's reply to `result.md`, and writes `proposal.json` only when proposing a standing task. The file shapes are in the prompt and in [ASSISTANT.md](../../tools/slack-coordinator/internal/assistant/skill/ASSISTANT.md).

Installing, upgrading, rotating tokens, and restarting the daemon are operator work, documented in [docs/slack-coordinator.md](../../docs/slack-coordinator.md). An app that already exists is connected with `slack-coordinator setup`, not by creating a second app. An agent reports that the daemon is down; it does not repair it.

Follow [references/commands.md](references/commands.md) for the start/check/resolve/event/finish flow and exit codes; it also reserves `run disable-slack` for an interactive operator. Read [references/channel-selection.md](references/channel-selection.md) when choosing `--channel`, and [references/messages.md](references/messages.md) for the fields each message renders.
