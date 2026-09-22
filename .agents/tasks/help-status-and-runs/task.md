---
slug: help-status-and-runs
title: "!help, !status, and !runs answer questions about the daemon from the DM"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - owner-dms-are-recorded
issue: 50
---
In `tools/slack-coordinator/internal/assistant/`, add `verbs.go` and dispatch `!`-prefixed owner top-level DMs from `routeDM`: split on whitespace, lowercase the first token, look it up in a `verbs` map of `func(ctx, args []string) (string, error)`, and `PostMessage(channel, "", reply)` at the DM's top level; no row is inserted. Verbs in this child:

- `!help`: a fixed table listing all eight verbs (`!help`, `!status`, `!tasks`, `!show <id>`, `!runs`, `!pause <id>`, `!resume <id>`, `!cancel <id>`) with one-line descriptions, then `Anything else sent here goes to the assistant.` The five task verbs are listed here even though a sibling child implements them; until then they answer `not available yet`.
- `!status`: `up <duration>` since `Service` construction (`started time.Time` field), `socket mode: <s.Coord.Health()>`, `active runs: <COUNT runs WHERE lifecycle='active'>`, `tasks: active n · paused n · completed n · cancelled n`, `agent: <command> (approval: <level>)` or `agent: none`, `messages: <COUNT collected_messages> · runs: <COUNT assistant_runs>`, `disk: <db bytes> db · <runs bytes> runs` where db bytes sum `state.sqlite`, `-wal`, `-shm` sizes and runs bytes walk `paths.Workspace()/runs` (0 when absent); humanize as `12.3 MB`. `Service` gains `Paths *paths.Paths`.
- `!runs`: `<run_id> · <channel_id> · started <started_at> · <permalink>` per active run from `runs`, or `No active runs.`
- Unknown verb or bare `!` → the `!help` text.

Db functions: `CountTasksByState` in new `internal/db/tasks.go`, `CountCollectedMessages` in new `internal/db/collected_messages.go`, `CountAssistantRuns` in `internal/db/assistant_runs.go`, `ActiveRuns` in `internal/db/runs.go` (reuse an existing query if one lists active runs).

Tests in `internal/assistant/verbs_test.go` with a fixed clock, temp db, and a temp workspace holding one file: `!help` text lists eight verbs; `!status` reply contains each line with the expected counts and non-zero disk bytes; `!runs` with one inserted active run and with none; `!bogus` and `!` → help; no `dm_requests` row after any `!` message; `!Help` (case) dispatches.

Proof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN the owner sends a top-level DM whose first token starts with `!`, the daemon shall reply at the DM's top level and shall insert no `dm_requests` or `assistant_runs` row.
- IF the verb is unknown or the text is `!` alone, THEN the reply shall be the `!help` table.
- WHEN `!status` runs, the reply shall include daemon uptime, Socket Mode state, the count of active coding-agent runs, task counts by state, `agent: <command> (approval: <level>)` or `agent: none`, `COUNT(*)` of `collected_messages` and `assistant_runs`, and the byte sizes of `state.sqlite*` and `workspace/runs`.
- WHEN `!runs` runs, the reply shall list one line per `runs` row with `lifecycle = active`: run id, channel id, started at, permalink, or `No active runs.`
