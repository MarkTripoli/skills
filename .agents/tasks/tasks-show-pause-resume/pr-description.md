Ticket: [#54](https://github.com/MarkTripoli/skills/issues/54) | Task: `tasks-show-pause-resume` | Walkthrough: none

## Purpose

The owner DM answered `!tasks`, `!show`, `!pause`, `!resume`, and `!cancel` with `not available yet`; this pull request makes the five verbs read and change `tasks` rows through new `internal/db` accessors and a `NextDue` schedule function, so standing tasks can be listed, inspected, paused, resumed, and cancelled from Slack.

## Acceptance criteria

- `!tasks` lists one line per `active` or `paused` task (id, state, watched channels, schedule text, next due or `waiting for messages`, last result) or `No standing tasks.`: `go test ./internal/assistant -run 'TestTasksListsActiveAndPausedTasks|TestVerbsWriteNoRows'` compares the exact reply over six rows in four states and three schedule shapes, and the empty table.
- `!show <id>` on any row carries the instruction verbatim, the state, and the newest five `assistant_runs` with the first 500 characters of each `result.md`: `go test ./internal/assistant -run TestShowPrintsInstructionAndNewestRunsWithResults` uses a `cancelled` task, six runs (the sixth excluded), a 600-character `result.md` cut to 500, and another task's run excluded.
- `!pause`, `!resume`, and `!cancel` apply their transition (`paused` with `due_at = NULL`; `active` with `due_at = NextDue(schedule, now)` or NULL for `each_message`; `cancelled` with `ended_at`) and reply with the new state and, for `!resume`, the next due time: `go test ./internal/assistant -run TestPauseResumeCancelTransitions` reads `state`, `due_at`, `ended_at`, and `consecutive_failures` back from SQLite after each verb for daily, past `at`, `each_message`, and `every_hours` tasks, and checks `t<id> is <state>` on completed and cancelled rows.
- An unknown or malformed id replies `unknown id, known: t<id> t<id>…` with active and paused ids ascending: `go test ./internal/assistant -run TestTaskVerbsRejectUnknownAndMalformedIds` covers no argument, `9`, `t9`, `0`, `-1`, `t`, `x2`, `2a` across the four id verbs with a cancelled and a completed row excluded from the list.
- `NextDue({"daily":"09:00","tz":"Europe/Berlin"}, 2026-09-22T08:00:00Z)` returns `2026-09-23T07:00:00Z` and `{"every_hours":6}` returns now plus six hours: `go test ./internal/assistant -run TestNextDue`, rows 1 and 7 of the table; rows 4 and 5 cross both Berlin DST transitions.

## Special things to note

- `SetTaskState` updates by `task_id` alone with no `AND state = ?` guard. Every `tasks` writer runs on the `ConsumeInbound` goroutine today, so no interleaving exists; the scheduler a later child adds must add the guard before writing `completed` from another goroutine (review advisory ADV-001 in [01-code-review-tasks-show-pause-resume.md](.agents/tasks/tasks-show-pause-resume/01-code-review-tasks-show-pause-resume.md)).
- A verb error (unreadable `result.md`, unparsable `schedule` JSON on `!resume`) is logged by `ConsumeInbound` and leaves the owner without a reply, the same behavior `!status` has on a db error. Both inputs are written by the daemon itself.
- No `.changeset/` entry is added: this pull request targets the epic branch `epic-slack-assistant-bot-dms`, and the assistant gets one changeset when that branch merges to `main`, matching the two other verb children on the epic.

## Change outline

Ownership: SQL stays in `internal/db`; the assistant package composes it.

```text
tools/slack-coordinator/internal/
  db/
    tasks.go            Task row, ErrTaskNotFound, ListTasks, GetTask, TaskChannels,
                        SetTaskState, ResetTaskFailures
    assistant_runs.go   TaskRun row, RecentRunsForTask (LIMIT n, newest queued first)
  assistant/
    tasks.go            NextDue, parseSchedule, scheduleText, dueText, parseTaskID
    verbs.go            tasks, show, pause, resume, cancel, taskArg, runLine, resultExcerpt
    service.go          SlackSurface.ConversationInfo, Service.channelNames cache, channelName
```

`SlackSurface` gains one method; `*slackapi.Client` already had it, so the daemon constructor compiles unchanged.

```diff
 type SlackSurface interface {
     PostMessage(...)
+    ConversationInfo(ctx context.Context, id string) (*slack.Channel, error)
 }
```

`NextDue` is the only schedule arithmetic; `!resume` and the future scheduler share it.

```text
NextDue(scheduleJSON, now) -> (time.Time, error)
  {"daily":"HH:MM","tz":"<IANA>"}  next wall time in tz strictly after now, built with
                                   time.Date on the calendar day, so DST keeps the hour; UTC without tz
  {"every_hours":n}                now + n hours
  {"at":"<RFC3339>"}               that instant, or zero once it is not after now
```

Each id verb resolves its row once, then branches on state.

```text
verb(args)
  taskArg: parseTaskID -> GetTask
    malformed | ErrTaskNotFound -> "unknown id, known: t3 t4" (ListTasks active, paused; "none" when empty)
  state not eligible -> "t<id> is <state>"
  pause   -> SetTaskState(paused, due=NULL, ended=NULL)
  resume  -> due = NextDue (nil for each_message or a passed window)
             Transact{ SetTaskState(active, due, NULL); ResetTaskFailures }
             "t<id> resumed · next due <time in schedule tz>" | "waiting for messages" | "window already passed"
  cancel  -> SetTaskState(cancelled, NULL, ended=now)
  show    -> RecentRunsForTask(id, 5); per run: runLine + first 500 runes of <RunDir>/result.md
```

Before reading the diff: the tests assert replies through the router (`verbReply` posts one DM and captures the top-level post) and read the row back from SQLite, so a reply string change and a state change both fail a test.

## Human Review

### Review targets

- `internal/assistant/verbs.go` `resume`: the `Transact` closure writes `due_at` and zeroes `consecutive_failures` together; confirm a `NextDue` error leaves the paused row untouched.
- `internal/assistant/tasks.go` `NextDue` daily branch: `time.Date(..., day+1, ...)` in the schedule zone across the Berlin DST rows of `TestNextDue`.
- `internal/assistant/service.go` `channelName`: a failed `conversations.info` returns the bare id and is retried on the next `!tasks`; `TestTasksListsActiveAndPausedTasks` pins four calls over two listings.
- `internal/db/tasks.go` `SetTaskState`: unguarded UPDATE, accepted for the single-goroutine writer today.

### Verify

- [ ] `cd tools/slack-coordinator && go test -count=1 ./internal/assistant ./internal/db` passes on the head commit (both packages `ok` at `0ed59f1`).
- [ ] The `Commits` check accepts the title `feat(slack-coordinator): manage standing tasks from the owner DM` (`node scripts/check-commits.mjs --title` reports `ok: 1 subject`).

### Known limits

- No live Slack run; `ConversationInfo` is exercised through `fakeSlack` only.
- No path creates `tasks` rows yet, so the tests insert rows directly; the scheduler that fires due tasks is a later child.

Closes #54
