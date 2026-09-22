---
slug: a-failed-dm-run
title: "a failed DM run edits the ack to Failed with the cause and stderr tail"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - a-dm-request-runs
issue: 57
---
In `tools/slack-coordinator/internal/assistant/deliver.go`, add `deliverFailure(ctx, run, cause, stderrTail string)` for `kind = dm`: `UpdateMessage(channel, ack_ts, "Failed")`, then `PostMessage(channel, root_ts, text)` where `text` is the cause line followed, when `stderrTail != ""`, by a blank line and the tail in a triple-backtick fence; insert `dm_messages{author bot, text, run_id}`. Call it from `deliver` for every non-success outcome with causes `exit <code>`, `timed out after <s.Agent.Timeout>`, `agent wrote no result`; and from `spawnQueued` when `Runner.Start` fails, with the error text (`agent binary "codex" not found on PATH` for `ErrBinaryMissing`) and no tail. The row's `failure` column keeps the cause line. Slack errors are logged and do not change the row.

Tests in `deliver_test.go`: exit 3 with a 25-line stderr → `Failed` edit, reply starts with `exit 3`, fence holds 20 lines; timeout → `timed out after 10m0s`; empty result → `agent wrote no result`; `ErrBinaryMissing` from the fake runner → reply text and no fence; `dm_messages` bot row present in each case.

Proof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN a DM run exits non-zero, the daemon shall edit the ack to `Failed` and post one thread reply whose first line is `exit <code>` followed by the last 20 stderr lines in a code fence.
- WHEN a DM run is killed at `agent.timeout`, the reply's first line shall be `timed out after <limit>`.
- IF the run exits 0 with an empty result, THEN the reply's first line shall be `agent wrote no result`.
- IF the agent binary is not on `PATH`, THEN the ack shall become `Failed` and the reply shall be `agent binary "<name>" not found on PATH` with no stderr fence.
- WHEN a failure is delivered, the bot's reply shall be inserted into `dm_messages{author bot, run_id}` so follow-up prompts carry it.
