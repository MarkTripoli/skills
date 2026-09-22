---
slug: no-drops-a-pending
title: "no drops a pending proposal and any other reply re-runs the agent with it"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - yes-records-the-pending
  - owner-replies-in-a
issue: 71
---
In `tools/slack-coordinator/internal/assistant/requests.go`, complete the pending-proposal routing: after the confirm check, if the normalized reply is in `cancelWords` (`no n cancel never mind nevermind forget it drop it`), clear `pending_proposal`, post `Dropped the proposal.` in the thread, insert both `dm_messages` rows with `run_id` set to the proposing run, and return. Otherwise fall into the follow-up path (existing) so a run is queued. In `prompt.go`, when the request's `pending_proposal` is non-NULL, render `## Pending proposal` with the stored JSON in a code fence between `## Thread so far` and `## Collected messages`. In `deliver.go`, on a DM run's completion: a valid `Proposal` overwrites `pending_proposal` through the existing render path; a result with no proposal clears `pending_proposal`.

Tests in `requests_test.go`: `no` and `Never mind!` → cleared, reply text, no run; `every 2 hours instead` → queued run whose `prompt.md` contains the pending JSON and the reply; scripted outcome with a new proposal replaces the stored one; scripted plain result clears it.

Proof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN the owner's reply under a thread with a pending proposal normalizes to one of `no n cancel "never mind" nevermind "forget it" "drop it"`, the daemon shall clear `pending_proposal`, reply `Dropped the proposal.`, and spawn no run.
- WHEN the reply is neither a confirm nor a cancel word, the daemon shall queue a follow-up run whose `prompt.md` carries `## Pending proposal` with the stored JSON and the reply as the request.
- WHEN that run ends with a new valid `Proposal`, it shall replace `pending_proposal`.
- WHEN that run ends with only `result.md`, `pending_proposal` shall be cleared.
