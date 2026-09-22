---
task: i-want-new-skill
type: structure-outline
summary: "Nine phases build a Go daemon and CLI at tools/slack-coordinator/ that mirrors the Safety Dance shapes (singleton lock, Unix-socket JSON-RPC, modernc SQLite, injectable service executor), then add the slack-coordinator skill. Phase 1 posts one root message per run from a channel ID; later phases add AGENTS.md channel selection, status and completion posts, the fail-closed run check, owner steering, per-run break-glass, launchd/systemd supervision, the Jira backlink, and the skill with its validation wiring. The plan phase needs the CLI verbs, IPC method names, SQLite tables, and exit codes fixed here."
repo: MarkTripoli/skills
branch: i-want-new-skill
sha: a11d37fe2f583ea41f3ce741a7acf68033601692
---

# Slack Agent Work Communication Outline

The daemon and CLI live in one new Go module, `tools/slack-coordinator/`, copied in shape from `tools/safety-dance/` (Cobra root at `internal/cli/root.go:62-69`, lock at `internal/daemon/daemon.go:20-43`, JSON-RPC socket at `internal/ipc/server.go:152-232`, SQLite open at `internal/db/db.go:27-52`, service generation at `internal/daemon/service.go:73-91`). Go packages are `internal/` to their module, so the shapes are copied, not imported. Agents use the CLI; the skill in Phase 9 tells them when.

## Desired End State

- `slack-coordinator run start` creates exactly one thread per Slack-enabled run in the override or root `AGENTS.md` channel; `run event` and a one-hour quiet timer post status; `run finish` posts completion. Every message renders the PRD's fixed fields with `None` for empty values.
- `run check` exits `0` (`ready`), `10` (`owner_input`), `11` (`unavailable`), or `12` (`slack_disabled`); owner thread replies become pending input; `run disable-slack` flips one run after a typed `yes`.
- One daemon per OS user owns one Socket Mode connection and `~/.slack-coordinator/state.sqlite`; `service install` supervises it through launchd or systemd.
- A Jira-linked run writes its thread permalink to the configured custom field; failure stays pending and never changes `run check`.
- `npm test` runs the Go tests; `node scripts/validate.mjs` and `sync-plugin --check` pass with the new `slack-coordinator` skill.

## Phase Checklist

- [ ] Phase 1: Daemon skeleton posts one root message per run
- [ ] Phase 2: Channel selection from run override or root AGENTS.md
- [ ] Phase 3: Status and completion messages
- [ ] Phase 4: Run check fails closed
- [ ] Phase 5: Owner replies gate the next state-changing action
- [ ] Phase 6: Per-run break-glass
- [ ] Phase 7: launchd and systemd supervision
- [ ] Phase 8: Jira thread backlink
- [ ] Phase 9: slack-coordinator skill and repository wiring

---

## Phase 1: Daemon skeleton posts one root message per run

The walking skeleton: a configured daemon accepts `run start --channel <ID>` over the local socket, posts the root message, and persists the run/thread mapping. Nothing reads `AGENTS.md` yet; nothing inbound exists yet.

### Change Outline

```diff
 tools/
+├── slack-coordinator/
+│   ├── go.mod                              ~ module github.com/MarkTripoli/skills/tools/slack-coordinator; modernc.org/sqlite, spf13/cobra, slack-go/slack, oklog/ulid, gopkg.in/yaml.v3
+│   ├── Makefile                            ~ test, test-race, lint (go vet), e2e
+│   ├── slack-app-manifest.yaml             ~ bot scopes chat:write channels:history channels:read groups:history groups:read users:read; events message.channels message.groups; app token connections:write
+│   ├── cmd/slack-coordinator/main.go
+│   └── internal/
+│       ├── paths/          ~ SLACK_COORDINATOR_HOME, default ~/.slack-coordinator; state.sqlite, socket, daemon.lock, daemon.pid, config.yaml
+│       ├── config/         ~ config.yaml 0600: slack.bot_token, slack.app_token, slack.owner_user_id; setup reads SLACK_BOT_TOKEN/SLACK_APP_TOKEN once, never a repo .env
+│       ├── daemon/         ~ AcquireOwnership flock (copy of safety-dance daemon.go:20-43)
+│       ├── ipc/            ~ newline JSON-RPC over Unix socket, peer PID check (copy of safety-dance ipc/)
+│       ├── db/             ~ Open with WAL/foreign_keys/busy_timeout, schema.go, runs.go
+│       ├── slack/          ~ Web API adapter: auth.test, apps.connections.open probe, chat.postMessage, chat.getPermalink
+│       ├── coordinator/    ~ StartRun use case + messages.go fixed-field renderer
+│       └── cli/            ~ root, setup, daemon {start,stop,status,serve}, run start
 package.json                                 ~ add test:slack-coordinator; chain it in test after test:safety-dance
```

