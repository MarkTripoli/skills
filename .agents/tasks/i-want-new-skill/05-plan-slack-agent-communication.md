---
task: i-want-new-skill
type: plan
summary: "Nine phases build `tools/slack-coordinator/`, a Go module whose daemon owns one Slack Socket Mode connection and `~/.slack-coordinator/state.sqlite`, and whose CLI gives agents `run start|event|check|resolve|finish|disable-slack`. Each phase names its files, Go signatures, SQL, IPC methods, and `go test` commands; the exit-code contract is `0` ready, `1` refused confirmation, `2` usage or config, `10` owner_input, `11` unavailable, `12` slack_disabled. Phase 9 adds the `slack-coordinator` skill, bumps `EXPECTED_SKILL_COUNT` to 48, and wires docs. Implementation copies Safety Dance shapes (`internal/daemon`, `internal/ipc`, `internal/db`) into the new module because Go `internal/` packages cannot be imported across modules."
repo: MarkTripoli/skills
branch: i-want-new-skill
sha: 5465bb8cce2f5e690e39b3fc255f638f0fb245ee
---

# Slack Agent Work Communication Implementation Plan

## Overview

Agents post one Slack thread per run (root, status, completion) through a per-user daemon, pause before state-changing work when the run owner has replied in that thread or when Slack coordination is unavailable, and continue without Slack only after a typed per-run break-glass. The daemon and CLI are one Go module at `tools/slack-coordinator/`; the `slack-coordinator` skill tells agents when to call each verb. This plan expands [04-structure-outline-slack-agent-communication.md](04-structure-outline-slack-agent-communication.md); the contracts come from [03-tdd-slack-agent-communication.md](03-tdd-slack-agent-communication.md).

## Current State Analysis

No Slack code exists in the repository. `tools/safety-dance/` is the only Go module and supplies every daemon shape this plan copies.

### Key Discoveries:

- Singleton lock: `AcquireOwnership` opens `daemon.lock`, takes an exclusive `flock`, writes the PID (`tools/safety-dance/internal/daemon/daemon.go:20-43`); platform lock calls live in `lock_unix.go` and `lock_windows.go` in the same package.
- IPC: newline-delimited JSON-RPC 2.0 over a Unix socket. `Request`/`Response`/`RPCError` and error codes at `internal/ipc/protocol.go:35-66`; server accept loop and per-connection dispatch at `internal/ipc/server.go:66-131,152-232`; the listener refuses a path with a live listener and unlinks only a stale one (`transport_unix.go:21-31`); the client dials with a bounded timeout and reads with a deadline (`client.go:116-183`). Peer PID is bound into the handler context (`peer.go`, `server.go:161`).
- SQLite: `db.Open` uses `modernc.org/sqlite` with `journal_mode(wal)`, `foreign_keys(on)`, `busy_timeout(5000)`, `SetMaxOpenConns(1)`, runs `schemaSQL`, then idempotent `ALTER TABLE ADD COLUMN` migrations that tolerate `duplicate column name`, then chmods `state.sqlite`, `-wal`, `-shm` to `0600` (`internal/db/db.go:27-81`).
- Paths: `paths.New()` refuses the default root under `go test` unless the home env var is set (`internal/paths/paths.go:19-28`); accessor methods per file (`paths.go:35-57`).
- Service: `Service{Home, Binary, Executor}` renders a launchd plist or systemd unit with an ownership marker and refuses foreign files (`internal/daemon/service.go:25-29,73-133`); tests use `recordingExecutor` (`service_test.go:25-34`).
- CLI: Cobra root with `SilenceUsage`/`SilenceErrors`; `ExitCodeError{Code, Err}` maps to the process exit code, pflag errors to `2` (`internal/cli/root.go:23-69`). `callDaemon` dials `p.Socket()` and wraps failure as `daemon unavailable` (`runtime.go:32-43`). `daemon start` re-executes the binary as `daemon serve`, writes `daemon.pid`, polls health for 5 s (`daemon.go:98-157`). `gitRoot()` shells `git rev-parse --show-toplevel` (`runtime.go:45-51`).
- In-process daemon test: `ipc.NewServer()`, `server.Listen(socket)`, `go server.ServeReady()`, `ipc.Dial(socket)`, with the socket under `/tmp` to stay inside the macOS 104-byte `sun_path` limit (`internal/daemon/admission_test.go:176-200`).
- stdin confirmation: `readAnswer(*bufio.Reader)` trims one line and treats EOF with no text as an error (`internal/wizard/setup.go:28-34`).
- Repository gate: `package.json:20-21` chains `test:safety-dance` after the Node tests; `scripts/validate.mjs:19` pins `EXPECTED_SKILL_COUNT = 47`, `validate.mjs:324-331` requires every `references/<file>` a `SKILL.md` names to exist, and `validate.mjs:519-522` requires `workflows/delivery.md` to mention every `skills/delivery/*` skill not in `STANDALONE_SKILLS`. The phase table row shape is `| safety-dance | none | no | By hand |` (`workflows/delivery.md:182`). `.changeset/safety-dance.md` shows the changeset shape. `scripts/check-safety-dance-identity.mjs:17` scans `scripts`, `tests`, `workflows`, `docs`, `README.md`, and `package.json`, so new docs must not contain the retired product identity.
- Slack SDK: `github.com/slack-go/slack` latest release is `v0.29.0` (2026-08-15). It provides `slack.New(botToken, slack.OptionAppLevelToken(appToken))`, `slack.OptionAPIURL`, `StartSocketModeContext` (`apps.connections.open`), `PostMessageContext`, `GetPermalinkContext`, `GetConversationInfoContext`, `GetConversationsContext`, and `socketmode.New(api)` whose `RunContext` reconnects on its own and exposes `Events <-chan socketmode.Event` plus `Ack(req)`. v1 defines no reconnect logic of its own (TDD line 79).

## Desired End State

- `slack-coordinator run start` creates one thread per Slack-enabled run in the `--channel` override or the single root `AGENTS.md` `Slack default channel:` directive; `run event` and a quiet-interval scheduler post status; `run finish` posts completion. Every message renders the fixed fields; empty values render `None`.
- `run check` exits `0` ready, `10` owner_input, `11` unavailable, `12` slack_disabled. `11` is also returned when no daemon answers. `run start`, `run event`, `run finish` exit `11` for the same reasons.
- One daemon per OS user owns one Socket Mode connection and `$SLACK_COORDINATOR_HOME/state.sqlite` (default `~/.slack-coordinator`); `service install` supervises it with launchd or systemd.
- A `--jira-issue` run writes its permalink to the configured custom field; failures stay `pending` and never change `run check`.
- `npm test` runs `test:slack-coordinator`; `node scripts/validate.mjs` and `node scripts/sync-plugin.mjs --check` pass with 48 skills.

