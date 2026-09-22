---
type: implementation
completed_phase: 4
summary: "Phase 4 proves `run check` answers `{\"kind\":\"ready\"}` exit `0` or `{\"kind\":\"unavailable\",\"reason\":…}` exit `11` when Socket Mode is not connected, when the run's last post failed, or when no daemon answers; the daemon opens the Socket Mode connection, reports its state through `daemon.health`, and retries failed posts every scheduler tick. Phase 5 consumes `slackapi.SocketMode.Inbound()` (currently drained and acked in `daemon.Serve`) and inserts the owner-input step into `coordinator.CheckBeforeWrite` after the delivery-error step."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/i-want-new-skill/task.md`
- plan artifact: [05-plan-slack-agent-communication.md](05-plan-slack-agent-communication.md)
- phase range: 4

## Child Workers
- implementer: `agent-implementer` (`ImplPhase4`), one worker for Phase 4
- reviewer: none; the parent re-ran both Phase 4 checks and the whole module suite

## Completed Work
- `internal/slackapi/socketmode.go`: `SocketMode` over `socketmode.New(api).RunContext` with `Run`, `Health`, `Inbound`, `Ack`; `client.go` gains `API()`.
- `internal/db`: migration `last_delivery_error`; `SetDeliveryError`, `RunsWithDeliveryError`.
- `internal/ipc`: `ErrUnavailable = -32000`; `dispatch` preserves handler `*RPCError` codes.
- `internal/coordinator`: `post` with delivery tracking, `WriteGate`, `CheckBeforeWrite`, `Coordinator.Health`; `run.check` handler; `run.start|event|finish` map `*DeliveryError` to `ErrUnavailable`; scheduler retries runs with delivery errors.
- `internal/daemon/daemon.go`: `Options.SocketModeHealth` (test hook) and `Options.SchedulerPeriod`; runs Socket Mode and drains `Inbound` with acks; waits for background loops before closing the database.
- `internal/cli`: `run check`, `daemonErr` mapping (`ErrUnavailable` to `11`, other RPC errors to `2`), `dialDaemon`.
- Commit `bb71765 feat(slack-coordinator): fail run check closed on delivery or socket`.

## Automated Verification
- command: `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/cli/...`
- result: pass
- evidence: worker run, parent re-run inside `go test -race -count=1 ./...`
- command: `cd tools/slack-coordinator && go build -o /tmp/slack-coordinator ./cmd/slack-coordinator && SLACK_COORDINATOR_HOME=$(mktemp -d) /tmp/slack-coordinator run check --run-id none; test $? -eq 11`
- result: stdout `{"kind":"unavailable","reason":"daemon unreachable: dial ipc: …"}`, exit `11`
- evidence: parent re-run
- command: `cd tools/slack-coordinator && go vet ./... && go test -race -count=1 ./...`
- result: nine packages `ok`
- evidence: parent run after the worker finished
- command: worker smoke run with a fake `apps.connections.open` answering `invalid_auth` (real Socket Mode path)
- result: `daemon status` `{"socket_mode":"disconnected"}`; `run check` `{"kind":"unavailable","reason":"socket_mode disconnected"}` exit `11`
- evidence: worker final message (`agent://ImplPhase4`); the driver was not kept

## Deferred Human Evidence

- Live `daemon status` shows `"socket_mode":"connected"`; disabling network yields `run check` exit `11` and re-enabling returns `0`; record in `.agents/tasks/i-want-new-skill/evidence/phase-4-fail-closed.md`. Recorded, not executed.

## Commit Handoff
Phase commit `bb71765` was created after green automated checks; this receipt and the ticked plan are committed separately as `docs(task): implementation artifact`.

## Human Review

### Review targets

- `SocketMode` maps `Connecting`, `ConnectionError`, `InvalidAuth`, and `Disconnect` to `disconnected`: the SDK emits no event on a dropped WebSocket, only `Connecting` before each reconnect. `Ack` returns `error` in v0.29.0; the wrapper logs it.
- Retry after a delivery error reposts `last_status` or an all-`None` status; root fields are not stored in `runs`, so the plan's "or the root when none" was not implemented.
- Post failures cross the wire as JSON-RPC code `-32000` (`ipc.ErrUnavailable`), which the CLI maps to exit `11`; every other RPC error stays exit `2`.
- `daemon.Options.SocketModeHealth` skips opening the WebSocket in tests; `Options.SchedulerPeriod` lets the CLI test observe the retry.

### Verify

- `cd tools/slack-coordinator && go test -race -run 'RunCheck|Delivery' ./internal/cli/... ./internal/coordinator/... ./internal/db/...` passes at `bb71765`.
- `run check` with no daemon prints the `unavailable` JSON on stdout and exits `11`.

### Known limits

- A live WebSocket is not exercised; Socket Mode state transitions are proven against a fake `apps.connections.open` and an injected `Health`.
- The CLI prints the `daemon unreachable` reason twice on no-daemon `run check` (once as the gate JSON on stdout, once as the error on stderr).
