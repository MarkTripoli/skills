---
slug: a-daily-purge-deletes
title: "a daily purge deletes consumed messages and stale runs, tasks, and DM threads"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - schedule-and-window-end
issue: 67
---
In `tools/slack-coordinator/internal/assistant/purge.go`, add `RunPurge(ctx)` (first tick at start + 1 min, then every 24 h) calling `Purge(ctx, now) ([]string, error)`, which runs `PurgeRetention(ctx, now, days, consumedDays) (deletedRunIDs []string, err error)` in new `internal/db/purge.go` as one transaction: (1) delete `task_messages` whose `run_id` is a run with `finished_at < now - consumedDays`; then delete `collected_messages` with no remaining `task_messages` row; (2) delete `assistant_runs` with `finished_at < now - days` that are not among the newest 20 by `finished_at` for their `task_id` (DM runs: for their `root_ts`), first deleting `task_messages` rows referencing them; (3) delete `tasks` in `cancelled`/`completed` with `ended_at < now - days` plus their `task_channels`, `task_messages`, and `assistant_runs`; (4) delete `dm_messages` and `dm_requests` with `last_message_at < now - days` and the DM runs for those roots. Collect every deleted run id. Never touch `refused_users`. A `collected_messages` row with any `task_messages.run_id IS NULL` survives every branch (step 1 only removes junction rows that point at old runs, so the unconsumed row keeps the message alive). Wire `background.Go(func() { svc.RunPurge(ctx) })` in `daemon.Serve`; `Service` already has `Retention`. Run-directory removal is a sibling child; this child logs the deleted ids.

Tests in `purge_test.go` and `internal/db/purge_test.go` with a fixed clock: consumed message finished 8 days ago deleted, 6 days ago kept; message consumed by one task and unconsumed by another, 100 days old, kept; 25 runs for one task all 40 days old → 5 deleted, 20 kept, ids returned; cancelled task ended 31 days ago removed with its rows, ended 29 days ago kept; DM thread quiet 31 days removed with its runs; `refused_users` row kept; `RunPurge` ticks once at +1 min with an injected clock.

Proof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN the purge runs, it shall delete `collected_messages` rows whose every `task_messages` row has `run_id` set to a run with `finished_at < now - retention.consumed_days`, together with those `task_messages` rows.
- WHILE a `collected_messages` row has any `task_messages` row with `run_id IS NULL`, the purge shall not delete it at any age.
- WHEN the purge runs, it shall delete `assistant_runs` with `finished_at < now - retention.days` except the newest 20 per `task_id` (and per `root_ts` for DM runs), `tasks` in `cancelled`/`completed` with `ended_at < now - retention.days` with their `task_channels`, `task_messages`, and runs, and `dm_requests`/`dm_messages` with `last_message_at < now - retention.days` with their runs, and shall leave `refused_users` untouched.
- WHEN `Purge` returns, it shall return the ids of every deleted `assistant_runs` row, and the daemon shall run it at startup plus one minute and then every 24 hours.