`setup` stores tokens and the default owner, then proves the app can open Socket Mode (`apps.connections.open`) before writing `config.yaml`. `daemon serve` acquires the lock, opens SQLite, binds the socket. The `runs` table is the only table in this phase:

```sql
CREATE TABLE runs (
  run_id            TEXT PRIMARY KEY,
  owner_user_id     TEXT NOT NULL,
  channel_id        TEXT NOT NULL,
  thread_ts         TEXT NOT NULL,
  permalink         TEXT NOT NULL,
  lifecycle         TEXT NOT NULL CHECK (lifecycle IN ('active','completed','failed','cancelled')),
  slack_mode        TEXT NOT NULL CHECK (slack_mode IN ('enabled','slack_disabled')) DEFAULT 'enabled',
  started_at        TEXT NOT NULL,
  finished_at       TEXT
);
```

CLI and IPC contract for this phase (later phases add verbs, never change these):

```text
slack-coordinator setup [--owner <U…>]                 # env SLACK_BOT_TOKEN, SLACK_APP_TOKEN read here only
slack-coordinator daemon start|stop|status
slack-coordinator run start --channel <C…> --work <s> --goal <s> --scope <s> [--link <url>]... [--owner <U…>] [--run-id <id>]
   → stdout JSON {"run_id","channel_id","thread_ts","permalink"}; run_id defaults to a ULID

IPC method run.start  params StartRunInput (TDD Type Definitions) → SlackRunRef
IPC method daemon.health → {"socket_mode":"not_started"}
```

`messages.go` renders the root message as `*Work:*`, `*Goal:*`, `*Scope:*`, `*Owner:*` (`<@U…>`), `*Links:*`, `*Started at:*` lines; an empty value renders `None`. The renderer takes typed structs, so an agent cannot post free text.

Tests: `db` open and `runs` round trip in `t.TempDir()`; `coordinator` renderer golden cases including all-empty input; `slack` adapter against `httptest.NewServer` with `slack.OptionAPIURL`; `cli` `run start` end to end against a fake Slack server and an in-process daemon on a temp socket (pattern: safety-dance `admission_test.go:180-196`). Tests set `SLACK_COORDINATOR_HOME` to a temp dir.

### Validation

#### Automated Verification

- [ ] `cd tools/slack-coordinator && go vet ./... && go test -race ./...`
- [ ] `cd tools/slack-coordinator && go build -o /tmp/slack-coordinator ./cmd/slack-coordinator && /tmp/slack-coordinator --help`
- [ ] `npm run test:slack-coordinator`

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- One live `setup` + `run start` against a test workspace produces one root message with the six fields; record the command, permalink, and screenshot path in `.agents/tasks/i-want-new-skill/evidence/phase-1-root-message.md`.

---

## Phase 2: Channel selection from run override or root AGENTS.md

`run start` without `--channel` reads exactly one `Slack default channel: <#name-or-ID>` line from the repository root `AGENTS.md`; with `--channel` it uses the override. Both forms resolve to an invited, non-archived public or private channel before the thread exists.

### Change Outline

```diff
 tools/slack-coordinator/internal/
+├── channel/
+│   ├── directive.go      ~ ParseDefault(agentsMD []byte) (ref, error): exactly one standalone case-sensitive line; zero or two+ → error
+│   ├── reference.go      ~ ParseRef(s) → {Name|ID}; accepts "#name", "name", "C…"/"G…"
+│   └── resolve.go        ~ Resolve(ref) → channelID via conversations.info (ID) or conversations.list paged by name; rejects is_archived, !is_member
 ├── slack/                ~ conversations.info, conversations.list
 └── cli/run_start.go      ~ --channel optional; --repo <path> default git toplevel of cwd; resolve before run.start
```

