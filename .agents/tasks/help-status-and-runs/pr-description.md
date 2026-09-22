Ticket: [#50](https://github.com/MarkTripoli/skills/issues/50) | Task: `help-status-and-runs` | Walkthrough: none

## Purpose

An owner's `!`-prefixed DM was dropped by `routeDM`; this PR dispatches it through a verb table and answers `!help`, `!status`, and `!runs` at the DM's top level without writing a `dm_requests` or `assistant_runs` row.

## Acceptance criteria

- Owner top-level DM whose first token starts with `!` is answered at the DM's top level and inserts no `dm_requests` or `assistant_runs` row: `TestVerbsWriteNoRows` sends eleven `!` messages and asserts `GetDMRequest` misses, `CountAssistantRuns` is 0, no reaction, no wake; `verbReply` fails on any post with a thread ts. `go test ./internal/assistant ./internal/db`.
- Unknown verb or `!` alone answers with the `!help` table: `TestUnknownVerbAndBareBangAnswerWithHelp` (`!bogus now`, `!`) checks all eight verb names and the closing sentence.
- `!status` reports uptime, Socket Mode state, active coding-agent runs, task counts by state, `agent: <command> (approval: <level>)` or `agent: none`, `COUNT(*)` of `collected_messages` and `assistant_runs`, and the byte sizes of `state.sqlite*` and `workspace/runs`: `TestStatusReportsTheDaemon` fixes the clock at +90m, injects `Health`, starts two runs and finishes one, inserts two `assistant_runs`, writes a 2048-byte file under `RunDir("A1")`, and asserts six lines exactly plus `disk: <non-zero> db · 2.0 KB runs`; `TestStatusWithoutAgentOrWorkspace` covers `agent: none` and `0 B runs`.
- `!runs` lists one `<run_id> · <channel_id> · started <started_at> · <permalink>` line per `runs` row with `lifecycle = active`, or `No active runs.`: `TestRunsListsActiveRunsOnly` (empty, then one active of two started); `TestStatusCountsFilterByStateAndLifecycle` in `internal/db` proves `ActiveRuns` keeps a `slack_disabled` active row and drops a finished one.

## Special things to note

- `assistant.New` gains a `*paths.Paths` parameter; `daemon.Serve` passes the `p` it already holds. `Service` records `started: now()` at construction, so uptime in tests follows the injected clock.
- The five task verbs (`!tasks`, `!show`, `!pause`, `!resume`, `!cancel`) are registered and answer `not available yet` until the sibling child replaces their map entries; they never fall through to `!help`. An owner `!` message posted as a thread reply is still dropped.
- `!status` runs seven `COUNT`/`SELECT` queries and walks `workspace/runs` on the `ConsumeInbound` goroutine; a verb that returns an error is logged as `inbound not recorded` and posts nothing (code review ADV-001, ADV-002 in `.agents/tasks/help-status-and-runs/02-code-review-help-status-and-runs.md`).

## Change outline

`routeDM` gains the `!` branch ahead of request handling:

```diff
 routeDM(msg)
   if msg.User != Owner: return nil
-  if text starts with "!": return nil
+  if text starts with "!":
+    if ThreadTimeStamp != "": return nil
+    return runVerb(channel, text)
   if ThreadTimeStamp == "": newRequest(msg)
   else:                     followUp(msg)
```

`runVerb` is one lookup, one call, one post:

```text
runVerb(channel, text)
  fields = strings.Fields(text)
  v = verbs[lower(fields[0])]  (missing -> help)
  reply = v(ctx, fields[1:])
  PostMessage(channel, "", reply)

status
  ActiveRuns                          -> active runs: len
  CountTasksByState x4                -> tasks: active · paused · completed · cancelled
  CountCollectedMessages, CountAssistantRuns
  fileBytes(state.sqlite, -wal, -shm) -> disk: db
  dirBytes(Workspace()/runs)          -> disk: runs   (missing dir = 0 B)
  Agent nil -> "agent: none"

runs
  ActiveRuns -> one line per row, or "No active runs."
```

New `db` surface and where it is wired:

```text
tools/slack-coordinator/internal/
  assistant/
    verbs.go            verb, helpText, verbTable, runVerb, help, status, runs,
                        socketHealth, fileBytes, dirBytes, humanBytes
    service.go          Service.Paths, started, verbs; New(..., p, ...)
    router.go           routeDM `!` branch
  db/
    tasks.go            Task{Active,Paused,Completed,Cancelled}; CountTasksByState
    collected_messages.go  CountCollectedMessages
    assistant_runs.go   CountAssistantRuns
    runs.go             ActiveRuns (lifecycle = 'active', ORDER BY started_at, run_id)
  daemon/daemon.go      assistant.New(..., p, ...)
```

The detail to hold while reading: `runVerb` posts with an empty `threadTS` and never touches `DB` for a write, so the no-row guarantee is structural, not a guarded branch.

## Human Review

### Review targets

- `verbs.go:60-72`: dispatch falls back to `help` on an unknown verb; confirm `fields[0]` is safe (text is trimmed and starts with `!`, so `Fields` is never empty).
- `verbs.go:97-104`: `!status` returns any `os.Stat` or walk error, which leaves the owner without a reply; decide whether silence is acceptable for this child.
- `router.go:94-98`: a `!` thread reply is dropped rather than treated as a follow-up; confirm that matches the intended DM contract.
- `db/runs.go:105-127`: `ActiveRuns` reuses `runColumns`/`scanRun`; no existing query listed active runs without a `slack_mode` filter.

### Verify

- [ ] `cd tools/slack-coordinator && go test -count=1 ./internal/assistant ./internal/db` passes on the head commit.
- [ ] `Commits` check passes: `node scripts/check-commits.mjs origin/epic-slack-assistant-bot-dms..HEAD` prints `ok: 3 subjects`.
- [ ] `git diff origin/epic-slack-assistant-bot-dms...HEAD -- tools/` touches only the 12 Go files listed in the change outline.

### Known limits

- A verb that fails (db or filesystem error) is logged and posts no reply; the owner cannot distinguish it from a dropped message.
- `!status` walks `workspace/runs` in full on the router goroutine; a large run workspace stalls inbound routing for the duration.
- `!runs` with two or more active rows is proven only at the db layer; the assistant-level test uses one row.
- `docs/slack-coordinator.md` and the `.changeset/` entry are owned by the epic's docs child, not this PR.
- No live Slack workspace was exercised; mrkdwn rendering of the fenced `!help` table and `·` separators is unobserved.

Closes #50
