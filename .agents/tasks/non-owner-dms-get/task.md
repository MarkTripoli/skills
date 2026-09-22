---
slug: non-owner-dms-get
title: "non-owner DMs get one refusal, then silence"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - owner-dms-are-recorded
issue: 49
---
In `tools/slack-coordinator/internal/assistant/router.go` `routeDM`, handle a `D…` message whose `User != s.Owner` (top level or thread), run `INSERT OR IGNORE INTO refused_users(user_id, refused_at) VALUES (?, ?)`; when the insert changed a row, `PostMessage(channel, "", fmt.Sprintf("This assistant only takes instructions from its owner, <@%s>.", s.Owner))`; when it changed nothing, return. A failed post is logged with `slog.Error` and does not roll back the row. Add `InsertRefusedUser(ctx, userID, at string) (inserted bool, err error)` to a new `internal/db/refused_users.go`.

Tests in `internal/assistant/requests_test.go`: two DMs from `U2` → exactly one post with the fixed text and one row; a DM from `U2` after the fake Slack is set to fail → row present, no panic, error logged.

Proof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN a user other than the owner sends their first DM, the daemon shall insert `refused_users(user_id, refused_at)` and post `This assistant only takes instructions from its owner, <@owner>.` in that DM.
- WHILE a `refused_users` row exists for the sender, the daemon shall ack and drop further DMs from them with no post and no row.
- IF the refusal post fails, THEN the `refused_users` row shall still exist and the error shall be logged.