Decision order in the CLI, executed once per `run start`:

```text
ref := --channel if given
     else channel.ParseDefault(<repo>/AGENTS.md)      # error: missing or duplicate directive
id  := channel.Resolve(ref)                           # error: unknown, archived, or not invited
run.start(channelId = id)                             # daemon stores the ID only
```

Ambiguity in the person's natural-language request is the agent's judgment, documented in Phase 9's skill; the CLI accepts one `--channel` and rejects repeats. Errors exit `2` with one line naming the cause.

Tests: `directive` table (one line, none, two, indented, lowercase variant rejected); `reference` forms; `resolve` against the fake server for archived and not-a-member; `cli` default path with a temp repo containing `AGENTS.md`.

### Validation

#### Automated Verification

- [ ] `cd tools/slack-coordinator && go test -race ./internal/channel/... ./internal/cli/...`
- [ ] `cd tools/slack-coordinator && go vet ./...`

human-gated: false

---

## Phase 3: Status and completion messages

Active runs post status on `run event`, or after one quiet hour, and post one completion message on `run finish`. Lifecycle becomes terminal.

### Change Outline

```diff
 tools/slack-coordinator/internal/
 ├── db/
+│   ├── schema.go         ~ runs += next_status_due TEXT, last_status JSON TEXT
+│   └── status.go
 ├── coordinator/
+│   ├── record_event.go   ~ RecordWorkEvent: persist last_status, post status, reset next_status_due = now+1h
+│   ├── finish_run.go     ~ FinishRun: post completion, set lifecycle, clear next_status_due
+│   ├── scheduler.go      ~ StatusScheduler: ticker scans runs where next_status_due <= now and lifecycle='active'; reposts last_status; interval from `daemon serve --status-interval` (default 1h)
+│   └── messages.go       ~ + status and completion renderers
 └── cli/
+    ├── run_event.go
+    └── run_finish.go
```

```text
slack-coordinator run event  --run-id <id> --current <s> [--completed <s>]... [--decision <s>]... [--blocker <s>]... [--next <s>]...
slack-coordinator run finish --run-id <id> --outcome completed|failed|cancelled [--completed <s>]... [--decision <s>]... [--unresolved <s>]... [--evidence <s>]... [--link <url>]...

IPC run.event  params WorkEvent      → {}
IPC run.finish params FinishRunInput → {}
```

Status fields: `Current work`, `Completed since last update`, `Decisions`, `Blockers`, `Up next`. Completion fields: `Outcome`, `Completed work`, `Decisions`, `Unresolved items`, `Evidence`, `Links`, `Finished at`. The quiet-hour post repeats the last recorded fields; the caller decides when a phase or blocker change warrants `run event`. `run event` or `run finish` on a terminal run exits `2`.

Tests: scheduler with an injected clock posts once when due and not before; `finish` on an already finished run is rejected; renderer goldens for both messages.

### Validation

#### Automated Verification

- [ ] `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/db/... ./internal/cli/...`

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- One live run with `event`, a shortened quiet interval (`--status-interval 2m` on `daemon serve`, test-only flag), and `finish`; record permalinks in `.agents/tasks/i-want-new-skill/evidence/phase-3-lifecycle.md`.

---

## Phase 4: Run check fails closed

`run check` answers `ready` or `unavailable`. The daemon now holds the Socket Mode connection and reports its health; a failed required post marks the run unavailable until a retry succeeds. No inbound events are handled yet.

### Change Outline

```diff
 tools/slack-coordinator/internal/
 ├── slack/
+│   └── socketmode.go     ~ one socketmode.Client; Health() connected|disconnected; events channel exposed for Phase 5
 ├── db/schema.go          ~ runs += last_delivery_error TEXT
 ├── coordinator/
+│   ├── check.go          ~ CheckBeforeWrite(runId) → WriteGate
+│   └── delivery.go       ~ post wrapper: on failure store last_delivery_error; scheduler retries every 30s and clears it
 └── cli/run_check.go
```

