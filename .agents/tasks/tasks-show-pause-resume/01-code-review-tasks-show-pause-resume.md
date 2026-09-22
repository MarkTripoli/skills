---
type: code-review
date: 2026-09-22
branch: tasks-show-pause-resume
base_branch: epic-slack-assistant-bot-dms
base_sha: 4b632ce1d6b8b1da71a0b09067f70729a4c1e691
head_sha: 0ed59f109d92071dac77365b50f7e133ca2883e2
status: clean
summary: "Reviewed commit 0ed59f1, which makes !tasks, !show, !pause, !resume, and !cancel manage tasks rows from the owner DM through new db accessors and NextDue. Every acceptance criterion is proven by a test in verbs_test.go or tasks_test.go, and go build ./... plus go test ./internal/assistant ./internal/db pass. No critical or major finding; four advisories (unguarded state UPDATE, whole-file read for the 500-rune excerpt, silent DM on a verb error, no changeset). Next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `4b632ce1d6b8b1da71a0b09067f70729a4c1e691` (`epic-slack-assistant-bot-dms`, the `base:` in `task.md`; no pull request exists yet)
- reviewed HEAD: `0ed59f109d92071dac77365b50f7e133ca2883e2`
- commits: one, `0ed59f1 feat(slack-coordinator): manage standing tasks from the owner DM`
- staged and unstaged changes: none (`git status --short --branch` reports only the branch line)
- task-owned untracked files: none; `.agents/tasks/tasks-show-pause-resume/task.md` is committed
- excluded changes: none. Eight files changed, all under `tools/slack-coordinator/internal/{assistant,db}` (861 insertions, 17 deletions)

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `.agents/tasks/tasks-show-pause-resume/task.md` (issue #54, oneshot child of `slack-assistant-bot-dms`, depends on `help-status-and-runs`). Five acceptance criteria, decided below.
- implementation source: `task.md` body; no plan, outline, TDD, or PRD artifact exists (legacy task directory without `index.json`).
- repository instructions: `AGENTS.md` (commits via `scripts/check-commits.mjs`, user-facing changes add a `.changeset/` entry); `shared/CONVENTIONS.md` commit rules. The commit subject is 64 characters and matches the Conventional Commits regex.

### Acceptance criteria

| Criterion | Decision | Evidence |
|---|---|---|
| `!tasks` lists active and paused tasks with id, state, channels, schedule text, next due or `waiting for messages`, last result, or `No standing tasks.` | pass | `verbs.go:142-178`; `TestTasksListsActiveAndPausedTasks` (`verbs_test.go`) asserts the exact four-line reply over six rows spanning all four states and three schedule shapes, and the empty reply |
| `!show <id>` on any row carries instruction verbatim, state, newest five runs, first 500 characters of each `result.md` | pass | `verbs.go:183-242`; `TestShowPrintsInstructionAndNewestRunsWithResults` uses a `cancelled` task, six runs (sixth excluded), a 600-character `result.md` cut to 500, and another task's run excluded |
| `!pause`/`!resume`/`!cancel` apply their transition and reply with the new state and, for `!resume`, the next due time | pass | `verbs.go:245-311`; `TestPauseResumeCancelTransitions` reads `state`, `due_at`, `ended_at`, `consecutive_failures` back from SQLite after each verb for daily, past `at`, `each_message`, and `every_hours` tasks, and checks `t<id> is <state>` for completed and cancelled rows |
| Unknown or malformed id replies `unknown id, known: t<id> t<id>…` with active and paused ids ascending | pass | `verbs.go:316-341`, `tasks.go:141-151`; `TestTaskVerbsRejectUnknownAndMalformedIds` covers no arg, `9`, `t9`, `0`, `-1`, `t`, `x2`, `2a` across `!show`/`!pause`/`!resume`/`!cancel` with a cancelled and a completed row excluded from the list |
| `NextDue({"daily":"09:00","tz":"Europe/Berlin"}, 2026-09-22T08:00:00Z)` = `2026-09-23T07:00:00Z`; `{"every_hours":6}` = now + 6h | pass | `tasks.go:55-91`; `TestNextDue` rows 1 and 7 (`tasks_test.go:20,26`); DST end and start rows at lines 23-24 |

## Change Profile

- intent and expected behavior: replace the `not available yet` placeholder for the five task verbs with real handlers over `tasks`, `task_channels`, and `assistant_runs`; add `NextDue` schedule arithmetic; add `ConversationInfo` to `SlackSurface` with a per-Service name cache.
- change description quality: the commit body explains why rows go through db accessors, why daily schedules compute on calendar days, the cache/fallback rule, and lists the four choices `task.md` left open (paused task prints `waiting for messages`, run with no exit or failure prints time and state only, `watches none`, `known: none`). `Refs: #54`. Title stands alone.
- implementation model and review model: implementation model not recorded in the commit or task directory; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 861 added / 17 removed lines across 8 files, one feature; below the ~1000 split check and cohesive (db layer, schedule arithmetic, verbs, tests).
- resulting large-file concerns: `verbs.go` grows to 404 lines and `verbs_test.go` to about 400; both remain single-purpose.
- dependency or lockfile changes: none. `github.com/slack-go/slack` was already a direct dependency; `service.go` and `requests_test.go` import it for `*slack.Channel`.

## Tests Reviewed First

- behavior claimed by tests: `TestVerbsWriteNoRows` (updated) now expects `No standing tasks.` and `unknown id, known: none` in place of the placeholder. `TestTasksListsActiveAndPausedTasks` also pins the cache: two listings make four `conversations.info` calls (C1 and C3 cached, unknown C2 retried). `TestNextDue` covers today/tomorrow rollover, the exact-wall-time boundary, both Berlin DST transitions, UTC default, fractional hours, future/past/equal `at`. `TestNextDueRejectsMalformedSchedules` covers eight bad documents.
- missing or misleading coverage: `db.ListTasks()` with zero states (the "every task" branch, `db/tasks.go:61`) has no caller and no test; not a defect, see ADV-005. `dueText` on a stored `due_at` that fails RFC 3339 parsing falls back to the raw string and is untested; the column is always written by `stamp`, so the branch is defensive only. `resultExcerpt` on an unreadable (not missing) file is untested; see ADV-003.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 5915 in / 73 out (stderr: `judge: model jev-1.13.0, tokens 5915 in / 73 out`); one run, every axis `covered`

### Correctness

- assessment and evidence: The verbs run on the single `ConsumeInbound` goroutine (`router.go:27-44`), which also owns `collect`'s `SetTaskDue`, so the `channelNames` map and the read-then-update in `pause`/`resume`/`cancel` are not raced today. `NextDue` daily builds the candidate with `time.Date` in the schedule zone and normalizes `Day()+1`, so the 09:00 Berlin wall time survives both DST transitions (`tasks.go:70-75`, proven at `tasks_test.go:23-24`); `!next.After(now)` makes the exact wall time roll to tomorrow as `task.md` requires ("strictly after"). `resume` computes `NextDue` from `s.Now()` and writes `due_at` plus `consecutive_failures = 0` in one `Transact` (`verbs.go:285-290`), so a failure leaves the paused row intact. `cancel` writes `ended_at = stamp(now)` and NULL `due_at` (`verbs.go:306-307`). `taskArg` treats a `GetTask` error other than `ErrTaskNotFound` as a verb error rather than as "unknown" (`verbs.go:323-325`), so a db failure is not reported as a missing task. `parseTaskID` lower-cases before trimming one `t`, rejects empty, non-digit-leading, zero, and overflow (`tasks.go:141-151`); `tt3`, `+3`, `-1`, `2a` all fall to the unknown reply. `RecentRunsForTask` orders `queued_at DESC, run_id DESC LIMIT ?` (`db/assistant_runs.go:57-61`); `!show` prints `finished_at`, else `started_at`, else `queued_at` (`verbs.go:209-225`), a documented extension of the `<finished_at | started_at>` spec for queued rows. `resultExcerpt` slices runes, matching the "500 characters" wording. `!show` works for completed and cancelled rows because `taskArg` only consults state through `GetTask`. No correctness finding at critical or major severity; ADV-001 records the unguarded UPDATE.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: Each verb is one function with a shared `taskArg` resolver returning `(row, reply, err)`; the `if err != nil || reply != ""` guard repeats four times (`verbs.go:185,247,264,300`) but keeps each verb linear. Constants name every literal reply (`noTasksReply`, `waitingForMessages`, `showRunLimit`, `resultExcerptRunes`). `schedule` decoding is centralized in `parseSchedule`, used by `NextDue`, `scheduleText`, and `dueText`. `db.Task` mirrors the table column for column with a shared `taskColumns`/`scanTask` pair, the same shape `runs.go` uses. Doc comments state behavior and fallbacks rather than restating code. No dead code introduced; `notAvailableReply` and its help-text caveat were removed with their last use.
- helper coverage: covered, level 3, confidence 0.99

### Architecture

- assessment and evidence: SQL stays in `internal/db` (`ListTasks`, `GetTask`, `TaskChannels`, `SetTaskState`, `ResetTaskFailures`, `RecentRunsForTask`); the assistant package composes them, matching `!status`/`!runs`. `ConversationInfo` joins `SlackSurface` (`service.go:25-27`) rather than the assistant reaching for `channel.Lookup`; `*slackapi.Client` already had the method (`slackapi/client.go:187`), so the daemon constructor at `daemon.go:165` compiles unchanged (`go build ./...` passes). The name cache lives on `Service` as `task.md` directs and is initialized in `New`. `NextDue` is exported from `assistant/tasks.go` for the future scheduler, as `task.md` names it. `SetTaskState(id, state, dueAt, endedAt *string)` matches the signature `task.md` specifies; it always writes all three columns, which is what every current caller wants.
- helper coverage: covered, level 3, confidence 0.97

### Security

- assessment and evidence: Verbs run only for `msg.User == s.Owner` at the DM top level (`router.go:98-107`), unchanged. The only owner-controlled input reaching a query is the id, parsed by `parseTaskID` to an `int64` and bound as a parameter (`db/tasks.go:88`); `ListTasks` builds its `IN (?,...)` placeholder list from the caller's constant states, not from input (`db/tasks.go:62`). `!show` reads `s.Paths.RunDir(r.RunID)/result.md` where `RunID` comes from an `assistant_runs` row the daemon wrote, not from the DM. Channel names come from `conversations.info` and are posted back to the owner only. The instruction text is echoed verbatim to its author. No secret handling is touched.
- helper coverage: covered, level 3, confidence 0.99

### Performance

- assessment and evidence: `!tasks` issues one `TaskChannels` query per listed task (`verbs.go:155`), bounded by the owner's own active and paused tasks; `task.md` specifies `TaskChannels(id)` per row. `conversations.info` is called once per distinct channel for the daemon lifetime on success and retried on failure (`service.go:79-90`); a persistently unknown channel costs one Slack call per `!tasks`, which the test at `verbs_test.go` pins at two calls for two listings. `resultExcerpt` reads the whole `result.md` and converts it to a rune slice before truncating (`verbs.go:230-239`); see ADV-002. `RecentRunsForTask` is `LIMIT 5` with a `WHERE task_id`; `assistant_runs` has no index on `task_id`, and the table is small (one row per agent run), so a scan is acceptable at this stage.
- helper coverage: covered, level 3, confidence 0.96

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go build ./... && go test -count=1 ./internal/assistant ./internal/db && go vet ./internal/assistant ./internal/db`
- result: `ok github.com/MarkTripoli/skills/tools/slack-coordinator/internal/assistant 0.405s`, `ok .../internal/db 0.468s`; build and vet silent. `git status --short --branch` shows a clean tree. Every acceptance row above was traced to the test that proves it and to the handler lines.
- manual, screenshot, or before-and-after evidence: none needed; the surface is text replies in a DM and the tests compare exact reply strings through the router (`verbReply` routes a DM event and captures the single top-level post).

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 State transitions update without a state guard

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `tools/slack-coordinator/internal/db/tasks.go:121-126`, `tools/slack-coordinator/internal/assistant/verbs.go:250-253`
- evidence: `pause`, `resume`, and `cancel` read the row with `GetTask`, check `t.State` in Go, then run `UPDATE tasks SET state = ?, due_at = ?, ended_at = ? WHERE task_id = ?`. Today every writer of `tasks` runs on the `ConsumeInbound` goroutine, so no interleaving exists. The scheduler that later children add will mark `window_end` tasks completed from another goroutine, and this UPDATE would then overwrite a `completed` row with `paused` or `active`.
- suggestion: when that runner lands, add `AND state = ?` (the expected prior state) to `SetTaskState` and treat zero `RowsAffected` as "state changed underneath", re-reading the row for the `t<id> is <state>` reply. Not required for this change.

### ADV-002 `resultExcerpt` reads and rune-converts the whole file to keep 500 runes

- type: Refactor suggestion
- severity: minor
- category: Performance and scalability
- location: `tools/slack-coordinator/internal/assistant/verbs.go:229-242`
- evidence: `os.ReadFile` loads the full `result.md`, then `[]rune(text)` allocates four bytes per rune of the whole file before slicing to 500. A long agent result (tens of KB) allocates several times its size per `!show` run line.
- suggestion: read at most `4*resultExcerptRunes` bytes with `io.LimitReader`, back off to the last complete UTF-8 boundary (`utf8.RuneStart`/`utf8.Valid` suffix check), then count runes on that prefix only.

### ADV-003 A verb error leaves the owner without a reply

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/assistant/verbs.go:73-76`, `196-199`, `273-276`
- evidence: `runVerb` returns the handler error and `ConsumeInbound` only logs it (`router.go:39-41`). New error paths this change adds: an unreadable but present `result.md` aborts the whole `!show` reply; a `schedule` task whose `schedule` JSON does not parse makes `!resume` fail after the owner asked for it. The same pattern already applies to `!status` on a db error, so this is consistent with the existing verbs rather than a regression.
- suggestion: for `!show`, treat a read error like a missing file and append `(result.md unreadable)` to the run line so the rest of the reply still posts; for `!resume`, reply `t<id> has a malformed schedule: <err>` instead of returning the error. Optional; the daemon writes both inputs itself.

### ADV-004 No `.changeset/` entry for a user-visible daemon change

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `.changeset/` (no file added by `0ed59f1`)
- evidence: `AGENTS.md` says user-facing changes add a `.changeset/` entry, and the sibling child `71681a0` (non-owner DM refusal) added one, while the two other verb children on the epic branch (`77c5c5c`, `c1e8543`) did not. This pull request targets the epic branch, not `main`.
- suggestion: add one `minor` changeset for the DM task verbs on this branch, or add a single entry for the whole assistant when the epic branch merges to `main`. Record the choice in the pull request description.

### ADV-005 `ListTasks()` with no states is an untested unused branch

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/db/tasks.go:58-66`
- evidence: every caller passes `db.TaskActive, db.TaskPaused`; the `len(states) == 0` path that lists every task has no caller or test.
- suggestion: keep it if the scheduler will list all tasks; otherwise require at least one state.

## Dead Code and Dependency Review

- newly orphaned code: none. `notAvailableReply` was deleted with its last use; `db.SetTaskDue`, `CountTasksByState`, and `WatchingTasks` keep their callers in `router.go` and `verbs.go`.
- dependency findings: none; no `go.mod` or `go.sum` change.

## Verdict

- decision: approve
- overall code-health change: improves. The five verbs work against real rows through a db layer that mirrors the existing `runs.go` shape, schedule arithmetic is isolated and DST-tested, and the tests read state back from SQLite instead of trusting replies.
- rationale: all five acceptance criteria are proven by tests in the pinned scope; build, task-named tests, and vet pass; no critical or major finding. The advisories are forward-looking (ADV-001), allocation (ADV-002), reply-shape (ADV-003), and process (ADV-004, ADV-005) notes that do not block.

## Review Limits

- blocked or unavailable checks: none. The typed judgment ran once and returned `covered` on all five axes, so no second run was needed. The project-wide `npm test` was not run, per `task.md`.
- residual manual verification: no live Slack run; `conversations.info` behavior is exercised through `fakeSlack` only. The daemon's future scheduler is not in scope, so ADV-001 stays a design note.
