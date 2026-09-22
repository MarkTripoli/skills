Ticket: [#49](https://github.com/MarkTripoli/skills/issues/49) | Task: `non-owner-dms-get` | Walkthrough: none

## Purpose

A DM from anyone but the owner was dropped without a word; the daemon now tells that sender once who it listens to, records them in `refused_users`, and stays silent on every later DM from them, so a stranger can never make the bot post on demand.

## Acceptance criteria

- First DM from a non-owner inserts `refused_users(user_id, refused_at)` and posts `This assistant only takes instructions from its owner, <@owner>.` in that DM: `TestNonOwnerDMIsRefusedOnceThenDropped` asserts exactly one post equal to `slackPost{"D1", "", "...<@U1>."}` and a row for `U2` (`tools/slack-coordinator/internal/assistant/requests_test.go:222-243`).
- While a `refused_users` row exists, further DMs from that sender are acked and dropped with no post and no row: the same test routes a second `U2` message one minute later and still sees one post; `TestInsertRefusedUserKeepsTheFirstRow` proves the second insert changes nothing and keeps the first `refused_at` (`tools/slack-coordinator/internal/db/db_test.go:423-443`). The ack happens in `ConsumeInbound` before routing, unchanged by this diff.
- If the refusal post fails, the row still exists and the error is logged: `TestFailedRefusalPostKeepsTheRowAndLogs` sets `fakeSlack.postErr`, asserts the row, one attempted post, and a `level=ERROR` line carrying `slack is down`, then clears the error and shows no second post (`requests_test.go:245-267`).

## Special things to note

- The row is written before the Slack call and a failed post returns nil without rolling it back (`router.go:110-119`). A Slack outage during the first DM means that sender is never told; the alternative, retrying on the next DM, would let anyone trigger posts by DMing repeatedly.
- Threaded replies from a non-owner are refused the same way as top-level DMs, and the refusal is posted at the top level of the DM (`threadTS == ""`), not inside the sender's thread. `task.md` says "top level or thread" for the trigger and fixes the post call with an empty thread argument; this follows that.
- The post error is logged through the package-level `slog` default; the test captures it by swapping `slog.SetDefault` for the test's duration (`requests_test.go:83-90`). No test in `internal/assistant` uses `t.Parallel`, so the swap is safe today.

## Change outline

`refused_users` already existed in the schema; this adds its only writer and the router branch that calls it.

```text
tools/slack-coordinator/internal/
  db/refused_users.go        InsertRefusedUser(ctx, userID, at) (inserted bool, err error)
  assistant/router.go        refusalText const; routeDM sender check; refuse method
docs/slack-coordinator.md    one sentence on the refusal under "Steering is owner-only"
.changeset/non-owner-dm-refusal.md   minor
```

`routeDM` gains one branch ahead of every owner path:

```diff
 routeDM(msg)
+  if msg.User != s.Owner      -> refuse(msg)
   if text starts with "!"     -> nil (verb handlers)
   if no thread ts             -> newRequest
   else                        -> followUp

+refuse(msg)
+  inserted, err = DB.InsertRefusedUser(msg.User, stamp(Now()))
+  if err != nil || !inserted  -> return err        (nil when the row already existed)
+  PostMessage(msg.Channel, "", fmt.Sprintf(refusalText, s.Owner))
+  on post error: slog.Error("refusal not posted", ...); return nil
```

The `INSERT OR IGNORE` result's `RowsAffected()` is the sole signal that decides whether to post; there is no read-before-write.

## Human Review

### Review targets

- `router.go:94-96` sits before the `!` check, so a non-owner `!status` is refused rather than left to verb handlers; confirm that ordering is the intended behavior.
- `router.go:112-114` collapses "insert failed" and "already refused" into one `return err`; the second case relies on `err` being nil.
- `refused_users.go:12-13` is the only writer of `refused_users`; no reader exists yet, so the test probe `isRefused` (`requests_test.go:95-102`) proves presence by attempting an insert.

### Verify

- [ ] `cd tools/slack-coordinator && go test -count=1 ./internal/assistant ./internal/db` passes on the head commit (observed: `ok internal/assistant 0.273s`, `ok internal/db 0.437s`).
- [ ] The `Commits` hosted check accepts the one code commit and the two `docs(task)` commits.

### Known limits

- No live Slack workspace was used; `slackapi.Client.PostMessage` is exercised only through the fake in `requests_test.go`.
- `refused_users` has no read helper or expiry; a sender stays refused for the life of `state.sqlite`.

Closes #49