Verification: each phase's `go test -race` commands plus the Phase 9 repository commands. Live Slack, launchd/systemd restart, and Jira proof are recorded under `.agents/tasks/i-want-new-skill/evidence/` and gate nothing.

## What We're NOT Doing

- Chat systems other than Slack; DMs; non-owner steering; Slack MCP integration.
- Multiple daemons per Slack app, socket handoff, custom ACK or replay protocols, generation-fenced permits.
- Browser OAuth or app provisioning; the manifest is shipped for the person to paste.
- Workspace channel defaults, mapping tables, channel caches.
- Jira operations beyond one custom-field write; GitHub Issues or Linear backlinks.
- Windows service, Windows build, or Windows tests. The module is built and tested on darwin and linux.
- Sharing Go packages with `tools/safety-dance/`; its `internal/` packages are copied by shape only.

## Execution Strategy

Phases run in outline order. Phase 1 is the walking skeleton (lock, socket, SQLite, one post); Phases 2 and 3 extend outbound behavior; Phase 4 lands the gate semantics and Socket Mode health before Phase 5 consumes inbound events; Phases 6 to 8 are independent of each other after Phase 5 and could run in parallel by separate sessions, with Phase 6 touching `check.go` that Phase 5 last edited; Phase 9 documents verbs that already pass tests.

Contracts fixed for every phase:

```text
exit codes    0 ok/ready · 1 confirmation refused · 2 usage/config/repo error · 10 owner_input · 11 unavailable · 12 slack_disabled
IPC methods   run.start run.event run.check run.resolve run.finish run.disable_slack daemon.health daemon.shutdown
tables        runs owner_inputs jira_backlinks
home          SLACK_COORDINATOR_HOME, default ~/.slack-coordinator: config.yaml state.sqlite socket daemon.lock daemon.pid daemon.log
```

`daemon.shutdown` and `run.disable_slack` are IPC methods the outline did not list; `daemon stop` and `run disable-slack` need them because only the daemon writes SQLite (TDD line 134).

Tests set `SLACK_COORDINATOR_HOME` to a short directory under `/tmp` (`os.MkdirTemp("/tmp", "sc-")` with `t.Cleanup`) so the Unix socket path fits. Fake Slack is an `httptest.Server` handed to the daemon through the optional config key `slack.api_url`, which defaults to the SDK's URL and exists for tests only.

---

## Phase 1: Daemon skeleton posts one root message per run

### Goal

`slack-coordinator setup` validates tokens and writes `config.yaml`; `daemon start` runs a locked daemon on a Unix socket with SQLite; `run start --channel C…` posts one root message and stores the run. `npm test` runs the module's tests.

### Required Edits:

#### 1.1 Module, build, and manifest

**File**: `tools/slack-coordinator/go.mod`
**Changes**: New module. Pin the versions Safety Dance already resolves so `go.sum` shares entries.

```diff
+module github.com/MarkTripoli/skills/tools/slack-coordinator
+
+go 1.26.6
+
+require (
+	github.com/oklog/ulid/v2 v2.1.1
+	github.com/slack-go/slack v0.29.0
+	github.com/spf13/cobra v1.10.2
+	golang.org/x/sys v0.42.0
+	gopkg.in/yaml.v3 v3.0.1
+	modernc.org/sqlite v1.48.1
+)
```

**File**: `tools/slack-coordinator/Makefile`
**Changes**: Copy `tools/safety-dance/Makefile` targets `build`, `test`, `test-race`, `lint`; drop `e2e`; binary path `./cmd/slack-coordinator`.

**File**: `tools/slack-coordinator/slack-app-manifest.yaml`
**Changes**: Slack app manifest (schema `display_information`, `features.bot_user`, `oauth_config.scopes.bot`, `settings.event_subscriptions.bot_events`, `settings.socket_mode_enabled: true`). Bot scopes `chat:write channels:history channels:read groups:history groups:read users:read`; bot events `message.channels message.groups`. The app-level token with `connections:write` is created by the person in the app UI; a comment line says so.

**File**: `tools/slack-coordinator/cmd/slack-coordinator/main.go`
**Changes**: `func main() { os.Exit(cli.Execute()) }`.

**File**: `package.json`
**Changes**: Add the Go gate and chain it.

```diff
~ "test": "... && npm run test:safety-dance && npm run test:slack-coordinator",
+ "test:slack-coordinator": "cd tools/slack-coordinator && go test -race ./... && go vet ./... && tmp=$(mktemp -d) && trap \"rm -rf \\\"$tmp\\\"\" EXIT && go build -o \"$tmp/slack-coordinator\" ./cmd/slack-coordinator",
```

#### 1.2 Paths and config

**File**: `tools/slack-coordinator/internal/paths/paths.go`
**Changes**: Copy `paths.go:11-57` shape. `New()` reads `SLACK_COORDINATOR_HOME`, defaults to `~/.slack-coordinator`, and returns an error under `testing.Testing()` when the env var is unset. Methods: `Root() DB() Socket() LockFile() PIDFile() ConfigFile() DaemonLog()`, `EnsureDirs()` creates `Root()` with `0700`. `WithRoot(root)` for tests.

**File**: `tools/slack-coordinator/internal/config/config.go`
**Changes**:

```go
type Slack struct {
	BotToken    string `yaml:"bot_token"`
	AppToken    string `yaml:"app_token"`
	OwnerUserID string `yaml:"owner_user_id"`
	APIURL      string `yaml:"api_url,omitempty"` // tests only; empty uses the SDK default
}
type Config struct{ Slack Slack `yaml:"slack"` }
func Load(path string) (*Config, error)   // missing file → error naming `slack-coordinator setup`
func Save(path string, cfg *Config) error // MkdirAll(dir, 0700); WriteFile 0600
func (c *Config) Validate() error         // bot_token prefix "xoxb-", app_token prefix "xapp-", owner prefix "U" or "W"
```

`config_test.go`: round trip in `t.TempDir()` asserts mode `0600`; `Validate` rejects a missing app token.

#### 1.3 Daemon lock and IPC

**File**: `tools/slack-coordinator/internal/daemon/daemon.go`, `lock_unix.go`
**Changes**: Copy `Ownership`, `AcquireOwnership`, `Close` (`daemon.go:12-58`) and the unix `lockRuntimeFile`/`unlockRuntimeFile` (`golang.org/x/sys/unix.Flock` with `LOCK_EX|LOCK_NB`). No Windows file. Add:

```go
type Runtime struct {
	Paths  *paths.Paths
	Config *config.Config
	DB     *db.DB
	Slack  *slackapi.Client
	Server *ipc.Server
}
// Serve acquires the lock, opens SQLite, registers handlers, binds the socket, and blocks until ctx ends.
func Serve(ctx context.Context, p *paths.Paths, cfg *config.Config, opts Options) error
type Options struct{ StatusInterval time.Duration } // used from Phase 3
```

