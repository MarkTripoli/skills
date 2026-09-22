---
slug: a-task-proposal-is
title: "a task proposal is rendered into the request thread with the confirm sentence"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - proposal-json-is-validated
  - a-failed-dm-run
issue: 64
---
In `tools/slack-coordinator/internal/assistant/`, add the proposal render path. In `deliver.go`, when `outcome.ProposalErr != nil` → `deliverFailure(ctx, run, outcome.ProposalErr.Error(), "")`; when `outcome.Proposal != nil` → `s.renderProposal(ctx, run, req, outcome)` in new `proposals.go`: for each `Watch` entry resolve through `channel.Resolve` (`internal/channel/resolve.go`, which takes the `slackapi` lookups; explicit `C…`/`G…` ids are checked for membership through `ConversationInfo`); collect unresolved names; if `Trigger.Kind == "schedule"` with `Daily` and `TZ == ""`, fill `TZ` from `s.Slack.UserInfo(ctx, s.Owner).TZ`; build `pendingProposal{Proposal agent.Proposal (channel ids substituted); Confirmable bool; Unresolved []string; RunID string}` and store it as JSON via `SetPendingProposal` (`internal/db/dm_requests.go`). Render:

```
*Proposed task*
<Summary>
<result.md text when non-empty>
Watch: <#name[, #name]>
Trigger: daily HH:MM TZ | every N hours | once at <at> | each message (debounce <n>s)
Deliver to: this DM | #channel thread
[Not confirmable yet: invite the bot to #x first.]
Reply yes to record this task, no to drop it, or tell me what to change.
```

`UpdateMessage(channel, ack_ts, text)`, `InsertDMMessage{author bot, text, run_id}`, `FinishRun(id, done, ...)`. `SlackSurface` gains `UserInfo(ctx, id) (slackapi.User, error)`, `ConversationInfo`, and whatever `channel.Resolve` needs (`ListConversations`). A pending proposal in this child is stored only; sibling children act on the owner's reply.

Tests in `proposals_test.go` / `deliver_test.go` (fake Slack answering `conversations.info`/`conversations.list`, `users.info` with `tz: Europe/Berlin`): valid proposal for `#general` → ack edited with all lines and the confirm sentence, `pending_proposal` has the channel id, `tz` filled, `confirmable: true`; `#nowhere` → warning line, `confirmable: false`; `ProposalErr` → `Failed` with the error text; proposal plus `result.md` → prose included.

Proof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN a DM run ends with a valid `Proposal`, the daemon shall resolve each `watch` entry through `channel.Resolve`, fill `trigger.tz` from `users.info` when empty, store the resolved proposal JSON in `dm_requests.pending_proposal`, and edit the ack to the rendered proposal ending with `Reply yes to record this task, no to drop it, or tell me what to change.`
- IF `RunOutcome.ProposalErr` is set, THEN the daemon shall deliver `Failed` with the schema error as the cause line and store no pending proposal.
- IF a watch channel cannot be resolved or the bot is not a member, THEN the rendered proposal shall carry `Not confirmable yet: invite the bot to #name first.` and the stored JSON shall have `confirmable: false`.
- WHEN both `proposal.json` and `result.md` are present, the rendered proposal shall include the `result.md` text under the summary.
