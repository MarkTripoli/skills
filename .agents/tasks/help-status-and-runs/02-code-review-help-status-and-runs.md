---
type: code-review
date: 2026-09-22
branch: help-status-and-runs
base_branch: epic-slack-assistant-bot-dms
base_sha: da39e897228eb829509761cb8c5c1027f8751460
head_sha: 83012b83ce92eca12c8c0b789138fb2ce2c590eb
status: clean
summary: "Reviewed commit 77c5c5c (12 Go files, 532 lines) that adds the owner-DM verb dispatcher with !help, !status, !runs and the four db count/list queries. All four acceptance criteria are proven by tests that pass under `go test ./internal/assistant ./internal/db`; no critical or major finding. Three advisories: a failing verb answers with silence, `!status` walks the run workspace on the router goroutine, and `socketHealth` duplicates `coordinator.health`. Next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `da39e89` (`epic-slack-assistant-bot-dms`; no pull request exists for the branch, so `task.md` `base:` decides)
- reviewed HEAD: `83012b8`
- commits: `77c5c5c feat(slack-coordinator): answer !help, !status, !runs in the owner DM`, `83012b8 docs(task): commit artifact`
- staged and unstaged changes: none (`git status --short --branch` prints only the branch line)
- task-owned untracked files: none
- excluded changes: `.agents/tasks/help-status-and-runs/01-commit-help-status-and-runs.md` (task artifact, not a review subject)

## Previous Round

- previous artifact: none
- None.

## Requirements and Standards