`Serve` writes `daemon.pid`, registers `daemon.health` and `daemon.shutdown` and the `run.*` handlers exported by `coordinator`, and removes the socket and PID file on return. `daemon_test.go`: second `AcquireOwnership` on the same root fails while the first is open.

**File**: `tools/slack-coordinator/internal/ipc/protocol.go`, `server.go`, `client.go`, `transport_unix.go`, `peer.go`, `peer_darwin.go`, `peer_linux.go`, `peer_other_unix.go`
**Changes**: Copy the Safety Dance files without stream handlers (`HandleStream`, `StreamFunc`, `StreamHandlerFunc`, and the `isStream` branch in `handleConn`). Method constants:

```go
const (
	MethodRunStart        = "run.start"
	MethodRunEvent        = "run.event"
	MethodRunCheck        = "run.check"
	MethodRunResolve      = "run.resolve"
	MethodRunFinish       = "run.finish"
	MethodRunDisableSlack = "run.disable_slack"
	MethodDaemonHealth    = "daemon.health"
	MethodDaemonShutdown  = "daemon.shutdown"
)
type HealthResult struct{ SocketMode string `json:"socket_mode"` } // "not_started" until Phase 4
```

Client connect timeout: `SLACK_COORDINATOR_CONNECT_TIMEOUT` env, default `250ms` (`client.go:108-113`); call timeout `30s`. `ipc_test.go`: one request round trip over a `/tmp` socket; unknown method returns `-32601`.

#### 1.4 SQLite

**File**: `tools/slack-coordinator/internal/db/db.go`, `schema.go`, `runs.go`
**Changes**: `db.go` is `db.go:21-52,73-86` verbatim minus `OpenReadOnly` and `newID` (ULIDs are minted by the CLI). `schema.go`:

```go
const schemaSQL = `
CREATE TABLE IF NOT EXISTS runs (
  run_id        TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  thread_ts     TEXT NOT NULL,
  permalink     TEXT NOT NULL,
  lifecycle     TEXT NOT NULL CHECK (lifecycle IN ('active','completed','failed','cancelled')),
  slack_mode    TEXT NOT NULL CHECK (slack_mode IN ('enabled','slack_disabled')) DEFAULT 'enabled',
  started_at    TEXT NOT NULL,
  finished_at   TEXT
);`
var migrationStatements = []string{} // later phases append ALTER TABLE statements
```

`runs.go`:

```go
type Run struct{ RunID, OwnerUserID, ChannelID, ThreadTS, Permalink, Lifecycle, SlackMode, StartedAt string; FinishedAt sql.NullString }
func (d *DB) InsertRun(ctx context.Context, r Run) error   // fails on duplicate run_id
func (d *DB) GetRun(ctx context.Context, runID string) (Run, error) // sql.ErrNoRows wrapped as ErrRunNotFound
```

Timestamps are RFC 3339 UTC strings. `db_test.go`: open in `t.TempDir()`, insert, get, duplicate insert errors, files are `0600`.

#### 1.5 Slack Web API adapter

**File**: `tools/slack-coordinator/internal/slackapi/client.go`
**Changes**: Package name `slackapi` avoids shadowing the SDK import.

```go
type Client struct{ api *slack.Client; appToken string }
func New(cfg config.Slack) *Client // slack.New(bot, OptionAppLevelToken(app), OptionAPIURL(cfg.APIURL) when set)
func (c *Client) AuthTest(ctx context.Context) (*slack.AuthTestResponse, error)
func (c *Client) ProbeSocketMode(ctx context.Context) error // api.StartSocketModeContext; discards the URL
func (c *Client) PostMessage(ctx context.Context, channelID, threadTS, mrkdwn string) (ts string, err error)
func (c *Client) Permalink(ctx context.Context, channelID, ts string) (string, error)
```

`PostMessage` uses `slack.MsgOptionText(mrkdwn, false)`, `slack.MsgOptionTS(threadTS)` when non-empty, and `slack.MsgOptionDisableLinkUnfurl()`. `client_test.go`: `httptest.NewServer` handling `/auth.test`, `/apps.connections.open`, `/chat.postMessage`, `/chat.getPermalink`; assert the form fields `channel`, `thread_ts`, `text` and that an `{"ok":false,"error":"channel_not_found"}` body surfaces as an error containing `channel_not_found`.

#### 1.6 Coordinator and renderer

**File**: `tools/slack-coordinator/internal/coordinator/types.go`, `messages.go`, `start_run.go`, `handlers.go`
**Changes**: Go mirror of the TDD types (TDD lines 176-204) with JSON tags used on the wire:

```go
type StartRunInput struct {
	RunID       string   `json:"run_id"`
	OwnerUserID string   `json:"owner_user_id"`
	ChannelID   string   `json:"channel_id"`
	Work        string   `json:"work"`
	Goal        string   `json:"goal"`
	Scope       string   `json:"scope"`
	Links       []string `json:"links"`
	StartedAt   string   `json:"started_at"` // filled by the daemon
}
type SlackRunRef struct{ RunID, ChannelID, ThreadTS, Permalink string } // json snake_case
```

`messages.go`:

```go
type RootMessage struct{ Work, Goal, Scope, OwnerUserID string; Links []string; StartedAt string }
func RenderRoot(m RootMessage) string
func field(label, value string) string // "*Label:* value" with "None" for ""
func list(label string, items []string) string // bullet lines or "None"
```

Root fields, in order: `Work`, `Goal`, `Scope`, `Owner` (`<@U…>`), `Links`, `Started at`. `messages_test.go` holds goldens as Go string constants, including the all-empty input.

`start_run.go`:

```go
type Coordinator struct{ DB *db.DB; Slack Poster; Now func() time.Time }
type Poster interface {
	PostMessage(ctx context.Context, channelID, threadTS, mrkdwn string) (string, error)
	Permalink(ctx context.Context, channelID, ts string) (string, error)
}
func (c *Coordinator) StartRun(ctx context.Context, in StartRunInput) (SlackRunRef, error)
```

Order: validate `RunID`, `OwnerUserID`, `ChannelID` non-empty → post root → permalink → `InsertRun(lifecycle=active)`. A duplicate `run_id` fails before posting (`GetRun` first).

`handlers.go`: `func Register(s *ipc.Server, c *Coordinator, health func() ipc.HealthResult, shutdown func())` registers `run.start`, `daemon.health`, `daemon.shutdown`; each handler unmarshals params, calls the use case, returns the typed result.

#### 1.7 CLI

**File**: `tools/slack-coordinator/internal/cli/root.go`, `exit.go`, `setup.go`, `daemon.go`, `run.go`, `run_start.go`, `runtime.go`
**Changes**: `root.go` copies `root.go:15-69` with `Use: "slack-coordinator"` and `AddCommand(newSetup(), newDaemon(), newRun())`. `exit.go`:

