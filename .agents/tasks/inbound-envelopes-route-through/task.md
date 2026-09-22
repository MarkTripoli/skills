---
slug: inbound-envelopes-route-through
title: "inbound envelopes route through the assistant package while run-thread replies keep working"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on: []
issue: 44
---
Create package `tools/slack-coordinator/internal/assistant` and move envelope consumption into it without changing behavior.

`service.go`: `type Service struct { DB *db.DB; Slack SlackSurface; Coord *coordinator.Coordinator; Owner string; Now func() time.Time; wake chan struct{} }`, `New(db, slack, coord, owner string, now func() time.Time) *Service`, `Wake() <-chan struct{}` (capacity-1 channel; sibling children send on it). `SlackSurface` is an interface with `PostMessage(ctx, channel, threadTS, text string) (string, error)` and `Permalink(ctx, channel, ts string) (string, error)` satisfied by `*slackapi.Client`; sibling children extend it.

`router.go`: `ConsumeInbound(ctx, events <-chan socketmode.Event, ack coordinator.Acker)` with the ack-first loop from `internal/coordinator/inbound.go`; `route(ctx, evt)` extracts the Events API `*slackevents.MessageEvent`, drops `SubType != ""` or `BotID != ""`, then: channel id starting with `D` → `s.routeDM(ctx, msg)` (returns nil in this child); `C…`/`G…` with `ThreadTimeStamp != ""` → `s.Coord.RecordOwnerInput(ctx, msg)`; `C…`/`G…` any → `s.collect(ctx, msg)` (returns nil in this child); else drop. Errors are logged with `slog.Error("inbound not recorded", ...)`.

In `internal/coordinator/inbound.go`, delete `ConsumeInbound` and `ownerReply`; rename `recordInbound` to exported `RecordOwnerInput(ctx, msg *slackevents.MessageEvent) error` keeping the predicate (`ActiveRunByThread`, `msg.User == run.OwnerUserID`, `InsertOwnerInput`). Move `internal/coordinator/inbound_test.go` to `internal/assistant/router_test.go`, driving the same nine envelopes through `Service.ConsumeInbound` with the same assertions; keep the context-cancellation test. In `internal/daemon/daemon.go`, after `coord` is built, `svc := assistant.New(rt.DB, rt.Slack, coord, cfg.Slack.OwnerUserID, time.Now)` and replace `coord.ConsumeInbound(ctx, inbound, acker)` with `svc.ConsumeInbound(ctx, inbound, acker)`.

Proof: `go test -race ./internal/assistant ./internal/coordinator ./internal/daemon ./internal/cli` passes, including `internal/cli/run_resolve_test.go` unchanged. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN the daemon receives the nine envelopes of the existing inbound fixture (owner reply, redelivery, non-owner reply, owner top-level message, bot message, unknown thread, interactive envelope, malformed data), it shall ack each one and store exactly the owner thread replies in `owner_inputs`, as before.
- WHEN `run start`, an owner thread reply, `run check` (exit 10), `run resolve`, and `run finish` run against the daemon, they shall behave as before the change.
- The `coordinator` package shall export `RecordOwnerInput(ctx, *slackevents.MessageEvent) error` and shall no longer own `ConsumeInbound`.
