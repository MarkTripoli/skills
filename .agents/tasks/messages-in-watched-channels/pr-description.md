Ticket: [#51](https://github.com/MarkTripoli/skills/issues/51) | Task: `messages-in-watched-channels`

## Purpose

`collect` dropped every channel message, so a task watching a channel never saw one; it now stores each plain user message in a watched `C…`/`G…` channel once with its permalink, binds it unconsumed to every active watching task in one transaction, and closes an `each_message` task's window at `now + debounce_seconds`.

## Acceptance criteria

- A message with no `subtype` and no `bot_id` in a channel watched by at least one `active` task inserts `collected_messages` with the `chat.getPermalink` result and one `task_messages{run_id NULL}` row per watching active task: `TestCollectStoresWatchedMessageOnceAndBindsEveryActiveTask` (`internal/assistant/collect_test.go:77`) routes the same envelope twice plus an unwatched-channel message and asserts one `collected_messages` row with permalink `https://t.slack.com/archives/C1/p1700000000.002000`, two `run_id IS NULL` bindings, and no `due_at` on the `schedule` and `window_end` tasks; pass. Subtype and bot filtering is the unchanged `userMessage` (`router.go:81-83`).
- An `each_message` task gets `due_at = now + debounce_seconds`: `TestCollectClosesEachMessageWindowAtNowPlusDebounce` (`collect_test.go:135`) expects `2026-09-21T10:05:00Z` for a clock at `10:00:00Z` and debounce 300, unchanged after a redelivery two minutes later, and `10:07:00Z` after a second message (a thread reply, stored with its `thread_ts`); pass.
- A channel watched only by `paused`, `completed`, or `cancelled` tasks inserts nothing: `WatchingTasks` filters `t.state = 'active'` (`internal/db/tasks.go:39`); `TestCollectIgnoresChannelsWatchedOnlyByInactiveTasks` (`collect_test.go:116`) inserts one task per inactive state and asserts zero rows in both tables and no `due_at`; pass.
- An owner reply in an active coding-agent run thread that is also watched inserts both `owner_inputs` and `collected_messages`: `route` runs `RecordOwnerInput` first and joins its error with `collect` (`router.go:56-60`); `TestCollectAlsoRecordsOwnerReplyInWatchedRunThread` (`collect_test.go:163`) reads the input back through `OldestUnhandledInput` and counts the collected row and its binding; pass.

Proof command: `cd tools/slack-coordinator && go test -count=1 ./internal/assistant ./internal/db` (both `ok`). `npm test`, formatters, and linters were not run, per `task.md`.

## Special things to note

- `due_at` moves only when `BindMessageToTask` reports a new row (`router.go:135`, `collected_messages.go:44-48`). A redelivered Socket Mode envelope is therefore not a new message: it changes no row and leaves the window where the first delivery put it. `task.md` does not state this; the alternative (moving the window on every delivery) would let a late ack extend a window with no new content.
- `chat.getPermalink` is called before the transaction, once per watched message and never for an unwatched channel, in the order `task.md` prescribes. A redelivery pays one extra Slack call before `INSERT OR IGNORE` discards it, and a permalink failure returns before any row is written (code review ADV-001, ADV-002; no behavior change).
- `WatchingTasks` runs on the base connection, outside `Transact` (ADV-003). Nothing in the tree writes `tasks.state` yet and `ConsumeInbound` handles envelopes serially, so no writer can pause a task between the read and the bindings today; the child that adds state transitions should move the read inside the transaction.

## Change outline

Two new `internal/db` files, one method per statement, used only by `collect`.

```diff
+db.WatchingTask{TaskID int64; Trigger string; DebounceSeconds sql.NullInt64}
+(*DB).WatchingTasks(ctx, channelID) ([]WatchingTask, error)
+    task_channels JOIN tasks WHERE channel_id = ? AND state = 'active' ORDER BY task_id
+(*DB).SetTaskDue(ctx, taskID, dueAt string) error
+
+db.CollectedMessage{ChannelID, TS string; ThreadTS sql.NullString; UserID, Text, Permalink, ReceivedAt string}
+(*DB).InsertCollectedMessage(ctx, m) error               INSERT OR IGNORE, PK (channel_id, ts)
+(*DB).BindMessageToTask(ctx, taskID, channelID, ts) (bound bool, error)
+    INSERT OR IGNORE task_messages(..., run_id NULL); bound = RowsAffected() > 0
+
+const TaskActive, TaskPaused, TaskCompleted, TaskCancelled
+const TriggerSchedule, TriggerWindowEnd, TriggerEachMessage
```

`collect` replaces the `return nil` stub; `route` is unchanged.

```text
route(C…/G… message)
  if thread reply:  Coord.RecordOwnerInput      (unchanged, runs first)
  collect
    tasks = DB.WatchingTasks(channel)
    none → return                                one query, no Slack call
    permalink = Slack.Permalink(channel, ts)     once per watched message
    now = s.Now()
    DB.Transact
      InsertCollectedMessage(channel, ts, thread_ts|NULL, user, text, permalink, now)
      for each task:
        bound = BindMessageToTask(task, channel, ts)
        if bound and trigger == each_message:
          SetTaskDue(task, now + debounce_seconds)
```

Tests insert tasks through a second `sql.DB` on the same file (`newCollectService`, `collect_test.go:18`); `router_test.go` extracts `newTestServiceAt(t, path)` for it.

Read `router.go:130-142` first: the `!bound || t.Trigger != db.TriggerEachMessage` guard is the only branch in the transaction and carries the redelivery decision.

## Human Review

### Review targets

- `internal/assistant/router.go` `collect`: transaction boundary covers the `collected_messages` insert and every binding, so `task_messages`' composite foreign key to `collected_messages` (`schema.go:75`) cannot dangle; `received_at` and `due_at` come from one `s.Now()` read.
- `internal/db/collected_messages.go` `BindMessageToTask`: `RowsAffected` after `INSERT OR IGNORE` is the signal that moves `due_at`; confirm the driver reports 0 on an ignored insert (the redelivery assertions in `collect_test.go:84,146` depend on it).
- `internal/db/tasks.go` `WatchingTasks`: `debounce_seconds` scans into `sql.NullInt64`; a NULL on an `each_message` task yields `due_at = now`. Task creation, a later child, owns that validation.

### Verify

- [ ] `cd tools/slack-coordinator && go test -count=1 ./internal/assistant ./internal/db` passes on the head commit.
- [ ] The `Commits` check passes on the subjects between `epic-slack-assistant-bot-dms` and head.

### Known limits

- The `G…` private-channel prefix shares one `case` with `C…` (`router.go:55`) and is not exercised by a test.
- No test drives `collect` with a failing `Permalink`; the early return at `router.go:113-116` precedes the transaction, read from the code only.
- No `.changeset/` entry in this child; the epic's docs child owns the user-facing changelog.

Closes #51
