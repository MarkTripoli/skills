---
type: code-review
date: 2026-09-22
branch: messages-in-watched-channels
base_branch: epic-slack-assistant-bot-dms
base_sha: da39e897228eb829509761cb8c5c1027f8751460
head_sha: c1e8543d7e4a3443fed4be5bd335a3ba162acfd7
status: clean
summary: "Reviewed commit c1e8543 against epic-slack-assistant-bot-dms: collect in router.go stores a watched channel message once, binds it to every active watching task in one transaction, and moves each_message due_at only on a new binding. All four acceptance criteria are proven by collect_test.go and go test ./internal/assistant ./internal/db passes. Three minor advisories (unwrapped permalink error, permalink fetched before the redelivery check, watching-task read outside the transaction); nothing blocks describe-pr."
---

# Code Review

## Scope

- merge base: `da39e897228eb829509761cb8c5c1027f8751460` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists for the branch)
- reviewed HEAD: `c1e8543d7e4a3443fed4be5bd335a3ba162acfd7`
- commits: 1, `c1e8543 feat(slack-coordinator): collect watched-channel messages for tasks`
- staged and unstaged changes: none (`git status --short --branch` prints only the branch line)
- task-owned untracked files: none; `task.md` is committed, no `index.json` (legacy numbering applies)
- excluded changes: `.agents/tasks/messages-in-watched-channels/task.md`

