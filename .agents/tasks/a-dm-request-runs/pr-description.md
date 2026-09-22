Ticket: [#55](https://github.com/MarkTripoli/skills/issues/55) | Task: `a-dm-request-runs` | Walkthrough: none

## Purpose

The Slack coordinator now dispatches queued owner DM requests to the configured agent and replaces the acknowledgement with the agent's answer while recording every terminal run state.

## Acceptance criteria

- A queued DM with fewer than three running rows writes 0600 `prompt.md` and empty `messages.jsonl`, starts the configured agent, records `pid`, `pgid`, `daemon_pid`, and `started_at`, and edits a `Queued behind` acknowledgement to `Working on it`: `go test -race ./internal/assistant ./internal/daemon ./internal/cli`, especially `dispatcher_test.go`.
- Three running rows prevent another spawn, and the oldest queued row starts after one delivery finishes: `dispatcher_test.go` fills the three slots, confirms the fourth is queued, then releases one and observes the backfill.
- A successful non-empty result of at most 4,000 characters updates the acknowledgement, inserts the bot message with `run_id`, and finishes the row as `done`: `deliver_test.go` and the end-to-end `internal/cli/dm_request_test.go`.
- A newly inserted DM wakes the dispatcher before its timer period: `dispatcher_test.go` observes a spawn within 50 ms with a 10-second period.
- Non-zero exits, timeouts, empty results, and daemon-shutdown cancellation finish the row as `failed` without changing the acknowledgement: `deliver_test.go` and `TestShutdownRecordsCancelledRunAsFailed` in `dispatcher_test.go`.

## Special things to note

- Answers longer than 4,000 runes leave a `Done` acknowledgement and post the full answer in the thread; short answers replace the acknowledgement in place.
- Terminal database writes use `context.WithoutCancel`, so shutdown cannot strand a running row and consume a dispatcher slot after restart.
- The proof uses the repository's fake agent and fake Slack HTTP surface; no live Slack workspace or real `omp` process was exercised.

## Change outline

The dispatcher owns the bounded queue and run lifecycle; the existing agent runner owns process execution, while the database owns durable state.

```text
tools/slack-coordinator/internal/
  assistant/
    dispatcher.go       wake/timer loop, three-slot spawn, shutdown lifecycle
    prompt.go           embedded skill and run-directory inputs
    deliver.go          success/failure Slack delivery and terminal persistence
    skill/ASSISTANT.md   headless agent contract
  db/assistant_runs.go  queued, running, done, and failed row transitions
  daemon/daemon.go      configured runner and dispatcher wiring
  cli/dm_request_test.go
                         daemon-to-agent-to-Slack end-to-end proof
```

```diff
queued DM
  -> write prompt.md + messages.jsonl
  -> start agent and persist process metadata
  -> edit "Queued behind" to "Working on it"
  -> wait for outcome
     -> short result: update ack, insert bot row, finish done
     -> long result: update ack to "Done", post thread result, finish done
     -> failure: finish failed, leave ack unchanged
```

The review-critical boundary is delivery persistence: Slack calls happen before the database transaction, while terminal writes survive daemon cancellation.

## Human Review

### Review targets

- `tools/slack-coordinator/internal/assistant/dispatcher.go`: oldest-queued ordering, three-run cap, process metadata ordering, wake handling, and shutdown wait.
- `tools/slack-coordinator/internal/assistant/deliver.go`: 4,000-rune split, post-before-record ordering, failure text, and non-cancellable terminal writes.
- `tools/slack-coordinator/internal/assistant/prompt.go` and `skill/ASSISTANT.md`: run-directory contract, approval level, Slack prohibition, and restrictive file modes.
- `tools/slack-coordinator/internal/daemon/daemon.go` and `internal/db/assistant_runs.go`: configured runner wiring and durable state transitions.

### Verify

- [ ] `cd tools/slack-coordinator && go test -race ./internal/assistant ./internal/daemon ./internal/cli` passes on the head commit.
- [ ] `git diff --check` passes, and the pull request's `Commits` check accepts the Conventional Commit subjects.
- [ ] Review confirms the daemon-shutdown regression remains covered by `TestShutdownRecordsCancelledRunAsFailed`.

### Known limits

- No live Slack workspace or real `omp` process was exercised; the end-to-end test uses the committed fake agent and fake Slack server.
- The task explicitly omits formatters, linters, and the project-wide `npm test`; those checks were not run.

Closes #55