```go
const (
	ExitOK = 0; ExitRefused = 1; ExitUsage = 2
	ExitOwnerInput = 10; ExitUnavailable = 11; ExitSlackDisabled = 12
)
func usageErr(format string, a ...any) error      // ExitCodeError{Code: 2}
func unavailableErr(err error) error              // ExitCodeError{Code: 11}
```

`Execute` maps pflag errors and Cobra usage errors to `2` and any error without a code to `1`.

`runtime.go`: `home()`, `callDaemon(method, params, result) error` (`runtime.go:32-43`) returning `unavailableErr` on dial failure, `writePID`, `gitRoot()`.

`setup.go`: `setup [--owner U…] [--install-service]` reads `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` from the environment, requires both, runs `AuthTest` then `ProbeSocketMode`, then `config.Save`. Prints the bot user and team. `--install-service` is accepted and rejected with `2` until Phase 7. It never reads a repository `.env`.

`daemon.go`: `daemon start|stop|status|serve`. `start` copies `startDaemon` (`daemon.go:98-139`) with the child log at `p.DaemonLog()` and readiness = `daemon.health` answering. `stop` calls `daemon.shutdown` then polls until dial fails (`daemon.go:166-199`). `status` prints the health JSON. `serve` (hidden) loads config, calls `daemon.Serve(ctx, p, cfg, opts)` with `SIGINT`/`SIGTERM` cancelling `ctx`.

`run_start.go`:

```text
slack-coordinator run start --channel <C…> --work <s> --goal <s> --scope <s> [--link <url>]... [--owner <U…>] [--run-id <id>]
```

Phase 1 requires `--channel`; `--owner` defaults to `config.Slack.OwnerUserID`; `--run-id` defaults to `ulid.Make().String()`. Prints `{"run_id","channel_id","thread_ts","permalink"}` on stdout.

`run_start_test.go`: temp home under `/tmp`, fake Slack server, `config.Save` with `api_url`, `go daemon.Serve(...)`, poll `daemon.health`, then `NewRoot()` with args and `SetOutput(&buf)`; assert stdout JSON and one `chat.postMessage` request; a second `run start` with the same `--run-id` exits `2`; with the daemon stopped, `run start` exits `11`.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/slack-coordinator && go vet ./... && go test -race ./...`
- [x] `cd tools/slack-coordinator && go build -o /tmp/slack-coordinator ./cmd/slack-coordinator && /tmp/slack-coordinator --help`
- [x] `npm run test:slack-coordinator`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- One live `setup` + `daemon start` + `run start --channel C…` against a test workspace produces a root message with the six fields; record the command, permalink, and screenshot path in `.agents/tasks/i-want-new-skill/evidence/phase-1-root-message.md`.

---

## Phase 2: Channel selection from run override or root AGENTS.md

### Goal

`run start` without `--channel` reads the single `Slack default channel:` line from the repository root `AGENTS.md`; either source resolves through Slack to an invited, non-archived channel before the daemon is called.

### Required Edits:

#### 2.1 Directive and reference parsing

**File**: `tools/slack-coordinator/internal/channel/directive.go`, `reference.go`
**Changes**:

```go
var directiveLine = regexp.MustCompile(`^Slack default channel: (\S+)$`) // anchored per line, case-sensitive
func ParseDefault(agentsMD []byte) (Ref, error) // 0 matches → ErrNoDirective; 2+ → ErrDuplicateDirective
type Ref struct{ ID, Name string } // exactly one set
func ParseRef(s string) (Ref, error) // "C…"/"G…" matching ^[CG][A-Z0-9]{8,}$ → ID; "#name" or "name" → Name (lowercased, no spaces)
```

An indented line does not match `^`. `directive_test.go`: table of one line, none, two, indented, `slack default channel:` lowercase, trailing text.

#### 2.2 Resolution

**File**: `tools/slack-coordinator/internal/channel/resolve.go`
**Changes**:

```go
type Lookup interface {
	ConversationInfo(ctx context.Context, id string) (*slack.Channel, error)
	ListConversations(ctx context.Context, cursor string) ([]slack.Channel, string, error) // types public_channel,private_channel; exclude_archived=false; limit 200
}
func Resolve(ctx context.Context, l Lookup, ref Ref) (string, error)
```

Errors name the cause: `channel #name not found`, `channel C… is archived`, `bot is not a member of #name`. By name, page until match or empty cursor.

**File**: `tools/slack-coordinator/internal/slackapi/client.go`
**Changes**: Add `ConversationInfo` (`GetConversationInfoContext`) and `ListConversations` (`GetConversationsContext`) so `*Client` satisfies `channel.Lookup`. Fake server gains `/conversations.info` and `/conversations.list`.

#### 2.3 CLI decision order

**File**: `tools/slack-coordinator/internal/cli/run_start.go`
**Changes**: `--channel` optional; `--repo <path>` defaults to `gitRoot()` of the cwd. Cobra rejects a repeated `--channel` because it is a string flag; the CLI also rejects a value containing a space or comma with exit `2`.

```go
ref, err := refFromFlagsOrAgentsMD(channelFlag, repo) // ParseRef(flag) or ParseDefault(read(repo/AGENTS.md))
id, err := channel.Resolve(ctx, slackClient, ref)      // exit 2 with the resolver's message
// run.start with ChannelID = id
```

