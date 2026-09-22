---
slug: yes-records-the-pending
title: "yes records the pending proposal as a standing task"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - a-task-proposal-is
  - tasks-show-pause-resume
issue: 68
---
In `tools/slack-coordinator/internal/assistant/requests.go`, in `routeDM`'s request-thread branch, before storing the reply as a plain follow-up: load `GetDMRequest(root_ts).PendingProposal`; when non-NULL, normalize the text (`strings.ToLower(strings.TrimSpace(text))`, `strings.TrimRight(..., ".!,")`) and check membership in `var confirmWords = map[string]bool{"yes", "y", "confirm", "confirmed", "ok", "okay", "go", "do it", "👍", ":+1:"}`. On a confirm word with `Confirmable`: in one transaction `InsertTask` (new in `internal/db/tasks.go`: `state active`, `instruction`, `trigger` = `Trigger.Kind`, `schedule` JSON built from the trigger (`{"daily","tz"}` | `{"every_hours"}` | `{"at"}`, NULL for each_message), `debounce_seconds` (`DebounceSeconds` or 300 for each_message, NULL otherwise), `deliver_to` JSON, `request_root_ts`, `created_at`, `due_at` = `NextDue(schedule, now)` for schedule/window_end else NULL) returning the id, `InsertTaskChannel` per channel id, `SetPendingProposal(root_ts, NULL)`; then `PostMessage(channel, root_ts, "Recorded as t<id> · next due <due formatted 2006-01-02 15:04 MST in trigger.tz>")` or `… · waiting for messages`; insert the owner reply and the bot reply into `dm_messages` with `run_id = pending.RunID`. On a confirm word without `Confirmable`: `PostMessage(..., "Invite the bot to #<first unresolved>, then ask again.")`, insert both messages the same way, keep the pending proposal. Any other reply falls through to the existing follow-up handling unchanged (a sibling child adds cancel words and correction prompts).

Tests in `requests_test.go`: `yes` → `tasks` row with the expected columns and `due_at == NextDue`, `task_channels` rows, reply text, no new `assistant_runs` row, no `dm_messages` row with `run_id NULL`; `Ok.`, `👍`, `Do it!` also confirm; `yes` on `confirmable:false` → invite reply, nothing recorded; `each_message` proposal → `waiting for messages` and `debounce_seconds 300`.

Proof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN the owner's reply under a thread with a confirmable pending proposal, lowercased, trimmed, and stripped of trailing `.!,`, is one of `yes`, `y`, `confirm`, `confirmed`, `ok`, `okay`, `go`, `do it`, `👍`, `:+1:`, the daemon shall insert `tasks` (state `active`, `due_at = NextDue` for `schedule`/`window_end`, NULL for `each_message`, `debounce_seconds` default 300) and one `task_channels` row per watched channel, clear `pending_proposal`, and spawn no run.
- WHEN the task is recorded, the daemon shall reply in the thread `Recorded as t<id> · next due <time in trigger.tz>` or `Recorded as t<id> · waiting for messages`, and `!tasks` shall list `t<id>`.
- IF the reply is a confirm word but the pending proposal has `confirmable: false`, THEN the daemon shall reply `Invite the bot to #<name>, then ask again.` and record nothing.
- WHEN the confirm reply is handled, both the owner's reply and the bot's reply shall be inserted into `dm_messages` with `run_id` set to the proposing run, leaving no pending follow-up.
