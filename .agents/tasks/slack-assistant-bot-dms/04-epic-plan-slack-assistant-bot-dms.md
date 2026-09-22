---
task: slack-assistant-bot-dms
type: epic-plan
summary: "Cuts the assistant program into 33 oneshot children over nine waves, each one pull request into epic-slack-assistant-bot-dms. Wave 1 holds five enablers every track needs (owner-flag removal, config agent/retention sections, the eight-table schema, six slackapi methods with the embedded manifest, the router move); the DM walking skeleton (owner DM requests, adapters and runner, DM answer) gates the proposal handshake, the standing-task track, and onboarding verification. Shared contracts fixed here: schema DDL verbatim, run-directory file names, RunSpec/RunOutcome, the ack rule at insert time, NextDue and failure-delivery ownership, and where each track adds db functions. The sizing helper returned split verdicts with no named split for eleven first-cut children; eight were split by workflow step and three kept whole with the reason in Known limits."
repo: skills
branch: epic-slack-assistant-bot-dms
sha: f8b9ff711b7e7b3ebcc54f2645daad0e43145f38
---

# Slack assistant bot with DMs, standing tasks, and onboarding Epic Plan

## Goal

An owner installs the assistant with `slack-coordinator onboard`, DMs the bot, gets answers from a headless coding agent run by the daemon, records standing channel-watching tasks by confirming a proposal in the DM thread, receives their results on schedule, and keeps using `run start` threads from coding agents. Every run's owner is the configured owner; non-owners get one refusal. Stored data is purged daily on the documented bounds.

## Current State

`tools/slack-coordinator/` is a one-thread-per-run Slack bridge. One owner lives in `config.yaml` (`internal/config/config.go:16-22`) and `run start --owner` overrides it per run (`internal/cli/run_start.go:67-69,84`; `StartRunInput.OwnerUserID` at `internal/coordinator/types.go:8`). Inbound Socket Mode envelopes are acked, then pass one predicate: thread reply, no subtype, no `bot_id`, active run thread, owner user (`internal/coordinator/inbound.go:44-83`); DMs are dropped without a row. The manifest (`slack-app-manifest.yaml`) subscribes to `message.channels` and `message.groups` only, no `im:*` scope. `slackapi.Client` exposes `PostMessage`, `Permalink`, `ConversationInfo`, `ListConversations`, `AuthTest`, `ProbeSocketMode` (`internal/slackapi/client.go`). SQLite holds `runs`, `owner_inputs`, `jira_backlinks` through idempotent `CREATE TABLE IF NOT EXISTS` in `schemaSQL` (`internal/db/schema.go`). `daemon.Serve` runs three loops (status scheduler at 30 s, `ConsumeInbound`, Socket Mode) with test injection through `Options{SchedulerPeriod, SocketModeHealth, Inbound, Acker}` (`internal/daemon/daemon.go:86-176`). The daemon spawns only itself, `git rev-parse`, and the service manager; no agent, no per-run directory, no scheduler for standing tasks. `setup` is non-interactive (`internal/cli/setup.go`). `docs/slack-coordinator.md:9,15` and `skills/delivery/slack-coordinator/references/commands.md:34-37`, `messages.md:14` document `--owner`.

## Decomposition

Children are cut by the behavior a caller meets, in the order they meet it: install, DM, answer, propose, confirm, collect, run on schedule, purge. The five wave-1 items are the layers every track reads (config, schema, Slack methods and manifest, owner-only runs) plus the behavior-preserving router move; after them, three tracks run in parallel: DM surface, standing tasks, onboarding. Each track's first child is its walking skeleton; failure classes, boundaries, and variations are separate children, and the two largest flows (onboarding, `!` verbs) are cut by workflow step.

Shared contracts, fixed here so siblings build without waiting:

- **Schema.** The eight `CREATE TABLE IF NOT EXISTS` statements are written verbatim in the schema child's prompt; every later child uses those column names and adds no DDL. Children add SQL functions to `internal/db/tasks.go`, `internal/db/collected_messages.go`, `internal/db/dm_requests.go`, `internal/db/assistant_runs.go`, `internal/db/refused_users.go`, `internal/db/purge.go`; the first child to merge creates the file, later children append.
- **Manifest.** `tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml`, embedded as `manifest.YAML()` by the slackapi child; the owner-DM child adds the DM scopes and `message.im`; onboarding sends `manifest.YAML()`.
- **Run directory.** `<root>/workspace/runs/<run-id>/` (0700) holds `prompt.md`, `messages.jsonl` (daemon writes), `result.md`, `proposal.json` (agent writes), `stdout.log`, `stderr.log`, `meta.json` (daemon writes). `paths.Workspace()`, `paths.RunDir(id)`, `paths.OnboardCheckpoint()`, `paths.EnsureWorkspace()` come from the config child.
- **Runner.** `internal/agent` exposes `Adapter{Command, Args(RunSpec), FinalTextPath}`, `RunSpec{RunDir, Approval, ExtraDirs, Timeout}`, `Lookup(name)` (adapters child); `Runner.Start(ctx, spec) (*Handle, error)`, `Handle{Pid, Pgid int; Wait func() RunOutcome; Kill func()}`, `RunOutcome{ExitCode, TimedOut, Duration, Proposal *Proposal, ProposalErr error, Result, ResultSource, StderrTail}`, `ErrBinaryMissing` (runner child). `internal/agent` imports nothing from `slackapi`, `db`, or `config`.
- **Service.** `internal/assistant.Service{DB, Slack SlackSurface, Coord, Owner, Now, wake}` with `ConsumeInbound`, `routeDM`, and `collect` hooks is created by the router child; the owner-DM child adds `Agent`; the DM-answer child adds `Runner`, `Paths`, `RunDispatcher`; the purge child adds `RunPurge`; the verify child adds `Register`. Each adds one `background.Go` line in `daemon.Serve`. `SlackSurface` grows one method per consumer.
- **Ack rule.** The owner-DM child inserts `dm_requests`, `dm_messages`, and one `queued` `assistant_runs` row and acks `Working on it` when fewer than three rows are `running` and none is `queued` ahead, else `Queued behind <n>` with `n` the queued rows ahead. The DM-answer child edits a queued ack to `Working on it` when it spawns that row.
- **Failure delivery.** `deliverFailure(ctx, run, cause, stderrTail)` for DM runs lives in the failed-DM child; orphan reap and proposal render call it. Task failures post through the task-failure child.
- **Next due.** `assistant.NextDue(schedule JSON, now) (time.Time, error)` in `internal/assistant/tasks.go`, created by the task-verbs child (`!resume` recomputes it) and reused by confirm and scheduled runs. `InsertTask` is the confirm child's; list/get/set-state functions are the task-verbs child's.
- **Constants.** CONFIRM = `yes y confirm confirmed ok okay go "do it" 👍 :+1:`; CANCEL = `no n cancel "never mind" nevermind "forget it" "drop it"`; the confirm sentence is `Reply yes to record this task, no to drop it, or tell me what to change.`; the refusal is `This assistant only takes instructions from its owner, <@owner>.`; the answer edit threshold is 4,000 characters; the each-message floor is 10 minutes.

The docs child is last because it documents every merged behavior once; each code child still deletes or replaces the doc lines its own change makes false.

## Children