`run_start_test.go`: temp repo with `AGENTS.md` holding one directive resolves by name against the fake `conversations.list`; archived and not-a-member exit `2` with the named cause and zero `chat.postMessage` requests.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/slack-coordinator && go test -race ./internal/channel/... ./internal/cli/...`
- [x] `cd tools/slack-coordinator && go vet ./...`

human-gated: false

---

## Phase 3: Status and completion messages

### Goal

Active runs post status on `run event` or after one quiet interval, and one completion message on `run finish`; lifecycle becomes terminal and terminal runs reject further posts.

### Required Edits:

#### 3.1 Schema and status persistence

**File**: `tools/slack-coordinator/internal/db/schema.go`, `status.go`
**Changes**:

```go
var migrationStatements = []string{
	`ALTER TABLE runs ADD COLUMN next_status_due TEXT`,
	`ALTER TABLE runs ADD COLUMN last_status TEXT`, // JSON of coordinator.StatusMessage
}
func (d *DB) SetStatus(ctx, runID, lastStatusJSON, nextDue string) error
func (d *DB) FinishRun(ctx, runID, lifecycle, finishedAt string) error // also NULLs next_status_due; fails when lifecycle != active
func (d *DB) DueStatusRuns(ctx, now string) ([]Run, error)             // lifecycle='active' AND slack_mode='enabled' AND next_status_due <= now
```

#### 3.2 Use cases and renderer

**File**: `tools/slack-coordinator/internal/coordinator/types.go`, `messages.go`, `record_event.go`, `finish_run.go`, `scheduler.go`
**Changes**:

```go
type WorkEvent struct{ RunID, Current string; Completed, Decisions, Blockers, Next []string }
type FinishRunInput struct{ RunID, Outcome string; Completed, Decisions, Unresolved, Evidence, Links []string }
func RenderStatus(m WorkEvent) string        // Current work, Completed since last update, Decisions, Blockers, Up next
func RenderCompletion(m FinishRunInput, finishedAt string) string // Outcome, Completed work, Decisions, Unresolved items, Evidence, Links, Finished at
func (c *Coordinator) RecordWorkEvent(ctx, e WorkEvent) error // active only; post as thread reply; SetStatus(json, now+Quiet)
func (c *Coordinator) FinishRun(ctx, in FinishRunInput) error  // Outcome ∈ completed|failed|cancelled; post; FinishRun
type StatusScheduler struct{ C *Coordinator; Quiet time.Duration }
func (s *StatusScheduler) Tick(ctx context.Context, now time.Time) error // reposts last_status for DueStatusRuns, resets next_status_due
func (s *StatusScheduler) Run(ctx context.Context, every time.Duration)    // ticker loop calling Tick
```

`StartRun` now sets `next_status_due = now + Quiet`. `Coordinator` gains `Quiet time.Duration`. `daemon.Serve` starts `StatusScheduler.Run(ctx, 30*time.Second)` with `Quiet = Options.StatusInterval` (default `1h`). `run event` or `run finish` on a terminal run returns an error the CLI maps to exit `2`.

`scheduler_test.go`: injected `Now`; after `StartRun`, `Tick(now+59m)` posts nothing, `Tick(now+61m)` posts once, a second `Tick(now+61m)` posts nothing. `finish_run_test.go`: second `FinishRun` fails. `messages_test.go`: goldens for both renderers.

#### 3.3 CLI verbs

**File**: `tools/slack-coordinator/internal/cli/run_event.go`, `run_finish.go`, `daemon.go`
**Changes**:

```text
slack-coordinator run event  --run-id <id> --current <s> [--completed <s>]... [--decision <s>]... [--blocker <s>]... [--next <s>]...
slack-coordinator run finish --run-id <id> --outcome completed|failed|cancelled [--completed <s>]... [--decision <s>]... [--unresolved <s>]... [--evidence <s>]... [--link <url>]...
```

Both call `run.event` / `run.finish` and print nothing on success. `daemon serve --status-interval <duration>` (default `1h`) feeds `Options.StatusInterval`; `daemon start` forwards the flag to the child.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/db/... ./internal/cli/...`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- One live run with `event`, `daemon serve --status-interval 2m`, and `finish`; record the three permalinks in `.agents/tasks/i-want-new-skill/evidence/phase-3-lifecycle.md`.

---

## Phase 4: Run check fails closed

### Goal

`run check` answers `ready` or `unavailable`; the daemon holds the Socket Mode connection and reports its health; a failed required post marks the run unavailable until a retry succeeds. Every `run` verb exits `11` when no daemon answers.

### Required Edits:

#### 4.1 Socket Mode connection

**File**: `tools/slack-coordinator/internal/slackapi/socketmode.go`
**Changes**:

```go
type SocketMode struct{ client *socketmode.Client; state atomic.Value /* "not_started"|"connected"|"disconnected" */ }
func NewSocketMode(api *slack.Client) *SocketMode // socketmode.New(api)
func (s *SocketMode) Run(ctx context.Context) error // go client.RunContext(ctx); consumes Events: Connected → connected; ConnectionError, Disconnect → disconnected; other events forwarded to Inbound channel
func (s *SocketMode) Health() string
func (s *SocketMode) Inbound() <-chan socketmode.Event // Phase 5 consumes; Phase 4 drains and acks EventsAPI envelopes
func (s *SocketMode) Ack(req socketmode.Request)
```

`daemon.Serve` builds it from `slackapi.New(cfg.Slack).API()` and passes `Health` to the health handler; `daemon.health` returns `{"socket_mode":"connected|disconnected|not_started"}`. No reconnect code: `RunContext` reconnects (SDK v0.29.0).

#### 4.2 Delivery tracking and the gate

**File**: `tools/slack-coordinator/internal/db/schema.go`, `runs.go`
**Changes**: Append `ALTER TABLE runs ADD COLUMN last_delivery_error TEXT`; `SetDeliveryError(ctx, runID, msg string)` (empty clears); `RunsWithDeliveryError(ctx)`.

**File**: `tools/slack-coordinator/internal/coordinator/delivery.go`, `check.go`, `scheduler.go`
**Changes**:

```go
func (c *Coordinator) post(ctx, run db.Run, mrkdwn string) error // on error SetDeliveryError(run, err.Error()) and return; on success clear when set
type WriteGate struct{ Kind string `json:"kind"`; Reason string `json:"reason,omitempty"` }
func (c *Coordinator) CheckBeforeWrite(ctx, runID string) (WriteGate, error)
```

`CheckBeforeWrite` order (later phases insert steps, marked here): run not found → error; `[Phase 6: slack_disabled]`; `Health() != "connected"` → `unavailable: socket_mode <state>`; `last_delivery_error` set → `unavailable: <error>`; `[Phase 5: owner_input]`; `ready`. `Coordinator` gains `Health func() string`.

`RecordWorkEvent` and `FinishRun` use `post`; a failed post returns an error the CLI maps to exit `11`. `StatusScheduler.Tick` also retries `RunsWithDeliveryError` by reposting `last_status` (or the root when none) and clears the error on success; the loop already ticks every 30 s.

#### 4.3 CLI

**File**: `tools/slack-coordinator/internal/cli/run_check.go`, `runtime.go`
**Changes**:

```text
slack-coordinator run check --run-id <id>
  stdout {"kind":"ready"} exit 0 · {"kind":"unavailable","reason":"..."} exit 11
```

`callDaemon` failure in `run check` prints `{"kind":"unavailable","reason":"daemon unreachable: <err>"}` and exits `11` (the JSON is still printed so agents parse one shape). `run start`, `run event`, `run finish` exit `11` through `unavailableErr` on dial failure or when the daemon reports a post failure.