```text
slack-coordinator run check --run-id <id>
   stdout JSON {"kind":"ready"} | {"kind":"unavailable","reason":"..."}
   exit 0 ready · 11 unavailable (daemon unreachable, socket_mode != connected, or last_delivery_error set)

IPC run.check → WriteGate
IPC daemon.health → {"socket_mode":"connected|disconnected"}
```

The CLI itself returns `unavailable` with exit `11` when the socket does not answer within the dial timeout, so an agent never needs the daemon to be up to learn it must pause. `run start`, `run event`, and `run finish` fail fast with exit `11` for the same reasons.

Tests: fake Slack server returning 500 on `chat.postMessage` sets `last_delivery_error` and `run check` exits `11`; server recovery clears it after the retry tick; CLI against no daemon exits `11`; socket health `disconnected` exits `11`.

### Validation

#### Automated Verification

- [ ] `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/cli/...`
- [ ] `cd tools/slack-coordinator && go build -o /tmp/slack-coordinator ./cmd/slack-coordinator && /tmp/slack-coordinator run check --run-id none; test $? -eq 11` (with no daemon running)

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- Live daemon shows `daemon status` `socket_mode: connected`; disabling network yields `run check` exit `11`; record in `.agents/tasks/i-want-new-skill/evidence/phase-4-fail-closed.md`.

---

## Phase 5: Owner replies gate the next state-changing action

Thread replies from the run owner become pending input. `run check` returns `owner_input` until the agent resolves it, and the resolution posts the acknowledgement into the thread.

### Change Outline

```diff
 tools/slack-coordinator/internal/
 ├── db/
+│   ├── schema.go         ~ + owner_inputs
+│   └── owner_inputs.go
 ├── coordinator/
+│   ├── inbound.go        ~ consume socketmode events: message with thread_ts of an active run AND user == owner → insert; others ignored; ack every envelope
+│   ├── check.go          ~ owner_input when any unhandled row exists (oldest first)
+│   └── resolve.go        ~ ResolveOwnerInput: post reply, set handled_at
 └── cli/run_resolve.go
```

```sql
CREATE TABLE owner_inputs (
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  message_ts  TEXT NOT NULL,
  text        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  handled_at  TEXT,
  outcome     TEXT CHECK (outcome IN ('applied','rejected','answered')),
  PRIMARY KEY (run_id, message_ts)
);
```

```text
slack-coordinator run check   --run-id <id>  → {"kind":"owner_input","input":{"message_ts","text"}} exit 10
slack-coordinator run resolve --run-id <id> --message-ts <ts> --outcome applied|rejected|answered --reply <s>

IPC run.resolve params OwnerInputResolution → {}
```

The primary key makes a redelivered Socket Mode envelope a no-op. Bot messages, non-owner users, and replies outside an active run's thread are dropped without a row.

Tests: injected event stream: owner reply inserts one row, duplicate ts inserts none, non-owner inserts none; `run check` returns `owner_input` then `ready` after `run resolve`; `resolve` posts one reply with the given text.

### Validation

#### Automated Verification

- [ ] `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/db/... ./internal/cli/...`

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- Live owner reply → `run check` exit `10` → `run resolve` → thread shows the acknowledgement → `run check` exit `0`; a second Slack user's reply does not change the exit code. Record in `.agents/tasks/i-want-new-skill/evidence/phase-5-steering.md`.

---

## Phase 6: Per-run break-glass

A local operator disables Slack for one run after a typed confirmation; that run's `run check` returns `slack_disabled` and other runs are untouched.

### Change Outline

```diff
 tools/slack-coordinator/internal/
 ├── coordinator/
+│   └── disable.go        ~ DisableSlackForRun: set slack_mode='slack_disabled' in one transaction; keeps channel_id/thread_ts
 ├── coordinator/check.go  ~ slack_disabled short-circuits before health and owner-input checks
 └── cli/run_disable_slack.go
```

```text
slack-coordinator run disable-slack --run-id <id>
   prints: run, channel, thread permalink, and "Slack gating stops for this run only. Type yes to continue:"
   reads one line from stdin (pattern: safety-dance wizard/setup.go:28-34); anything but yes exits 1 without change
   exit 0 → run check now exits 12 {"kind":"slack_disabled"}
```

