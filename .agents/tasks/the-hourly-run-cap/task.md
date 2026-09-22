---
slug: the-hourly-run-cap
title: "the hourly run cap holds queued runs and logs the held batch"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - a-dm-request-runs
issue: 59
---
In `tools/slack-coordinator/internal/assistant/dispatcher.go`, before each spawn in `spawnQueued`, count `assistant_runs WHERE started_at >= now - 1h` (RFC 3339 string comparison, `internal/db/assistant_runs.go` `CountStartedSince(ts)`); when the count is `>= s.Agent.MaxRunsPerHour`, log `slog.Info("cap reached", ...)` formatted as `cap reached: run <id> held (task <tid>, <n> messages)` for task runs (message count = `task_messages WHERE run_id = ?`) or `cap reached: run <id> held (dm)`, and stop the spawn loop for this tick. The row stays `queued` and its ack untouched.

Tests: `MaxRunsPerHour: 2` with a fixed clock; three queued rows → two spawn, third held with the log line captured through a `slog.Handler` the test installs; advance the clock 61 minutes → third spawns.

Proof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- IF the count of `assistant_runs` with `started_at` within the last hour equals `agent.max_runs_per_hour`, THEN the dispatcher shall spawn no run in that tick and log `cap reached: run <id> held (task <tid>, <n> messages)` (or `(dm)` for a DM run) once per held row per tick.
- WHEN the oldest such `started_at` falls out of the rolling hour, the next tick shall spawn the held row.
- WHILE the cap holds a row, its `queued` state and ack text shall be unchanged.
