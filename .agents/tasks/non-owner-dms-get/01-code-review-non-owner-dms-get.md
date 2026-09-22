---
type: code-review
date: 2026-09-22
branch: non-owner-dms-get
base_branch: epic-slack-assistant-bot-dms
base_sha: da39e897228eb829509761cb8c5c1027f8751460
head_sha: 71681a00098826cb4afbc8adef77df4c89e383b0
status: clean
summary: "Reviewed commit 71681a0, which makes routeDM refuse a DM from anyone but the owner: the first DM inserts a refused_users row and posts the fixed refusal at the top level of that DM, every later DM from a stored sender is dropped without a post or row, and a failed post is logged at ERROR while the row stays. All three acceptance criteria hold under go test -race ./internal/assistant ./internal/db. No critical or major findings; two advisories about test helpers. Next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `da39e897228eb829509761cb8c5c1027f8751460` (`epic-slack-assistant-bot-dms`, the `base:` in `task.md`; `gh pr view` reports no pull request for this branch)
- reviewed HEAD: `71681a00098826cb4afbc8adef77df4c89e383b0`
- commits: one, `71681a0 feat(slack-coordinator): refuse non-owner DMs once, then stay silent`
- staged and unstaged changes: none (`git status --short --branch` shows only the branch line)
- task-owned untracked files: none before this artifact; `.agents/tasks/non-owner-dms-get/` held only `task.md` and no `index.json` (legacy numbering applies)
- excluded changes: none. The request said to implement before review; the implementation commit already sat at HEAD when this session opened and matches every symbol, statement, and test `task.md` names (see Requirements and Standards), so no product code was written or edited.

Changed files (`git diff --name-status da39e89...71681a0`, 158 insertions, 8 deletions):

