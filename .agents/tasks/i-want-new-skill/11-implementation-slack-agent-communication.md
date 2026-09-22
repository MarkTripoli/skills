---
type: implementation
completed_phase: 6
summary: "Phase 6 proves `run disable-slack --run-id` shows the run summary, reads one `yes` line, and flips only that run's `slack_mode` through `run.disable_slack`; afterwards `run check` exits `12` with `{\"kind\":\"slack_disabled\"}` ahead of every other gate step, `run event`/`run finish` store without posting, and sibling runs are untouched. Phase 7 consumes `internal/daemon` (add `service.go`) and `internal/cli/setup.go`, `daemon.go` (service install and the `daemon stop` supervision notice)."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/i-want-new-skill/task.md`
- plan artifact: [05-plan-slack-agent-communication.md](05-plan-slack-agent-communication.md)
- phase range: 6

## Child Workers
- implementer: `agent-implementer` (`ImplPhase6`), one worker for Phase 6
- reviewer: none; the parent re-ran the Phase 6 check and the whole module suite

## Completed Work
- `internal/db/runs.go`: `SlackEnabled`/`SlackDisabled` constants, `DisableSlack` (active runs only).
- `internal/coordinator`: `DisableSlackForRun`, `RunSummary`, `WriteGate.Run` on every daemon answer, `slack_disabled` step first after the run lookup, `RecordWorkEvent`/`FinishRun` skip `post` on disabled runs, `run.disable_slack` handler.
- `internal/cli`: `run disable-slack --run-id` with the typed `yes` prompt via `cmd.InOrStdin()`; `run check` exit `12`.
- Commit `a3e0f43 feat(slack-coordinator): add per-run break-glass via run disable-slack`.

## Automated Verification
- command: `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/cli/...`
- result: pass
- evidence: worker run, parent re-run inside `go test -race -count=1 ./...`
- command: `cd tools/slack-coordinator && go vet ./... && go test -race -count=1 ./...`
- result: nine packages `ok`
- evidence: parent run after the worker finished
- command: `SLACK_COORDINATOR_HOME=$(mktemp -d) /tmp/slack-coordinator run disable-slack --run-id none </dev/null`
- result: `daemon unavailable: …`, exit `11`, no prompt
- evidence: worker final message (`agent://ImplPhase6`)

## Deferred Human Evidence

- None.

## Commit Handoff
Phase commit `a3e0f43` was created after green automated checks; this receipt and the ticked plan are committed separately as `docs(task): implementation artifact`.

## Human Review

### Review targets

- `db.DisableSlack` returns `ErrRunNotActive` for a finished run and `ErrRunNotFound` for a missing one (both exit `2`), copying the `db.FinishRun` pattern.
- `run disable-slack` with no daemon exits `11` without a prompt and without the gate JSON; the break-glass cannot proceed without the daemon.
- Every daemon `run.check` answer now carries `run{run_id, channel_id, permalink}`; the CLI-synthesized `daemon unreachable` gate has none.
- `check_test.go` and `run_check_test.go` compare gate kind and reason instead of whole-struct equality because `WriteGate` gained a pointer field.

### Verify

- `cd tools/slack-coordinator && go test -race -run 'DisableSlack' -v ./internal/cli/... ./internal/coordinator/...` passes at `a3e0f43`.
- `internal/cli/run_disable_slack_test.go`: `no\n`, empty stdin, and `yes please\n` exit `1` leaving both runs `ready`; `yes\n` flips only the targeted run.

### Known limits

- None.