```json
[
  {
    "name": "run start uses the configured owner and rejects --owner",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [],
    "acceptance": [
      "WHEN `slack-coordinator run start --owner U1 --work w --goal g --scope s` is invoked, the CLI shall exit 2 with an unknown-flag error before contacting the daemon.",
      "WHEN `run start` opens a run, the daemon shall store `slack.owner_user_id` from `config.yaml` in `runs.owner_user_id` and render it as the root message's Owner field.",
      "The skill references and docs shall contain no `run start --owner` mention while `setup --owner` stays documented."
    ],
    "prompt": "In `tools/slack-coordinator/`, make the configured owner the only run owner.\n\nChange: delete the `--owner` flag from `internal/cli/run_start.go` (flag registration at the `f.StringVar(&in.OwnerUserID, \"owner\", ...)` line, the `Use:` string, and the default-fill `if in.OwnerUserID == \"\"` block). Remove `OwnerUserID` from `StartRunInput` in `internal/coordinator/types.go`. In `internal/coordinator/start_run.go`, drop the `in.OwnerUserID == \"\"` refusal and copy the owner from a new `Coordinator.OwnerUserID string` field (set in `internal/daemon/daemon.go` from `cfg.Slack.OwnerUserID` where the `Coordinator` literal is built) into `RenderRoot` and the `runs` insert. Update `internal/cli/run_start_test.go` and any coordinator test constructing `StartRunInput{OwnerUserID: ...}` to set the coordinator field instead.\n\nDocs and skill: remove `[--owner <U…>]` and the `--owner` sentence from `skills/delivery/slack-coordinator/references/commands.md` (the `run start` usage block and the paragraph below it), change the Owner row in `skills/delivery/slack-coordinator/references/messages.md` to `the configured owner (\\`setup --owner\\`)`, and rewrite `docs/slack-coordinator.md` line 9 so only `setup --owner <U…>` names the owner. `setup --owner` and its `commands.md` operator block stay.\n\nProof: `go test ./internal/cli ./internal/coordinator` passes; a test in `run_start_test.go` asserts `run start --owner U1 ...` exits 2 with an unknown-flag message; `node scripts/validate.mjs` passes. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "config.yaml loads agent and retention sections with defaults and validation",
    "workflow": "oneshot",
    "slice": "enabler",
    "depends_on": [],
    "acceptance": [
      "WHEN `config.Load` reads a file with only `slack:`, it shall return `Agent == nil` and `Retention{Days: 30, ConsumedDays: 7}`.",
      "WHEN `agent:` is present with only `command: codex`, `Load` shall fill `approval: edits`, `timeout: 10m`, `max_runs_per_hour: 30`, and empty `extra_dirs`.",
      "IF `agent.command` is not one of `omp`, `claude`, `codex`, or `approval` is not `edits` or `full`, or `timeout <= 0`, or `max_runs_per_hour <= 0`, or an `extra_dirs` entry is relative, THEN `Validate` shall return an error naming the key and the allowed values.",
      "The `paths` package shall return `<root>/workspace`, `<root>/workspace/runs/<id>`, and `<root>/onboard.json` from `Workspace()`, `RunDir(id)`, and `OnboardCheckpoint()`."
    ],
    "prompt": "In `tools/slack-coordinator/internal/config/config.go`, add two optional sections beside `Slack` and `Jira`:\n\n```go\ntype Agent struct {\n    Command        string        `yaml:\"command\"`            // omp | claude | codex\n    Approval       string        `yaml:\"approval\"`           // edits | full; default edits\n    Timeout        time.Duration `yaml:\"timeout\"`            // default 10m\n    MaxRunsPerHour int           `yaml:\"max_runs_per_hour\"`  // default 30\n    ExtraDirs      []string      `yaml:\"extra_dirs\"`         // absolute paths\n}\ntype Retention struct {\n    Days         int `yaml:\"days\"`          // default 30\n    ConsumedDays int `yaml:\"consumed_days\"` // default 7\n}\n```\n\n`Config` gains `Agent *Agent \\`yaml:\"agent,omitempty\"\\`` and `Retention Retention \\`yaml:\"retention\"\\``. `Load` fills defaults after unmarshal and before `Validate`: retention days/consumed_days when zero; when `Agent != nil`, approval `edits`, timeout `10m`, max_runs_per_hour `30`. `Validate` rejects `agent.command` outside `omp|claude|codex` (error text lists the three names), `approval` outside `edits|full`, `timeout <= 0`, `max_runs_per_hour <= 0`, any `extra_dirs` entry that is not `filepath.IsAbs`, and retention values `<= 0`. `Save` must round-trip both sections; a file without them must keep loading. Add `AgentEnabled() bool`.\n\nIn `internal/paths/paths.go`, add `Workspace() string` (`<root>/workspace`), `RunDir(id string) string` (`<root>/workspace/runs/<id>`), `OnboardCheckpoint() string` (`<root>/onboard.json`), and `EnsureWorkspace() error` that `MkdirAll`s `<root>/workspace/runs` at 0700 and chmods both directories 0700.\n\nProof: table tests in `internal/config/config_test.go` for defaults, each rejection, and save/load round trip; a paths test for the three new paths. `go test ./internal/config ./internal/paths`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "state.sqlite carries the eight assistant tables",
    "workflow": "oneshot",
    "slice": "enabler",
    "depends_on": [],
    "acceptance": [
      "WHEN `db.Open` runs against a `state.sqlite` created by the current `main` schema, it shall succeed and `SELECT name FROM sqlite_master WHERE type='table'` shall list `tasks`, `task_channels`, `collected_messages`, `task_messages`, `dm_requests`, `dm_messages`, `assistant_runs`, `refused_users` beside `runs`, `owner_inputs`, `jira_backlinks`.",
      "IF a row violates a `CHECK` constraint on `tasks.state`, `tasks.trigger`, `dm_messages.author`, `assistant_runs.kind`, or `assistant_runs.state`, THEN the insert shall fail.",
      "The existing `runs`, `owner_inputs`, and `jira_backlinks` DDL and `migrationStatements` shall be byte-identical to before."
    ],
    "prompt": "In `tools/slack-coordinator/internal/db/schema.go`, append these statements to `schemaSQL` after the existing three tables, unchanged in column names and constraints (later children depend on them verbatim). Add no `migrationStatements` entry and no index.\n\n```sql\nCREATE TABLE IF NOT EXISTS tasks (\n  task_id              INTEGER PRIMARY KEY AUTOINCREMENT,\n  state                TEXT NOT NULL CHECK (state IN ('active','paused','completed','cancelled')),\n  instruction          TEXT NOT NULL,\n  trigger              TEXT NOT NULL CHECK (trigger IN ('schedule','window_end','each_message')),\n  schedule             TEXT,\n  debounce_seconds     INTEGER,\n  deliver_to           TEXT NOT NULL,\n  request_root_ts      TEXT NOT NULL,\n  created_at           TEXT NOT NULL,\n  due_at               TEXT,\n  last_run_started_at  TEXT,\n  last_result_at       TEXT,\n  consecutive_failures INTEGER NOT NULL DEFAULT 0,\n  ended_at             TEXT\n);\nCREATE TABLE IF NOT EXISTS task_channels (\n  task_id    INTEGER NOT NULL REFERENCES tasks(task_id),\n  channel_id TEXT NOT NULL,\n  PRIMARY KEY (task_id, channel_id)\n);\nCREATE TABLE IF NOT EXISTS collected_messages (\n  channel_id  TEXT NOT NULL, ts TEXT NOT NULL, thread_ts TEXT,\n  user_id     TEXT NOT NULL, text TEXT NOT NULL, permalink TEXT NOT NULL, received_at TEXT NOT NULL,\n  PRIMARY KEY (channel_id, ts)\n);\nCREATE TABLE IF NOT EXISTS task_messages (\n  task_id    INTEGER NOT NULL REFERENCES tasks(task_id),\n  channel_id TEXT NOT NULL, ts TEXT NOT NULL,\n  run_id     TEXT REFERENCES assistant_runs(run_id),\n  PRIMARY KEY (task_id, channel_id, ts),\n  FOREIGN KEY (channel_id, ts) REFERENCES collected_messages(channel_id, ts)\n);\nCREATE TABLE IF NOT EXISTS dm_requests (\n  root_ts TEXT PRIMARY KEY, channel_id TEXT NOT NULL, received_at TEXT NOT NULL,\n  ack_ts TEXT, pending_proposal TEXT, last_message_at TEXT NOT NULL\n);\nCREATE TABLE IF NOT EXISTS dm_messages (\n  root_ts TEXT NOT NULL REFERENCES dm_requests(root_ts), ts TEXT NOT NULL,\n  author  TEXT NOT NULL CHECK (author IN ('owner','bot')), text TEXT NOT NULL,\n  run_id  TEXT,\n  PRIMARY KEY (root_ts, ts)\n);\nCREATE TABLE IF NOT EXISTS assistant_runs (\n  run_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('dm','task')),\n  root_ts TEXT, task_id INTEGER,\n  state TEXT NOT NULL CHECK (state IN ('queued','running','done','failed')),\n  queued_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,\n  pid INTEGER, pgid INTEGER, daemon_pid INTEGER,\n  exit_code INTEGER, timed_out INTEGER NOT NULL DEFAULT 0, result_source TEXT, failure TEXT\n);\nCREATE TABLE IF NOT EXISTS refused_users (user_id TEXT PRIMARY KEY, refused_at TEXT NOT NULL);\n```\n\nColumn meanings for the doc comment above `schemaSQL`: `tasks.schedule` is JSON `{\"daily\":\"09:00\",\"tz\":\"Europe/Berlin\"}` | `{\"every_hours\":6}` | `{\"at\":\"<RFC3339>\"}`; `tasks.deliver_to` is JSON `{\"dm\":true}` | `{\"channel_id\":\"C…\",\"thread_ts\":\"…\"}`; `task_messages.run_id NULL` means unconsumed; `dm_messages.run_id NULL` on an owner row means a pending follow-up; timestamps are RFC 3339 UTC text like the existing tables. Since `task_messages` references `assistant_runs` and `collected_messages`, keep the statement order above so `foreign_keys(on)` accepts it.\n\nProof: in `internal/db/db_test.go`, open a temp database created by writing only the three old tables first (simulate a pre-existing file), run `db.Open`, and assert the eleven table names; insert-rejection tests for the five CHECK constraints. `go test ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "slackapi client gains the six assistant methods",
    "workflow": "oneshot",
    "slice": "enabler",
    "depends_on": [],
    "acceptance": [
      "WHEN `UpdateMessage(ctx, channel, ts, text)` or `AddReaction(ctx, channel, ts, name)` is called, the client shall send `chat.update` with `channel`, `ts`, `text` or `reactions.add` with `channel`, `timestamp`, `name`.",
      "WHEN `OpenConversation(ctx, userID)` is called, the client shall send `conversations.open` with `users=<id>` and return the `D…` channel id.",
      "WHEN `LookupUserByEmail` or `UserInfo` is called, the client shall send `users.lookupByEmail` or `users.info` and return the user's id, display name, and `tz`.",
      "WHEN `ManifestCreate(ctx, configToken, manifestYAML)` or `ManifestUpdate(ctx, configToken, appID, manifestYAML)` is called, the client shall send `apps.manifest.create` or `apps.manifest.update` with `Authorization: Bearer <configToken>` and return `app_id` and the OAuth install URL, or an error carrying Slack's `error` string.",
      "`manifest.YAML()` in new package `internal/manifest` shall return the bytes of `slack-app-manifest.yaml`, which shall live at `internal/manifest/slack-app-manifest.yaml` and nowhere else in the module."
    ],
    "prompt": "In `tools/slack-coordinator/internal/slackapi/client.go`, add methods beside `PostMessage` and `Permalink`, each one Slack Web API call:\n\n- `UpdateMessage(ctx, channelID, ts, mrkdwn string) (string, error)` via `c.api.UpdateMessageContext` with `MsgOptionText(mrkdwn, false)` and `MsgOptionDisableLinkUnfurl()`.\n- `AddReaction(ctx, channelID, ts, name string) error` via `c.api.AddReactionContext(name, slack.NewRefToMessage(channelID, ts))`.\n- `OpenConversation(ctx, userID string) (string, error)` via `c.api.OpenConversationContext(&slack.OpenConversationParameters{Users: []string{userID}})`, returning `channel.ID`.\n- `LookupUserByEmail(ctx, email string) (User, error)` via `GetUserByEmailContext`; `UserInfo(ctx, userID string) (User, error)` via `GetUserInfoContext`; `User` is a small struct `{ID, DisplayName, TZ string}` where `DisplayName` is `Profile.DisplayName` falling back to `RealName`.\n- `ManifestCreate(ctx, configToken, manifest string) (ManifestResult, error)` and `ManifestUpdate(ctx, configToken, appID, manifest string) (ManifestResult, error)`. The slack-go SDK has no manifest helpers: post form-encoded `manifest=<yaml>` (and `app_id` for update) to `<api url>/apps.manifest.create|update` with `Authorization: Bearer <configToken>` using the client's HTTP client and API URL (respect `config.Slack.APIURL` so tests can fake it). `ManifestResult{AppID, InstallURL string}` from `app_id` and `oauth_authorize_url`; a response with `ok:false` returns an error carrying the Slack `error` string (tests need `invalid_auth` to surface verbatim).\n\nTests in `internal/slackapi/client_test.go` in the existing fake-server style (see the `chat.postMessage` form assertions there): one test per method asserting path, form fields, and bearer header for the manifest calls, plus the `ok:false` error path for `ManifestCreate`. Also create package `tools/slack-coordinator/internal/manifest` with `manifest.go`: `//go:embed slack-app-manifest.yaml` and `func YAML() string`; `git mv tools/slack-coordinator/slack-app-manifest.yaml tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml` without changing its content, and update the path in `docs/slack-coordinator.md` Setup step 1 and anywhere else the repository names it (`grep -rn slack-app-manifest.yaml`). Scope changes belong to a sibling child.\n\nProof: `go test ./internal/slackapi ./internal/manifest` (a test asserts `YAML()` is non-empty and parses as YAML). Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "agent adapters name argv per binary and approval level",
    "workflow": "oneshot",
    "slice": "enabler",
    "depends_on": [
      "config.yaml loads agent and retention sections with defaults and validation"
    ],
    "acceptance": [
      "WHEN `agent.Lookup` is called with `omp`, `claude`, or `codex`, it shall return that adapter, and with any other name it shall return an error listing the three names.",
      "WHEN `Args(RunSpec{Approval: \"edits\"})` is called, each adapter shall return exactly its `edits` argv row from the table, with `--add-dir <D>` repeated per `ExtraDirs` entry and the instruction as the last argument.",
      "WHEN `Approval` is `full`, `omp` shall replace `--approval-mode write` with `--auto-approve`, `claude` shall use `--permission-mode bypassPermissions`, and `codex` shall add `--approve-for-me`.",
      "`FinalTextPath(runDir)` shall be `<runDir>/stdout.log` for `omp` and `claude` and `<runDir>/last-message.md` for `codex`."
    ],
    "prompt": "Create package `tools/slack-coordinator/internal/agent` (this child adds `adapter.go` only; a sibling adds the process runner). Import nothing from `slackapi`, `db`, or `config`.\n\n```go\ntype Adapter interface { Command() string; Args(spec RunSpec) []string; FinalTextPath(runDir string) string }\ntype RunSpec struct { RunDir string; Approval string /* edits|full */; ExtraDirs []string; Timeout time.Duration }\nfunc Lookup(name string) (Adapter, error) // omp | claude | codex; error text: `unknown agent command %q; use omp, claude, or codex`\nconst instruction = \"Read prompt.md in the current directory and follow it.\"\n```\n\nArgv tables (`edits` row; `full` differences in parentheses), flags checked against `omp` 18.1.22, `claude` 2.1.258, `codex` 0.155.1:\n\n- `omp`: `-p --cwd <RunDir> --approval-mode write --no-session --max-time <Timeout.String()> [--add-dir D]... <instruction>` (full: `--auto-approve` replaces `--approval-mode write`); `FinalTextPath` = `<RunDir>/stdout.log`.\n- `claude`: `-p --output-format text --permission-mode acceptEdits --no-session-persistence [--add-dir D]... <instruction>` (full: `--permission-mode bypassPermissions`); `FinalTextPath` = `<RunDir>/stdout.log`.\n- `codex`: `exec -C <RunDir> --skip-git-repo-check -s workspace-write --ephemeral [--add-dir D]... -o last-message.md <instruction>` (full: adds `--approve-for-me` before `-o`); `FinalTextPath` = `<RunDir>/last-message.md`.\n\n`Command()` returns the binary name. Keep the tables in one place so a flag rename is a one-line change.\n\nProof: `internal/agent/adapter_test.go` table test asserting the exact argv slice per adapter for `edits` and `full`, with zero and two `ExtraDirs`, plus `Lookup` rejection text and `FinalTextPath`. `go test ./internal/agent`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout",
    "workflow": "oneshot",
    "slice": "enabler",
    "depends_on": [
      "agent adapters name argv per binary and approval level"
    ],
    "acceptance": [
      "WHEN `Runner.Start` is called with a `RunSpec`, it shall create `RunDir` at mode 0700, spawn the adapter's binary with `cmd.Dir = RunDir`, stdin from `/dev/null`, `Setpgid: true`, stdout and stderr to `stdout.log` and `stderr.log` (0600), and an environment without `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `JIRA_API_TOKEN`, `SLACK_COORDINATOR_HOME`.",
      "IF the process has not exited at `spec.Timeout`, THEN the runner shall `SIGKILL` the process group so a child the agent forked is dead within one second and `RunOutcome.TimedOut` is true.",
      "WHEN the process exits, `RunOutcome.Result` shall be the `result.md` text with `ResultSource` `result.md`, else the trimmed final text file with `ResultSource` `stdout`, else empty with an empty `ResultSource`, and `meta.json` shall record `exit_code`, `duration_ms`, `timed_out`, `result_source`.",
      "WHEN the process exits, `RunOutcome.StderrTail` shall hold the last 20 lines of `stderr.log`.",
      "IF the adapter's binary is not on `PATH`, THEN `Start` shall return `ErrBinaryMissing` naming the binary without creating a process."
    ],
    "prompt": "In `tools/slack-coordinator/internal/agent` (the `Adapter`, `RunSpec`, and `Lookup` already exist in `adapter.go`), add the process runner. Import `os/exec`, `syscall`, standard library only; never `slackapi`, `db`, or `config`.\n\n`rundir.go`: `Create(dir string) error` (MkdirAll 0700 + chmod 0700), `ReadOutputs(dir, finalTextPath string) (result, source string, err error)` returning `result.md` text with source `result.md`, else the trimmed content of `finalTextPath` with source `stdout`, else empty with empty source; `Remove(dir string) error`.\n\n`run.go`:\n```go\ntype Runner interface { Start(ctx context.Context, spec RunSpec) (*Handle, error) }\ntype Handle struct { Pid, Pgid int; Wait func() RunOutcome; Kill func() }\ntype RunOutcome struct { ExitCode int; TimedOut bool; Duration time.Duration; Proposal *Proposal; ProposalErr error; Result, ResultSource, StderrTail string }\ntype ErrBinaryMissing struct{ Name string } // Error(): agent binary %q not found on PATH\nfunc NewRunner(adapter Adapter) Runner\n```\n`proposal.go` holds `type Proposal struct{}` as a placeholder a sibling child fills. `Start`: `exec.LookPath(adapter.Command())` → `ErrBinaryMissing`; `Create(spec.RunDir)`; `cmd := exec.Command(bin, adapter.Args(spec)...)`; `cmd.Dir = spec.RunDir`; `cmd.Stdin` = opened `/dev/null`; `stdout.log`/`stderr.log` created 0600 in the run dir; `cmd.Env` = `os.Environ()` minus the four variables; `cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}`; `cmd.Start()`; `Handle.Pgid` = `syscall.Getpgid(pid)`; `Handle.Kill` = `syscall.Kill(-pgid, syscall.SIGKILL)`. `Wait` selects on process exit, `ctx.Done()`, and `time.After(spec.Timeout)`; on timeout or ctx it kills the group, waits for exit, sets `TimedOut`; then `ReadOutputs(spec.RunDir, adapter.FinalTextPath(spec.RunDir))`, computes `StderrTail` (last 20 lines of `stderr.log`), writes `meta.json` `{\"exit_code\", \"duration_ms\", \"timed_out\", \"result_source\"}` (0600), returns the outcome. Exit code `-1` when killed.\n\n`testdata/fake-agent.sh` (executable, `#!/bin/sh`): reads env `FAKE_MODE`: `result` writes `result.md` with `$FAKE_TEXT`; `stdout` echoes `$FAKE_TEXT` and writes nothing; `empty` exits 0 writing nothing; `sleep` runs `sleep 300 &`, writes `$!` to `child.pid`, then `wait`; `fail` prints 25 numbered lines to stderr and exits 3; `env` writes `env` output to `result.md`. Tests use a test adapter whose `Command()` is `fake-agent.sh` with `PATH` prepended to `testdata`, and `FinalTextPath` = `stdout.log`: assert run dir mode 0700, `Pgid == Pid`, group kill after a 200 ms timeout (`syscall.Kill(childPid, 0)` returns `ESRCH` within one second), env scrub (`result.md` lacks the four names while the test sets them), `meta.json` fields, `ResultSource` `stdout` fallback, `empty` → empty source, `fail` → exit 3 and a 20-line `StderrTail`, `ErrBinaryMissing` for an unknown command.\n\nProof: `go test -race ./internal/agent`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "proposal.json is validated into a Proposal on run exit",
    "workflow": "oneshot",
    "slice": "enabler",
    "depends_on": [
      "agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout"
    ],
    "acceptance": [
      "WHEN `proposal.json` in the run directory parses and `Validate` passes, `RunOutcome.Proposal` shall be non-nil and `ProposalErr` nil.",
      "IF `proposal.json` is present but malformed JSON, has zero or more than one trigger form, an empty `watch`, an empty `instruction`, or `deliver_to` with both or neither of `dm` and `channel_id`, THEN `RunOutcome.ProposalErr` shall name the failing field and `Proposal` shall be nil.",
      "WHEN both `proposal.json` and `result.md` are present, `RunOutcome.Result` shall still carry the `result.md` text."
    ],
    "prompt": "In `tools/slack-coordinator/internal/agent/proposal.go`, replace the placeholder with:\n\n```go\ntype Proposal struct {\n    Watch       []string  `json:\"watch\"`        // channel ids or \"#name\"\n    Trigger     Trigger   `json:\"trigger\"`\n    Instruction string    `json:\"instruction\"`\n    DeliverTo   DeliverTo `json:\"deliver_to\"`\n    Summary     string    `json:\"summary\"`\n}\ntype Trigger struct {\n    Kind            string `json:\"kind\"`                       // schedule | window_end | each_message\n    Daily           string `json:\"daily,omitempty\"`            // HH:MM\n    TZ              string `json:\"tz,omitempty\"`               // IANA; may be empty\n    EveryHours      int    `json:\"every_hours,omitempty\"`\n    At              string `json:\"at,omitempty\"`               // RFC 3339, window_end\n    DebounceSeconds int    `json:\"debounce_seconds,omitempty\"` // each_message; default 300\n}\ntype DeliverTo struct { DM bool `json:\"dm,omitempty\"`; ChannelID string `json:\"channel_id,omitempty\"`; ThreadTS string `json:\"thread_ts,omitempty\"` }\nfunc (p Proposal) Validate() error\nfunc ReadProposal(dir string) (*Proposal, error) // nil, nil when the file is absent\n```\n\n`Validate` rules: `Watch` non-empty; `Instruction` non-empty; `Kind` one of the three; `schedule` has exactly one of `Daily` (matching `^\\d{2}:\\d{2}$`, and `TZ` empty or a loadable IANA zone) or `EveryHours > 0`; `window_end` has `At` parsing as RFC 3339; `each_message` has `DebounceSeconds >= 0` (0 means default 300) and no `Daily`/`EveryHours`/`At`; `DeliverTo` has exactly one of `DM == true` or `ChannelID != \"\"`. Each error names the field, for example `trigger: schedule needs exactly one of daily or every_hours`.\n\nIn `run.go`'s `Wait`, after `ReadOutputs`, call `ReadProposal(spec.RunDir)` and set `Proposal` or `ProposalErr` on the outcome (a JSON syntax error is also `ProposalErr`). `Result` keeps the `result.md` text when both files exist.\n\nProof: table tests in `internal/agent/proposal_test.go` for one valid proposal per trigger kind and one case per rule; extend `run_test.go` with a `FAKE_MODE=proposal` branch in `testdata/fake-agent.sh` that writes both files, asserting `Proposal != nil` and `Result` set. `go test ./internal/agent`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "inbound envelopes route through the assistant package while run-thread replies keep working",
    "workflow": "oneshot",
    "slice": "enabler",
    "depends_on": [],
    "acceptance": [
      "WHEN the daemon receives the nine envelopes of the existing inbound fixture (owner reply, redelivery, non-owner reply, owner top-level message, bot message, unknown thread, interactive envelope, malformed data), it shall ack each one and store exactly the owner thread replies in `owner_inputs`, as before.",
      "WHEN `run start`, an owner thread reply, `run check` (exit 10), `run resolve`, and `run finish` run against the daemon, they shall behave as before the change.",
      "The `coordinator` package shall export `RecordOwnerInput(ctx, *slackevents.MessageEvent) error` and shall no longer own `ConsumeInbound`."
    ],
    "prompt": "Create package `tools/slack-coordinator/internal/assistant` and move envelope consumption into it without changing behavior.\n\n`service.go`: `type Service struct { DB *db.DB; Slack SlackSurface; Coord *coordinator.Coordinator; Owner string; Now func() time.Time; wake chan struct{} }`, `New(db, slack, coord, owner string, now func() time.Time) *Service`, `Wake() <-chan struct{}` (capacity-1 channel; sibling children send on it). `SlackSurface` is an interface with `PostMessage(ctx, channel, threadTS, text string) (string, error)` and `Permalink(ctx, channel, ts string) (string, error)` satisfied by `*slackapi.Client`; sibling children extend it.\n\n`router.go`: `ConsumeInbound(ctx, events <-chan socketmode.Event, ack coordinator.Acker)` with the ack-first loop from `internal/coordinator/inbound.go`; `route(ctx, evt)` extracts the Events API `*slackevents.MessageEvent`, drops `SubType != \"\"` or `BotID != \"\"`, then: channel id starting with `D` → `s.routeDM(ctx, msg)` (returns nil in this child); `C…`/`G…` with `ThreadTimeStamp != \"\"` → `s.Coord.RecordOwnerInput(ctx, msg)`; `C…`/`G…` any → `s.collect(ctx, msg)` (returns nil in this child); else drop. Errors are logged with `slog.Error(\"inbound not recorded\", ...)`.\n\nIn `internal/coordinator/inbound.go`, delete `ConsumeInbound` and `ownerReply`; rename `recordInbound` to exported `RecordOwnerInput(ctx, msg *slackevents.MessageEvent) error` keeping the predicate (`ActiveRunByThread`, `msg.User == run.OwnerUserID`, `InsertOwnerInput`). Move `internal/coordinator/inbound_test.go` to `internal/assistant/router_test.go`, driving the same nine envelopes through `Service.ConsumeInbound` with the same assertions; keep the context-cancellation test. In `internal/daemon/daemon.go`, after `coord` is built, `svc := assistant.New(rt.DB, rt.Slack, coord, cfg.Slack.OwnerUserID, time.Now)` and replace `coord.ConsumeInbound(ctx, inbound, acker)` with `svc.ConsumeInbound(ctx, inbound, acker)`.\n\nProof: `go test -race ./internal/assistant ./internal/coordinator ./internal/daemon ./internal/cli` passes, including `internal/cli/run_resolve_test.go` unchanged. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "owner DMs are recorded as requests and acked in a thread",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "inbound envelopes route through the assistant package while run-thread replies keep working",
      "config.yaml loads agent and retention sections with defaults and validation",
      "state.sqlite carries the eight assistant tables",
      "slackapi client gains the six assistant methods"
    ],
    "acceptance": [
      "WHEN the owner posts a top-level DM not starting with `!` and `agent.command` is configured, the daemon shall insert `dm_requests`, `dm_messages{author owner}`, and one `queued` `assistant_runs` row, call `reactions.add eyes` on the message, post `Working on it` (or `Queued behind <n>` when three runs are `running` or any row is `queued`) as a thread reply, and store that reply's ts in `dm_requests.ack_ts`.",
      "IF the same DM event is delivered twice, THEN the daemon shall keep one `dm_requests` row and one `assistant_runs` row and post one ack.",
      "IF `agent:` is absent from `config.yaml`, THEN the daemon shall reply `No agent is configured; set agent.command in config.yaml` in the DM and store no row.",
      "WHEN the owner replies under a `dm_requests` root, the daemon shall insert `dm_messages{author owner, run_id NULL}` for the reply.",
      "The app manifest shall list bot scopes `im:history`, `im:read`, `im:write`, `reactions:write`, `users:read.email` and bot event `message.im`."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/`, fill `routeDM` for the owner (`msg.User == s.Owner`; non-owner DMs stay dropped in this child): top level (`ThreadTimeStamp == \"\"`) with text whose first token does not start with `!` → `newRequest`; a reply whose `ThreadTimeStamp` matches a `dm_requests.root_ts` → `InsertDMMessage{root_ts, ts, author owner, text, run_id NULL}` and `UPDATE dm_requests SET last_message_at` (nothing else yet); `!`-prefixed text → return nil (a sibling adds verbs). `Service` gains `Agent *config.Agent`; `New` takes it; `daemon.Serve` passes `cfg.Agent`.\n\n`requests.go` `newRequest`: if `s.Agent == nil`, `PostMessage(channel, msg.TimeStamp, \"No agent is configured; set agent.command in config.yaml\")` and return. Else in one transaction: `INSERT OR IGNORE dm_requests(root_ts, channel_id, received_at, last_message_at)`; when that inserted a row (`RowsAffected == 1`): `INSERT dm_messages(root_ts, ts=root_ts, author owner, text)` and `INSERT assistant_runs(run_id=<new ULID; reuse the generator `run start` uses>, kind dm, root_ts, state queued, queued_at)`; when it inserted nothing (redelivery) commit and return. Then, outside the transaction: `AddReaction(channel, msg.TimeStamp, \"eyes\")`; ack text = `Working on it` when `COUNT(assistant_runs WHERE state='running') < 3 AND COUNT(queued rows with queued_at earlier than this row) == 0`, else `Queued behind <n>` with `n` that earlier-queued count; `ts, _ := PostMessage(channel, root_ts, ack)`; `UPDATE dm_requests SET ack_ts = ts`; `INSERT dm_messages(root_ts, ts, author bot, text ack)`; non-blocking send on `s.wake`. `SlackSurface` gains `AddReaction(ctx, channel, ts, name string) error` and `UpdateMessage(ctx, channel, ts, text string) (string, error)`. Db functions in new `internal/db/dm_requests.go` (`InsertDMRequest` returning inserted bool, `GetDMRequest`, `SetAckTS`, `TouchDMRequest`, `InsertDMMessage`, `ListDMMessages(root_ts)`) and `internal/db/assistant_runs.go` (`InsertAssistantRun`, `CountRunsByState`, `CountQueuedBefore(queuedAt)`).\n\nManifest: in `tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml`, add bot scopes `im:history`, `im:read`, `im:write`, `reactions:write`, `users:read.email` and bot event `message.im`. Add one sentence to `docs/slack-coordinator.md` Setup step 1: existing apps must apply the updated manifest and reinstall to receive DMs.\n\nTests in `internal/assistant/requests_test.go` (temp `state.sqlite`, fixed clock, fake `SlackSurface` recording calls): owner top-level DM → three rows, `eyes`, `Working on it`, `ack_ts`; redelivered envelope → no second row or post; with three rows forced to `running`, a new DM → `Queued behind 0`, a second → `Queued behind 1`; `Agent == nil` → fixed reply, no rows; owner reply under the root → `dm_messages` row with `run_id NULL`; `wake` receives after a request.\n\nProof: `go test -race ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "non-owner DMs get one refusal, then silence",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "owner DMs are recorded as requests and acked in a thread"
    ],
    "acceptance": [
      "WHEN a user other than the owner sends their first DM, the daemon shall insert `refused_users(user_id, refused_at)` and post `This assistant only takes instructions from its owner, <@owner>.` in that DM.",
      "WHILE a `refused_users` row exists for the sender, the daemon shall ack and drop further DMs from them with no post and no row.",
      "IF the refusal post fails, THEN the `refused_users` row shall still exist and the error shall be logged."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/router.go` `routeDM`, handle a `D…` message whose `User != s.Owner` (top level or thread), run `INSERT OR IGNORE INTO refused_users(user_id, refused_at) VALUES (?, ?)`; when the insert changed a row, `PostMessage(channel, \"\", fmt.Sprintf(\"This assistant only takes instructions from its owner, <@%s>.\", s.Owner))`; when it changed nothing, return. A failed post is logged with `slog.Error` and does not roll back the row. Add `InsertRefusedUser(ctx, userID, at string) (inserted bool, err error)` to a new `internal/db/refused_users.go`.\n\nTests in `internal/assistant/requests_test.go`: two DMs from `U2` → exactly one post with the fixed text and one row; a DM from `U2` after the fake Slack is set to fail → row present, no panic, error logged.\n\nProof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "!help, !status, and !runs answer questions about the daemon from the DM",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "owner DMs are recorded as requests and acked in a thread"
    ],
    "acceptance": [
      "WHEN the owner sends a top-level DM whose first token starts with `!`, the daemon shall reply at the DM's top level and shall insert no `dm_requests` or `assistant_runs` row.",
      "IF the verb is unknown or the text is `!` alone, THEN the reply shall be the `!help` table.",
      "WHEN `!status` runs, the reply shall include daemon uptime, Socket Mode state, the count of active coding-agent runs, task counts by state, `agent: <command> (approval: <level>)` or `agent: none`, `COUNT(*)` of `collected_messages` and `assistant_runs`, and the byte sizes of `state.sqlite*` and `workspace/runs`.",
      "WHEN `!runs` runs, the reply shall list one line per `runs` row with `lifecycle = active`: run id, channel id, started at, permalink, or `No active runs.`"
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/`, add `verbs.go` and dispatch `!`-prefixed owner top-level DMs from `routeDM`: split on whitespace, lowercase the first token, look it up in a `verbs` map of `func(ctx, args []string) (string, error)`, and `PostMessage(channel, \"\", reply)` at the DM's top level; no row is inserted. Verbs in this child:\n\n- `!help`: a fixed table listing all eight verbs (`!help`, `!status`, `!tasks`, `!show <id>`, `!runs`, `!pause <id>`, `!resume <id>`, `!cancel <id>`) with one-line descriptions, then `Anything else sent here goes to the assistant.` The five task verbs are listed here even though a sibling child implements them; until then they answer `not available yet`.\n- `!status`: `up <duration>` since `Service` construction (`started time.Time` field), `socket mode: <s.Coord.Health()>`, `active runs: <COUNT runs WHERE lifecycle='active'>`, `tasks: active n · paused n · completed n · cancelled n`, `agent: <command> (approval: <level>)` or `agent: none`, `messages: <COUNT collected_messages> · runs: <COUNT assistant_runs>`, `disk: <db bytes> db · <runs bytes> runs` where db bytes sum `state.sqlite`, `-wal`, `-shm` sizes and runs bytes walk `paths.Workspace()/runs` (0 when absent); humanize as `12.3 MB`. `Service` gains `Paths *paths.Paths`.\n- `!runs`: `<run_id> · <channel_id> · started <started_at> · <permalink>` per active run from `runs`, or `No active runs.`\n- Unknown verb or bare `!` → the `!help` text.\n\nDb functions: `CountTasksByState` in new `internal/db/tasks.go`, `CountCollectedMessages` in new `internal/db/collected_messages.go`, `CountAssistantRuns` in `internal/db/assistant_runs.go`, `ActiveRuns` in `internal/db/runs.go` (reuse an existing query if one lists active runs).\n\nTests in `internal/assistant/verbs_test.go` with a fixed clock, temp db, and a temp workspace holding one file: `!help` text lists eight verbs; `!status` reply contains each line with the expected counts and non-zero disk bytes; `!runs` with one inserted active run and with none; `!bogus` and `!` → help; no `dm_requests` row after any `!` message; `!Help` (case) dispatches.\n\nProof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "!tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "!help, !status, and !runs answer questions about the daemon from the DM"
    ],
    "acceptance": [
      "WHEN `!tasks` runs, the reply shall list one line per `active` or `paused` task with id, state, watched channels, schedule text, next due (or `waiting for messages`), and last result time, or `No standing tasks.`",
      "WHEN `!show <id>` runs on any task row, the reply shall carry the instruction verbatim, the state, and the newest five `assistant_runs` for it with the first 500 characters of each run's `result.md` when the file exists.",
      "WHEN `!pause`, `!resume`, or `!cancel` names an `active` or `paused` task, the daemon shall apply that verb's transition (`paused` with `due_at = NULL`; `active` with `due_at = NextDue(schedule, now)` or NULL for `each_message`; `cancelled` with `ended_at`) and reply with the new state and, for `!resume`, the next due time.",
      "IF a task verb names an id with no `tasks` row or a malformed id, THEN the reply shall be `unknown id, known: t<id> t<id>…` listing active and paused ids ascending.",
      "WHEN `NextDue` is called with `{\"daily\":\"09:00\",\"tz\":\"Europe/Berlin\"}` at 2026-09-22T08:00:00Z, it shall return 2026-09-23T07:00:00Z, and with `{\"every_hours\":6}` it shall return now plus six hours."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/verbs.go`, replace the `not available yet` answers for the five task verbs. Ids are `t<n>` or bare `<n>`.\n\n- `!tasks`: per `active`/`paused` task: `t<id> · <state> · watches <#name[, #name]> · <schedule text> · next <due_at in trigger tz | waiting for messages> · last result <last_result_at | none>`; channel names via `ConversationInfo` (add to `SlackSurface`; cache in the `Service`; fall back to the id). Schedule text: `daily HH:MM TZ`, `every N hours`, `once at <at>`, `each message (debounce <n>s)`.\n- `!show <id>`: `t<id> · <state>` line, `instruction` verbatim, then the newest 5 `assistant_runs` for the task (`<finished_at | started_at> · <state> · <exit <code> | failure>`), each followed by up to 500 characters of `<paths.RunDir(run_id)>/result.md` when present. Works for `completed`/`cancelled` rows while they exist.\n- `!pause <id>` (active → paused, `due_at NULL`), reply `t<id> paused`; `!resume <id>` (paused → active, `due_at = NextDue` for `schedule`, `NextDue` for `window_end` (past `at` → NULL and reply `window already passed`), NULL for `each_message`, `consecutive_failures = 0`), reply `t<id> resumed · next due <time>` or `t<id> resumed · waiting for messages`; `!cancel <id>` (active or paused → cancelled, `ended_at = now`, `due_at NULL`), reply `t<id> cancelled`. Other states reply `t<id> is <state>`.\n- Unknown or malformed id → `unknown id, known: t3 t4`.\n\nCreate `tasks.go` with `NextDue(scheduleJSON string, now time.Time) (time.Time, error)`: `{\"daily\":\"HH:MM\",\"tz\":\"<IANA>\"}` → the next instant with that wall time in the zone strictly after `now`, returned in UTC (missing `tz` → UTC); `{\"every_hours\":n}` → `now + n h`; `{\"at\":\"<RFC3339>\"}` → that instant, or the zero time when it is not after `now`. Db functions in `internal/db/tasks.go`: `ListTasks(states ...string)`, `GetTask(id)`, `TaskChannels(id)`, `SetTaskState(id, state string, dueAt, endedAt *string)`, `ResetTaskFailures(id)`; in `internal/db/assistant_runs.go`: `RecentRunsForTask(id, limit)`. Tests insert task rows directly since no path creates them yet.\n\nTests in `verbs_test.go` and `tasks_test.go`: every verb's reply with fixed rows; `!pause`/`!resume`/`!cancel` transitions and `due_at`; unknown id list; `!show` on a cancelled task and with a `result.md` in a temp run dir; `NextDue` table including the DST-safe daily case in the acceptance, `every_hours`, and a past `at`.\n\nProof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "a DM request runs the agent and its answer replaces the Working on it ack",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout",
      "owner DMs are recorded as requests and acked in a thread"
    ],
    "acceptance": [
      "WHEN a `queued` DM run exists and fewer than three rows are `running`, the dispatcher tick shall write `prompt.md` (embedded skill text, approval level, the request) and an empty `messages.jsonl` into `paths.RunDir(run_id)`, spawn the configured adapter, set the row `running` with `pid`, `pgid`, `daemon_pid`, `started_at`, and, for a row acked as `Queued behind`, edit that ack to `Working on it`.",
      "WHILE three rows are `running`, the tick shall spawn nothing, so the oldest `queued` row starts on the first tick after one of them finishes.",
      "WHEN the run exits 0 with a non-empty result of at most 4,000 characters, the daemon shall `chat.update` the ack to that text, insert `dm_messages{author bot, run_id}`, and set the row `done` with `finished_at`, `exit_code`, and `result_source`.",
      "WHEN a DM request is inserted, the wake channel shall make the dispatcher tick before its next timer period.",
      "IF the run exits non-zero, times out, or produces an empty result, THEN the daemon shall set the row `failed` with `failure` text and leave the ack unchanged."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/`, add the dispatcher and the success path of DM delivery.\n\n`skill/ASSISTANT.md` (new, embedded with `//go:embed skill/ASSISTANT.md`): the text the headless agent reads. It states the run-directory contract (`prompt.md` and `messages.jsonl` are inputs; write the answer to `result.md`; write `proposal.json` only when proposing a standing task, with the schema `{\"watch\": [\"#name\"|\"C…\"], \"trigger\": {\"kind\": \"schedule\"|\"window_end\"|\"each_message\", \"daily\": \"HH:MM\", \"tz\": \"<IANA>\", \"every_hours\": n, \"at\": \"<RFC3339>\", \"debounce_seconds\": n}, \"instruction\": \"…\", \"deliver_to\": {\"dm\": true} | {\"channel_id\": \"C…\", \"thread_ts\": \"…\"}, \"summary\": \"one line\"}`), what the approval level permits (draft results at `edits`, run commands at `full`), and the rules: never delete the run directory, never contact Slack, keep writes inside the run directory, the workspace, and the listed extra dirs.\n\n`prompt.go`: `renderPrompt(p promptInput) string` producing `# Assistant run <run-id>`, `kind: dm request · approval: <level>`, the embedded skill text, `## Request` (the newest owner message), `## Thread so far` (every `dm_messages` row of the root in ts order as `owner: …` / `bot: …`), `## Collected messages` (`0 messages in messages.jsonl`). `writeInputs(runDir, prompt string)` writes `prompt.md` and an empty `messages.jsonl` (0600).\n\n`dispatcher.go`: `RunDispatcher(ctx, period time.Duration)` loops on a `time.Ticker` and `s.wake`, calling `Tick`. `Tick(ctx) error` in this child is `spawnQueued`: while `CountRunsByState(running) < 3`: `OldestQueued()` (by `queued_at`); none → return. `paths.EnsureWorkspace()`; write inputs; `handle, err := s.Runner.Start(ctx, agent.RunSpec{RunDir: s.Paths.RunDir(id), Approval: s.Agent.Approval, ExtraDirs: s.Agent.ExtraDirs, Timeout: s.Agent.Timeout})`; on error (including `agent.ErrBinaryMissing`) `FinishRun(id, failed, failure=err.Error())` and continue; else `MarkRunning(id, pid, pgid, os.Getpid(), started_at)` committed before any Slack call; if the stored ack text (`dm_messages` bot row with ts `ack_ts`) starts with `Queued behind`, `UpdateMessage(channel, ack_ts, \"Working on it\")`; `go s.deliver(ctx, run, handle.Wait())`. `Service` gains `Runner agent.Runner`; `daemon.Serve` builds `agent.NewRunner(adapter)` from `agent.Lookup(cfg.Agent.Command)` when `cfg.AgentEnabled()`, adds `background.Go(func() { svc.RunDispatcher(ctx, dispatcherPeriod) })`, and `daemon.Options` gains `DispatcherPeriod time.Duration` with `DefaultDispatcherPeriod = 5 * time.Second`.\n\n`deliver.go`: `deliver(ctx, run, outcome)` for `kind = dm`: `ExitCode == 0 && !TimedOut && Result != \"\"` and `utf8.RuneCountInString(Result) <= 4000` → `UpdateMessage(channel, ack_ts, Result)`, `InsertDMMessage{author bot, text Result, run_id}`, `FinishRun(id, done, exit 0, result_source)`; a longer result: `UpdateMessage(ack, \"Done\")` then one `PostMessage` in the thread with the full text (a sibling adds chunking). Any other outcome: `FinishRun(id, failed, exit_code, timed_out, failure = \"exit <code>\" | \"timed out after <Timeout>\" | \"agent wrote no result\")` and no Slack call (a sibling adds the `Failed` reply). Post first, record after; no transaction spans a Slack call. Log `run <id>: result.md missing, answered from stdout` when `ResultSource == \"stdout\"`.\n\nDb functions in `internal/db/assistant_runs.go`: `OldestQueued`, `MarkRunning`, `FinishRun(id, state string, exitCode int, timedOut bool, resultSource, failure, finishedAt string)`, `GetAssistantRun`.\n\nTests (`dispatcher_test.go`, `deliver_test.go`) with a `fakeRunner` recording `RunSpec`s and returning scripted `RunOutcome`s, fixed clock, fake `SlackSurface`: 4 queued → 3 `running`, fourth spawned after one delivers and its `Queued behind` ack edited to `Working on it`; short answer edits the ack and inserts the bot row; `prompt.md` contains the request text and a sentence from the skill text; exit 3 → row `failed` with `exit 3`; wake triggers a tick within 50 ms with a 10 s period. One `internal/cli` test drives a DM end to end through `daemon.Serve` with `Options.Inbound`, `DispatcherPeriod: 10ms`, `agent.command: omp` in config, and a `PATH` whose `omp` is a copy of `internal/agent/testdata/fake-agent.sh` (`FAKE_MODE=result`), asserting the `chat.update` text at the fake Slack server.\n\nProof: `go test -race ./internal/assistant ./internal/daemon ./internal/cli`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "a failed DM run edits the ack to Failed with the cause and stderr tail",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "a DM request runs the agent and its answer replaces the Working on it ack"
    ],
    "acceptance": [
      "WHEN a DM run exits non-zero, the daemon shall edit the ack to `Failed` and post one thread reply whose first line is `exit <code>` followed by the last 20 stderr lines in a code fence.",
      "WHEN a DM run is killed at `agent.timeout`, the reply's first line shall be `timed out after <limit>`.",
      "IF the run exits 0 with an empty result, THEN the reply's first line shall be `agent wrote no result`.",
      "IF the agent binary is not on `PATH`, THEN the ack shall become `Failed` and the reply shall be `agent binary \"<name>\" not found on PATH` with no stderr fence.",
      "WHEN a failure is delivered, the bot's reply shall be inserted into `dm_messages{author bot, run_id}` so follow-up prompts carry it."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/deliver.go`, add `deliverFailure(ctx, run, cause, stderrTail string)` for `kind = dm`: `UpdateMessage(channel, ack_ts, \"Failed\")`, then `PostMessage(channel, root_ts, text)` where `text` is the cause line followed, when `stderrTail != \"\"`, by a blank line and the tail in a triple-backtick fence; insert `dm_messages{author bot, text, run_id}`. Call it from `deliver` for every non-success outcome with causes `exit <code>`, `timed out after <s.Agent.Timeout>`, `agent wrote no result`; and from `spawnQueued` when `Runner.Start` fails, with the error text (`agent binary \"codex\" not found on PATH` for `ErrBinaryMissing`) and no tail. The row's `failure` column keeps the cause line. Slack errors are logged and do not change the row.\n\nTests in `deliver_test.go`: exit 3 with a 25-line stderr → `Failed` edit, reply starts with `exit 3`, fence holds 20 lines; timeout → `timed out after 10m0s`; empty result → `agent wrote no result`; `ErrBinaryMissing` from the fake runner → reply text and no fence; `dm_messages` bot row present in each case.\n\nProof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "answers over 4,000 characters post as Done plus chunked thread replies",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "a DM request runs the agent and its answer replaces the Working on it ack"
    ],
    "acceptance": [
      "WHEN a DM run's result exceeds 4,000 characters, the daemon shall edit the ack to `Done` and post the result as thread replies split at line boundaries, each at most 4,000 characters, in order.",
      "IF a single line exceeds 4,000 characters, THEN the splitter shall break it at 4,000 characters rather than post an oversized message.",
      "WHEN the result is exactly 4,000 characters, the daemon shall edit the ack with the full text and post no extra reply."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/deliver.go`, add `chunk(text string, limit int) []string` that splits at `\\n` boundaries into pieces of at most `limit` characters (rune count), hard-splitting any single line longer than `limit`, never emitting an empty piece. Replace the placeholder long-answer path: when `utf8.RuneCountInString(Result) > 4000`, `UpdateMessage(ack, \"Done\")` then `PostMessage` each chunk in the thread in order; insert one `dm_messages{author bot}` row with the full text. Constant `answerEditLimit = 4000`.\n\nTests in `deliver_test.go`: 4,000 characters → single edit, no reply; 4,001 characters over two lines → `Done` plus two replies in order; a 9,000-character single line → `Done` plus three replies each ≤ 4,000; chunk table test for boundary handling.\n\nProof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "running rows from a previous daemon pid are killed and reported as Failed",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "a failed DM run edits the ack to Failed with the cause and stderr tail"
    ],
    "acceptance": [
      "WHEN the dispatcher ticks and an `assistant_runs` row is `running` with `daemon_pid != os.Getpid()`, it shall send `SIGKILL` to `-pgid`, set the row `failed` with `failure = daemon restarted`, and for a DM run edit the ack to `Failed` and post `daemon restarted` in the thread.",
      "WHEN daemon shutdown begins, every `running` row's process group shall receive `SIGKILL` before `Serve` returns.",
      "IF the recorded `pgid` no longer exists, THEN the reap shall still mark the row `failed` and log the kill error."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/dispatcher.go`, add `reapOrphans(ctx)` as the first step of `Tick`: select `assistant_runs WHERE state='running' AND daemon_pid != ?` (this pid); for each, `syscall.Kill(-pgid, syscall.SIGKILL)` (log `ESRCH` and continue), `FinishRun(id, failed, ..., failure=\"daemon restarted\")`, and for `kind = dm` call `deliverFailure(ctx, run, \"daemon restarted\", \"\")`. Task-kind rows only get the row update in this child (task delivery is a sibling). Also track live `*agent.Handle`s in the `Service` (map guarded by a mutex) so `RunDispatcher` kills every live group when `ctx` is done, before returning; `daemon.Serve` already cancels and waits for background loops.\n\nTests: insert a `running` row with `daemon_pid = 1` and a `pgid` of a process the test starts (`sleep` in its own group via `Setpgid`), run `Tick`, assert the process is dead, the row is `failed` with `daemon restarted`, and the fake Slack received the `Failed` edit and the reply; a row whose `pgid` is a nonexistent pid still ends `failed`; cancelling the dispatcher context kills a fake-runner handle (assert its `Kill` was called).\n\nProof: `go test -race ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "the hourly run cap holds queued runs and logs the held batch",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "a DM request runs the agent and its answer replaces the Working on it ack"
    ],
    "acceptance": [
      "IF the count of `assistant_runs` with `started_at` within the last hour equals `agent.max_runs_per_hour`, THEN the dispatcher shall spawn no run in that tick and log `cap reached: run <id> held (task <tid>, <n> messages)` (or `(dm)` for a DM run) once per held row per tick.",
      "WHEN the oldest such `started_at` falls out of the rolling hour, the next tick shall spawn the held row.",
      "WHILE the cap holds a row, its `queued` state and ack text shall be unchanged."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/dispatcher.go`, before each spawn in `spawnQueued`, count `assistant_runs WHERE started_at >= now - 1h` (RFC 3339 string comparison, `internal/db/assistant_runs.go` `CountStartedSince(ts)`); when the count is `>= s.Agent.MaxRunsPerHour`, log `slog.Info(\"cap reached\", ...)` formatted as `cap reached: run <id> held (task <tid>, <n> messages)` for task runs (message count = `task_messages WHERE run_id = ?`) or `cap reached: run <id> held (dm)`, and stop the spawn loop for this tick. The row stays `queued` and its ack untouched.\n\nTests: `MaxRunsPerHour: 2` with a fixed clock; three queued rows → two spawn, third held with the log line captured through a `slog.Handler` the test installs; advance the clock 61 minutes → third spawns.\n\nProof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "owner replies in a request thread run a follow-up with the thread history",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "a DM request runs the agent and its answer replaces the Working on it ack"
    ],
    "acceptance": [
      "WHEN the owner replies under a `dm_requests` root with no `running` or `queued` run for that thread, the daemon shall insert `dm_messages{author owner, run_id NULL}` and one `queued` `assistant_runs` row for the thread, post `Working on it` as the new ack, and the run's `prompt.md` shall list every `dm_messages` row in order under `## Thread so far`.",
      "WHILE a run for that thread is `running` or `queued`, further owner replies shall be stored with `run_id NULL` and no second `assistant_runs` row shall be inserted.",
      "WHEN the next run of the thread starts, it shall set `run_id` on every pending owner row of that thread.",
      "WHEN the dispatcher picks a `queued` row, it shall skip any DM row whose thread has a `running` row and take the next oldest."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/`, implement follow-ups. `routeDM`: an owner reply under a `dm_requests` root (already inserting `dm_messages`) now also: if no `assistant_runs` row for `root_ts` is `queued` or `running`, insert a `queued` row, post `Working on it` in the thread, store its ts as the new `dm_requests.ack_ts`, update `last_message_at`, wake the dispatcher; otherwise only store the message (coalescing). `dispatcher.go`: `spawnQueued` selects the oldest `queued` row whose `root_ts` has no `running` row (`OldestQueuedSpawnable` in `internal/db/assistant_runs.go`); at spawn, `UPDATE dm_messages SET run_id = ? WHERE root_ts = ? AND author = 'owner' AND run_id IS NULL`. `prompt.go`: `## Thread so far` renders every `dm_messages` row for the root in ts order as `owner: …` / `bot: …`; `## Request` carries the newest pending owner message.\n\nTests in `requests_test.go` / `dispatcher_test.go`: reply after a done run → new queued row, new ack, prompt contains all prior lines in order; two replies during a running run → one pending row each, no new run, both claimed (`run_id` set) when the next run spawns; two threads each with a queued row and one running → the running thread's queued row is skipped and the other spawns.\n\nProof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "a task proposal is rendered into the request thread with the confirm sentence",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "proposal.json is validated into a Proposal on run exit",
      "a failed DM run edits the ack to Failed with the cause and stderr tail"
    ],
    "acceptance": [
      "WHEN a DM run ends with a valid `Proposal`, the daemon shall resolve each `watch` entry through `channel.Resolve`, fill `trigger.tz` from `users.info` when empty, store the resolved proposal JSON in `dm_requests.pending_proposal`, and edit the ack to the rendered proposal ending with `Reply yes to record this task, no to drop it, or tell me what to change.`",
      "IF `RunOutcome.ProposalErr` is set, THEN the daemon shall deliver `Failed` with the schema error as the cause line and store no pending proposal.",
      "IF a watch channel cannot be resolved or the bot is not a member, THEN the rendered proposal shall carry `Not confirmable yet: invite the bot to #name first.` and the stored JSON shall have `confirmable: false`.",
      "WHEN both `proposal.json` and `result.md` are present, the rendered proposal shall include the `result.md` text under the summary."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/`, add the proposal render path. In `deliver.go`, when `outcome.ProposalErr != nil` → `deliverFailure(ctx, run, outcome.ProposalErr.Error(), \"\")`; when `outcome.Proposal != nil` → `s.renderProposal(ctx, run, req, outcome)` in new `proposals.go`: for each `Watch` entry resolve through `channel.Resolve` (`internal/channel/resolve.go`, which takes the `slackapi` lookups; explicit `C…`/`G…` ids are checked for membership through `ConversationInfo`); collect unresolved names; if `Trigger.Kind == \"schedule\"` with `Daily` and `TZ == \"\"`, fill `TZ` from `s.Slack.UserInfo(ctx, s.Owner).TZ`; build `pendingProposal{Proposal agent.Proposal (channel ids substituted); Confirmable bool; Unresolved []string; RunID string}` and store it as JSON via `SetPendingProposal` (`internal/db/dm_requests.go`). Render:\n\n```\n*Proposed task*\n<Summary>\n<result.md text when non-empty>\nWatch: <#name[, #name]>\nTrigger: daily HH:MM TZ | every N hours | once at <at> | each message (debounce <n>s)\nDeliver to: this DM | #channel thread\n[Not confirmable yet: invite the bot to #x first.]\nReply yes to record this task, no to drop it, or tell me what to change.\n```\n\n`UpdateMessage(channel, ack_ts, text)`, `InsertDMMessage{author bot, text, run_id}`, `FinishRun(id, done, ...)`. `SlackSurface` gains `UserInfo(ctx, id) (slackapi.User, error)`, `ConversationInfo`, and whatever `channel.Resolve` needs (`ListConversations`). A pending proposal in this child is stored only; sibling children act on the owner's reply.\n\nTests in `proposals_test.go` / `deliver_test.go` (fake Slack answering `conversations.info`/`conversations.list`, `users.info` with `tz: Europe/Berlin`): valid proposal for `#general` → ack edited with all lines and the confirm sentence, `pending_proposal` has the channel id, `tz` filled, `confirmable: true`; `#nowhere` → warning line, `confirmable: false`; `ProposalErr` → `Failed` with the error text; proposal plus `result.md` → prose included.\n\nProof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "yes records the pending proposal as a standing task",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "a task proposal is rendered into the request thread with the confirm sentence",
      "!tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM"
    ],
    "acceptance": [
      "WHEN the owner's reply under a thread with a confirmable pending proposal, lowercased, trimmed, and stripped of trailing `.!,`, is one of `yes`, `y`, `confirm`, `confirmed`, `ok`, `okay`, `go`, `do it`, `👍`, `:+1:`, the daemon shall insert `tasks` (state `active`, `due_at = NextDue` for `schedule`/`window_end`, NULL for `each_message`, `debounce_seconds` default 300) and one `task_channels` row per watched channel, clear `pending_proposal`, and spawn no run.",
      "WHEN the task is recorded, the daemon shall reply in the thread `Recorded as t<id> · next due <time in trigger.tz>` or `Recorded as t<id> · waiting for messages`, and `!tasks` shall list `t<id>`.",
      "IF the reply is a confirm word but the pending proposal has `confirmable: false`, THEN the daemon shall reply `Invite the bot to #<name>, then ask again.` and record nothing.",
      "WHEN the confirm reply is handled, both the owner's reply and the bot's reply shall be inserted into `dm_messages` with `run_id` set to the proposing run, leaving no pending follow-up."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/requests.go`, in `routeDM`'s request-thread branch, before storing the reply as a plain follow-up: load `GetDMRequest(root_ts).PendingProposal`; when non-NULL, normalize the text (`strings.ToLower(strings.TrimSpace(text))`, `strings.TrimRight(..., \".!,\")`) and check membership in `var confirmWords = map[string]bool{\"yes\", \"y\", \"confirm\", \"confirmed\", \"ok\", \"okay\", \"go\", \"do it\", \"👍\", \":+1:\"}`. On a confirm word with `Confirmable`: in one transaction `InsertTask` (new in `internal/db/tasks.go`: `state active`, `instruction`, `trigger` = `Trigger.Kind`, `schedule` JSON built from the trigger (`{\"daily\",\"tz\"}` | `{\"every_hours\"}` | `{\"at\"}`, NULL for each_message), `debounce_seconds` (`DebounceSeconds` or 300 for each_message, NULL otherwise), `deliver_to` JSON, `request_root_ts`, `created_at`, `due_at` = `NextDue(schedule, now)` for schedule/window_end else NULL) returning the id, `InsertTaskChannel` per channel id, `SetPendingProposal(root_ts, NULL)`; then `PostMessage(channel, root_ts, \"Recorded as t<id> · next due <due formatted 2006-01-02 15:04 MST in trigger.tz>\")` or `… · waiting for messages`; insert the owner reply and the bot reply into `dm_messages` with `run_id = pending.RunID`. On a confirm word without `Confirmable`: `PostMessage(..., \"Invite the bot to #<first unresolved>, then ask again.\")`, insert both messages the same way, keep the pending proposal. Any other reply falls through to the existing follow-up handling unchanged (a sibling child adds cancel words and correction prompts).\n\nTests in `requests_test.go`: `yes` → `tasks` row with the expected columns and `due_at == NextDue`, `task_channels` rows, reply text, no new `assistant_runs` row, no `dm_messages` row with `run_id NULL`; `Ok.`, `👍`, `Do it!` also confirm; `yes` on `confirmable:false` → invite reply, nothing recorded; `each_message` proposal → `waiting for messages` and `debounce_seconds 300`.\n\nProof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "no drops a pending proposal and any other reply re-runs the agent with it",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "yes records the pending proposal as a standing task",
      "owner replies in a request thread run a follow-up with the thread history"
    ],
    "acceptance": [
      "WHEN the owner's reply under a thread with a pending proposal normalizes to one of `no n cancel \"never mind\" nevermind \"forget it\" \"drop it\"`, the daemon shall clear `pending_proposal`, reply `Dropped the proposal.`, and spawn no run.",
      "WHEN the reply is neither a confirm nor a cancel word, the daemon shall queue a follow-up run whose `prompt.md` carries `## Pending proposal` with the stored JSON and the reply as the request.",
      "WHEN that run ends with a new valid `Proposal`, it shall replace `pending_proposal`.",
      "WHEN that run ends with only `result.md`, `pending_proposal` shall be cleared."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/requests.go`, complete the pending-proposal routing: after the confirm check, if the normalized reply is in `cancelWords` (`no n cancel never mind nevermind forget it drop it`), clear `pending_proposal`, post `Dropped the proposal.` in the thread, insert both `dm_messages` rows with `run_id` set to the proposing run, and return. Otherwise fall into the follow-up path (existing) so a run is queued. In `prompt.go`, when the request's `pending_proposal` is non-NULL, render `## Pending proposal` with the stored JSON in a code fence between `## Thread so far` and `## Collected messages`. In `deliver.go`, on a DM run's completion: a valid `Proposal` overwrites `pending_proposal` through the existing render path; a result with no proposal clears `pending_proposal`.\n\nTests in `requests_test.go`: `no` and `Never mind!` → cleared, reply text, no run; `every 2 hours instead` → queued run whose `prompt.md` contains the pending JSON and the reply; scripted outcome with a new proposal replaces the stored one; scripted plain result clears it.\n\nProof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "messages in watched channels are collected for each active task",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "owner DMs are recorded as requests and acked in a thread"
    ],
    "acceptance": [
      "WHEN a message with no `subtype` and no `bot_id` arrives in a `C…`/`G…` channel listed in `task_channels` for at least one `active` task, the daemon shall `INSERT OR IGNORE collected_messages` (with `permalink` from `chat.getPermalink`) and one `task_messages{run_id NULL}` row per watching active task.",
      "WHEN such a message arrives for an `each_message` task, the daemon shall set `tasks.due_at = now + debounce_seconds`.",
      "IF the channel is watched only by `paused`, `completed`, or `cancelled` tasks, THEN no row shall be inserted.",
      "WHEN the message is also an owner reply in an active coding-agent run thread, the daemon shall insert both `owner_inputs` and `collected_messages`."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/router.go`, fill `collect` for `C…`/`G…` messages (top level and thread replies, any user, `SubType == \"\"`, `BotID == \"\"`): `WatchingTasks(channelID)` (`internal/db/tasks.go`: join `task_channels` with `tasks WHERE state='active'`); when non-empty, fetch the permalink once (`s.Slack.Permalink`), then in one transaction `INSERT OR IGNORE collected_messages(channel_id, ts, thread_ts, user_id, text, permalink, received_at)` and `INSERT OR IGNORE task_messages(task_id, channel_id, ts, NULL)` per task (`internal/db/collected_messages.go`: `InsertCollectedMessage`, `BindMessageToTask`), and for each watching task with `trigger = each_message`, `UPDATE tasks SET due_at = ?` with `now + debounce_seconds` (`SetTaskDue`). The run-thread `RecordOwnerInput` call stays and runs first; both rows may result. The bot's own posts have `bot_id` and are dropped before this hook.\n\nTests in `collect_test.go` (tasks inserted directly): message in a channel watched by two active tasks → one `collected_messages` row, two `task_messages` rows, permalink stored; redelivery → no duplicates; channel watched by a paused task only → nothing; each_message task → `due_at = now + 300s`; owner reply in a run thread that is also watched → `owner_inputs` and `collected_messages` both present.\n\nProof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "schedule and window-end tasks run at their due time and deliver results",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "messages in watched channels are collected for each active task",
      "!tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM",
      "a DM request runs the agent and its answer replaces the Working on it ack"
    ],
    "acceptance": [
      "WHEN an `active` task with `trigger` `schedule` or `window_end` has `due_at <= now` and no `queued` or `running` run, the tick shall insert one `queued` `assistant_runs{kind task, task_id}` row and set `task_messages.run_id` on every unconsumed row of that task.",
      "WHEN the task run spawns, `messages.jsonl` shall hold one `{\"author\",\"channel\",\"ts\",\"text\",\"permalink\"}` line per bound message in ts order, `prompt.md` shall carry `## Instruction`, `## Previous result`, and `## Collected messages` with the count, and `tasks.last_run_started_at` shall be set.",
      "WHEN the run exits 0 with a result, the daemon shall post `t<id> · <#channels> · <n> new items` followed by the result to the task's target: a new top-level DM to the owner for `{\"dm\":true}`, or a reply in the named channel thread.",
      "WHEN a run succeeds, the daemon shall set `last_result_at` and `consecutive_failures = 0`, and then either `due_at = NextDue(schedule, now)` for a `schedule` task or `state = completed`, `ended_at`, `due_at = NULL` for a `window_end` task.",
      "IF the run fails, THEN the daemon shall set the row `failed`, set `task_messages.run_id = NULL` for the batch, increment `consecutive_failures`, and advance `due_at` for `schedule` tasks, with no Slack post."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/dispatcher.go`, add `enqueueDueTasks(ctx)` to `Tick` before `spawnQueued` (after `reapOrphans` when that sibling has merged): `DueTasks(now)` (`internal/db/tasks.go`: `state='active' AND trigger IN ('schedule','window_end') AND due_at IS NOT NULL AND due_at <= ?` with no `assistant_runs` row in `queued`/`running` for the task) → per task, one transaction: `InsertAssistantRun{kind task, task_id, queued}` and `BindUnconsumedToRun(task_id, run_id)` (`internal/db/collected_messages.go`: `UPDATE task_messages SET run_id = ? WHERE task_id = ? AND run_id IS NULL`). `spawnQueued` treats task rows like DM rows in the slot loop (oldest `queued_at` first); before spawning a task run: `MessagesForRun(run_id)` joined to `collected_messages` in ts order → `messages.jsonl` lines `{\"author\": user_id, \"channel\": channel_id, \"ts\": ts, \"text\": text, \"permalink\": permalink}`; `prompt.md` with `kind: task t<id> · approval: <level>`, the skill text, `## Instruction` (verbatim `tasks.instruction`), `## Previous result` (the newest `done` run's `result.md` for this task when the file exists, else `None`), `## Collected messages` (`<n> messages in messages.jsonl (author, channel, ts, text, permalink)`); `SetTaskLastRunStarted(task_id, now)`.\n\n`deliver.go` for `kind = task`: success (`ExitCode == 0 && !TimedOut && Result != \"\"`) → header `t<id> · <#name[, #name]> · <n> new items` (names via the cached `ConversationInfo`; `n` = bound messages); target from `deliver_to`: `{\"dm\":true}` → `OpenConversation(s.Owner)` (add to `SlackSurface`; cache the `D…` id) then `PostMessage(dm, \"\", header + \"\\n\" + Result)`; `{\"channel_id\",\"thread_ts\"}` → `PostMessage(channel, thread_ts, header + \"\\n\" + Result)`; results over 4,000 runes use the existing `chunk` helper as consecutive posts with the header in the first. Then `FinishRun(done)` and `UPDATE tasks`: `last_result_at = now`, `consecutive_failures = 0`, and for `schedule` `due_at = NextDue(schedule, now)`; for `window_end` `state = completed`, `ended_at = now`, `due_at = NULL` (`CompleteTaskRun` in `internal/db/tasks.go`). Failure (any other outcome): `FinishRun(failed, cause)`, `UPDATE task_messages SET run_id = NULL WHERE run_id = ?` (`UnbindRun`), `consecutive_failures + 1`, `due_at = NextDue` for `schedule` (`FailTaskRun`); no Slack post in this child (a sibling reports task failures).\n\nTests (`dispatcher_test.go`, `deliver_test.go`; fixed clock, fake runner, fake Slack answering `conversations.open`): due schedule task with three collected messages → one queued row, three bound rows, `messages.jsonl` three lines in ts order, `prompt.md` has the instruction and `3 messages`; success → DM header `t1 · #general · 3 new items`, `due_at` advanced, failures 0; window_end success → `completed`, `ended_at`; channel-thread delivery posts with `thread_ts`; failure → row `failed`, batch unbound, `consecutive_failures = 1`, `due_at` advanced, no Slack call; a task with a `running` row is not re-enqueued; a due task with zero messages still runs with `0 new items`.\n\nProof: `go test -race ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "a failed task run reports Failed to its target and keeps the batch",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "schedule and window-end tasks run at their due time and deliver results"
    ],
    "acceptance": [
      "WHEN a task run exits non-zero or times out, the daemon shall post to the task's delivery target `Failed: t<id> · <#channels>` followed by `exit <code>` or `timed out after <limit>` and the last 20 stderr lines in a code fence.",
      "IF the run exits 0 with an empty result, THEN the posted cause shall be `agent wrote no result`.",
      "WHEN the failure is posted, the batch shall remain bound to no run (`task_messages.run_id IS NULL`) and `!show t<id>` shall list the failed run with its cause."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/deliver.go`, on a task run failure (after the existing row and batch updates), post to the task's target (same `deliver_to` resolution as success): first line `Failed: t<id> · <#name[, #name]>`, second line the cause (`exit <code>` | `timed out after <s.Agent.Timeout>` | `agent wrote no result`), then the stderr tail in a triple-backtick fence when non-empty. Slack errors are logged and do not change the row. Confirm `!show` renders the run's `failure` column (already stored) as its cause.\n\nTests in `deliver_test.go`: exit 2 with stderr → DM text lines and fence; timeout → `timed out after 10m0s`; empty result → `agent wrote no result`; channel-thread target receives the post with `thread_ts`; `task_messages.run_id` NULL afterwards; `!show` output includes `exit 2`.\n\nProof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "each-message tasks run when the debounce window closes under the 10-minute floor",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "schedule and window-end tasks run at their due time and deliver results"
    ],
    "acceptance": [
      "WHEN an `active` `each_message` task has `due_at <= now`, at least one unconsumed `task_messages` row, and `last_run_started_at + 10 min <= now` (or NULL), the tick shall enqueue one task run bound to every unconsumed message and set `due_at = NULL`.",
      "WHILE `last_run_started_at + 10 min > now`, the tick shall hold the batch and later messages shall keep joining it.",
      "WHEN an `each_message` run completes, the daemon shall deliver as for a scheduled task and leave `due_at` NULL until the next collected message sets it."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/dispatcher.go` `enqueueDueTasks`, add the `each_message` branch: select `tasks WHERE state='active' AND trigger='each_message' AND due_at IS NOT NULL AND due_at <= now AND (last_run_started_at IS NULL OR last_run_started_at <= now - 10m)` with no `queued`/`running` run and at least one `task_messages` row with `run_id IS NULL` (`DueEachMessageTasks` in `internal/db/tasks.go`, floor as a constant `eachMessageFloor = 10 * time.Minute`); enqueue exactly as the schedule branch and set `due_at = NULL`. A task inside the floor is left alone: the collection hook keeps extending `due_at`, and the batch grows. In `deliver.go`, an `each_message` success or failure does not compute `NextDue`; `due_at` stays NULL; failure keeps the batch unbound as for other tasks (a later message re-arms `due_at`).\n\nTests: fixed clock; message at T0 → `due_at = T0+5m`; tick at T0+4m → nothing; tick at T0+5m → run enqueued, `due_at` NULL; second message at T0+6m with `last_run_started_at = T0+5m` → `due_at = T0+11m`, tick at T0+11m → held (floor until T0+15m), tick at T0+15m → enqueued with every unconsumed message; owner-stated `debounce_seconds = 60` honored.\n\nProof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "three consecutive task failures pause the task and DM the owner",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "a failed task run reports Failed to its target and keeps the batch"
    ],
    "acceptance": [
      "WHEN a task run fails and `consecutive_failures` becomes 3, the daemon shall set `state = paused`, `due_at = NULL`, and post a top-level DM to the owner `t<id> paused after 3 failed runs: <last failure>` naming `!resume t<id>`.",
      "WHILE a task is `paused`, the tick shall enqueue no run for it and the collection hook shall insert no `task_messages` for it.",
      "WHEN `!resume` reactivates the task, `consecutive_failures` shall be 0 and the held batch shall be bound to the next run."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/deliver.go`, after incrementing `consecutive_failures` and posting the task's `Failed` message, when the new value is `>= 3`: `SetTaskState(id, paused, dueAt NULL, endedAt NULL)` and `PostMessage(ownerDM, \"\", \"t<id> paused after 3 failed runs: <failure first line>. Fix the cause, then send !resume t<id>.\")`. In `verbs.go`, `!resume` also resets `consecutive_failures = 0` (`ResetTaskFailures` in `internal/db/tasks.go`) and, for `each_message` tasks with unconsumed messages, sets `due_at = now + debounce_seconds` so the held batch runs. Confirm `WatchingTasks` already filters `state='active'` so paused tasks collect nothing.\n\nTests: three scripted failures → `paused`, DM text, no fourth enqueue on later ticks; a message in the paused task's channel → no `task_messages` row; `!resume` → `active`, failures 0, `due_at` set, next tick binds the old batch.\n\nProof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "a daily purge deletes consumed messages and stale runs, tasks, and DM threads",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "schedule and window-end tasks run at their due time and deliver results"
    ],
    "acceptance": [
      "WHEN the purge runs, it shall delete `collected_messages` rows whose every `task_messages` row has `run_id` set to a run with `finished_at < now - retention.consumed_days`, together with those `task_messages` rows.",
      "WHILE a `collected_messages` row has any `task_messages` row with `run_id IS NULL`, the purge shall not delete it at any age.",
      "WHEN the purge runs, it shall delete `assistant_runs` with `finished_at < now - retention.days` except the newest 20 per `task_id` (and per `root_ts` for DM runs), `tasks` in `cancelled`/`completed` with `ended_at < now - retention.days` with their `task_channels`, `task_messages`, and runs, and `dm_requests`/`dm_messages` with `last_message_at < now - retention.days` with their runs, and shall leave `refused_users` untouched.",
      "WHEN `Purge` returns, it shall return the ids of every deleted `assistant_runs` row, and the daemon shall run it at startup plus one minute and then every 24 hours."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/purge.go`, add `RunPurge(ctx)` (first tick at start + 1 min, then every 24 h) calling `Purge(ctx, now) ([]string, error)`, which runs `PurgeRetention(ctx, now, days, consumedDays) (deletedRunIDs []string, err error)` in new `internal/db/purge.go` as one transaction: (1) delete `task_messages` whose `run_id` is a run with `finished_at < now - consumedDays`; then delete `collected_messages` with no remaining `task_messages` row; (2) delete `assistant_runs` with `finished_at < now - days` that are not among the newest 20 by `finished_at` for their `task_id` (DM runs: for their `root_ts`), first deleting `task_messages` rows referencing them; (3) delete `tasks` in `cancelled`/`completed` with `ended_at < now - days` plus their `task_channels`, `task_messages`, and `assistant_runs`; (4) delete `dm_messages` and `dm_requests` with `last_message_at < now - days` and the DM runs for those roots. Collect every deleted run id. Never touch `refused_users`. A `collected_messages` row with any `task_messages.run_id IS NULL` survives every branch (step 1 only removes junction rows that point at old runs, so the unconsumed row keeps the message alive). Wire `background.Go(func() { svc.RunPurge(ctx) })` in `daemon.Serve`; `Service` already has `Retention`. Run-directory removal is a sibling child; this child logs the deleted ids.\n\nTests in `purge_test.go` and `internal/db/purge_test.go` with a fixed clock: consumed message finished 8 days ago deleted, 6 days ago kept; message consumed by one task and unconsumed by another, 100 days old, kept; 25 runs for one task all 40 days old → 5 deleted, 20 kept, ids returned; cancelled task ended 31 days ago removed with its rows, ended 29 days ago kept; DM thread quiet 31 days removed with its runs; `refused_users` row kept; `RunPurge` ticks once at +1 min with an injected clock.\n\nProof: `go test ./internal/assistant ./internal/db`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "the purge removes run directories of deleted and orphaned runs",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "a daily purge deletes consumed messages and stale runs, tasks, and DM threads"
    ],
    "acceptance": [
      "WHEN `Purge` returns deleted run ids, the daemon shall `RemoveAll` `workspace/runs/<id>/` for each of them.",
      "WHEN the purge scans `workspace/runs`, it shall remove every directory whose name has no `assistant_runs` row and keep every directory that has one.",
      "IF a directory removal fails, THEN the purge shall log the path and error and retry it on the next daily run."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/purge.go`, after `Purge` commits: for each returned id `os.RemoveAll(s.Paths.RunDir(id))`; then `os.ReadDir(filepath.Join(s.Paths.Workspace(), \"runs\"))` (absent directory → nothing) and for each entry whose name has no row (`AssistantRunExists(id)` in `internal/db/assistant_runs.go`) `RemoveAll` it. Log each failure with `slog.Error(\"run directory not removed\", \"path\", ..., \"error\", ...)` and continue; the next daily run repeats the scan. Report the removed count in the purge log line.\n\nTests in `purge_test.go`: directories for two deleted runs, one orphan, and one live run exist before; after `RunPurge`'s tick the first three are gone and the live one remains; a directory made unremovable (a read-only parent, skipped when running as root) is logged and left, and the tick returns without error.\n\nProof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "onboard creates the Slack app and collects both tokens through a resumable checkpoint",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "slackapi client gains the six assistant methods",
      "config.yaml loads agent and retention sections with defaults and validation"
    ],
    "acceptance": [
      "WHEN `slack-coordinator onboard` runs with no `config.yaml` and no `onboard.json`, it shall prompt for the configuration token and app name, call `apps.manifest.create` with `manifest.YAML()`, open the returned install URL, prompt for the bot token, open `https://api.slack.com/apps/<app_id>/general`, prompt for the app-level token, and write `onboard.json` (0600) with `step: 4`, `app_id`, `app_name`, `bot_token`, `app_token`.",
      "IF a pasted bot token lacks the `xoxb-` prefix or an app-level token lacks `xapp-`, THEN `onboard` shall say so and re-prompt without advancing the step.",
      "IF `apps.manifest.create` fails, THEN `onboard` shall print `create app: <cause>` (or `configuration token rejected; create a new one at api.slack.com/apps` for `invalid_auth`), exit 2, and write `onboard.json` with `step: 1` and no token.",
      "WHEN `onboard` re-runs with `onboard.json` at `step: 2`, it shall prompt for the configuration token only if a later step needs it, skip the app creation, and resume at step 3 using the stored `app_id`.",
      "`onboard.json` shall never contain the configuration token string."
    ],
    "prompt": "Create package `tools/slack-coordinator/internal/onboard` and the cobra command `internal/cli/onboard.go` (`onboard [--no-service] [--existing]`; both flags are parsed; in this child the command runs steps 1 to 4 and then prints `Tokens saved to onboard.json; the remaining steps arrive in a later change.` and exits 0; `--existing` prints `not implemented yet` and exits 2).\n\nThe manifest comes from `internal/manifest.YAML()` (already embedded); do not copy the file. `checkpoint.go`: `Checkpoint{Step int; AppID, AppName, BotToken, AppToken, OwnerUserID, OwnerDisplayName string; ServiceInstalled bool}` with `LoadCheckpoint(path) (*Checkpoint, error)` (absent → zero value) and `Save(path)` writing 0600 via a temp file rename. `steps.go`: `Deps{Prompt func(label string) (string, error); PromptSecret func(label string) (string, error); OpenURL func(url string) error; Slack ManifestAPI (ManifestCreate(ctx, token, manifest) (slackapi.ManifestResult, error)); Out io.Writer}` and `Run(ctx, deps Deps, cp *Checkpoint, cpPath string, flags Flags) error`. Steps, each `func(ctx, *state) error` in a slice indexed from 1: 1 `configuration token` (`PromptSecret`, prefix `xoxe.xoxp-` or `xoxe-`; re-prompt on mismatch; held in memory only); 2 `create app` (`Prompt(\"App name\")` default `Slack assistant`, `ManifestCreate`; record `AppID`, `AppName`; `invalid_auth` → the fixed rejected-token line); 3 `install app` (`OpenURL(InstallURL)`, print where the bot token appears, `PromptSecret(\"Bot token (xoxb-…)\")`, prefix check with re-prompt); 4 `app-level token` (`OpenURL(\"https://api.slack.com/apps/<AppID>/general\")`, print the `connections:write` scope to add, `PromptSecret(\"App-level token (xapp-…)\")`, prefix check). `Run` loads the checkpoint, starts at `Step + 1`, saves after each step, and on error prints `<step name>: <cause>` and returns an error the CLI maps to exit 2 through `internal/cli/exit.go`. Step 1 runs only when a following step in this invocation needs the token.\n\nTests in `internal/onboard/onboard_test.go` with scripted `Deps` (queued prompt answers, recorded URLs, fake `ManifestAPI`): steps 1 to 4 record `step: 4` and the four values; a wrong `xoxb` prefix re-prompts once; `ManifestCreate` error → `create app:` message, `step: 1`, file lacks the token; `invalid_auth` → the fixed line; re-run from `step: 2` skips `ManifestCreate` and opens the install URL built from the stored `AppID`; the checkpoint file mode is 0600 and never contains the configuration token. `internal/cli/onboard_test.go` runs the command against a fake Slack server serving `apps.manifest.create`.\n\nProof: `go test ./internal/onboard ./internal/cli`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "onboard resolves the owner, writes config.yaml, and starts the daemon",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "onboard creates the Slack app and collects both tokens through a resumable checkpoint"
    ],
    "acceptance": [
      "WHEN `onboard` resumes past step 4, it shall prompt for the owner's email or `U…`/`W…` id, resolve it through `users.lookupByEmail` or `users.info`, print `Owner: <display name> (<id>). Correct? [Y/n]`, and on `Y` record `owner_user_id` and `owner_display_name` at `step: 5`.",
      "IF the email or id resolves to no user, or the user answers `n`, THEN `onboard` shall re-prompt without writing config.",
      "WHEN step 6 runs, `onboard` shall call `auth.test` and `apps.connections.open` with the pasted tokens, write `config.yaml` at 0600 with `slack.bot_token`, `slack.app_token`, `slack.owner_user_id` while preserving any existing `agent`, `retention`, and `jira` keys, and install and start the user service.",
      "WHERE `--no-service` is passed, step 6 shall start the daemon through the existing detached `daemon start` path instead of installing a service and shall say the daemon runs until logout or reboot.",
      "WHEN `setup` and `onboard` both write config for the same tokens and owner, the two `config.yaml` files shall be identical."
    ],
    "prompt": "In `tools/slack-coordinator/internal/onboard/steps.go`, add steps 5 and 6 and make the command run through step 6 (then print `Setup written; verification arrives in a later change.` and exit 0; a sibling adds verification). `Deps` gains `LookupUserByEmail(ctx, bot token, email) (slackapi.User, error)`, `UserInfo(ctx, bot token, id)`, `AuthTest`, `ProbeSocketMode` (the fakes take the token so tests can assert it), `SaveConfig func(*config.Config) error`, `LoadConfig func() (*config.Config, error)` (nil when absent), `InstallService func() error` (wraps the existing `daemon.Install` path used by `service install`), `StartDaemon func() error` (wraps the existing detached re-exec in `internal/cli/daemon.go`). Step 5 `owner`: `Prompt(\"Owner email or Slack user id\")`; contains `@` → `LookupUserByEmail`, else must match `^[UW][A-Z0-9]+$` → `UserInfo`; `users_not_found` or a non-matching id → `No such user in this workspace.` and re-prompt; print `Owner: <DisplayName> (<ID>). Correct? [Y/n]`; `n` re-prompts; record `OwnerUserID`, `OwnerDisplayName`, `Step 5`. Step 6 `write config and start`: build a `slackapi.Client` from the pasted tokens, `AuthTest` then `ProbeSocketMode`; load the existing config when present and overwrite only the three `slack` keys, keep `agent`, `retention`, `jira`; `config.Save` (0600); `--no-service` → `StartDaemon` and print `The daemon runs until you log out or reboot; run slack-coordinator service install to keep it running.`; else `InstallService` and set `ServiceInstalled`; `Step 6`. Wire the real dependencies in `internal/cli/onboard.go`.\n\nTests in `internal/onboard/onboard_test.go`: email path and id path resolve and record; `users_not_found` re-prompts; `n` re-prompts; step 6 writes 0600 config with the three keys and preserves a pre-existing `agent:` block; `--no-service` calls `StartDaemon` not `InstallService`; `AuthTest` failure prints `write config and start: <cause>` and leaves `step: 5`. `internal/cli/onboard_test.go`: run `setup` and `onboard` (scripted stdin, fake Slack for `auth.test`, `apps.connections.open`, `users.info`) into two roots and compare the two `config.yaml` bytes.\n\nProof: `go test ./internal/onboard ./internal/cli ./internal/config`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "onboard finishes only when the owner replies to the setup DM within 120 seconds",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "onboard resolves the owner, writes config.yaml, and starts the daemon",
      "owner DMs are recorded as requests and acked in a thread"
    ],
    "acceptance": [
      "WHEN IPC method `assistant.verify_owner` is called, the daemon shall `conversations.open` the owner, post `Reply to this message to finish setup`, and block until an owner top-level DM with a later `ts` arrives, returning `{ok: true, display_name}`.",
      "WHILE a verify is pending, the owner's reply shall resolve it and shall not create a `dm_requests` row, reaction, or ack.",
      "WHEN the reply arrives, `onboard` shall print the owner display name and app name, delete `onboard.json`, print next steps, and exit 0.",
      "IF no owner reply arrives within 120 seconds, THEN `assistant.verify_owner` shall return `{ok: false, timeout: true}` and `onboard` shall exit 2 with hints in this order: the app was not reinstalled after the scope change, the `message.im` event subscription is missing, the owner id is wrong, keeping `config.yaml`, the service, and `onboard.json`.",
      "WHEN `onboard` runs with `config.yaml` present and no `--existing`, it shall offer repair: re-run the verify, reinstall the service, or replace one token, and shall not call `apps.manifest.create`."
    ],
    "prompt": "In `tools/slack-coordinator/internal/assistant/verify.go`, add `Register(server *ipc.Server)` for method `assistant.verify_owner` (add the constant to `internal/ipc/protocol.go`): `OpenConversation(s.Owner)`, `PostMessage(dm, \"\", \"Reply to this message to finish setup\")`, record the ts in a `Service` field `verify{ts string; done chan verifyResult}` under a mutex, then select on `done` and `time.After(120s)`. In `routeDM`, before `newRequest`, an owner top-level DM with `ts > verify.ts` while a verify is pending resolves `done` with `{ok, display_name from s.Slack.UserInfo(s.Owner)}` and returns (no row, reaction, or ack). `daemon.Serve` calls `svc.Register(rt.Server)`. `internal/ipc/client.go`: allow a per-call deadline; `onboard` calls this method with 130 s.\n\n`internal/onboard/steps.go`: step 7 replaces the `verification arrives in a later change` exit: it calls the daemon (poll `daemon.health` for up to 5 s first, like `daemon start` does), prints the reply on success, deletes `onboard.json`, prints step 8 (`Invite the bot to the channels it should watch, then DM it !help.`), exit 0. On timeout print the three hints in the acceptance order and return exit 2 without touching config or service. Repair mode: `Run` with `config.yaml` present and no `--existing` prints `Existing setup found. [1] re-verify [2] reinstall service [3] replace a token` and runs the chosen path; every path ends with step 7. Update the `onboard` command's `--no-service` closing text to mention verification passed.\n\nTests: `internal/assistant/verify_test.go` (fake Slack, injected inbound): owner DM after the setup post → `{ok, display_name}`, no `dm_requests` row; owner DM with an earlier ts → not resolved; 120 s timeout with a fake clock or a short injected timeout → `{timeout}`. `internal/onboard/onboard_test.go`: success prints name and deletes the checkpoint; timeout prints the three hints in order and exits 2 with `onboard.json` kept; repair mode never calls `ManifestCreate`. `internal/cli` end-to-end: daemon in-process with `Options.Inbound`, `onboard` step 7 succeeds when the test pushes an owner DM after the post.\n\nProof: `go test -race ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "onboard --existing updates an installed app's manifest and re-verifies",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "onboard finishes only when the owner replies to the setup DM within 120 seconds"
    ],
    "acceptance": [
      "WHEN `onboard --existing` runs, it shall prompt for the configuration token, read `app_id` from `onboard.json` or prompt for it, call `apps.manifest.update` with the embedded manifest, and print that the app must be reinstalled to grant the new scopes.",
      "WHEN the user pastes a new bot token at the reinstall prompt, `onboard --existing` shall write only `slack.bot_token` and keep every other `config.yaml` key.",
      "WHEN the user presses Enter at the reinstall prompt, `onboard --existing` shall keep the existing bot token.",
      "WHEN the manifest update and reinstall prompt complete, `onboard --existing` shall run the verify step and exit per its outcome.",
      "IF `apps.manifest.update` returns `invalid_auth`, THEN `onboard --existing` shall print `configuration token rejected; create a new one at api.slack.com/apps` and exit 2."
    ],
    "prompt": "In `tools/slack-coordinator/internal/onboard/`, implement `--existing`: `Run` with the flag loads `config.yaml` (must exist; else exit 2 naming `onboard` without the flag), prompts for the configuration token, takes `AppID` from `onboard.json` or a prompt (`A…` prefix check), calls `ManifestUpdate(token, appID, manifest.YAML())`, prints `Manifest updated. Reinstall the app at <install URL or https://api.slack.com/apps/<AppID>/install-on-team> to grant the new scopes, then paste the new bot token (Enter to keep the current one):`; a pasted `xoxb-` value replaces only `Slack.BotToken` through `config.Save` with the loaded struct (all other keys preserved); then step 7 (verify) as already implemented. Remove the `not implemented yet` stub from `internal/cli/onboard.go`. `invalid_auth` prints the rejected-token line and exits 2.\n\nTests: manifest update called with the embedded YAML and the app id; config round trip keeps `agent`, `retention`, `jira` keys and changes only `bot_token`; Enter keeps the token; `invalid_auth` → exit 2 with the fixed line; the verify step runs after.\n\nProof: `go test ./internal/onboard ./internal/cli`. Skip formatters, linters, and the full `npm test`."
  },
  {
    "name": "docs describe onboarding, DMs, and standing tasks, and the changeset records the release",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [
      "no drops a pending proposal and any other reply re-runs the agent with it",
      "answers over 4,000 characters post as Done plus chunked thread replies",
      "running rows from a previous daemon pid are killed and reported as Failed",
      "the hourly run cap holds queued runs and logs the held batch",
      "each-message tasks run when the debounce window closes under the 10-minute floor",
      "three consecutive task failures pause the task and DM the owner",
      "the purge removes run directories of deleted and orphaned runs",
      "onboard --existing updates an installed app's manifest and re-verifies"
    ],
    "acceptance": [
      "`docs/slack-coordinator.md` shall contain sections headed `Onboarding`, `Assistant DMs`, `Standing tasks`, `Configuration`, and `Trust boundary` covering `onboard`, `--no-service`, `--existing`, repair mode, the eight verbs, the request thread flow, triggers, debounce, floor, cap, retention bounds, and the `agent`/`retention` keys.",
      "WHEN `grep -rn 'run start --owner' docs skills/delivery/slack-coordinator README.md` runs, it shall print nothing.",
      "WHEN `node scripts/validate.mjs` runs, it shall exit 0 with `EXPECTED_SKILL_COUNT` unchanged and `skills/delivery/slack-coordinator/SKILL.md` line 6 byte-identical.",
      "A `.changeset/slack-assistant-bot-dms.md` file shall exist with `\"@marktripoli/skills\": minor` and a body naming owner DMs, standing tasks, and `onboard`."
    ],
    "prompt": "Update the operator and agent documentation for the slack-coordinator assistant.\n\n`docs/slack-coordinator.md`: add `## Onboarding` (steps 1 to 8 as the terminal prints them, the two browser steps, `--no-service`, `--existing` for existing installs, repair mode, `onboard.json` resume, where the configuration token comes from and that it is never stored); `## Assistant DMs` (the eight `!` verbs with one line each, request threads: eyes reaction, `Working on it`/`Queued behind <n>`, answer edit or `Done` plus replies, `Failed` with stderr tail, follow-ups, non-owner refusal); `## Standing tasks` (proposal handshake with the confirm sentence and the confirm/cancel words, triggers `schedule`/`window end`/`each message`, 5-minute default debounce, 10-minute floor, `agent.max_runs_per_hour`, delivery header `t<id> · #chan · N new items`, three-failure pause, `!resume`); `## Configuration` with the `agent:` (`command`, `approval` edits|full and what each permits per binary, `timeout`, `max_runs_per_hour`, `extra_dirs`) and `retention:` (`days`, `consumed_days`) keys and the purge bounds table; a `## Trust boundary` paragraph: the agent runs in `<root>/workspace/runs/<id>` with a scrubbed environment, never holds a Slack token, and `edits` is the default. Link the embedded skill text at `tools/slack-coordinator/internal/assistant/skill/ASSISTANT.md` and the manifest at `tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml`. Keep the existing run-thread sections; ensure no `run start --owner` remains anywhere in `docs/` or `skills/delivery/slack-coordinator/`.\n\n`skills/delivery/slack-coordinator/SKILL.md`: in the binary-prerequisite paragraph add one sentence that operators set up the daemon with `slack-coordinator onboard` (or `setup` non-interactively); do not touch line 6 or the frontmatter. `README.md` `## Slack coordinator`: one sentence naming DMs and standing tasks. Add `.changeset/slack-assistant-bot-dms.md` with `\"@marktripoli/skills\": minor` and a body naming owner DMs, standing tasks, and `onboard`.\n\nProof: `node scripts/validate.mjs` passes; `grep -rn 'run start --owner' docs skills/delivery/slack-coordinator` returns nothing; the changeset file exists. Skip formatters, linters, and the full `npm test`."
  }
]
```

## Slice Check

| Child | Observable increment | Size evidence | Merge safety |
|---|---|---|---|
| run start uses the configured owner and rejects --owner | `run start --owner` exits 2; runs carry the config owner | CLI flag, `StartRunInput`, `start_run.go`, three doc/skill lines, tests; ~120 lines | Breaking only for a flag no documented caller passes; run-thread flow unchanged |
| config.yaml loads agent and retention sections with defaults and validation | Enabler; consumers: adapters, owner DM requests, onboard | `config.go` two structs, defaults, validation; `paths.go` four funcs; tests; ~200 lines | Additive keys with defaults; an existing file keeps loading |
| state.sqlite carries the eight assistant tables | Enabler; consumers: owner DM requests, collection | `schema.go` DDL and tests; ~150 lines | Idempotent `CREATE TABLE IF NOT EXISTS`; no existing table altered |
| slackapi client gains the six assistant methods | Enabler; consumers: owner DM requests, onboard app creation | `client.go` seven methods (two hand-rolled manifest posts), `internal/manifest` embed and file move, fake-server tests; ~320 lines | Unused methods until consumers merge; manifest content unchanged |
| agent adapters name argv per binary and approval level | Enabler; consumer: agent runner | `adapter.go` interface, `Lookup`, three argv tables, table tests; ~150 lines. Split from the TDD's w4 runner (workflow step: argv before process) | No caller |
| agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout | Enabler; consumer: DM answer | `run.go`, `rundir.go`, fake script, process tests; ~400 lines. Proposal parsing split out | No caller |
| proposal.json is validated into a Proposal on run exit | Enabler; consumer: proposal render | `proposal.go`, `Validate`, `Wait` hook, tests; ~200 lines | Fills `RunOutcome` fields no caller reads yet |
| inbound envelopes route through the assistant package while run-thread replies keep working | Enabler; consumer: owner DM requests (run-thread replies keep working, proven by the moved fixture) | New package skeleton, `ConsumeInbound` move, `RecordOwnerInput` export, daemon wiring, moved test; ~200 lines. Split from w5 as the refactor step before the feature | Behavior-preserving refactor covered by the existing envelope fixture and CLI tests |
| owner DMs are recorded as requests and acked in a thread | Owner DMs get an eyes reaction and a thread ack | `routeDM`, `newRequest`, two db files, manifest scopes, doc line, tests; ~300 lines. Split from w5: verbs, refusal, and the router move are siblings | Reachable only with `agent:` configured (new key); otherwise a fixed reply |
| non-owner DMs get one refusal, then silence | A stranger gets one message | Router branch, one db func, tests; ~80 lines | Additive |
| !help, !status, and !runs answer questions about the daemon from the DM | `!help`, `!status`, `!runs` answer from the DM | Verb dispatch, three verbs, count queries, disk walk, tests; ~220 lines. Split from w5's eight verbs: self-description before task management | Additive |
| !tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM | `!tasks` … `!cancel` manage task rows | Five verbs, `NextDue`, task db funcs, tests; ~300 lines | Additive; acts only on rows no path creates yet |
| a DM request runs the agent and its answer replaces the Working on it ack | A DM gets an agent answer in its thread | `ASSISTANT.md`, `prompt.go`, `dispatcher.go` slots and wake, success delivery, daemon option, db funcs, tests, one CLI end-to-end; ~500 lines. Split from w6: failures, chunking, reap, cap, follow-ups are siblings | Reachable only with `agent:` configured |
| a failed DM run edits the ack to Failed with the cause and stderr tail | A failed run says why in the thread | `deliverFailure`, four causes, tests; ~100 lines. Split from the DM answer as its failure class | Additive |
| answers over 4,000 characters post as Done plus chunked thread replies | Long answers arrive whole | `chunk` and long path, tests; ~90 lines | Additive |
| running rows from a previous daemon pid are killed and reported as Failed | A daemon restart leaves no orphan agent and no stale ack | `reapOrphans`, handle tracking, tests; ~150 lines | Additive |
| the hourly run cap holds queued runs and logs the held batch | 31st run in an hour waits | One count and branch, tests; ~70 lines | Additive; default cap 30 |
| owner replies in a request thread run a follow-up with the thread history | Thread replies continue the conversation | Router follow-up path, spawnable select, prompt history, claim update, tests; ~200 lines | Additive |
| a task proposal is rendered into the request thread with the confirm sentence | Owner sees the parsed task with the confirm sentence | `proposals.go` resolve, tz fill, render, pending store, `ProposalErr` path, tests; ~250 lines. Split from w7: confirm and cancel are siblings | Additive; a pending proposal is stored, not acted on |
| yes records the pending proposal as a standing task | `yes` creates `t1` | Confirm words, `InsertTask`, `task_channels`, reply, tests; ~180 lines | Additive |
| no drops a pending proposal and any other reply re-runs the agent with it | `no` drops; prose corrects | Cancel branch, prompt section, replace/clear on completion, tests; ~120 lines | Additive |
| messages in watched channels are collected for each active task | Channel messages land in `collected_messages` | `collect`, three db funcs, tests; ~180 lines | Additive; no rows without an active task |
| schedule and window-end tasks run at their due time and deliver results | A digest arrives at the scheduled minute | Enqueue, `messages.jsonl`, task prompt, task delivery, next due or complete, silent failure bookkeeping, tests; ~400 lines. Split from w8+w9: each_message, failure report, pause, purge are siblings | Additive; no active task exists until confirm merges |
| a failed task run reports Failed to its target and keeps the batch | A broken task run says so at its target | Failure post, tests; ~80 lines. Split from the scheduled-run child as its failure class | Additive |
| each-message tasks run when the debounce window closes under the 10-minute floor | Bug-bash triage runs per batch | Due select with floor, tests; ~120 lines | Additive |
| three consecutive task failures pause the task and DM the owner | A broken task stops and says why | Pause branch, `!resume` reset, tests; ~90 lines | Additive |
| a daily purge deletes consumed messages and stale runs, tasks, and DM threads | Rows past retention disappear daily | `purge.go` loop, `db/purge.go` one transaction, tests; ~250 lines. Split from w10: directory sweep is a sibling | Additive loop; unconsumed rows never selected |
| the purge removes run directories of deleted and orphaned runs | `workspace/runs` stops growing | Directory sweep, existence query, tests; ~70 lines | Additive |
| onboard creates the Slack app and collects both tokens through a resumable checkpoint | `onboard` creates the app and holds both tokens in a checkpoint | New package: checkpoint, steps 1 to 4, cobra command, tests; ~350 lines. Split from w11: owner/config/service, verify, repair, `--existing` are siblings | New command; `setup` untouched; stops after step 4 with a printed notice |
| onboard resolves the owner, writes config.yaml, and starts the daemon | `onboard` ends with a configured, running daemon | Steps 5 and 6, config merge, service or `daemon start`, tests; ~250 lines | Additive steps of the new command |
| onboard finishes only when the owner replies to the setup DM within 120 seconds | `onboard` exits 0 only after a real DM round trip | IPC method, router intercept, client deadline, step 7/8, repair menu, tests; ~350 lines | Additive method; `onboard` was already runnable |
| onboard --existing updates an installed app's manifest and re-verifies | Existing installs gain DM scopes | `--existing` path, config preserve, tests; ~150 lines | Additive flag |
| docs describe onboarding, DMs, and standing tasks, and the changeset records the release | Operators can read the new surface | Five doc sections, skill sentence, README line, changeset; prose only | Docs only |

## Ordering

- Wave 1: run start uses the configured owner and rejects --owner; config.yaml loads agent and retention sections with defaults and validation; state.sqlite carries the eight assistant tables; slackapi client gains the six assistant methods; inbound envelopes route through the assistant package while run-thread replies keep working
- Wave 2: agent adapters name argv per binary and approval level; owner DMs are recorded as requests and acked in a thread; onboard creates the Slack app and collects both tokens through a resumable checkpoint
- Wave 3: agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout; non-owner DMs get one refusal, then silence; !help, !status, and !runs answer questions about the daemon from the DM; messages in watched channels are collected for each active task; onboard resolves the owner, writes config.yaml, and starts the daemon
- Wave 4: proposal.json is validated into a Proposal on run exit; !tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM; a DM request runs the agent and its answer replaces the Working on it ack; onboard finishes only when the owner replies to the setup DM within 120 seconds
- Wave 5: a failed DM run edits the ack to Failed with the cause and stderr tail; answers over 4,000 characters post as Done plus chunked thread replies; the hourly run cap holds queued runs and logs the held batch; owner replies in a request thread run a follow-up with the thread history; schedule and window-end tasks run at their due time and deliver results; onboard --existing updates an installed app's manifest and re-verifies
- Wave 6: running rows from a previous daemon pid are killed and reported as Failed; a task proposal is rendered into the request thread with the confirm sentence; a failed task run reports Failed to its target and keeps the batch; each-message tasks run when the debounce window closes under the 10-minute floor; a daily purge deletes consumed messages and stale runs, tasks, and DM threads
- Wave 7: yes records the pending proposal as a standing task; three consecutive task failures pause the task and DM the owner; the purge removes run directories of deleted and orphaned runs
- Wave 8: no drops a pending proposal and any other reply re-runs the agent with it
- Wave 9: docs describe onboarding, DMs, and standing tasks, and the changeset records the release

After the last wave the program's acceptance runs once: `npm test` (includes `go test -race ./... && go vet ./...`), then the fresh-machine walkthrough (`onboard` to first DM reply under 30 minutes, digest at the scheduled minute, run-thread regression) recorded as an `evidence` artifact in this task directory.

## Workflow judgments

| Child | Chosen | Suggested | Confidence |
|---|---|---|---|
| run start uses the configured owner and rejects --owner | oneshot | oneshot | 0.97 |
| config.yaml loads agent and retention sections with defaults and validation | oneshot | oneshot | 0.80 |
| state.sqlite carries the eight assistant tables | oneshot | oneshot | 0.89 |
| slackapi client gains the six assistant methods | oneshot | oneshot | 0.76 |
| agent adapters name argv per binary and approval level | oneshot | oneshot | 0.75 |
| agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout | oneshot | oneshot | 0.55 |
| proposal.json is validated into a Proposal on run exit | oneshot | oneshot | 0.77 |
| inbound envelopes route through the assistant package while run-thread replies keep working | oneshot | oneshot | 0.52 |
| owner DMs are recorded as requests and acked in a thread | oneshot | oneshot | 0.45 |
| non-owner DMs get one refusal, then silence | oneshot | oneshot | 0.88 |
| !help, !status, and !runs answer questions about the daemon from the DM | oneshot | oneshot | 0.52 |
| !tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM | oneshot | oneshot | 0.52 |
| a DM request runs the agent and its answer replaces the Working on it ack | oneshot | oneshot | 0.39 |
| a failed DM run edits the ack to Failed with the cause and stderr tail | oneshot | oneshot | 0.39 |
| answers over 4,000 characters post as Done plus chunked thread replies | oneshot | oneshot | 0.83 |
| running rows from a previous daemon pid are killed and reported as Failed | oneshot | oneshot | 0.80 |
| the hourly run cap holds queued runs and logs the held batch | oneshot | oneshot | 0.72 |
| owner replies in a request thread run a follow-up with the thread history | oneshot | oneshot | 0.65 |
| a task proposal is rendered into the request thread with the confirm sentence | oneshot | oneshot | 0.60 |
| yes records the pending proposal as a standing task | oneshot | oneshot | 0.60 |
| no drops a pending proposal and any other reply re-runs the agent with it | oneshot | oneshot | 0.52 |
| messages in watched channels are collected for each active task | oneshot | oneshot | 0.49 |
| schedule and window-end tasks run at their due time and deliver results | oneshot | oneshot | 0.56 |
| a failed task run reports Failed to its target and keeps the batch | oneshot | oneshot | 0.54 |
| each-message tasks run when the debounce window closes under the 10-minute floor | oneshot | oneshot | 0.65 |
| three consecutive task failures pause the task and DM the owner | oneshot | oneshot | 0.74 |
| a daily purge deletes consumed messages and stale runs, tasks, and DM threads | oneshot | oneshot | 0.77 |
| the purge removes run directories of deleted and orphaned runs | oneshot | oneshot | 0.75 |
| onboard creates the Slack app and collects both tokens through a resumable checkpoint | oneshot | oneshot | 0.80 |
| onboard resolves the owner, writes config.yaml, and starts the daemon | oneshot | oneshot | 0.88 |
| onboard finishes only when the owner replies to the setup DM within 120 seconds | oneshot | oneshot | 0.83 |
| onboard --existing updates an installed app's manifest and re-verifies | oneshot | oneshot | 0.80 |
| docs describe onboarding, DMs, and standing tasks, and the changeset records the release | oneshot | oneshot | 0.83 |

## Sizing judgments

- helper size-children: model `jev-1.13.0`, tokens `39871` in / `4292` out (run on the 25 first-cut children before splitting)

| Child | Verdict | Weakest test | Probability | Criteria | Split named |
|---|---|---|---|---|---|
| run start uses the configured owner and rejects --owner | ok | single_obligation | 0.71 | ok | none (suggested `layer_batch` 0.49) |
| config.yaml loads agent and retention sections with defaults and validation | unclear | single_obligation | 0.41 | ok | none (suggested `layer_batch` 0.27) |
| state.sqlite carries the eight assistant tables | ok | single_obligation | 0.74 | ok | none |
| slackapi client gains the six assistant methods | unclear | single_obligation | 0.47 | ok | none (suggested `layer_batch` 0.64) |
| agent adapters name argv per binary and approval level | split of `agent runner spawns an adapter in a 0700…` (split, 0.23) | single_obligation | 0.23 | unclear | applied `workflow_step` by this skill |
| agent runner spawns an adapter in a 0700 run directory and reads result.md or stdout | split | single_obligation | 0.23 | unclear | none (suggested `workflow_step` 0.42) |
| proposal.json is validated into a Proposal on run exit | unclear | single_obligation | 0.44 | ok | none (suggested `workflow_step` 0.20) |
| inbound envelopes route through the assistant package while run-thread replies keep working | split of `owner DMs are received, recorded as requ…` (split, 0.25) | single_obligation | 0.25 | ok | applied `workflow_step` by this skill |
| owner DMs are recorded as requests and acked in a thread | split of `owner DMs are received, recorded as requ…` (split, 0.25) | single_obligation | 0.25 | ok | applied `workflow_step` by this skill |
| non-owner DMs get one refusal, then silence | ok | merge_safe | 0.62 | ok | none (suggested `failure_path` 0.49) |
| !help, !status, and !runs answer questions about the daemon from the DM | split of `the eight ! verbs are answered by the da…` (split, 0.31) | single_obligation | 0.31 | ok | applied `workflow_step` by this skill |
| !tasks, !show, !pause, !resume, and !cancel manage standing tasks from the DM | split of `the eight ! verbs are answered by the da…` (split, 0.31) | single_obligation | 0.31 | ok | applied `workflow_step` by this skill |
| a DM request runs the agent and its answer replaces the Working on it ack | split | single_obligation | 0.39 | ok | none (suggested `workflow_step` 0.52) |
| a failed DM run edits the ack to Failed with the cause and stderr tail | split of `a DM request runs the agent and its answ…` (split, 0.39) | single_obligation | 0.39 | ok | applied `workflow_step` by this skill |
| answers over 4,000 characters post as Done plus chunked thread replies | unclear | single_obligation | 0.56 | ok | none (suggested `failure_path` 0.25) |
| running rows from a previous daemon pid are killed and reported as Failed | unclear | single_obligation | 0.43 | ok | none (suggested `failure_path` 0.31) |
| the hourly run cap holds queued runs and logs the held batch | unclear | single_obligation | 0.49 | ok | none (suggested `workflow_step` 0.42) |
| owner replies in a request thread run a follow-up with the thread history | split | single_obligation | 0.35 | ok | none (suggested `workflow_step` 0.57) |
| a task proposal is rendered into the request thread with the confirm sentence | split of `a task proposal is rendered with the con…` (split, 0.37) | single_obligation | 0.37 | ok | applied `workflow_step` by this skill |
| yes records the pending proposal as a standing task | split of `a task proposal is rendered with the con…` (split, 0.37) | single_obligation | 0.37 | ok | applied `workflow_step` by this skill |
| no drops a pending proposal and any other reply re-runs the agent with it | unclear | single_obligation | 0.40 | ok | none (suggested `workflow_step` 0.56) |
| messages in watched channels are collected for each active task | unclear | single_obligation | 0.40 | ok | none (suggested `workflow_step` 0.49) |
| schedule and window-end tasks run at their due time and deliver results | split | single_obligation | 0.37 | unclear | none (suggested `workflow_step` 0.59) |
| a failed task run reports Failed to its target and keeps the batch | split of `schedule and window-end tasks run at the…` (split, 0.37) | single_obligation | 0.37 | unclear | applied `workflow_step` by this skill |
| each-message tasks run when the debounce window closes under the 10-minute floor | split | single_obligation | 0.36 | ok | none (suggested `workflow_step` 0.59) |
| three consecutive task failures pause the task and DM the owner | split | single_obligation | 0.39 | ok | none (suggested `workflow_step` 0.71) |
| a daily purge deletes consumed messages and stale runs, tasks, and DM threads | split of `a daily purge removes consumed messages,…` (split, 0.33) | single_obligation | 0.33 | unclear | applied `workflow_step` by this skill |
| the purge removes run directories of deleted and orphaned runs | split of `a daily purge removes consumed messages,…` (split, 0.33) | single_obligation | 0.33 | unclear | applied `workflow_step` by this skill |
| onboard creates the Slack app and collects both tokens through a resumable checkpoint | split of `onboard takes a fresh workspace to a con…` (split, 0.38) | single_obligation | 0.38 | unclear | applied `workflow_step` by this skill |
| onboard resolves the owner, writes config.yaml, and starts the daemon | split of `onboard takes a fresh workspace to a con…` (split, 0.38) | single_obligation | 0.38 | unclear | applied `workflow_step` by this skill |
| onboard finishes only when the owner replies to the setup DM within 120 seconds | unclear | single_obligation | 0.47 | unclear | none (suggested `layer_batch` 0.24) |
| onboard --existing updates an installed app's manifest and re-verifies | unclear | single_obligation | 0.46 | unclear | none (suggested `layer_batch` 0.35) |
| docs describe onboarding, DMs, and standing tasks, and the changeset records the release | unclear | single_obligation | 0.43 | unclear | none (suggested `layer_batch` 0.32) |

## Human Review

### Review targets

- Thirty-three children in nine waves: whether the extra waves from cutting onboarding (two steps), `!` verbs (two groups), and DM/task failure classes are worth the smaller pull requests, or whether the first cut's 25 children were the better trade.
- Wave-1 enablers (`slackapi` methods, schema, adapters) whose consumers land in wave 2 or 3, against the slicing guide's "same wave or the next one" rule.
- The ack rule at insert time (owner-DM child) versus the ack edit at spawn (DM-answer child) as the seam between the two.
- Interim states visible on the epic branch only: a request row that nothing spawns until the DM-answer child merges, `onboard` stopping after step 4 then step 6 with a printed notice, task verbs answering `not available yet`.
- `NextDue` owned by the task-verbs child and `InsertTask` by the confirm child.
- Docs as one final child rather than per-child doc edits.

### Verify

- [ ] Confirm the adapter argv tables (`omp` 18.1.22, `claude` 2.1.258, `codex` 0.155.1) match the binaries on the walkthrough machine; the adapters child's prompt is the one place to change them.
- [ ] Confirm the manifest scope change may merge in wave 2 before `onboard --existing` ships (existing installs apply the manifest by hand until then).
- [ ] Confirm the pinned `slack-go` lacks `apps.manifest.*` helpers; if it has them, the slackapi child uses them instead of hand-rolled form posts.
- [ ] Confirm `go:embed` of the moved manifest does not break any script or doc that names `tools/slack-coordinator/slack-app-manifest.yaml` (`grep -rn slack-app-manifest.yaml`).

### Known limits

- Sizing helper: eleven first-cut children returned `verdict: split` with `split: null` (no named split; `suggested_split` low confidence). Eight were split by workflow step by this skill (adapters/runner, router/requests, self verbs/task verbs, DM answer/failed DM, render/confirm, task runs/task failure, purge/run directories, onboard steps 1-4/5-6). Three were kept whole because each is one rule with one exception at roughly 100 to 200 lines and the helper named no split: `owner replies in a request thread run a follow-up with the thread history`, `each-message tasks run when the debounce window closes under the 10-minute floor`, `three consecutive task failures pause the task and DM the owner`. The helper was not re-run after splitting; split-derived rows in Sizing judgments carry their parent's verdict.
- Workflow routing was re-run on the final 33 children; every suggestion was `oneshot`, and no differing helper `workflow` reached 0.8 confidence, so every child keeps `oneshot`.
- Each child's prompt carries the schema, argv tables, and constants it needs because child sessions cannot read this task directory; a later change to a shared contract must be repeated in every unmerged child's `task.md`.
- Line estimates in Slice Check are read from the design, not measured.
