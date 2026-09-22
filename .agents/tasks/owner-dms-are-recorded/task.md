---
slug: owner-dms-are-recorded
title: "owner DMs are recorded as requests and acked in a thread"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - inbound-envelopes-route-through
  - config-yaml-loads-agent
  - state-sqlite-carries-the
  - slackapi-client-gains-the
issue: 46
---
In `tools/slack-coordinator/internal/assistant/`, fill `routeDM` for the owner (`msg.User == s.Owner`; non-owner DMs stay dropped in this child): top level (`ThreadTimeStamp == ""`) with text whose first token does not start with `!` → `newRequest`; a reply whose `ThreadTimeStamp` matches a `dm_requests.root_ts` → `InsertDMMessage{root_ts, ts, author owner, text, run_id NULL}` and `UPDATE dm_requests SET last_message_at` (nothing else yet); `!`-prefixed text → return nil (a sibling adds verbs). `Service` gains `Agent *config.Agent`; `New` takes it; `daemon.Serve` passes `cfg.Agent`.

`requests.go` `newRequest`: if `s.Agent == nil`, `PostMessage(channel, msg.TimeStamp, "No agent is configured; set agent.command in config.yaml")` and return. Else in one transaction: `INSERT OR IGNORE dm_requests(root_ts, channel_id, received_at, last_message_at)`; when that inserted a row (`RowsAffected == 1`): `INSERT dm_messages(root_ts, ts=root_ts, author owner, text)` and `INSERT assistant_runs(run_id=<new ULID; reuse the generator `run start` uses>, kind dm, root_ts, state queued, queued_at)`; when it inserted nothing (redelivery) commit and return. Then, outside the transaction: `AddReaction(channel, msg.TimeStamp, "eyes")`; ack text = `Working on it` when `COUNT(assistant_runs WHERE state='running') < 3 AND COUNT(queued rows with queued_at earlier than this row) == 0`, else `Queued behind <n>` with `n` that earlier-queued count; `ts, _ := PostMessage(channel, root_ts, ack)`; `UPDATE dm_requests SET ack_ts = ts`; `INSERT dm_messages(root_ts, ts, author bot, text ack)`; non-blocking send on `s.wake`. `SlackSurface` gains `AddReaction(ctx, channel, ts, name string) error` and `UpdateMessage(ctx, channel, ts, text string) (string, error)`. Db functions in new `internal/db/dm_requests.go` (`InsertDMRequest` returning inserted bool, `GetDMRequest`, `SetAckTS`, `TouchDMRequest`, `InsertDMMessage`, `ListDMMessages(root_ts)`) and `internal/db/assistant_runs.go` (`InsertAssistantRun`, `CountRunsByState`, `CountQueuedBefore(queuedAt)`).

Manifest: in `tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml`, add bot scopes `im:history`, `im:read`, `im:write`, `reactions:write`, `users:read.email` and bot event `message.im`. Add one sentence to `docs/slack-coordinator.md` Setup step 1: existing apps must apply the updated manifest and reinstall to receive DMs.

Tests in `internal/assistant/requests_test.go` (temp `state.sqlite`, fixed clock, fake `SlackSurface` recording calls): owner top-level DM → three rows, `eyes`, `Working on it`, `ack_ts`; redelivered envelope → no second row or post; with three rows forced to `running`, a new DM → `Queued behind 0`, a second → `Queued behind 1`; `Agent == nil` → fixed reply, no rows; owner reply under the root → `dm_messages` row with `run_id NULL`; `wake` receives after a request.

Proof: `go test -race ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN the owner posts a top-level DM not starting with `!` and `agent.command` is configured, the daemon shall insert `dm_requests`, `dm_messages{author owner}`, and one `queued` `assistant_runs` row, call `reactions.add eyes` on the message, post `Working on it` (or `Queued behind <n>` when three runs are `running` or any row is `queued`) as a thread reply, and store that reply's ts in `dm_requests.ack_ts`.
- IF the same DM event is delivered twice, THEN the daemon shall keep one `dm_requests` row and one `assistant_runs` row and post one ack.
- IF `agent:` is absent from `config.yaml`, THEN the daemon shall reply `No agent is configured; set agent.command in config.yaml` in the DM and store no row.
- WHEN the owner replies under a `dm_requests` root, the daemon shall insert `dm_messages{author owner, run_id NULL}` for the reply.
- The app manifest shall list bot scopes `im:history`, `im:read`, `im:write`, `reactions:write`, `users:read.email` and bot event `message.im`.
