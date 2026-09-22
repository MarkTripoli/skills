---
type: code-review
date: 2026-09-22
branch: owner-dms-are-recorded
base_branch: epic-slack-assistant-bot-dms
base_sha: 0c80de9ac7d53af3a4d99480caa32377e74771e8
head_sha: b8c307afca08e66e203fa43ddfdb94ac7526bc8d
status: clean
summary: "Reviewed commit b8c307a, which fills routeDM for the owner: a top-level DM is stored as dm_requests, dm_messages, and one queued assistant_runs row in one transaction, reacted to with eyes, acked in its thread, and woken to the runner; a reply under a request root becomes a run_id NULL follow-up. All five acceptance criteria hold under go test -race ./internal/assistant ./internal/db and a read of the manifest. No critical or major findings; three advisories (same-second queue count, redelivered follow-up moves last_message_at, run row fields unasserted). Next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `0c80de9ac7d53af3a4d99480caa32377e74771e8` (`epic-slack-assistant-bot-dms`, the `base:` in `task.md`; `gh pr view` finds no pull request for this branch)
- reviewed HEAD: `b8c307afca08e66e203fa43ddfdb94ac7526bc8d`
- commits: one, `b8c307a feat(slack-coordinator): record owner DMs as requests and ack in thread`
- staged and unstaged changes: none (`git status --short --branch` shows only the branch line)
- task-owned untracked files: none before this artifact; `.agents/tasks/owner-dms-are-recorded/` held only `task.md` and no `index.json` (legacy numbering applies)
- excluded changes: none. The request said to implement before review; the implementation commit already sat at HEAD when this session opened, so the implement step compared it against every symbol, statement, and test `task.md` names and found nothing left to write (see Requirements and Standards). No product code was edited.

Changed files (`git diff --name-status 0c80de9...b8c307a`, 645 insertions, 38 deletions):