Tests: `yes` flips only the targeted row in a two-run database; `no` and EOF leave `slack_mode='enabled'`; `run check` exits `12` for the disabled run and `0` for the sibling; `run event` on a disabled run is a no-op exit `0` (no post).

### Validation

#### Automated Verification

- [ ] `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/cli/...`

human-gated: false

---

## Phase 7: launchd and systemd supervision

`service install` writes and activates a per-user launchd agent or systemd user unit that starts the daemon at login and restarts it after exit; `setup` offers the install after the Socket Mode probe succeeds.

### Change Outline

```diff
 tools/slack-coordinator/internal/
 ├── daemon/
+│   ├── service.go        ~ Service{Home, Binary, Executor}; Definition() by runtime.GOOS (copy of safety-dance service.go:73-133); ownership marker SLACK_COORDINATOR_MANAGED
+│   └── service_test.go   ~ recordingExecutor (copy of service_test.go:25-34)
 └── cli/
+    ├── service.go        ~ service install|uninstall|status
     └── setup.go          ~ after token probe: "install service (yes/no):" → Service.Install
```

```text
darwin: <home>/slack-coordinator.plist   KeepAlive, RunAtLoad, EnvironmentVariables SLACK_COORDINATOR_HOME; launchctl load -w / unload
linux:  ~/.config/systemd/user/slack-coordinator.service   Restart=on-failure, WantedBy=default.target; systemctl --user enable --now / disable --now
other:  exit 2 "unsupported platform"
```

Tests: definitions bind the home path and binary for both platforms; the injected executor records the exact activation and removal commands; a foreign file at the definition path without the marker is refused.

### Validation

#### Automated Verification

- [ ] `cd tools/slack-coordinator && go test -race ./internal/daemon/... ./internal/cli/...`
- [ ] `GOOS=linux go build ./... && GOOS=darwin go build ./...` (run in `tools/slack-coordinator`)

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- On macOS: `service install`, `kill -9 <daemon pid>`, `daemon status` reports a new PID within the launchd restart window. Linux equivalent on a systemd host when available. Record in `.agents/tasks/i-want-new-skill/evidence/phase-7-supervision.md`.

---

## Phase 8: Jira thread backlink

A run started with `--jira-issue <KEY>` writes its thread permalink to the configured custom field; failures stay pending for retry and never affect `run check`.

### Change Outline

```diff
 tools/slack-coordinator/internal/
 ├── config/               ~ jira.base_url, jira.email, jira.api_token, jira.field_id (customfield_NNNNN); all-or-none
 ├── db/
+│   ├── schema.go         ~ + jira_backlinks(run_id PK, issue_key, thread_url, state pending|delivered, last_error, attempts)
+│   └── jira_backlinks.go
 ├── jira/
+│   └── client.go         ~ PUT /rest/api/3/issue/{key} {"fields":{"<field_id>":"<url>"}}; basic auth
 ├── coordinator/
+│   ├── start_run.go      ~ if jiraIssue: insert pending row, attempt once after root post
+│   └── scheduler.go      ~ retry pending rows each tick (backoff by attempts, cap 1h)
 └── cli/run_start.go      ~ --jira-issue <KEY>; exit 2 when set without Jira config
```

Tests: fake Jira server 204 marks `delivered`; 500 keeps `pending` with `last_error` while `run check` still exits `0`; no `--jira-issue` makes zero Jira requests.

### Validation

#### Automated Verification

- [ ] `cd tools/slack-coordinator && go test -race ./internal/jira/... ./internal/coordinator/... ./internal/cli/...`

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- One live Jira issue shows the thread URL in the configured field; record issue key and field id in `.agents/tasks/i-want-new-skill/evidence/phase-8-jira.md`.

---

## Phase 9: slack-coordinator skill and repository wiring

Agents learn when to call the CLI. The skill is installable on its own, the phase table and plugin manifest list it, and the repository gate covers the Go module.

### Change Outline