`run_check_test.go`: fake Slack returns 500 on `chat.postMessage` for one `run event` → `run check` exits `11` with the error in `reason`; server recovers, `Tick` runs, `run check` exits `0`. Health fake `disconnected` exits `11`. No daemon: exit `11`. `Coordinator.Health` is injected in tests; the live WebSocket is not exercised.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/cli/...`
- [x] `cd tools/slack-coordinator && go build -o /tmp/slack-coordinator ./cmd/slack-coordinator && SLACK_COORDINATOR_HOME=$(mktemp -d) /tmp/slack-coordinator run check --run-id none; test $? -eq 11`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- Live `daemon status` shows `"socket_mode":"connected"`; disabling network yields `run check` exit `11` and re-enabling returns `0`; record in `.agents/tasks/i-want-new-skill/evidence/phase-4-fail-closed.md`.

---

## Phase 5: Owner replies gate the next state-changing action

### Goal

Owner replies in an active run's thread become pending input; `run check` exits `10` until `run resolve` posts the acknowledgement and marks the input handled.

### Required Edits:

#### 5.1 Table

**File**: `tools/slack-coordinator/internal/db/schema.go`, `owner_inputs.go`
**Changes**: Append to `schemaSQL`:

```sql
CREATE TABLE IF NOT EXISTS owner_inputs (
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  message_ts  TEXT NOT NULL,
  text        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  handled_at  TEXT,
  outcome     TEXT CHECK (outcome IN ('applied','rejected','answered')),
  PRIMARY KEY (run_id, message_ts)
);
```

```go
func (d *DB) InsertOwnerInput(ctx, in OwnerInput) (inserted bool, err error) // INSERT OR IGNORE; inserted reports RowsAffected
func (d *DB) OldestUnhandledInput(ctx, runID string) (OwnerInput, bool, error)
func (d *DB) ResolveOwnerInput(ctx, runID, messageTS, outcome, handledAt string) error // fails when already handled or missing
func (d *DB) ActiveRunByThread(ctx, channelID, threadTS string) (Run, bool, error)
```

#### 5.2 Inbound consumer and resolution

**File**: `tools/slack-coordinator/internal/coordinator/inbound.go`, `check.go`, `resolve.go`, `types.go`
**Changes**:

```go
type Acker interface{ Ack(req socketmode.Request) }
func (c *Coordinator) ConsumeInbound(ctx context.Context, events <-chan socketmode.Event, ack Acker)
```

For each event: ack first when `evt.Request != nil`; keep only `EventTypeEventsAPI` whose inner event is `*slackevents.MessageEvent` with `ThreadTimeStamp != ""`, `SubType == ""`, `BotID == ""`; look up `ActiveRunByThread(Channel, ThreadTimeStamp)`; require `User == run.OwnerUserID`; `InsertOwnerInput{RunID, MessageTS: TimeStamp, Text, ReceivedAt: now}`. Everything else is dropped without a row. `daemon.Serve` starts `ConsumeInbound(ctx, socket.Inbound(), socket)`.

```go
type OwnerInput struct{ RunID, ChannelID, ThreadTS, MessageTS, Text string }
type OwnerInputResolution struct{ RunID, MessageTS, Outcome, Reply string }
func (c *Coordinator) ResolveOwnerInput(ctx, in OwnerInputResolution) error // post Reply as thread reply through post(); then db.ResolveOwnerInput
```

`CheckBeforeWrite` inserts, after the delivery-error step: `OldestUnhandledInput` found → `WriteGate{Kind: "owner_input", Input: &in}`; `WriteGate` gains `Input *OwnerInput `json:"input,omitempty"``.

`inbound_test.go`: build `socketmode.Event` values with `slackevents.EventsAPIEvent` payloads through a channel: owner reply inserts one row; the same `message_ts` again inserts none; a non-owner user, a top-level message, and a `bot_message` subtype insert none; every envelope with a `Request` is acked. `check_test.go`: `owner_input` then `ready` after `ResolveOwnerInput`; the acknowledgement is one `chat.postMessage` with the given text and the run's `thread_ts`.

#### 5.3 CLI

**File**: `tools/slack-coordinator/internal/cli/run_check.go`, `run_resolve.go`
**Changes**:

```text
slack-coordinator run check   --run-id <id>  → {"kind":"owner_input","input":{"message_ts":"…","text":"…"}} exit 10
slack-coordinator run resolve --run-id <id> --message-ts <ts> --outcome applied|rejected|answered --reply <s>
```

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/db/... ./internal/cli/...`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- Live owner reply → `run check` exit `10` → `run resolve` → thread shows the acknowledgement → `run check` exit `0`; a second Slack user's reply leaves the exit code at `0`. Record in `.agents/tasks/i-want-new-skill/evidence/phase-5-steering.md`.

---

## Phase 6: Per-run break-glass

### Goal

A local operator disables Slack for one run after typing `yes`; that run's `run check` exits `12`, its posts become no-ops, and sibling runs are untouched.

### Required Edits:

#### 6.1 Use case and gate

**File**: `tools/slack-coordinator/internal/db/runs.go`, `tools/slack-coordinator/internal/coordinator/disable.go`, `check.go`, `record_event.go`, `finish_run.go`, `handlers.go`
**Changes**:

```go
func (d *DB) DisableSlack(ctx, runID string) error // UPDATE runs SET slack_mode='slack_disabled' WHERE run_id=? AND lifecycle='active'; ErrRunNotFound when 0 rows
func (c *Coordinator) DisableSlackForRun(ctx, runID string) error
```

`CheckBeforeWrite` returns `{Kind: "slack_disabled"}` right after the run lookup, before health and owner-input steps. `RecordWorkEvent` and `FinishRun` on a `slack_disabled` run still update SQLite (`last_status`, lifecycle) but skip `post`. `DueStatusRuns` already filters `slack_mode='enabled'`. `handlers.go` registers `run.disable_slack`.

#### 6.2 CLI

**File**: `tools/slack-coordinator/internal/cli/run_disable_slack.go`, `run_check.go`
**Changes**:

```text
slack-coordinator run disable-slack --run-id <id>
  prints run_id, channel_id, permalink, then
  "Slack gating stops for this run only. Type yes to continue: "
  reads one line (readAnswer shape, wizard/setup.go:28-34); anything but "yes" → exit 1, no IPC call
  exit 0 → run check prints {"kind":"slack_disabled"} exit 12
```

The command reads `cmd.InOrStdin()` so tests inject the answer. The prompt needs `channel_id` and `permalink`, so `run.check` gains `Run *RunSummary `json:"run,omitempty"`` (`run_id`, `channel_id`, `permalink`) on every kind; the CLI calls `run.check` first, prints those fields, reads the answer, then calls `run.disable_slack`.

