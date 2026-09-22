---
slug: tasks-show-pause-resume
title: "!tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - help-status-and-runs
issue: 54
---
In `tools/slack-coordinator/internal/assistant/verbs.go`, replace the `not available yet` answers for the five task verbs. Ids are `t<n>` or bare `<n>`.

- `!tasks`: per `active`/`paused` task: `t<id> · <state> · watches <#name[, #name]> · <schedule text> · next <due_at in trigger tz | waiting for messages> · last result <last_result_at | none>`; channel names via `ConversationInfo` (add to `SlackSurface`; cache in the `Service`; fall back to the id). Schedule text: `daily HH:MM TZ`, `every N hours`, `once at <at>`, `each message (debounce <n>s)`.
- `!show <id>`: `t<id> · <state>` line, `instruction` verbatim, then the newest 5 `assistant_runs` for the task (`<finished_at | started_at> · <state> · <exit <code> | failure>`), each followed by up to 500 characters of `<paths.RunDir(run_id)>/result.md` when present. Works for `completed`/`cancelled` rows while they exist.
- `!pause <id>` (active → paused, `due_at NULL`), reply `t<id> paused`; `!resume <id>` (paused → active, `due_at = NextDue` for `schedule`, `NextDue` for `window_end` (past `at` → NULL and reply `window already passed`), NULL for `each_message`, `consecutive_failures = 0`), reply `t<id> resumed · next due <time>` or `t<id> resumed · waiting for messages`; `!cancel <id>` (active or paused → cancelled, `ended_at = now`, `due_at NULL`), reply `t<id> cancelled`. Other states reply `t<id> is <state>`.
- Unknown or malformed id → `unknown id, known: t3 t4`.

Create `tasks.go` with `NextDue(scheduleJSON string, now time.Time) (time.Time, error)`: `{"daily":"HH:MM","tz":"<IANA>"}` → the next instant with that wall time in the zone strictly after `now`, returned in UTC (missing `tz` → UTC); `{"every_hours":n}` → `now + n h`; `{"at":"<RFC3339>"}` → that instant, or the zero time when it is not after `now`. Db functions in `internal/db/tasks.go`: `ListTasks(states ...string)`, `GetTask(id)`, `TaskChannels(id)`, `SetTaskState(id, state string, dueAt, endedAt *string)`, `ResetTaskFailures(id)`; in `internal/db/assistant_runs.go`: `RecentRunsForTask(id, limit)`. Tests insert task rows directly since no path creates them yet.

Tests in `verbs_test.go` and `tasks_test.go`: every verb's reply with fixed rows; `!pause`/`!resume`/`!cancel` transitions and `due_at`; unknown id list; `!show` on a cancelled task and with a `result.md` in a temp run dir; `NextDue` table including the DST-safe daily case in the acceptance, `every_hours`, and a past `at`.

Proof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `!tasks` runs, the reply shall list one line per `active` or `paused` task with id, state, watched channels, schedule text, next due (or `waiting for messages`), and last result time, or `No standing tasks.`
- WHEN `!show <id>` runs on any task row, the reply shall carry the instruction verbatim, the state, and the newest five `assistant_runs` for it with the first 500 characters of each run's `result.md` when the file exists.
- WHEN `!pause`, `!resume`, or `!cancel` names an `active` or `paused` task, the daemon shall apply that verb's transition (`paused` with `due_at = NULL`; `active` with `due_at = NextDue(schedule, now)` or NULL for `each_message`; `cancelled` with `ended_at`) and reply with the new state and, for `!resume`, the next due time.
- IF a task verb names an id with no `tasks` row or a malformed id, THEN the reply shall be `unknown id, known: t<id> t<id>…` listing active and paused ids ascending.
- WHEN `NextDue` is called with `{"daily":"09:00","tz":"Europe/Berlin"}` at 2026-09-22T08:00:00Z, it shall return 2026-09-23T07:00:00Z, and with `{"every_hours":6}` it shall return now plus six hours.
