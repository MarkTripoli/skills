---
slug: messages-in-watched-channels
title: "messages in watched channels are collected for each active task"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - owner-dms-are-recorded
issue: 51
---
In `tools/slack-coordinator/internal/assistant/router.go`, fill `collect` for `C…`/`G…` messages (top level and thread replies, any user, `SubType == ""`, `BotID == ""`): `WatchingTasks(channelID)` (`internal/db/tasks.go`: join `task_channels` with `tasks WHERE state='active'`); when non-empty, fetch the permalink once (`s.Slack.Permalink`), then in one transaction `INSERT OR IGNORE collected_messages(channel_id, ts, thread_ts, user_id, text, permalink, received_at)` and `INSERT OR IGNORE task_messages(task_id, channel_id, ts, NULL)` per task (`internal/db/collected_messages.go`: `InsertCollectedMessage`, `BindMessageToTask`), and for each watching task with `trigger = each_message`, `UPDATE tasks SET due_at = ?` with `now + debounce_seconds` (`SetTaskDue`). The run-thread `RecordOwnerInput` call stays and runs first; both rows may result. The bot's own posts have `bot_id` and are dropped before this hook.

Tests in `collect_test.go` (tasks inserted directly): message in a channel watched by two active tasks → one `collected_messages` row, two `task_messages` rows, permalink stored; redelivery → no duplicates; channel watched by a paused task only → nothing; each_message task → `due_at = now + 300s`; owner reply in a run thread that is also watched → `owner_inputs` and `collected_messages` both present.

Proof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN a message with no `subtype` and no `bot_id` arrives in a `C…`/`G…` channel listed in `task_channels` for at least one `active` task, the daemon shall `INSERT OR IGNORE collected_messages` (with `permalink` from `chat.getPermalink`) and one `task_messages{run_id NULL}` row per watching active task.
- WHEN such a message arrives for an `each_message` task, the daemon shall set `tasks.due_at = now + debounce_seconds`.
- IF the channel is watched only by `paused`, `completed`, or `cancelled` tasks, THEN no row shall be inserted.
- WHEN the message is also an owner reply in an active coding-agent run thread, the daemon shall insert both `owner_inputs` and `collected_messages`.