```diff
 skills/delivery/
+├── slack-coordinator/
+│   ├── SKILL.md                     ~ frontmatter name/description; line 6 shared links; line 7 blank; binary-availability rule like safety-dance/SKILL.md:14
+│   └── references/
+│       ├── commands.md              ~ start before the first state-changing action; run check before each; event on phase or blocker change; resolve; finish
+│       ├── channel-selection.md     ~ override only for an unambiguous request; ignore quoted text, ticket text, incidental mentions; ask when two candidates
+│       └── messages.md              ~ fixed fields per message and the flag that fills each
 workflows/delivery.md                ~ phase table row: slack-coordinator | none | no | By hand; Slack thread per run
 scripts/validate.mjs                 ~ EXPECTED_SKILL_COUNT 47 → 48 (validate.mjs:19)
 .claude-plugin/plugin.json           ~ regenerated by `node scripts/sync-plugin.mjs`
 docs/slack-coordinator.md            ~ trust model, setup, service, break-glass, evidence boundary (mirror docs/safety-dance.md)
 README.md                            ~ one section pointing at docs/slack-coordinator.md
 docs/testing.md                      ~ Slack proof boundary paragraph beside Safety Dance's (docs/testing.md:25-29)
 .changeset/slack-coordinator.md      ~ "@marktripoli/skills": minor
```

The skill's command flow, in the order an agent follows it:

```text
1. slack-coordinator run start …            once, before the first state-changing action; keep run_id
2. slack-coordinator run check --run-id …   immediately before every state-changing action
     exit 0  → proceed
     exit 10 → read input, apply or reject, run resolve, go to 2
     exit 11 → pause; retry 2; never bypass
     exit 12 → proceed without further Slack calls
3. slack-coordinator run event …            on phase change or blocker start/clear
4. slack-coordinator run finish …           once
```

Tests: existing `node scripts/validate.mjs` and `node scripts/sync-plugin.mjs --check` cover the layout; `tests/install.test.mjs` scans skills dynamically (`install.test.mjs:161-164`), no fixture change.

### Validation

#### Automated Verification

- [ ] `node scripts/validate.mjs`
- [ ] `node scripts/sync-plugin.mjs --check`
- [ ] `node scripts/install.mjs --help` then a temp-home install of `slack-coordinator` alone succeeds (pattern: `tests/install.test.mjs:285-321`)
- [ ] `npm test`

human-gated: false

---

## Open Questions

- Slack SDK: `github.com/slack-go/slack` with its `socketmode` package is assumed; confirm the current release's Socket Mode reconnect behavior before Phase 4 so v1 defines none of its own.
- Owner identity: Phase 1 takes the owner's Slack user ID from `setup --owner` or `run start --owner`. Resolving it from email would need `users:read.email`, which the manifest omits.

## Human Review

### Review targets

- Phase 1 as walking skeleton (lock, socket, SQLite, one post) versus splitting transport from posting.
- Phase 4 before Phase 5: gate semantics land before inbound events.
- Phase 9 last: the skill documents verbs that already exist and pass tests.
- CLI exit codes `0/10/11/12` and IPC method names as the contract the plan phase must keep.

### Verify

- [ ] Confirm `tools/slack-coordinator/` as a separate Go module that copies Safety Dance shapes rather than sharing packages.
- [ ] Confirm the `runs`, `owner_inputs`, and `jira_backlinks` tables and no others.
- [ ] Confirm Phase 1 accepts only `--channel <ID>` and Phase 2 adds the `AGENTS.md` default and `#name` resolution.
- [ ] Confirm `run check` exit codes `0` ready, `10` owner_input, `11` unavailable, `12` slack_disabled, with `11` also returned when no daemon answers.
- [ ] Confirm break-glass reads a typed `yes` on stdin and changes one row.
- [ ] Confirm live Slack, launchd/systemd restart, and Jira proof are recorded under `.agents/tasks/i-want-new-skill/evidence/` and never gate a phase.
- [ ] Confirm `npm test` gains `test:slack-coordinator` in Phase 1 and the skill count bump in Phase 9.

### Known limits

- Socket Mode inbound handling is unit-tested with injected events; a live WebSocket is proven only by the recorded Phase 5 trial.
- `run check` is a coordination gate, not a transaction around the external side effect (TDD Known Limits).
- Windows builds exit `2` on `service install`; no Windows supervision.
