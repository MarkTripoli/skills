---
type: implementation
completed_phase: 8
summary: "Phase 8 proves `run start --jira-issue KEY` writes the thread permalink to the configured Jira custom field with one `PUT /rest/api/3/issue/KEY`, keeps a failed write `pending` with 30s, 60s, 120s… retries capped at 1h on scheduler ticks, and never changes `run check`; a key without Jira config or a malformed key exits `2` before any Slack call. Phase 9 consumes the finished CLI verbs to write `skills/delivery/slack-coordinator/`, bump `EXPECTED_SKILL_COUNT` to 48, and wire docs, the phase table, the plugin manifest, and the changeset."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/i-want-new-skill/task.md`
- plan artifact: [05-plan-slack-agent-communication.md](05-plan-slack-agent-communication.md)
- phase range: 8

## Child Workers
- implementer: `agent-implementer` (`ImplPhase8`), one worker for Phase 8
- reviewer: none; the parent re-ran the Phase 8 check and the whole module suite

## Completed Work
- `internal/config`: `Jira{BaseURL, Email, APIToken, FieldID}`, `Validate` (all set, absolute http(s) base, `^customfield_\d+$`), `Config.JiraEnabled`; `Load` rejects a half-configured block.
- `internal/db`: `jira_backlinks` table; `InsertBacklink`, `GetBacklink`, `DueBacklinks`, `MarkBacklinkDelivered`, `MarkBacklinkFailed`.
- `internal/jira/client.go`: `SetThreadURL` with basic auth, 15 s timeout, 204 ok.
- `internal/coordinator`: `StartRunInput.JiraIssue`, `Coordinator.Jira BacklinkWriter`, `backoff`, `attemptBacklink`, `retryBacklinks` from `Tick`; `daemon.Serve` wires the Jira client when configured.
- `internal/cli`: `run start --jira-issue`, `setup --jira-base-url --jira-email --jira-field-id` with `JIRA_API_TOKEN` (all-or-none).
- Commit `118c0a4 feat(slack-coordinator): write the thread permalink to a Jira field`.

## Automated Verification
- command: `cd tools/slack-coordinator && go test -race ./internal/jira/... ./internal/coordinator/... ./internal/cli/...`
- result: pass (`internal/jira` has no test file; its request shape is asserted through the fake Jira server in `coordinator/backlink_test.go` and `cli/run_start_test.go`)
- evidence: worker run, parent re-run inside `go test -race -count=1 ./...`
- command: `cd tools/slack-coordinator && go vet ./... && go test -race -count=1 ./...`
- result: nine packages `ok`
- evidence: parent run after the worker finished

## Deferred Human Evidence

- One live Jira issue shows the thread URL in the configured field; record the issue key and `field_id` in `.agents/tasks/i-want-new-skill/evidence/phase-8-jira.md`. Recorded, not executed.

## Commit Handoff
Phase commit `118c0a4` was created after green automated checks; this receipt and the ticked plan are committed separately as `docs(task): implementation artifact`.

## Human Review

### Review targets

- `Jira.Validate` also requires `base_url` to parse as an absolute http(s) URL.
- `MarkBacklinkDelivered` increments `attempts` too, so `attempts` counts every write made.
- `setup` with `JIRA_API_TOKEN` exported and no Jira flags exits `2` (all-or-none applied literally).
- `Tick` skips `DueBacklinks` when `Coordinator.Jira` is nil, so pending rows left by a later config change stay pending silently.
- Effective retry delay is the backoff rounded up to the next 30 s scheduler tick.

### Verify

- `cd tools/slack-coordinator && go test -race -run 'Backlink|Jira' -v ./internal/coordinator/... ./internal/cli/... ./internal/config/...` passes at `118c0a4`.
- `coordinator/backlink_test.go`: after a 500, `CheckBeforeWrite` still returns `ready`; `Tick` at +29 s makes no Jira request and at +30 s retries.

### Known limits

- Live Jira is not exercised; the field write is proven against an `httptest` fake.