`run_disable_slack_test.go`: two runs; stdin `yes\n` flips only the targeted row; `no\n` and empty stdin leave both `enabled` and exit `1`; `run check` exits `12` for the disabled run and `0` for the sibling; `run event` on the disabled run exits `0` with zero new `chat.postMessage` requests.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/slack-coordinator && go test -race ./internal/coordinator/... ./internal/cli/...`

human-gated: false

---

## Phase 7: launchd and systemd supervision

### Goal

`service install` writes and activates a per-user launchd agent or systemd user unit that starts the daemon at login and restarts it after exit; `setup --install-service` runs the install after the Socket Mode probe succeeds.

### Required Edits:

#### 7.1 Service definitions

**File**: `tools/slack-coordinator/internal/daemon/service.go`, `service_test.go`
**Changes**: Copy `service.go:19-29,73-133` shape without the Windows branch and without `serviceIdentity` hashing (one home per user).

```go
const serviceMarker = "SLACK_COORDINATOR_MANAGED"
type ServiceExecutor interface{ Run(name string, args ...string) error }
type Service struct{ Home *paths.Paths; Binary string; Executor ServiceExecutor; GOOS string /* runtime.GOOS default */ }
func (s Service) Label() string                  // "com.marktripoli.slack-coordinator"
func (s Service) Definition() (string, error)    // darwin plist: Label, ProgramArguments [binary daemon serve], EnvironmentVariables SLACK_COORDINATOR_HOME, StandardOutPath/StandardErrorPath DaemonLog(), RunAtLoad true, KeepAlive true
                                                 // linux unit: ExecStart=<binary> daemon serve, Environment=SLACK_COORDINATOR_HOME=…, Restart=on-failure, [Install] WantedBy=default.target
                                                 // other: error "unsupported platform" → exit 2
func (s Service) DefinitionPath() (string, error) // darwin <home>/slack-coordinator.plist; linux ~/.config/systemd/user/slack-coordinator.service
func (s Service) Install() error   // refuse foreign file without marker; write 0600; darwin: launchctl load -w <plist>; linux: systemctl --user daemon-reload; systemctl --user enable --now slack-coordinator.service
func (s Service) Uninstall() error // darwin: launchctl unload <plist>; linux: systemctl --user disable --now …; remove owned file
func (s Service) Installed() bool
```

`GOOS` is a struct field so tests cover both platforms on one host. `service_test.go`: definitions for `darwin` and `linux` contain the home root, binary, and `daemon serve`; `recordingExecutor` (`service_test.go:25-34`) captures the exact activation and removal argv; a pre-existing file without the marker at the definition path makes `Install` fail without writing; `GOOS: "windows"` fails `Definition`.

#### 7.2 CLI

**File**: `tools/slack-coordinator/internal/cli/service.go`, `setup.go`, `daemon.go`
**Changes**: `service install|uninstall|status`; `Binary` is `os.Executable()` resolved through `filepath.EvalSymlinks`. `setup --install-service` calls `Service.Install` after `config.Save`. `daemon stop` also stops nothing extra: `KeepAlive` restarts a stopped daemon, so `daemon stop` prints `service installed; use service uninstall to stop supervision` when `Installed()` and still sends `daemon.shutdown`.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/slack-coordinator && go test -race ./internal/daemon/... ./internal/cli/...`
- [x] `cd tools/slack-coordinator && GOOS=linux go build ./... && GOOS=darwin go build ./...`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- On macOS: `service install`, `kill -9 <daemon pid>`, `daemon status` answers from a new PID within launchd's restart window; Linux equivalent when a systemd host is available. Record in `.agents/tasks/i-want-new-skill/evidence/phase-7-supervision.md`.

---

## Phase 8: Jira thread backlink

### Goal

A run started with `--jira-issue <KEY>` writes its permalink to the configured custom field; a failed write stays `pending`, is retried with backoff, and never changes `run check`.

### Required Edits:

#### 8.1 Config and table

**File**: `tools/slack-coordinator/internal/config/config.go`
**Changes**:

```go
type Jira struct {
	BaseURL  string `yaml:"base_url"`
	Email    string `yaml:"email"`
	APIToken string `yaml:"api_token"`
	FieldID  string `yaml:"field_id"`
}
type Config struct{ Slack Slack `yaml:"slack"`; Jira *Jira `yaml:"jira,omitempty"` }
func (j *Jira) Validate() error // all four set; FieldID matches ^customfield_\d+$
func (c *Config) JiraEnabled() bool
```

`setup` gains `--jira-base-url --jira-email --jira-field-id` and reads `JIRA_API_TOKEN` from the environment; all-or-none.

**File**: `tools/slack-coordinator/internal/db/schema.go`, `jira_backlinks.go`
**Changes**: Append to `schemaSQL`:

```sql
CREATE TABLE IF NOT EXISTS jira_backlinks (
  run_id     TEXT PRIMARY KEY REFERENCES runs(run_id),
  issue_key  TEXT NOT NULL,
  thread_url TEXT NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('pending','delivered')) DEFAULT 'pending',
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT NOT NULL
);
```

```go
func (d *DB) InsertBacklink(ctx, runID, issueKey, threadURL, nextAttemptAt string) error
func (d *DB) DueBacklinks(ctx, now string) ([]Backlink, error) // state='pending' AND next_attempt_at <= now
func (d *DB) MarkBacklinkDelivered(ctx, runID string) error
func (d *DB) MarkBacklinkFailed(ctx, runID, lastError, nextAttemptAt string) error // attempts += 1
```

#### 8.2 Client and use case

**File**: `tools/slack-coordinator/internal/jira/client.go`
**Changes**:

```go
type Client struct{ base *url.URL; email, token, fieldID string; http *http.Client }
func New(cfg config.Jira) (*Client, error)
func (c *Client) SetThreadURL(ctx, issueKey, threadURL string) error // PUT {base}/rest/api/3/issue/{key} body {"fields":{"<fieldID>":"<url>"}}; basic auth email:token; 204 ok; other → error with status and body prefix
```

**File**: `tools/slack-coordinator/internal/coordinator/start_run.go`, `backlink.go`, `scheduler.go`, `types.go`
**Changes**: `StartRunInput` gains `JiraIssue string `json:"jira_issue,omitempty"``. After `InsertRun`, when `JiraIssue != ""`: `InsertBacklink(..., nextAttemptAt: now)` then `attemptBacklink(run)` once; failure records `last_error` and `next_attempt_at = now + backoff(attempts)` where `backoff(n) = min(1h, 30s << n)`. `StatusScheduler.Tick` also calls `attemptBacklink` for `DueBacklinks`. `Coordinator` gains `Jira BacklinkWriter` (nil when Jira is not configured).

`backlink_test.go`: fake Jira `httptest.Server` returning 204 → `delivered`; 500 → `pending`, `attempts=1`, `last_error` set, `CheckBeforeWrite` still `ready`; a later `Tick` after `next_attempt_at` retries; `StartRun` without `JiraIssue` makes zero Jira requests.

#### 8.3 CLI

