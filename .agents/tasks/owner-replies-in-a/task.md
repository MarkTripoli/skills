---
slug: owner-replies-in-a
title: "owner replies in a request thread run a follow-up with the thread history"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - a-dm-request-runs
issue: 60
---
In `tools/slack-coordinator/internal/assistant/`, implement follow-ups. `routeDM`: an owner reply under a `dm_requests` root (already inserting `dm_messages`) now also: if no `assistant_runs` row for `root_ts` is `queued` or `running`, insert a `queued` row, post `Working on it` in the thread, store its ts as the new `dm_requests.ack_ts`, update `last_message_at`, wake the dispatcher; otherwise only store the message (coalescing). `dispatcher.go`: `spawnQueued` selects the oldest `queued` row whose `root_ts` has no `running` row (`OldestQueuedSpawnable` in `internal/db/assistant_runs.go`); at spawn, `UPDATE dm_messages SET run_id = ? WHERE root_ts = ? AND author = 'owner' AND run_id IS NULL`. `prompt.go`: `## Thread so far` renders every `dm_messages` row for the root in ts order as `owner: …` / `bot: …`; `## Request` carries the newest pending owner message.

Tests in `requests_test.go` / `dispatcher_test.go`: reply after a done run → new queued row, new ack, prompt contains all prior lines in order; two replies during a running run → one pending row each, no new run, both claimed (`run_id` set) when the next run spawns; two threads each with a queued row and one running → the running thread's queued row is skipped and the other spawns.

Proof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN the owner replies under a `dm_requests` root with no `running` or `queued` run for that thread, the daemon shall insert `dm_messages{author owner, run_id NULL}` and one `queued` `assistant_runs` row for the thread, post `Working on it` as the new ack, and the run's `prompt.md` shall list every `dm_messages` row in order under `## Thread so far`.
- WHILE a run for that thread is `running` or `queued`, further owner replies shall be stored with `run_id NULL` and no second `assistant_runs` row shall be inserted.
- WHEN the next run of the thread starts, it shall set `run_id` on every pending owner row of that thread.
- WHEN the dispatcher picks a `queued` row, it shall skip any DM row whose thread has a `running` row and take the next oldest.
