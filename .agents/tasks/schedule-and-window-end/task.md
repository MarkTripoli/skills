---
slug: schedule-and-window-end
title: "schedule and window-end tasks run at their due time and deliver results"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - messages-in-watched-channels
  - tasks-show-pause-resume
  - a-dm-request-runs
issue: 61
---
In `tools/slack-coordinator/internal/assistant/dispatcher.go`, add `enqueueDueTasks(ctx)` to `Tick` before `spawnQueued` (after `reapOrphans` when that sibling has merged): `DueTasks(now)` (`internal/db/tasks.go`: `state='active' AND trigger IN ('schedule','window_end') AND due_at IS NOT NULL AND due_at <= ?` with no `assistant_runs` row in `queued`/`running` for the task) → per task, one transaction: `InsertAssistantRun{kind task, task_id, queued}` and `BindUnconsumedToRun(task_id, run_id)` (`internal/db/collected_messages.go`: `UPDATE task_messages SET run_id = ? WHERE task_id = ? AND run_id IS NULL`). `spawnQueued` treats task rows like DM rows in the slot loop (oldest `queued_at` first); before spawning a task run: `MessagesForRun(run_id)` joined to `collected_messages` in ts order → `messages.jsonl` lines `{"author": user_id, "channel": channel_id, "ts": ts, "text": text, "permalink": permalink}`; `prompt.md` with `kind: task t<id> · approval: <level>`, the skill text, `## Instruction` (verbatim `tasks.instruction`), `## Previous result` (the newest `done` run's `result.md` for this task when the file exists, else `None`), `## Collected messages` (`<n> messages in messages.jsonl (author, channel, ts, text, permalink)`); `SetTaskLastRunStarted(task_id, now)`.

`deliver.go` for `kind = task`: success (`ExitCode == 0 && !TimedOut && Result != ""`) → header `t<id> · <#name[, #name]> · <n> new items` (names via the cached `ConversationInfo`; `n` = bound messages); target from `deliver_to`: `{"dm":true}` → `OpenConversation(s.Owner)` (add to `SlackSurface`; cache the `D…` id) then `PostMessage(dm, "", header + "\n" + Result)`; `{"channel_id","thread_ts"}` → `PostMessage(channel, thread_ts, header + "\n" + Result)`; results over 4,000 runes use the existing `chunk` helper as consecutive posts with the header in the first. Then `FinishRun(done)` and `UPDATE tasks`: `last_result_at = now`, `consecutive_failures = 0`, and for `schedule` `due_at = NextDue(schedule, now)`; for `window_end` `state = completed`, `ended_at = now`, `due_at = NULL` (`CompleteTaskRun` in `internal/db/tasks.go`). Failure (any other outcome): `FinishRun(failed, cause)`, `UPDATE task_messages SET run_id = NULL WHERE run_id = ?` (`UnbindRun`), `consecutive_failures + 1`, `due_at = NextDue` for `schedule` (`FailTaskRun`); no Slack post in this child (a sibling reports task failures).

Tests (`dispatcher_test.go`, `deliver_test.go`; fixed clock, fake runner, fake Slack answering `conversations.open`): due schedule task with three collected messages → one queued row, three bound rows, `messages.jsonl` three lines in ts order, `prompt.md` has the instruction and `3 messages`; success → DM header `t1 · #general · 3 new items`, `due_at` advanced, failures 0; window_end success → `completed`, `ended_at`; channel-thread delivery posts with `thread_ts`; failure → row `failed`, batch unbound, `consecutive_failures = 1`, `due_at` advanced, no Slack call; a task with a `running` row is not re-enqueued; a due task with zero messages still runs with `0 new items`.

Proof: `go test -race ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN an `active` task with `trigger` `schedule` or `window_end` has `due_at <= now` and no `queued` or `running` run, the tick shall insert one `queued` `assistant_runs{kind task, task_id}` row and set `task_messages.run_id` on every unconsumed row of that task.
- WHEN the task run spawns, `messages.jsonl` shall hold one `{"author","channel","ts","text","permalink"}` line per bound message in ts order, `prompt.md` shall carry `## Instruction`, `## Previous result`, and `## Collected messages` with the count, and `tasks.last_run_started_at` shall be set.
- WHEN the run exits 0 with a result, the daemon shall post `t<id> · <#channels> · <n> new items` followed by the result to the task's target: a new top-level DM to the owner for `{"dm":true}`, or a reply in the named channel thread.
- WHEN a run succeeds, the daemon shall set `last_result_at` and `consecutive_failures = 0`, and then either `due_at = NextDue(schedule, now)` for a `schedule` task or `state = completed`, `ended_at`, `due_at = NULL` for a `window_end` task.
- IF the run fails, THEN the daemon shall set the row `failed`, set `task_messages.run_id = NULL` for the batch, increment `consecutive_failures`, and advance `due_at` for `schedule` tasks, with no Slack post.
