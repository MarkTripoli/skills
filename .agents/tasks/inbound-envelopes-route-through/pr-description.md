Ticket: [#44](https://github.com/MarkTripoli/skills/issues/44) | Task: `inbound-envelopes-route-through`

## Purpose

The coordinator owned the Socket Mode envelope loop but only knows run threads, so the new `internal/assistant` package takes over envelope consumption and routes by channel, leaving `coordinator.RecordOwnerInput` as the coordinator's only inbound entry point while owner thread replies behave as before.

## Acceptance criteria

- The nine-envelope fixture acks every envelope and stores exactly the owner thread replies in `owner_inputs`: `TestConsumeInboundKeepsOnlyOwnerThreadReplies` in `internal/assistant/router_test.go` (moved from `coordinator/inbound_test.go`, same envelopes and assertions) passes under `go test -race ./internal/assistant`.
- `run start`, an owner thread reply, `run check` (exit 10), `run resolve`, and `run finish` behave as before: `internal/cli/run_resolve_test.go` is untouched by this diff and passes under `go test -race ./internal/cli`.
- `coordinator` exports `RecordOwnerInput(ctx, *slackevents.MessageEvent) error` and no longer owns `ConsumeInbound`: `internal/coordinator/inbound.go:20`; `ConsumeInbound` appears only in `internal/assistant/` and `internal/daemon/daemon.go:171`.

## Special things to note

- One narrowing that is unreachable in practice: the old `ownerReply` accepted a thread reply in any channel, `route` records only `C`/`G` thread replies. `run start` parses channels with `^[CG][A-Z0-9]{8,}$` (`internal/channel/reference.go:26`), so no `runs` row can hold a `D` channel and `ActiveRunByThread` never matched one.
- `routeDM` and `collect` are stubs that return nil, and `Service.DB`, `Slack`, `Owner`, `Now`, and `Wake()` have no reader yet. They are the contract the sibling epic children (owner DMs, DM answers, channel collection, purge) fill; no test distinguishes the stubs from a drop in this pull request.
- `coordinator.Acker` stays in `coordinator` although nothing there acks any more; `task.md` pins the `ConsumeInbound` signature to it. Moving it is a later cleanup.

## Change outline

Ownership after the move: `daemon -> assistant -> coordinator -> db`.

```text
internal/assistant/
  service.go     Service{DB, Slack SlackSurface, Coord, Owner, Now, wake}; New; Wake()
  router.go      ConsumeInbound (ack-first loop), route, userMessage, routeDM/collect stubs
  router_test.go moved from coordinator/inbound_test.go; drives Service.ConsumeInbound
internal/coordinator/
  inbound.go     Acker; RecordOwnerInput (was recordInbound); ConsumeInbound/ownerReply deleted
internal/daemon/
  daemon.go      svc := assistant.New(rt.DB, rt.Slack, coord, cfg.Slack.OwnerUserID, time.Now)
```

Per envelope, the loop is unchanged; the dispatch replaces the single owner-reply predicate.

```diff
 ConsumeInbound(ctx, events, ack)
   ack.Ack(*evt.Request) when both non-nil
-  ownerReply: thread reply, no subtype, no bot -> recordInbound
+  userMessage: Events API message, no SubType, no BotID, else drop
+  route by msg.Channel[0]
+    'D'      -> routeDM (nil)
+    'C','G'  -> ThreadTimeStamp != "" ? Coord.RecordOwnerInput : nil
+                errors.Join(that, collect(msg))
+    other    -> drop
   slog.Error("inbound not recorded", "error", err) on error
```

`errors.Join` runs `collect` even when `RecordOwnerInput` fails, so a channel that is both a run thread and a watched channel writes both rows once `collect` is filled.

## Human Review

### Review targets

- `internal/assistant/router.go:41-60`: the `C`/`G` branch calls `RecordOwnerInput` only for thread replies and always calls `collect`; confirm this matches the epic TDD's "both rows are written" reading.
- `internal/assistant/router.go:65-81`: `userMessage` type-asserts `evt.Data` and `InnerEvent.Data`; the malformed-`Data` envelope in the fixture is the negative case.
- `internal/coordinator/inbound.go:20-35`: the owner predicate (`ActiveRunByThread`, `msg.User == run.OwnerUserID`, `InsertOwnerInput`) is byte-for-byte the old `recordInbound`.

### Verify

- [ ] `cd tools/slack-coordinator && go test -race -count=1 ./internal/assistant ./internal/coordinator ./internal/daemon ./internal/cli` exits 0 with `ok` for all four packages.
- [ ] `git diff epic-slack-assistant-bot-dms...HEAD --stat -- tools/slack-coordinator/internal/cli` prints nothing.
- [ ] This pull request's title passes the `Commits` check.

### Known limits

- No live Slack workspace was used; `run_resolve_test.go` covers the daemon path with a fake Slack API.
- The `D` branch and the non-thread `C`/`G` branch are observable only once sibling children fill `routeDM` and `collect`.

Closes #44