Changed files (`git diff --name-status da39e89...HEAD`): `A internal/assistant/collect_test.go`, `M internal/assistant/router.go`, `M internal/assistant/router_test.go`, `A internal/db/collected_messages.go`, `A internal/db/tasks.go`, all under `tools/slack-coordinator/`.

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `task.md` (issue #51, `oneshot`, parent `slack-assistant-bot-dms`); four acceptance criteria, five named test scenarios, proof command `go test ./internal/assistant ./internal/db`.
- implementation source: `task.md` body only; the oneshot workflow has no plan, outline, TDD, or PRD artifact.
- repository instructions: repository `AGENTS.md` (Go tool under `tools/`, skip formatters, linters, and `npm test`); Conventional Commits per `scripts/check-commits.mjs`.

Acceptance criteria against the diff:

| Criterion | Decision | Proof |
|---|---|---|
| Message with no subtype and no bot_id in a `C…`/`G…` channel watched by at least one active task inserts `collected_messages` with `chat.getPermalink` and one `task_messages{run_id NULL}` per active watcher | met | `router.go:108-144`; `TestCollectStoresWatchedMessageOnceAndBindsEveryActiveTask` checks one `collected_messages` row with permalink `https://t.slack.com/archives/C1/p1700000000.002000` and two `run_id IS NULL` bindings (`collect_test.go:87-109`). Subtype and bot filtering happens in `userMessage` (`router.go:81-83`), unchanged. |
| `each_message` task gets `due_at = now + debounce_seconds` | met | `router.go:135-141`; `TestCollectClosesEachMessageWindowAtNowPlusDebounce` expects `2026-09-21T10:05:00Z` for clock `10:00:00Z` and debounce 300 (`collect_test.go:140-143`). |
| Channel watched only by paused, completed, or cancelled tasks inserts nothing | met | `WatchingTasks` filters `t.state = 'active'` (`tasks.go:39`); `TestCollectIgnoresChannelsWatchedOnlyByInactiveTasks` inserts one task per inactive state and asserts zero rows in both tables and no `due_at` (`collect_test.go:116-133`). |
| Owner reply in an active run thread inserts both `owner_inputs` and `collected_messages` | met | `route` runs `RecordOwnerInput` first and joins its error with `collect` (`router.go:56-60`); `TestCollectAlsoRecordsOwnerReplyInWatchedRunThread` reads the input back through `OldestUnhandledInput` and counts the collected row and binding (`collect_test.go:171-182`). |

## Change Profile

- intent and expected behavior: replace the `collect` stub with the watched-channel collector: one `WatchingTasks` query, one `Permalink` call when the list is non-empty, then `InsertCollectedMessage` + `BindMessageToTask` per task + `SetTaskDue` for `each_message` tasks inside `Transact`.
- change description quality: subject `feat(slack-coordinator): collect watched-channel messages for tasks` (62 chars, matches the commit regex) stands alone; body states the store-once/bind-per-task model, the redelivery decision (a redelivered envelope neither duplicates rows nor moves `due_at`), the owner-input ordering, and `Refs: #51`.
- implementation model and review model: implementation model not recorded in the commit; review by `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 353 insertions, 4 deletions across 5 files; one feature with its DB helpers and tests, no split needed.
- resulting large-file concerns: `router.go` grows to 145 lines, `collect_test.go` is 183 lines; none.
- dependency or lockfile changes: none (`go.mod`, `go.sum` untouched).

## Tests Reviewed First

- behavior claimed by tests: `collect_test.go` covers the five scenarios `task.md` names. Tasks are inserted directly through a second `sql.DB` on the same file (`newCollectService`, `collect_test.go:18-28`), matching the instruction "tasks inserted directly". Redelivery is exercised twice: same envelope twice yields one collected row and one binding per task (`collect_test.go:83-84,100-109`), and a redelivery two minutes later leaves `due_at` at `10:05:00Z` (`collect_test.go:145-149`). A thread reply stores its `thread_ts` and moves the window to its own arrival + 300s (`collect_test.go:151-160`). An unwatched channel (`C9`) adds nothing (`collect_test.go:85,100-102`).
- missing or misleading coverage: the `G…` (private channel) prefix is not exercised; the routing branch treats `C` and `G` identically in one `case` (`router.go:55`), so the risk is nil. No test drives `collect` with a failing `Permalink`; the early return at `router.go:113-116` leaves no partial rows because the transaction has not started, which reads directly from the code.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 4804 in / 73 out

### Correctness

- assessment and evidence: the transaction covers the `collected_messages` insert and every binding, so `task_messages`' composite foreign key to `collected_messages` (`schema.go:75`) cannot dangle. `INSERT OR IGNORE` on both primary keys makes redelivery idempotent; `BindMessageToTask` returns `RowsAffected() > 0` (`collected_messages.go:44-48`) and `collect` moves `due_at` only when `bound` is true (`router.go:135`), which the redelivery test pins. `ThreadTS` is NULL for a top-level message (`router.go:122`). `received_at` and `due_at` come from the same `s.Now()` read (`router.go:117,126,138`). A NULL `debounce_seconds` on an `each_message` task yields `due_at = now` because `sql.NullInt64.Int64` is 0; task creation, outside this task's scope, owns that validation. Two connections in the test (`db.Open` plus the raw `sql.Open`) rely on `busy_timeout(5000)` and single-goroutine calls, so no lock contention.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `collect` is one linear function: query, early return, permalink, transaction; the `!bound || t.Trigger != db.TriggerEachMessage` `continue` (`router.go:135`) reads as the single guard for the due_at move. `WatchingTask` carries the three columns the collector reads and nothing else (`tasks.go:27-31`). State and trigger constants (`tasks.go:10-22`) replace string literals in tests. `newTestServiceAt` extracts the path parameter without duplicating `newTestService` (`router_test.go:20-29`).
- helper coverage: covered, level 3, confidence 0.97

### Architecture

- assessment and evidence: SQL lives in `internal/db` as one method per statement, matching `owner_inputs.go` and `dm_requests.go`; the assistant service composes them under `Transact`, the pattern `Transact`'s doc describes (`db.go:58-62`). `collect` keeps the `Slack` dependency behind the existing `Service` interface (`service.go:21`), so tests use `fakeSlack.Permalink` unchanged (`requests_test.go:42-44`). No new package, interface, or option.
- helper coverage: covered, level 3, confidence 0.98

### Security

- assessment and evidence: every SQL statement is parameterized (`tasks.go:36-40,61`, `collected_messages.go:25-27,38-40`). Slack `text`, `user`, `channel`, and `ts` are stored as opaque strings and never interpolated. Bot and subtyped messages are dropped before `collect` (`router.go:81-83`). The permalink comes from Slack's own API for the same `(channel, ts)` and is stored verbatim; nothing renders it in this change.
- helper coverage: covered, level 3, confidence 0.82

### Performance

- assessment and evidence: an unwatched channel costs one indexed query (`task_channels` primary key is `(task_id, channel_id)`, so the `channel_id = ?` filter scans `task_channels`, a small table) and no Slack call (`router.go:109-112`). One `chat.getPermalink` per watched message, then one transaction with 1 + N + M statements for N watchers and M `each_message` tasks. `ConsumeInbound` is serial, so no concurrent transactions from this path. See ADV-002 for the redelivery cost.
- helper coverage: covered, level 3, confidence 0.95

## Verification Story

- command or inspection: `go test -count=1 ./internal/assistant ./internal/db` in `tools/slack-coordinator`; `go vet ./internal/assistant ./internal/db`; `git diff da39e89...HEAD` read in full.
- result: `ok github.com/MarkTripoli/skills/tools/slack-coordinator/internal/assistant 0.602s`, `ok .../internal/db 0.361s`; `go vet` printed nothing.
- manual, screenshot, or before-and-after evidence: none needed; the change has no interface. Before: `collect` returned nil for every message (`router.go` at `da39e89`).

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Permalink error returned without context

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/assistant/router.go:113-116`
- evidence: `collect` returns the `Permalink` error unwrapped; `ConsumeInbound` logs it as `inbound not recorded` (`router.go:35`). The coordinator wraps the same call as `fmt.Errorf("get permalink: %w", err)` (`coordinator/start_run.go:78-81`), and the db helpers in this diff wrap theirs with the channel and ts.
- suggestion: `fmt.Errorf("permalink %s/%s: %w", msg.Channel, msg.TimeStamp, err)` so the log names the message that was dropped.

### ADV-002 Redelivered envelope pays a Slack call before the ignore

- type: Potential issue
- severity: minor
- category: Performance and scalability
- location: `tools/slack-coordinator/internal/assistant/router.go:113`
- evidence: `chat.getPermalink` runs before the transaction discovers the `(channel_id, ts)` row exists; the redelivery test (`collect_test.go:84,146`) reaches `fakeSlack.Permalink` a second time. `task.md` prescribes this order ("fetch the permalink once, then in one transaction"), and Socket Mode redelivers only when the ack is late, so the cost is one extra API call per rare redelivery.
- suggestion: none required; if redelivery volume shows up in logs, check `collected_messages` for the key before the permalink call.

### ADV-003 Watching tasks read outside the transaction

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `tools/slack-coordinator/internal/assistant/router.go:109,118`
- evidence: `WatchingTasks` runs on the base connection; a task paused or cancelled between that read and `Transact` still receives a binding and, for `each_message`, a `due_at`. The daemon is one process and `ConsumeInbound` handles envelopes serially, so the window exists only if a scheduler or verb handler changes task state on another goroutine; nothing in the current tree writes `tasks.state` yet (grep for `each_message` finds only this diff and the schema), so the risk is theoretical today.
- suggestion: when state transitions land, move the `WatchingTasks` call inside the transaction (`tx.WatchingTasks`), keeping the `Permalink` call ahead of it.

## Dead Code and Dependency Review

- newly orphaned code: none. The stub `collect(context.Context, *slackevents.MessageEvent) error { return nil }` was replaced, not left beside the implementation; `newTestService` still has callers in `router_test.go` and `requests_test.go`.
- dependency findings: none; no `go.mod` or `go.sum` change.

## Verdict

- decision: approve
- overall code-health change: improves. The stubbed hook becomes a tested collector; DB access follows the existing one-method-per-statement pattern and the transaction invariant the schema comment demands.
- rationale: every acceptance criterion in `task.md` is met and proven by a test that would fail on the plausible bug (duplicate rows, moved `due_at` on redelivery, rows for inactive watchers, missing owner input). The three advisories are non-blocking and two of them are constrained by `task.md`'s prescribed order.

## Review Limits

- blocked or unavailable checks: none. The typed-judgment helper answered on the first run; the second run was not needed.
- residual manual verification: none for this change. A live `chat.getPermalink` call is exercised only by `slackapi/client_test.go` against a stub server, not against Slack.
