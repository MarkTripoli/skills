Ticket: [#46](https://github.com/MarkTripoli/skills/issues/46) | Task: `owner-dms-are-recorded` | Walkthrough: none

## Purpose

An owner's top-level DM to the assistant bot was dropped by `routeDM`; this PR stores it as a `dm_requests` row with one `queued` `assistant_runs` row in a single transaction, reacts with `eyes`, acknowledges in the thread, and records owner replies under a request root as pending follow-ups.

## Acceptance criteria

- Owner top-level DM with `agent.command` configured inserts `dm_requests`, `dm_messages{author owner}`, one `queued` run, reacts `eyes`, posts `Working on it` or `Queued behind <n>`, stores the reply ts in `ack_ts`: `TestOwnerTopLevelDMOpensRequestOnce` and `TestRequestBehindRunningRunsIsAckedAsQueued` (`Queued behind 0`, then `Queued behind 1` with three `running` rows) under `go test -race ./internal/assistant`.
- Same DM event delivered twice keeps one `dm_requests` row, one `assistant_runs` row, one ack: the redelivery half of `TestOwnerTopLevelDMOpensRequestOnce` asserts no new row, post, reaction, or wake.
- `agent:` absent from `config.yaml` replies `No agent is configured; set agent.command in config.yaml` and stores no row: `TestDMWithoutAgentIsRefusedWithoutRows`.
- Owner reply under a `dm_requests` root inserts `dm_messages{author owner, run_id NULL}`: `TestOwnerReplyUnderRequestIsRecordedAsFollowUp`.
- Manifest lists bot scopes `im:history`, `im:read`, `im:write`, `reactions:write`, `users:read.email` and bot event `message.im`: read `tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml` lines 20-25 and 31.

## Special things to note

- Existing Slack apps receive no DMs until the updated manifest is applied and the app is reinstalled; `docs/slack-coordinator.md` Setup step 1 says so. Two new scopes (`im:write`, `users:read.email`) are for siblings that edit the ack and look up the owner by e-mail.
- `db.DB` gains `Transact`: inside the callback the wrapper's statement surface is the open `*sql.Tx`, so every existing `db` method runs unchanged in either mode; nesting returns an error instead of deadlocking on the single connection. Slack calls sit outside both transactions.
- `Queued behind <n>` counts `queued_at < this row` at RFC 3339 second resolution, as the task specifies; two requests in one second both read `Queued behind 0`. A Slack failure after commit is returned for logging, and the runner is still woken because the queued row is the source of truth.

## Change outline

`routeDM` now branches on owner, `!` prefix, and thread position:

```diff
 routeDM(msg)
-  return nil
+  if msg.User != Owner || text starts with "!": return nil
+  if ThreadTimeStamp == "": newRequest(msg)
+  else:                     followUp(msg)
```

`newRequest` writes first, tells Slack second:

```text
newRequest
  Agent == nil            -> PostMessage(noAgentReply) in thread; return
  Transact
    InsertDMRequest       INSERT OR IGNORE; inserted=false on redelivery -> commit, return
    InsertDMMessage       owner root text
    InsertAssistantRun    run_id ulid, kind dm, state queued
  defer signalWake
  AddReaction eyes
  ackText                 running < 3 && CountQueuedBefore == 0 ? "Working on it" : "Queued behind n"
  PostMessage ack in thread
  Transact
    SetAckTS
    InsertDMMessage       bot ack row

followUp
  GetDMRequest(ThreadTimeStamp) missing -> return
  Transact
    InsertDMMessage       owner reply, run_id NULL
    TouchDMRequest        last_message_at = now
```

New `db` statement surface and the wiring that reaches it:

```text
tools/slack-coordinator/internal/
  db/
    db.go               querier interface; DB{sql querier, root *sql.DB}; Transact
    dm_requests.go      DMRequest, DMMessage; InsertDMRequest, GetDMRequest, SetAckTS,
                        TouchDMRequest, InsertDMMessage, ListDMMessages
    assistant_runs.go   AssistantRun; InsertAssistantRun, CountRunsByState, CountQueuedBefore
  assistant/
    service.go          Service.Agent *config.Agent; New(..., agent, now);
                        SlackSurface += UpdateMessage, AddReaction
    router.go           routeDM owner branch
    requests.go         newRequest, ackText, followUp
  daemon/daemon.go      assistant.New(..., cfg.Agent, time.Now)
  manifest/slack-app-manifest.yaml   im:*, reactions:write, users:read.email, message.im
docs/slack-coordinator.md            reinstall sentence in Setup step 1
```

The detail to hold while reading: `InsertDMRequest` returns `inserted`, and every later write, Slack call, and wake is gated on it, so redelivery is decided by the `root_ts` primary key alone.

## Human Review

### Review targets

- `requests.go:35-56`: the transaction commits before any Slack call; confirm the `defer s.signalWake()` after the `inserted` check is the ordering you want when `AddReaction` or `PostMessage` fails.
- `db.go:59-75`: `Transact` hands the callback a `*DB` whose `sql` is the `*sql.Tx`; confirm no existing `db` method reaches `d.root` for a statement (only `Close` and `BeginTx` do).
- `router_test.go`: `fakeSlack` moved to `requests_test.go` and became a recording fake; `newTestService` now returns `(service, fake, clock)`.
- Manifest and `docs/slack-coordinator.md:13`: scope list and the reinstall sentence.

### Verify

- [ ] `cd tools/slack-coordinator && go test -race ./internal/assistant ./internal/db` passes on the head commit.
- [ ] `Commits` check passes: `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD` prints `ok`.
- [ ] Manifest diff shows exactly `im:history`, `im:read`, `im:write`, `reactions:write`, `users:read.email`, `message.im` added.

### Known limits

- Two requests queued in the same RFC 3339 second both read `Queued behind 0`; the dispatcher sibling decides the tie-break.
- A redelivered follow-up envelope adds no row but moves `last_message_at` to the redelivery time (`TouchDMRequest` runs after `INSERT OR IGNORE`).
- `assistant_runs.kind` and `root_ts` for the queued run are asserted only through `CountRunsByState`; no getter exists in this child.
- No live Slack workspace was exercised; `reactions.add` and `chat.postMessage` are proven against the recording `fakeSlack`.

Closes #46