- task or ticket: `.agents/tasks/help-status-and-runs/task.md` (oneshot child of `slack-assistant-bot-dms`, issue #50). The request fixes the dispatch shape (split on whitespace, lowercase first token, `verbs` map of `func(ctx, args []string) (string, error)`, top-level `PostMessage`, no row), the exact `!help`, `!status`, and `!runs` text, the four db functions and their files, and the test list.
- implementation source: no plan, outline, TDD, or PRD; the commit receipt `01-commit-help-status-and-runs.md` records the decisions taken. Its `## Verification` names `go build`, `go vet`, and `go test ./internal/assistant ./internal/db` as green.
- repository instructions: `AGENTS.md` (offline `npm test` skipped per the task; docs and the `.changeset/` entry belong to the epic's wave 9 child `docs describe onboarding, DMs, and standing tasks, and the changeset records the release`, `04-epic-plan-slack-assistant-bot-dms.md:523-540`), `shared/CONVENTIONS.md` commit rules.

## Change Profile

- intent and expected behavior: an owner top-level DM whose first token starts with `!` is a command. `routeDM` (`router.go:88-104`) dispatches it through `Service.verbs`; `runVerb` (`verbs.go:60-72`) lowercases the first token, falls back to `help` for an unknown verb or bare `!`, and posts the reply at the DM's top level. `!status` (`verbs.go:78-113`) reports uptime from `Service.started`, Socket Mode through a nil-safe `socketHealth`, `len(ActiveRuns)`, four `CountTasksByState` calls, the agent command and approval level, `CountCollectedMessages`, `CountAssistantRuns`, and byte sizes of `state.sqlite{,-wal,-shm}` and `workspace/runs`. `!runs` (`verbs.go:116-132`) prints one `run_id · channel_id · started started_at · permalink` line per active run or `No active runs.` The five task verbs answer `not available yet`.
- change description quality: subject is 69 characters and matches the Conventional Commits rule; the body explains why `!` DMs bypass rows, why `Service` gains `Paths` and `started`, and why the task verbs are listed early. `Refs: #50` footer present.
- implementation model and review model: implementation model not recorded in the receipt; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 532 lines across 12 Go files, 238 of them in tests. One feature plus its queries and tests; no split needed.
- resulting large-file concerns: none. `verbs.go` is 195 lines; `runs.go` grows to 152.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: `verbs_test.go` drives every case through `routeDMEvent`, so the router, dispatch, and post path are exercised together. `TestHelpListsEveryVerb` and `TestUnknownVerbAndBareBangAnswerWithHelp` check the eight verb names and the closing sentence for `!help`, `!bogus now`, and `!`. `TestVerbDispatchIgnoresCase` checks `!Help` and `!RUNS`. `TestStatusReportsTheDaemon` fixes the clock 90 minutes after construction, injects `Health`, starts two coordinator runs and finishes one, inserts two `assistant_runs`, writes a 2048-byte file under `Paths.RunDir("A1")`, and asserts the six text lines exactly plus a regex requiring non-zero db bytes and `2.0 KB runs`. `TestStatusWithoutAgentOrWorkspace` covers `agent: none` and `0 B runs`. `TestRunsListsActiveRunsOnly` covers the empty reply and one active line including the stored permalink. `TestVerbsWriteNoRows` sends all eleven `!` shapes and asserts no `dm_requests` row, zero `assistant_runs`, no reaction, no wake, and `not available yet` for the five task verbs. `db_test.go:382-431` proves `CountTasksByState` filters by state, `CountCollectedMessages` and `CountAssistantRuns` count every row, and `ActiveRuns` returns both `slack_mode` values ordered by `started_at`. `requests_test.go:191-212` now asserts that a non-owner `!status` and an owner `!status` thread reply are dropped with no post.
- missing or misleading coverage: `!runs` with two active rows is proven only at the db layer (`db_test.go:427-430`); the assistant-level test has one row, so the `\n` join at `verbs.go:126-128` is exercised by no test. Trivial: the join is three lines with no branch beyond `i > 0`.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4781` in / `73` out (stderr: `judge: model jev-1.13.0, tokens 4781 in / 73 out`)

### Correctness

- assessment and evidence: every acceptance criterion is proven. AC1 (top-level reply, no `dm_requests`/`assistant_runs` row): `runVerb` posts with empty `threadTS` (`verbs.go:70`) and writes nothing; `TestVerbsWriteNoRows` and `verbReply`'s `post.thread != ""` check (`verbs_test.go:27`) prove it. AC2 (unknown or bare `!` gives help): `verbs.go:62-65`, `TestUnknownVerbAndBareBangAnswerWithHelp`. AC3 (`!status` lines): `verbs.go:109-112` emits all seven lines in the task's order; `TestStatusReportsTheDaemon` asserts each. AC4 (`!runs`): `ActiveRuns` filters `lifecycle = 'active'` (`runs.go:109`), `TestRunsListsActiveRunsOnly` and `TestStatusCountsFilterByStateAndLifecycle` prove both the empty and populated cases and that a `slack_disabled` active run is still listed. `fields[0]` at `verbs.go:62` cannot panic: `text` is trimmed and starts with `!` (`router.go:92-94`), so `strings.Fields` returns at least one token. `dirBytes` maps a missing root to 0 through `errors.Is(err, fs.ErrNotExist)` (`verbs.go:177-179`) and `fileBytes` skips a missing `-wal`/`-shm` (`verbs.go:149-151`). `socketHealth` reads `not_started` for a nil `Health` (`verbs.go:137-139`), the same reading `coordinator.health` uses (`check.go:36-41`). `New` is called once in product code (`daemon.go:165`) and passes `p`. Task-state constants match the schema check (`schema.go:46`). `go build ./...`, `go vet`, and `go test -count=1 ./internal/assistant ./internal/db` pass in this session.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `verbTable` (`verbs.go:43-55`) is a flat map; `runVerb` is one lookup, one call, one post. `status` reads top to bottom in the order of the reply lines. Names are exact: `helpText`, `notAvailableReply`, `noActiveRunsReply`, `fileBytes`, `dirBytes`, `humanBytes`. The `tasks [4]int` parallel to the four-constant array (`verbs.go:83-88`) is the one indirection; it is local to eleven lines. `routeDM`'s new comment (`router.go:84-87`) matches the switch below it. No dead code: the old `!` drop branch was replaced, not left beside the new one.
- helper coverage: covered, level 3, confidence 0.99

### Architecture

- assessment and evidence: the queries live in `internal/db` beside their tables, matching `CountRunsByState` (`assistant_runs.go`) and the `runColumns`/`scanRun` reuse in `ActiveRuns` (`runs.go:105-127`). `Service` owns the verb table and `Paths`; the daemon passes the `*paths.Paths` it already holds. `socketHealth` re-implements the unexported `coordinator.health` rather than exposing it (ADV-003). The task verbs are registered as `notYet` placeholders so the sibling child replaces map entries without touching dispatch; that is the smallest seam.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: only `msg.User == s.Owner` reaches `runVerb` (`router.go:89-91`); a non-owner `!status` is dropped and tested (`requests_test.go:196`). Verb arguments are ignored by every implemented handler, so no owner-supplied text reaches a query or the filesystem. Queries use no interpolation; `CountTasksByState` binds `state` (`tasks.go:19`). The reply reveals the agent command, approval level, and paths' byte sizes to the owner's own DM only.
- helper coverage: covered, level 3, confidence 0.94

### Performance

- assessment and evidence: `!status` runs seven queries and two filesystem passes per request on the owner's demand; the counts are `COUNT(*)` over small tables. `dirBytes` walks `workspace/runs` in full on the `ConsumeInbound` goroutine (ADV-002); the task specifies the walk. `active runs` loads every active row to count it (`verbs.go:79,110`); active runs are bounded by the daemon's concurrency, so this is not a hot path. `strings.Builder` in `runs` avoids repeated concatenation.
- helper coverage: covered, level 3, confidence 0.93

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go build ./... && go vet ./internal/assistant ./internal/db ./internal/daemon && go test -count=1 ./internal/assistant ./internal/db`; `go test -count=1 -run 'TestStatus|TestRuns|TestHelp|TestUnknown|TestVerb|TestRouteDMDrops' -v ./internal/assistant`.
- result: build and vet clean; `ok internal/assistant 0.420s`, `ok internal/db 0.228s`. The eight targeted tests each print `--- PASS`.
- manual, screenshot, or before-and-after evidence: none; the change has no interface beyond Slack text, which the tests capture through `fakeSlack.posts`. Live Slack delivery is not exercised.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 A verb that fails answers the owner with silence

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/assistant/verbs.go:66-69`
- evidence: a db or `os.Stat` error from `status` returns up the router and is logged as `inbound not recorded` (`router.go:31-33`); nothing is posted, so the owner sees no reply and cannot tell a dropped message from a failed verb.
- suggestion: post a one-line failure reply (`!status failed: <err>`) before returning the error, or record in the wave 9 docs that a silent `!` verb means a daemon-side error worth a log check.

### ADV-002 `!status` walks the whole run workspace on the router goroutine

- type: Potential issue
- severity: minor
- category: Performance and scalability
- location: `tools/slack-coordinator/internal/assistant/verbs.go:101,161-181`
- evidence: `dirBytes` is called from `route` inside `ConsumeInbound`'s single loop (`router.go:19-36`), so every inbound envelope waits while `workspace/runs` is walked. Run directories hold agent checkouts; a large one turns one `!status` into seconds of router stall. The task requires the walk, so the cost is accepted here.
- suggestion: when a future run workspace grows, cache the size with a short TTL or compute it off the router goroutine; not needed for this child.

### ADV-003 `socketHealth` duplicates `coordinator.health`

- type: Refactor suggestion
- severity: trivial
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/assistant/verbs.go:136-141`; `tools/slack-coordinator/internal/coordinator/check.go:36-41`
- evidence: both read `Health`, both map nil to `slackapi.SocketNotStarted`.
- suggestion: export one `Coordinator.SocketState()` and call it from both sites when a third reader appears.

## Dead Code and Dependency Review

- newly orphaned code: none. `path/filepath` was removed from `router_test.go` when the test db moved under `Paths.DB()`; no exported symbol lost its last caller (`assistant.New` keeps `daemon.go:165` and the tests).
- dependency findings: none; `go.mod` and `go.sum` unchanged.

## Verdict

- decision: approve
- overall code-health change: improves. The router now names the `!` path instead of dropping it, the four queries follow the existing `internal/db` shape, and tests cover every acceptance criterion at the router boundary.
- rationale: no critical or major finding; three minor or trivial advisories, none blocking. Docs and the changeset are owned by the epic's wave 9 child, not this one.

## Review Limits

- blocked or unavailable checks: none for judgments; `judge.mjs axis-coverage` ran once and returned `covered` on all five axes. `npm test` and the full `go test ./...` were not run per the task; only the two named packages plus `go build ./...` and `go vet` on the three touched packages.
- residual manual verification: the reply text against a live Slack DM (mrkdwn rendering of the fenced `!help` table and the `·` separators) has not been observed.
