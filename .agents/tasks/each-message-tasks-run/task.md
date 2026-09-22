---
slug: each-message-tasks-run
title: "each-message tasks run when the debounce window closes under the 10-minute floor"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - schedule-and-window-end
issue: 66
---
In `tools/slack-coordinator/internal/assistant/dispatcher.go` `enqueueDueTasks`, add the `each_message` branch: select `tasks WHERE state='active' AND trigger='each_message' AND due_at IS NOT NULL AND due_at <= now AND (last_run_started_at IS NULL OR last_run_started_at <= now - 10m)` with no `queued`/`running` run and at least one `task_messages` row with `run_id IS NULL` (`DueEachMessageTasks` in `internal/db/tasks.go`, floor as a constant `eachMessageFloor = 10 * time.Minute`); enqueue exactly as the schedule branch and set `due_at = NULL`. A task inside the floor is left alone: the collection hook keeps extending `due_at`, and the batch grows. In `deliver.go`, an `each_message` success or failure does not compute `NextDue`; `due_at` stays NULL; failure keeps the batch unbound as for other tasks (a later message re-arms `due_at`).

Tests: fixed clock; message at T0 → `due_at = T0+5m`; tick at T0+4m → nothing; tick at T0+5m → run enqueued, `due_at` NULL; second message at T0+6m with `last_run_started_at = T0+5m` → `due_at = T0+11m`, tick at T0+11m → held (floor until T0+15m), tick at T0+15m → enqueued with every unconsumed message; owner-stated `debounce_seconds = 60` honored.

Proof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN an `active` `each_message` task has `due_at <= now`, at least one unconsumed `task_messages` row, and `last_run_started_at + 10 min <= now` (or NULL), the tick shall enqueue one task run bound to every unconsumed message and set `due_at = NULL`.
- WHILE `last_run_started_at + 10 min > now`, the tick shall hold the batch and later messages shall keep joining it.
- WHEN an `each_message` run completes, the daemon shall deliver as for a scheduled task and leave `due_at` NULL until the next collected message sets it.