**File**: `tools/slack-coordinator/internal/cli/run_start.go`
**Changes**: `--jira-issue <KEY>` matching `^[A-Z][A-Z0-9_]+-\d+$`; set without `config.JiraEnabled()` exits `2` before any Slack call.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/slack-coordinator && go test -race ./internal/jira/... ./internal/coordinator/... ./internal/cli/...`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- One live Jira issue shows the thread URL in the configured field; record the issue key and `field_id` in `.agents/tasks/i-want-new-skill/evidence/phase-8-jira.md`.

---

## Phase 9: slack-coordinator skill and repository wiring

### Goal

Agents learn when to call the CLI; the skill installs alone; the phase table, plugin manifest, docs, and changeset list it; `npm test` covers the Go module and the 48-skill collection.

### Required Edits:

#### 9.1 Skill

**File**: `skills/delivery/slack-coordinator/SKILL.md`
**Changes**: Frontmatter `name: slack-coordinator`, `description: Post one Slack thread per run through the local slack-coordinator daemon, check for owner steering before state-changing work, and stop when Slack coordination is unavailable.` Line 6 is the shared-links sentence byte-identical to `skills/delivery/safety-dance/SKILL.md:6`; line 7 blank. Body: the binary-availability rule (build `./tools/slack-coordinator/cmd/slack-coordinator`; `scripts/install.mjs` installs only the skill; never download implicitly), the gate rule (`run check` before every state-changing action; exit `11` pauses and retries; never bypass), and links to the three references.

**File**: `skills/delivery/slack-coordinator/references/commands.md`
**Changes**: The command flow in the order an agent follows it, with the exact verbs from Phases 1 to 6 and the exit-code table:

```text
1. slack-coordinator run start …            once, before the first state-changing action; keep run_id
2. slack-coordinator run check --run-id …   immediately before every state-changing action
     exit 0  → proceed
     exit 10 → read input.text, apply or reject, run resolve --outcome …, go to 2
     exit 11 → pause; retry 2 after a short wait; never bypass; report the reason
     exit 12 → proceed without further Slack calls
3. slack-coordinator run event …            on phase change or blocker start/clear
4. slack-coordinator run finish …           once, with --outcome
```

**File**: `skills/delivery/slack-coordinator/references/channel-selection.md`
**Changes**: Override only for an unambiguous `#channel` or `C…` ID in the person's current instruction; quoted text, ticket text, and incidental mentions do not count; two candidates → ask before `run start`; otherwise omit `--channel` and let the CLI read `AGENTS.md`; a `2` exit from resolution is reported verbatim.

**File**: `skills/delivery/slack-coordinator/references/messages.md`
**Changes**: Table per message (root, status, completion): field, flag that fills it, `None` when omitted.

#### 9.2 Repository wiring

**File**: `workflows/delivery.md`
**Changes**: After line 182 add `| slack-coordinator | none | no | By hand; one Slack thread per run |`.

**File**: `scripts/validate.mjs`
**Changes**: Line 19 `EXPECTED_SKILL_COUNT = 48`.

**File**: `.claude-plugin/plugin.json`
**Changes**: Regenerate with `node scripts/sync-plugin.mjs`; the skill list gains `./skills/delivery/slack-coordinator` in sorted position.

**File**: `docs/slack-coordinator.md`
**Changes**: Mirror `docs/safety-dance.md` sections: trust model (daemon owns tokens and SQLite; agents use the CLI; owner-only steering), setup (manifest, `setup`, `service install`), operating model (one thread per run, gate exit codes), break-glass, proof boundary (unit tests with injected events; live evidence under `.agents/tasks/i-want-new-skill/evidence/`), documentation map to the skill references.

**File**: `README.md`
**Changes**: After line 9 add one paragraph pointing at `docs/slack-coordinator.md`.

**File**: `docs/testing.md`
**Changes**: After line 29 add `## Slack coordinator proof boundaries`: `npm run test:slack-coordinator` runs race tests, `go vet`, and a build without Slack credentials; live Slack delivery, Socket Mode inbound, launchd/systemd restart, and Jira writes are deferred evidence.

**File**: `.changeset/slack-coordinator.md`
**Changes**:

```markdown
---
"@marktripoli/skills": minor
---

Add the slack-coordinator daemon, CLI, and agent skill for one Slack thread per run with owner steering.
```

`tests/install.test.mjs` scans skills dynamically, so no fixture changes. `scripts/check-safety-dance-identity.mjs` scans the new docs; they must not contain the retired product identity.

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `node scripts/sync-plugin.mjs --check`
- [ ] `HOME=$(mktemp -d) node scripts/install.mjs portable --skill slack-coordinator --yes` exits 0 and installs `SKILL.md` with the three references (flags per `scripts/install.mjs:5-13`)
- [ ] `npm test`

human-gated: false

---

## Human Review

### Review targets

- Phase 1 as the walking skeleton (lock, socket, SQLite, one post) and its copied Safety Dance files versus splitting transport from posting.
- The two IPC methods this plan adds beyond the outline: `daemon.shutdown` (Phase 1) and `run.disable_slack` (Phase 6), plus `run.check` returning `run` summary fields for the break-glass prompt.
- Phase 4 before Phase 5: health and delivery-error gating land before inbound events; `Coordinator.Health` is injected in tests.
- `slack.api_url` as a test-only config key for the fake Slack server.
- Phase 9 last: the skill documents verbs that already pass tests.

### Verify

- [ ] Confirm `tools/slack-coordinator/` is a separate Go module that copies Safety Dance shapes (`daemon.go:20-43`, `ipc/server.go:66-131,152-232`, `db/db.go:27-52`, `service.go:73-133`) rather than importing them.
- [ ] Confirm the `runs`, `owner_inputs`, and `jira_backlinks` tables and no others, with `runs` columns added by idempotent `ALTER TABLE` migrations in Phases 3 and 4.
- [ ] Confirm Phase 1 requires `--channel <ID>` and Phase 2 adds the `AGENTS.md` directive and `#name` resolution through `conversations.info`/`conversations.list`.
- [ ] Confirm exit codes `0` ready, `10` owner_input, `11` unavailable, `12` slack_disabled, `2` usage/config, `1` refused confirmation, and that `11` is returned when no daemon answers.
- [ ] Confirm break-glass reads one `yes` line from stdin and changes one row through `run.disable_slack`.
- [ ] Confirm live Slack, launchd/systemd restart, and Jira evidence are recorded under `.agents/tasks/i-want-new-skill/evidence/` and gate no phase.
- [ ] Confirm `npm test` gains `test:slack-coordinator` in Phase 1 and `EXPECTED_SKILL_COUNT` becomes 48 in Phase 9.

### Known limits

- Socket Mode inbound handling and connection health are unit-tested with injected events and an injected `Health`; a live WebSocket is proven only by the recorded Phase 4 and 5 trials.
- `run check` is a coordination gate, not a transaction around the external side effect (TDD Known Limits).
- Windows is neither built nor tested; `service install` on an unsupported GOOS exits `2`.
- launchd `KeepAlive` restarts a daemon stopped with `daemon stop`; `service uninstall` is the way to stop supervision.
