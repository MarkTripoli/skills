---
type: code-review
date: 2026-09-22
branch: inbound-envelopes-route-through
base_branch: epic-slack-assistant-bot-dms
base_sha: d1f95113d28c1d42c350b7379dd009ee2977a2c2
head_sha: 75a7aa222a1485321db973a44f99a24c1c67abaa
status: clean
summary: "Reviewed commit 75a7aa2, which moves Socket Mode envelope consumption from coordinator into the new internal/assistant package. All three acceptance criteria hold: the nine-envelope fixture acks every envelope and stores only owner thread replies, run_resolve_test.go drives the CLI lifecycle through the daemon unchanged, and coordinator exports RecordOwnerInput without ConsumeInbound. No critical or major findings; two advisories. Next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `d1f95113d28c1d42c350b7379dd009ee2977a2c2` (`epic-slack-assistant-bot-dms`, the `base:` in `task.md`; no pull request exists yet)
- reviewed HEAD: `75a7aa222a1485321db973a44f99a24c1c67abaa`
- commits: one, `75a7aa2 refactor(slack-coordinator): route inbound envelopes through assistant`
- staged and unstaged changes: none (`git status --short --branch` shows only the branch line)
- task-owned untracked files: none before this artifact; `.agents/tasks/inbound-envelopes-route-through/` held only `task.md`
- excluded changes: none. The request said to implement before review; the implementation commit already sat at HEAD when this session opened, so the implement step compared it against `task.md` line by line and found nothing left to write (see Requirements and Standards).

Changed files (`git diff --name-status d1f9511...75a7aa2`):

