---
slug: three-consecutive-task-failures
title: "three consecutive task failures pause the task and DM the owner"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - a-failed-task-run
issue: 69
---
In `tools/slack-coordinator/internal/assistant/deliver.go`, after incrementing `consecutive_failures` and posting the task's `Failed` message, when the new value is `>= 3`: `SetTaskState(id, paused, dueAt NULL, endedAt NULL)` and `PostMessage(ownerDM, "", "t<id> paused after 3 failed runs: <failure first line>. Fix the cause, then send !resume t<id>.")`. In `verbs.go`, `!resume` also resets `consecutive_failures = 0` (`ResetTaskFailures` in `internal/db/tasks.go`) and, for `each_message` tasks with unconsumed messages, sets `due_at = now + debounce_seconds` so the held batch runs. Confirm `WatchingTasks` already filters `state='active'` so paused tasks collect nothing.

Tests: three scripted failures → `paused`, DM text, no fourth enqueue on later ticks; a message in the paused task's channel → no `task_messages` row; `!resume` → `active`, failures 0, `due_at` set, next tick binds the old batch.

Proof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN a task run fails and `consecutive_failures` becomes 3, the daemon shall set `state = paused`, `due_at = NULL`, and post a top-level DM to the owner `t<id> paused after 3 failed runs: <last failure>` naming `!resume t<id>`.
- WHILE a task is `paused`, the tick shall enqueue no run for it and the collection hook shall insert no `task_messages` for it.
- WHEN `!resume` reactivates the task, `consecutive_failures` shall be 0 and the held batch shall be bound to the next run.