```text
M  docs/slack-coordinator.md
A  tools/slack-coordinator/internal/assistant/requests.go
A  tools/slack-coordinator/internal/assistant/requests_test.go
M  tools/slack-coordinator/internal/assistant/router.go
M  tools/slack-coordinator/internal/assistant/router_test.go
M  tools/slack-coordinator/internal/assistant/service.go
M  tools/slack-coordinator/internal/daemon/daemon.go
A  tools/slack-coordinator/internal/db/assistant_runs.go
M  tools/slack-coordinator/internal/db/db.go
M  tools/slack-coordinator/internal/db/db_test.go
A  tools/slack-coordinator/internal/db/dm_requests.go
M  tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml
```

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `task.md` (issue #46, oneshot child of `slack-assistant-bot-dms`). Every named shape exists: `Service.Agent *config.Agent`, `New(db, slack, coord, owner, agent, now)` (`service.go:33,42-44`); `daemon.Serve` passes `cfg.Agent` (`daemon.go:165`); `SlackSurface` gains `UpdateMessage` and `AddReaction` (`service.go:19-20`), both implemented by `*slackapi.Client` (`slackapi/client.go:78,84`); `routeDM` keeps non-owner DMs dropped, returns nil for `!`-first-token text, sends top level to `newRequest` and replies to `followUp` (`router.go:88-96`); `newRequest` posts the fixed no-agent reply in the message's thread when `s.Agent == nil` (`requests.go:28-31`, constant at `requests.go:16`), else runs `INSERT OR IGNORE dm_requests`, and on `inserted` the owner `dm_messages` row and one `queued` `assistant_runs` row with `ulid.Make()` (the generator `cli/run_start.go:65` uses) in one `Transact` (`requests.go:35-51`); outside it, `AddReaction eyes`, ack text from `CountRunsByState(running) < 3 && CountQueuedBefore(now) == 0`, `PostMessage` under the root, `SetAckTS` plus the bot `dm_messages` row, and a non-blocking wake (`requests.go:56-73`, `79-92`); `followUp` inserts `dm_messages{author owner, run_id NULL}` and touches `last_message_at` for a root found in `dm_requests` (`requests.go:97-109`). `db/dm_requests.go` carries `InsertDMRequest` (returns inserted), `GetDMRequest`, `SetAckTS`, `TouchDMRequest`, `InsertDMMessage`, `ListDMMessages`; `db/assistant_runs.go` carries `InsertAssistantRun`, `CountRunsByState`, `CountQueuedBefore`. Manifest and docs sentence match the request (see Correctness).
- implementation source: no plan or outline artifact; `task.md` body is the specification. The epic TDD summary (`.agents/tasks/slack-assistant-bot-dms/03-tdd-slack-assistant-bot-dms.md:4`) and its line 69 ("`Queued behind <n>` is the count of `queued` rows ahead at insert time") agree with the `queued_at < ?` shape `task.md` asks for.
- repository instructions: `AGENTS.md` asks for Conventional Commits and a `.changeset/` entry for user-facing changes. `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD` prints `ok: 1 subject`; the subject is 71 characters and the body records why plus four decisions and `Refs: #46`. No changeset, matching every prior `slack-coordinator` commit on the epic branch; the tool is outside the changeset-versioned packages. `task.md` forbids formatters, linters, and the full `npm test`; none were run.

## Change Profile

- intent and expected behavior: an owner's top-level DM becomes durable queued work before Slack is told anything; the runner is woken whenever a row was queued; a redelivered envelope changes nothing; a reply under a request root is stored as a pending follow-up.
- change description quality: title stands alone; body explains the transaction-first ordering and lists the decisions taken where the request left room (same-second queue count, Slack failures after commit, `INSERT OR IGNORE` on `dm_messages`, `Transact` design). No pull request yet.
- implementation model and review model: implementation model not recorded in the commit; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 645 insertions, 38 deletions across twelve files; 260 of the insertions are tests. One feature with its db layer, manifest, and doc sentence; each file is the smallest unit `task.md` names. Above the ~300 mark but one coherent behavior; no split warranted.
- resulting large-file concerns: none; the largest new file is `requests_test.go` at 212 lines, `requests.go` is 109.
- dependency or lockfile changes: none (`go.mod`, `go.sum` untouched; `github.com/oklog/ulid/v2` was already required).

## Tests Reviewed First

- behavior claimed by tests: `requests_test.go:73-117` routes an owner top-level DM and asserts the `dm_requests` row with channel and both timestamps, one `eyes` reaction on the root, one `Working on it` post in the root's thread, two `dm_messages` rows (owner root, then bot ack whose `ts` equals `ack_ts` and differs from the root), one `queued` run, and a wake; then redelivers the same envelope and asserts no new message, run, post, reaction, or wake. `requests_test.go:119-139` forces three `running` rows and asserts `Queued behind 0` then `Queued behind 1` for two requests one second apart, with two queued rows. `requests_test.go:141-161` sets `Agent = nil` and asserts the fixed reply in the thread, no reaction, no `dm_requests` row, no run, no wake. `requests_test.go:163-189` asserts a reply under the root is the third `dm_messages` row with `RunID` NULL, moves `last_message_at` to the reply time, queues nothing, and does not wake. `requests_test.go:191-212` asserts non-owner, `!status`, leading-space `!status`, and a reply under an unknown thread store and post nothing. `db_test.go:382-421` asserts `Transact` rolls back the callback's error, refuses nesting, and commits a two-statement write. Fixed clock (`router_test.go:27,34-36`), temp `state.sqlite`, and a recording `fakeSlack` (`requests_test.go:17-44`) as `task.md` asks.
- missing or misleading coverage: no test reads the `assistant_runs` row back, so `kind = dm` and `root_ts = <request root>` are asserted only through `CountRunsByState`; the package has no getter yet (ADV-003). The same-second edge of `CountQueuedBefore` is not exercised (ADV-001). `TestOwnerReplyUnderRequestIsRecordedAsFollowUp` pins "no wake on follow-up", which is this child's `nothing else yet`; the sibling that adds follow-up wake will change that assertion knowingly.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6538` in / `73` out (stderr: `judge: model jev-1.13.0, tokens 6538 in / 73 out`; one run, every axis `covered`)

### Correctness

- assessment and evidence: acceptance criteria decided against the diff and tests. (1) Owner top-level DM with an agent: `requests.go:35-51` writes the three rows in one transaction; `requests.go:58-72` reacts, computes the ack, posts under `rootTS`, stores `ack_ts` and the bot row; `Working on it` versus `Queued behind <n>` follows `running < 3 && ahead == 0` (`requests.go:88-91`), proven by `requests_test.go:89-107` and `:129-138`. (2) Redelivery: `INSERT OR IGNORE` on the `root_ts` primary key returns `inserted == false` (`dm_requests.go:42-52`), the callback returns before the other inserts, and `newRequest` returns before any Slack call or wake (`requests.go:38-39,52-54`); proven by `requests_test.go:109-116`. (3) No agent: `requests.go:28-31` posts the exact string in the DM's thread and returns before any write; proven by `requests_test.go:141-161`. (4) Owner reply under a root: `followUp` checks `GetDMRequest` before writing, so the `dm_messages.root_ts` foreign key (`schema.go:82`) cannot fail, and inserts with the zero `RunID` (NULL); proven by `requests_test.go:178-181`. (5) Manifest: `slack-app-manifest.yaml:20-25` lists `im:history`, `im:read`, `im:write`, `reactions:write`, `users:read.email`; `:31` lists `message.im`. Docs: `docs/slack-coordinator.md:12` ends with the required sentence. Ordering: the wake is deferred after a successful insert (`requests.go:56`), so a reaction or ack failure still wakes the runner and returns the joined error to `ConsumeInbound`'s log line (`router.go:31-33`); a failed ack post leaves `ack_ts` NULL rather than storing an empty ts (`requests.go:63-66`). Single-connection safety: `Transact` refuses nesting (`db.go:60-62`) and both callbacks use only `tx` (`requests.go:37,41,44,68,71,104,107`), so no call inside a transaction can wait on the one pooled connection; no Slack call runs inside a transaction. `strings.HasPrefix(strings.TrimSpace(msg.Text), "!")` (`router.go:89`) is the "first token starts with `!`" test, covered for a leading space at `requests_test.go:197`. `CountQueuedBefore` compares RFC 3339 UTC strings lexically, which is chronological at fixed width (`service.go:61`, `assistant_runs.go:58`); its second resolution is ADV-001.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `newRequest` reads top to bottom as the request describes it: refuse, transact, wake, react, ack, record (`requests.go:27-74`); `ackText` isolates the one policy decision (`requests.go:79-92`). `Transact` hands the callback a `*db.DB` whose `sql` is the open `*sql.Tx`, so every existing method runs unchanged in either mode (`db.go:14-26,59-75`); the `querier` interface names exactly the three methods shared by `*sql.DB` and `*sql.Tx`. Constants replace the string literals `task.md` spells out (`db.AuthorOwner`, `db.RunKindDM`, `db.RunQueued`, `noAgentReply`, `maxRunningRuns`). `fakeSlack` moved from `router_test.go` to `requests_test.go` and gained recording, and `newTestService` now returns the fake and the clock (`router_test.go:20-31`), so the two existing router tests changed only their destructuring. No dead branches or pass-through helpers.
- helper coverage: covered, level 3, confidence 1.00

### Architecture

- assessment and evidence: the db layer stays a thin statement surface (`dm_requests.go`, `assistant_runs.go`) and policy lives in `assistant` (`ackText`, wake ordering), matching how `coordinator` uses `db` today. `Transact` is the one new concept in `db` and is the smallest way to give callers atomicity without exposing `*sql.Tx`; its `root` field keeps `Close` and `BeginTx` on the real handle (`db.go:25,63,89`). `Service.Agent` is a pointer to the config struct rather than a boolean, which the sibling that spawns runs will read for command and approval, so no second field is needed later. `SlackSurface.UpdateMessage` has no caller in this child but is required by `task.md` for the sibling that edits the ack; the fake satisfies it in one line (`requests_test.go:35`). `routeDM` keeps the routing table shape of `route` (`router.go:88-96`): predicates only, behavior in the two named methods.
- helper coverage: covered, level 3, confidence 0.97

### Security

- assessment and evidence: only `msg.User == s.Owner` reaches any write or post (`router.go:89`), proven at `requests_test.go:195`. Every SQL statement is parameterized (`dm_requests.go:42-44,58-60,72,80,89-91,99-100`; `assistant_runs.go:36-38,47,57-58`); the only string concatenation is the constant column list `dmMessageColumns`. Owner text is stored verbatim and never echoed to Slack; every posted string is a constant or `fmt.Sprintf("Queued behind %d")` over an integer (`requests.go:16,89,91`). New scopes `im:*`, `reactions:write`, `users:read.email` are the minimum for reading DMs, reacting, and the sibling's owner e-mail lookup; `users:read` was already present. No secrets, no new files, no new network surface beyond `reactions.add` through the existing client.
- helper coverage: covered, level 3, confidence 1.00

### Performance

- assessment and evidence: one request costs one transaction of three inserts, two `COUNT(*)` queries over `assistant_runs`, two Slack calls, and one two-statement transaction (`requests.go:35-72`). `assistant_runs` has no index on `state`, but the table holds one row per run and the TDD's dispatcher caps running rows at three, so both counts are full scans over a small table; a redelivered envelope costs one ignored insert and no Slack call. Slack calls sit outside both transactions, so the single SQLite connection is never held across network I/O. `ListDMMessages` is bounded by one thread. No hot-path allocation beyond the `DMRequest`/`DMMessage` values.
- helper coverage: covered, level 3, confidence 0.99

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go build ./... && go vet ./internal/assistant ./internal/db && go test -race -count=1 ./internal/assistant ./internal/db`; `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD`; read of `slack-app-manifest.yaml` and `docs/slack-coordinator.md:12`.
- result: build and vet clean; `ok internal/assistant 1.745s`, `ok internal/db 1.475s`; `ok: 1 subject`; manifest and doc sentence match `task.md`.
- manual, screenshot, or before-and-after evidence: none. A live Slack workspace was not used; the recording `fakeSlack` stands in for `reactions.add` and `chat.postMessage`.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Two requests in one second both read `Queued behind 0`

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `tools/slack-coordinator/internal/db/assistant_runs.go:58`, `tools/slack-coordinator/internal/assistant/requests.go:84`
- evidence: `queued_at` is `time.RFC3339` at second resolution (`service.go:61`) and `CountQueuedBefore` uses `queued_at < ?`, so a second owner DM arriving in the same wall-clock second as a queued first one counts zero ahead and, with three runs `running`, is acked `Queued behind 0` while it is behind one. `task.md` spells out `queued_at earlier than this row` and the commit body records the decision, so this is the requested shape, not a defect against the specification.
- suggestion: when the dispatcher lands, break ties on insertion order (`queued_at < ? OR (queued_at = ? AND rowid < ?)` with the run's rowid, or ULID order since `ulid.Make()` is millisecond-monotonic within a process) so the ack agrees with the order the dispatcher will pick.

### ADV-002 A redelivered follow-up moves `last_message_at` to the redelivery time

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `tools/slack-coordinator/internal/assistant/requests.go:103-108`
- evidence: `InsertDMMessage` is `INSERT OR IGNORE` on `(root_ts, ts)` (`dm_requests.go:89-91`) but `TouchDMRequest` runs unconditionally after it, so a duplicate envelope for an already-stored reply stamps `last_message_at` with the later `now`. `ConsumeInbound` acks every envelope before routing (`router.go:28-30`), so Slack redelivery is unlikely, and no acceptance criterion covers a redelivered follow-up.
- suggestion: return `inserted bool` from `InsertDMMessage` as `InsertDMRequest` does and touch only when a row was inserted.

### ADV-003 The queued run's `kind` and `root_ts` are not read back

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/assistant/requests_test.go:105-107`
- evidence: `TestOwnerTopLevelDMOpensRequestOnce` proves one `queued` row through `CountRunsByState` only; `requests.go:44-50` sets `Kind: db.RunKindDM` and `RootTS: rootTS`, and the schema `CHECK` rejects an unknown kind, but nothing asserts the run points at this request. `task.md` names no getter for `assistant_runs`, so adding one here would be outside the child's scope.
- suggestion: when the dispatcher sibling adds a read of the oldest queued row, assert `kind` and `root_ts` for this test's request through it.

## Dead Code and Dependency Review

- newly orphaned code: none. `SlackSurface.UpdateMessage` (`service.go:19`) and the constants `RunKindTask`, `RunDone`, `RunFailed`, and field `AssistantRun.TaskID` (`assistant_runs.go:12,19-20,29`) have no caller in this child; the interface method is required by `task.md`, and the constants mirror the schema `CHECK` values (`schema.go:88,90`) the dispatcher and task siblings write. The removed value-receiver `fakeSlack` in `router_test.go` is replaced by the recording one; `d.sql.Query` in `db_test.go` moved to `d.root.Query` because `sql` is now the `querier` interface.
- dependency findings: none; no module or lockfile change.

## Verdict

- decision: approve
- overall code-health change: improves. `db` gains one transaction primitive that existing methods use unchanged; `assistant` gains the DM request use case with policy in one function and the Slack calls outside every transaction; tests cover each acceptance criterion with a fixed clock and recording fake.
- rationale: every acceptance criterion is proven by a named test or a read of the changed file; the three advisories are a requested tie-breaking shape, an unlikely redelivery drift, and a missing read-back the child has no getter for. None blocks merge.

## Review Limits

- blocked or unavailable checks: none. The typed judgment ran once and reported every axis `covered`. Formatters, linters, and `npm test` were not run, per `task.md`.
- residual manual verification: none. A live Slack workspace was not used; `slackapi.Client.AddReaction` and `UpdateMessage` are exercised only by their own package, not by this child's tests.
