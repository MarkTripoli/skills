---
slug: a-failed-task-run
title: "a failed task run reports Failed to its target and keeps the batch"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - schedule-and-window-end
issue: 65
---
In `tools/slack-coordinator/internal/assistant/deliver.go`, on a task run failure (after the existing row and batch updates), post to the task's target (same `deliver_to` resolution as success): first line `Failed: t<id> · <#name[, #name]>`, second line the cause (`exit <code>` | `timed out after <s.Agent.Timeout>` | `agent wrote no result`), then the stderr tail in a triple-backtick fence when non-empty. Slack errors are logged and do not change the row. Confirm `!show` renders the run's `failure` column (already stored) as its cause.

Tests in `deliver_test.go`: exit 2 with stderr → DM text lines and fence; timeout → `timed out after 10m0s`; empty result → `agent wrote no result`; channel-thread target receives the post with `thread_ts`; `task_messages.run_id` NULL afterwards; `!show` output includes `exit 2`.

Proof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN a task run exits non-zero or times out, the daemon shall post to the task's delivery target `Failed: t<id> · <#channels>` followed by `exit <code>` or `timed out after <limit>` and the last 20 stderr lines in a code fence.
- IF the run exits 0 with an empty result, THEN the posted cause shall be `agent wrote no result`.
- WHEN the failure is posted, the batch shall remain bound to no run (`task_messages.run_id IS NULL`) and `!show t<id>` shall list the failed run with its cause.