```text
A  .changeset/non-owner-dm-refusal.md
M  docs/slack-coordinator.md
M  tools/slack-coordinator/internal/assistant/requests_test.go
M  tools/slack-coordinator/internal/assistant/router.go
M  tools/slack-coordinator/internal/db/db_test.go
A  tools/slack-coordinator/internal/db/refused_users.go
```

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `task.md` (issue #49, oneshot child of `slack-assistant-bot-dms`). Every named shape exists: `routeDM` sends `msg.User != s.Owner` to `refuse` before the `!` check, so top-level and threaded non-owner DMs both reach it (`router.go:93-96`); `refuse` calls `InsertRefusedUser(ctx, msg.User, stamp(s.Now()))`, returns when nothing was inserted, and on an inserted row posts `PostMessage(msg.Channel, "", fmt.Sprintf(refusalText, s.Owner))` with `refusalText = "This assistant only takes instructions from its owner, <@%s>."` (`router.go:18,110-119`); a post error is `slog.Error`ed and `refuse` still returns nil, so nothing rolls the row back (`router.go:115-118`). `InsertRefusedUser(ctx, userID, at string) (bool, error)` lives in the new `internal/db/refused_users.go:11-22` and runs `INSERT OR IGNORE INTO refused_users (user_id, refused_at) VALUES (?, ?)`, reporting `RowsAffected() > 0`. The `refused_users` table already existed in `schema.go:95` (`user_id TEXT PRIMARY KEY, refused_at TEXT NOT NULL`). The named tests are in `requests_test.go:222-268` (two `U2` DMs, then a `U2` DM under a failing fake Slack).
- implementation source: no plan or outline artifact; `task.md` body is the specification. Where it left a choice open (thread replies from a non-owner), the commit refuses them the same way and posts at the top level, which is what `task.md` states for "top level or thread".
- repository instructions: `AGENTS.md` asks for Conventional Commits and a `.changeset/` entry for user-facing changes. `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD` prints `ok: 1 subject`; the subject is 68 characters, the body says why the refusal is posted once and why the row is written before the post, and carries `Refs: #49`. `.changeset/non-owner-dm-refusal.md` is a `minor` entry like the two earlier `slack-coordinator` changesets on the epic branch. `task.md` forbids formatters, linters, and the full `npm test`; none were run.

## Change Profile

- intent and expected behavior: a stranger who DMs the bot is told once who it listens to; the record is written first so a Slack outage cannot cause a second refusal later; every further DM from that sender is acked (in `ConsumeInbound`, `router.go:33-35`) and dropped without a post or a row.
- change description quality: title stands alone; body explains the once-only choice (repeating the refusal would let anyone make the bot spam their DM) and the row-before-post ordering. No pull request yet.
- implementation model and review model: implementation model not recorded in the commit; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 158 insertions, 8 deletions across six files; 104 of the insertions are tests. One behavior with its db helper, doc sentence, and changeset. Under the ~300 mark; no split warranted.
- resulting large-file concerns: none; `router.go` is 123 lines, `requests_test.go` is 289.
- dependency or lockfile changes: none (`go.mod`, `go.sum` untouched; `bytes`, `errors`, `log/slog`, `strings`, `fmt` are standard library).

## Tests Reviewed First

- behavior claimed by tests: `TestNonOwnerDMIsRefusedOnceThenDropped` (`requests_test.go:222-244`) routes a top-level `U2` DM and then a `U2` reply under it one minute later, and asserts exactly one post equal to `slackPost{"D1", "", "This assistant only takes instructions from its owner, <@U1>."}`, a `refused_users` row for `U2`, no `dm_requests` row for the root, no reactions, and no wake. `TestFailedRefusalPostKeepsTheRowAndLogs` (`requests_test.go:246-268`) sets `fakeSlack.postErr`, routes a `U2` DM, asserts the row is present, one attempted post, and a `level=ERROR` log line carrying `slack is down`; it then clears the error, routes a second `U2` DM, and asserts no second post. `TestInsertRefusedUserKeepsTheFirstRow` (`db_test.go:423-443`) asserts the first insert reports `true`, the second `false`, and `refused_at` keeps the first value. `TestRouteDMDropsWhatIsNotARequest` (`requests_test.go:270-289`) drops its former non-owner case because that input now posts; the remaining owner-only cases still assert no post, no row, no wake.
- missing or misleading coverage: `isRefused` (`requests_test.go:95-102`) proves the row by attempting a probe insert, so a missing row becomes a present one at the moment of the check; every caller fails immediately on `false`, so no later assertion in the same test reads the probe row (ADV-001). `captureLog` (`requests_test.go:83-90`) swaps the process-wide `slog` default; no test in the package calls `t.Parallel`, so the swap is sequential today (ADV-002). No test sends a bot or subtyped DM from a non-owner, but `userMessage` drops those before `routeDM` (`router.go:83-85`) and `router_test.go` already covers that filter for the pre-existing paths.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4944` in / `73` out (`judge: model jev-1.13.0, tokens 4944 in / 73 out`; one run, every axis `covered`, so no second run was needed)

### Correctness

- assessment and evidence: criterion 1 holds: the first non-owner DM inserts through `INSERT OR IGNORE` and, only when `RowsAffected() > 0`, posts the fixed text at `threadTS == ""` (`router.go:111-115`, `refused_users.go:12-21`; `requests_test.go:230-232`). Criterion 2 holds: with a row present the insert changes nothing and `refuse` returns nil before any Slack call, and the ack happened in `ConsumeInbound` before routing (`router.go:33-36,112-114`; second DM in `requests_test.go:227,230`). Criterion 3 holds: the post error is logged with `slog.Error` and the function returns nil without touching the row (`router.go:115-118`; `requests_test.go:252-260`). The bot's own refusal post cannot re-enter `refuse`: Slack delivers it with `bot_id` set and `userMessage` drops any `BotID != ""` message (`router.go:83-85`). `s.Owner` cannot be empty at runtime: `config.go:136-137` rejects an owner id that does not start with `U` or `W`, so `<@%s>` always names a user. `INSERT OR IGNORE` on the primary key makes concurrent first DMs from one sender race-safe, and `ConsumeInbound` is one goroutine anyway. `go test -race -count=1 ./internal/assistant ./internal/db` passes.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `routeDM` now has one branch per sender class, and the non-owner path is a named method whose comment states the once-only contract (`router.go:89-119`). `refusalText` is a package constant used once, adjacent to the routing code that formats it (`router.go:16-18`). `refuse` collapses "insert failed" and "nothing inserted" into one early return (`router.go:112-114`), which reads correctly because both cases return `err` and `err` is nil in the second. Test names state the behavior they pin. No dead code, no pass-through wrappers.
- helper coverage: covered, level 3, confidence 0.98

### Architecture

- assessment and evidence: the db package gains one file per table like `dm_requests.go` and `assistant_runs.go`, wrapping errors with the same `fmt.Errorf("...: %w")` shape (`refused_users.go:15,19`). The assistant package owns the Slack-facing decision and the message text; the db package owns persistence and reports the inserted flag rather than leaking `sql.Result`. The fake Slack's `postErr` is recorded after the attempt so tests can count attempts (`requests_test.go:33-37`), matching how the fake already records reactions. No new dependency between packages.
- helper coverage: covered, level 3, confidence 0.98

### Security

- assessment and evidence: the refusal is the only outbound effect a stranger can trigger, and it fires at most once per sender for the life of the database, which is the commit's stated reason (a repeating refusal would let anyone make the bot post on demand). The sender's `msg.User` and `msg.Channel` reach only a parameterized SQL statement and the `slog` record; the posted text interpolates `s.Owner`, a validated configuration value, never the sender's text (`router.go:115`, `refused_users.go:12-13`). Non-owner input still never reaches `newRequest`, `followUp`, or the verb handlers (`router.go:94-96`).
- helper coverage: covered, level 3, confidence 0.98

### Performance

- assessment and evidence: one `INSERT OR IGNORE` per non-owner DM against a primary key, no read-before-write, and at most one Slack call per sender ever. The dropped path performs no Slack call and allocates nothing beyond the timestamp string (`router.go:111-114`). No loops, no unbounded queries.
- helper coverage: covered, level 3, confidence 0.98

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go test -count=1 ./internal/assistant ./internal/db`; `go test -race -count=1 ./internal/assistant ./internal/db`; `go test -count=1 -run 'NonOwner|FailedRefusal|InsertRefusedUser|RouteDMDrops' -v ./internal/assistant ./internal/db`; `go vet ./internal/assistant ./internal/db`; `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD`; read of `router.go`, `refused_users.go`, `schema.go:95`, `config.go:136-137`, `daemon.go:165`, and the full diff.
- result: `ok internal/assistant 0.260s`, `ok internal/db 0.401s`; race run `ok 1.791s` and `ok 1.520s`; the four named tests print `--- PASS`; `go vet` prints nothing; `ok: 1 subject`.
- manual, screenshot, or before-and-after evidence: none; the change has no interface beyond the Slack post text, which the test asserts byte for byte.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Test probe writes the row it checks for

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/assistant/requests_test.go:95-102`
- evidence: `isRefused` calls `InsertRefusedUser(ctx, userID, "probe")` and returns `!inserted`, so when the row is absent the probe creates it with `refused_at = "probe"`. Every current caller `t.Fatal`s on `false`, so no assertion after the probe observes the created row.
- suggestion: when the db package grows a read helper for `refused_users`, switch the probe to it; until then a caller that continues after a `false` result must not exist.

### ADV-002 Log capture swaps the global default logger

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/assistant/requests_test.go:83-90`
- evidence: `captureLog` calls `slog.SetDefault` and restores it in `t.Cleanup`. `router.go:116` logs through the package default, so this is the only way to observe the record; no test in the package calls `t.Parallel` (grep of `internal/assistant` for `t.Parallel` returns nothing).
- suggestion: keep the package sequential, or give `Service` a `Log *slog.Logger` if a later child needs parallel tests.

## Dead Code and Dependency Review

- newly orphaned code: none. The non-owner case removed from `TestRouteDMDropsWhatIsNotARequest` is replaced by the two new tests; `refusalText`, `refuse`, `InsertRefusedUser`, `fakeSlack.postErr`, `captureLog`, and `isRefused` each have callers.
- dependency findings: none; no module or lockfile change.

## Verdict

- decision: approve
- overall code-health change: positive. A non-owner DM path that silently dropped input now records and answers once, with the record written before the network call, and the behavior is pinned by tests for the once-only, dropped, and failed-post cases.
- rationale: all three acceptance criteria are proven by tests that pass under `-race`; the code follows the existing per-table db file pattern and the router's one-method-per-sender-class shape; the commit, changeset, and doc sentence are in place; the two advisories concern test helpers only.

## Review Limits

- blocked or unavailable checks: none. `typed-judgment/judge.mjs axis-coverage` answered on the first run with every axis `covered`. Formatters, linters, and the full `npm test` were skipped as `task.md` requires.
- residual manual verification: none. A live Slack workspace was not used; `slackapi.Client.PostMessage` is exercised only by its own package.
