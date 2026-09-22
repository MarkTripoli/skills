---
slug: answers-over-4000-characters
title: "answers over 4,000 characters post as Done plus chunked thread replies"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - a-dm-request-runs
issue: 58
---
In `tools/slack-coordinator/internal/assistant/deliver.go`, add `chunk(text string, limit int) []string` that splits at `\n` boundaries into pieces of at most `limit` characters (rune count), hard-splitting any single line longer than `limit`, never emitting an empty piece. Replace the placeholder long-answer path: when `utf8.RuneCountInString(Result) > 4000`, `UpdateMessage(ack, "Done")` then `PostMessage` each chunk in the thread in order; insert one `dm_messages{author bot}` row with the full text. Constant `answerEditLimit = 4000`.

Tests in `deliver_test.go`: 4,000 characters → single edit, no reply; 4,001 characters over two lines → `Done` plus two replies in order; a 9,000-character single line → `Done` plus three replies each ≤ 4,000; chunk table test for boundary handling.

Proof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN a DM run's result exceeds 4,000 characters, the daemon shall edit the ack to `Done` and post the result as thread replies split at line boundaries, each at most 4,000 characters, in order.
- IF a single line exceeds 4,000 characters, THEN the splitter shall break it at 4,000 characters rather than post an oversized message.
- WHEN the result is exactly 4,000 characters, the daemon shall edit the ack with the full text and post no extra reply.