```text
A  tools/slack-coordinator/internal/assistant/router.go
R  tools/slack-coordinator/internal/coordinator/inbound_test.go -> internal/assistant/router_test.go
A  tools/slack-coordinator/internal/assistant/service.go
M  tools/slack-coordinator/internal/coordinator/inbound.go
M  tools/slack-coordinator/internal/daemon/daemon.go
```

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `task.md` (issue #44, oneshot child of `slack-assistant-bot-dms`). Every named symbol exists with the named shape: `Service{DB, Slack, Coord, Owner, Now, wake}`, `New(db, slack, coord, owner, now)`, `Wake()` over a capacity-1 channel (`service.go:22-42`); `SlackSurface{PostMessage, Permalink}` (`service.go:16-19`); `ConsumeInbound(ctx, events, ack coordinator.Acker)` with the ack-first loop (`router.go:18-35`); `route` drops `SubType != ""` or `BotID != ""` then dispatches `D` to `routeDM`, `C`/`G` thread replies to `RecordOwnerInput`, every `C`/`G` message to `collect`, else drop (`router.go:41-81`); `RecordOwnerInput` exported with the unchanged predicate (`coordinator/inbound.go:20-35`); `daemon.go:165,171` builds `svc` and swaps the consumer.
- implementation source: no plan or outline artifact; `task.md` body is the specification. The epic TDD (`.agents/tasks/slack-assistant-bot-dms/03-tdd-slack-assistant-bot-dms.md:143-147`) settles the one open reading of the route table: a `C`/`G` thread reply gets both `RecordOwnerInput` and `collect` ("A channel may match both a run thread and a watched task; both rows are written"), which is what `router.go:51-56` does with `errors.Join`.
- repository instructions: `AGENTS.md` asks for Conventional Commits and a `.changeset/` entry for user-facing changes. The subject is 70 characters and matches the pattern; the body says why and carries `Refs: #44`. No changeset: the change is behavior-preserving and the six prior `slack-coordinator` feature commits (`118c0a4` back to `bb71765`) added none either, so the tool is outside the changeset-versioned packages.

## Change Profile

- intent and expected behavior: create `internal/assistant` as the daemon's inbound Slack surface so sibling children fill `routeDM` and `collect` without touching `coordinator`; envelope handling is unchanged for the owner-reply path.
- change description quality: title stands alone; body explains the motivation (coordinator only knows run threads) and the sibling contract. No pull request yet.
- implementation model and review model: implementation model not recorded in the commit; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 185 insertions, 60 deletions across five files; one refactor with its moved test. Under the ~300 coherent mark.
- resulting large-file concerns: none; the largest new file is `router.go` at 89 lines.
- dependency or lockfile changes: none (`go.mod`, `go.sum` untouched).

## Tests Reviewed First

- behavior claimed by tests: `router_test.go:67-137` drives the same nine envelopes as the removed `inbound_test.go` (owner reply, redelivery, non-owner reply, owner top level, bot message, unknown thread, interactive envelope, malformed `Data`, second owner reply) through `Service.ConsumeInbound`, asserts nine acks in delivery order, exactly two `owner_inputs` rows for `RUN2`, none for completed `RUN1`. `router_test.go:139-149` keeps the context-cancellation test. `internal/cli/run_resolve_test.go` (unchanged) starts the daemon with an `Inbound` channel and runs `run start`, a non-owner reply, an owner top-level message, an owner thread reply, `run check` exit 10, `run resolve` refusals and success, and redelivery after resolution.
- missing or misleading coverage: `route`'s `D` branch and the non-thread `C`/`G` branch reach only `routeDM`/`collect` stubs that return nil, so no test distinguishes them from a drop; nothing observable differs in this child, and the sibling children that fill the stubs own those tests. The comment at `router_test.go:75` reads correctly after the rename (`fakeSlack` gives every root the same ts).

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4782` in / `73` out (stderr: `judge: model jev-1.13.0, tokens 4782 in / 73 out`; one run, every axis `covered`)

### Correctness

- assessment and evidence: the old `ownerReply` (`coordinator/inbound.go` at `d1f9511`) accepted a thread reply in any channel; `route` now records only `C`/`G` thread replies. This is reachable-state equivalent: `run start` resolves its channel through `channel.ParseRef`, whose `idPattern` is `^[CG][A-Z0-9]{8,}$` (`internal/channel/reference.go:26`), so no `runs` row can hold a `D` channel and `ActiveRunByThread` could never match one. The ack-first order, nil-ack tolerance, and channel-close/ctx-done exits are byte-for-byte the old loop (`router.go:19-34`). `errors.Join(recorded, s.collect(...))` runs `collect` even when `RecordOwnerInput` fails, matching the TDD's "both rows are written" and keeping the two inserts independent. `msg.Channel == ""` is guarded before indexing `msg.Channel[0]` (`router.go:47`). `go test -race -count=1` passes on the four named packages.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `userMessage` isolates the envelope unwrapping and the subtype/bot drop from the channel dispatch (`router.go:65-81`), so `route` reads as the TDD's routing table. The two stubs carry one-sentence comments stating that nothing is consumed yet (`router.go:83-89`). Doc comments on `Service`, `New`, `Wake`, and `SlackSurface` say who satisfies the interface and why the channel has capacity one. No dead branches: `default` covers ids outside `C`/`G`/`D`.
- helper coverage: covered, level 3, confidence 0.98

### Architecture

- assessment and evidence: the dependency direction is `daemon -> assistant -> coordinator -> db`; `coordinator` gains no import and loses `log/slog` and the Socket Mode loop, leaving `RecordOwnerInput` as its single inbound entry point. `Service` matches the shared contract in the epic plan (`04-epic-plan-slack-assistant-bot-dms.md:30`), so sibling children add fields and one `background.Go` line each instead of reshaping the type. `coordinator.Acker` stays in `coordinator` although the coordinator no longer acks; the task pins the `ConsumeInbound` signature to it (ADV-001).
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: the envelope is untrusted input; `userMessage` type-asserts `evt.Data` and `InnerEvent.Data` and rejects mismatches (`router.go:69-76`), the malformed-`Data` envelope `e8` proves the path. The owner check is unchanged: `msg.User == run.OwnerUserID` from the stored run, not from the message (`coordinator/inbound.go:25`). Bot-authored messages are dropped before any handler (`router.go:77`). `Service.Owner` is stored for siblings and read by nothing yet, so no new trust decision is introduced. No secrets, no new parameters reach SQL beyond the existing `InsertOwnerInput` call.
- helper coverage: covered, level 3, confidence 0.98

### Performance

- assessment and evidence: per envelope the work is one type assertion chain plus, for `C`/`G` thread replies only, the same single `ActiveRunByThread` query and conditional insert as before. Top-level `C`/`G` messages and DMs now return without a query (previously a thread-less message returned early as well). No allocation is added on the hot path except the `errors.Join` call, which returns nil without allocating when both errors are nil. The consumer remains one goroutine reading an already-buffered channel.
- helper coverage: covered, level 3, confidence 0.96

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go test -race -count=1 ./internal/assistant ./internal/coordinator ./internal/daemon ./internal/cli`; `go vet ./internal/assistant ./internal/coordinator ./internal/daemon`; `git diff --name-status d1f9511...75a7aa2` to confirm `internal/cli/run_resolve_test.go` is untouched; grep for `ConsumeInbound|ownerReply|recordInbound` outside `assistant`.
- result:

```text
ok  github.com/MarkTripoli/skills/tools/slack-coordinator/internal/assistant     1.489s
ok  github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator   1.477s
ok  github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon        1.663s
ok  github.com/MarkTripoli/skills/tools/slack-coordinator/internal/cli           2.420s
```

`go vet` exit 0. The grep finds `ConsumeInbound` only in `assistant/` and `daemon/daemon.go:171`; `ownerReply` and `recordInbound` are gone.

- manual, screenshot, or before-and-after evidence: not applicable; the daemon has no interface beyond the CLI, which `run_resolve_test.go` exercises end to end. Formatters, linters, and `npm test` were skipped per `task.md`.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Acker interface lives in the package that no longer acks

- type: Refactor suggestion
- severity: info
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/coordinator/inbound.go:13`
- evidence: after this change `Acker` is implemented by the Socket Mode client and consumed only by `assistant.ConsumeInbound` (`router.go:18`) and `daemon.go:171`; nothing in `coordinator` calls `Ack`. `task.md` fixes the signature as `ack coordinator.Acker`, so this is a later cleanup, not a deviation.
- suggestion: when a sibling next touches the signature, move `Acker` to `assistant` and drop the `socketmode` import from `coordinator`.

### ADV-002 Unfilled Service fields have no reader in this child

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/assistant/service.go:23-30`
- evidence: `DB`, `Slack`, `Owner`, `Now`, and `wake` are assigned in `New` and read by nothing; `Wake()` returns a channel no code sends on. The epic plan (`04-epic-plan-slack-assistant-bot-dms.md:30`) names them as the contract the owner-DM, DM-answer, collection, and purge children build on, so they are scaffolding by design.
- suggestion: none needed; the sibling children give each field its first reader. Recorded so a later reviewer does not flag them as orphaned.

## Dead Code and Dependency Review

- newly orphaned code: none. `newTestCoordinator`, `fakePoster`, `startTestRun` in `coordinator/scheduler_test.go` remain used by `check_test.go`, `disable_test.go`, `finish_run_test.go`, `backlink_test.go`; `stamp` in `start_run.go:37` remains used by `RecordOwnerInput` and `StartRun`. The `socketmode` import in `coordinator/inbound.go` is still needed for `Acker`.
- dependency findings: none; no module changes.

## Verdict

- decision: approve
- overall code-health change: improves. The coordinator shrinks to run-thread concerns, the routing table has one owner with named extension points, and the moved test keeps the same nine-envelope contract.
- rationale: every `task.md` acceptance criterion is proven by an existing or moved test that passes under `-race`; the one narrowing of behavior (thread replies recorded only for `C`/`G`) is unreachable in the old code because run channels are restricted to `^[CG]` at parse time. No critical or major finding.

## Review Limits

- blocked or unavailable checks: none.
- residual manual verification: none. A live Slack workspace was not used; `run_resolve_test.go` covers the daemon path with a fake Slack API.
