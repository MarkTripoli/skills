# Slack coordinator

The `slack-coordinator` daemon owns Slack credentials, its Socket Mode connection, and coordination state. Agents interact with it only through the `slack-coordinator` CLI; they do not read tokens or call Slack APIs directly. The skill lives at `skills/slack-coordinator/` and is explicitly invoked by an orchestrator when coordination is wanted; `deliver` and `describe-pr` do not automatically create Slack threads. GitHub PR and task-index workflows remain independent.

## Install

Skill installation does not install this binary. From a checkout of this collection, with the Go version named in `tools/slack-coordinator/go.mod`:

```sh
go build -o slack-coordinator ./tools/slack-coordinator/cmd/slack-coordinator
```

Put that file on `PATH`, then run `slack-coordinator onboard` as described below.

When the bot token, the app-level token, and the owner id are already known, skip the walkthrough:

```sh
SLACK_BOT_TOKEN=xoxb-… SLACK_APP_TOKEN=xapp-… slack-coordinator setup --owner U… --install-service
slack-coordinator daemon status
```

`setup` reads `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` from the environment, checks both against Slack, and writes `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator`, mode 0600). It never reads a repository `.env`. `--install-service` installs the supervisor. Without that flag, start the process with `slack-coordinator daemon start`.

## Onboarding

Run `slack-coordinator onboard` in a terminal. The walkthrough prints and performs these steps:

1. Create an app configuration token at [api.slack.com/apps](https://api.slack.com/apps) under **Your App Configuration Tokens > Generate**. This token authorizes app creation and manifest updates; it is held only in memory and never stored.
2. Enter an app name, or press Enter to use “Slack assistant”; the CLI creates the app from its embedded manifest.
3. The browser opens the workspace install page. Allow the install, then paste the Bot User OAuth Token shown under **OAuth & Permissions**.
4. The browser opens **Basic Information**. Generate an app-level token with `connections:write` and paste it.
5. Enter the owner’s workspace email or Slack user ID, then confirm the resolved user.
6. The CLI checks both tokens, writes `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator`), and installs a launchd (macOS) or systemd user service.
7. The bot DMs the owner; reply in Slack within two minutes to verify the setup.
8. The CLI reports verification and tells you to invite the bot to watched channels and DM it `!help`.

Use `--no-service` to start the daemon detached until logout or reboot instead of installing a service; `slack-coordinator service install` can add supervision later. For an already installed app, `--existing` updates its manifest, asks you to reinstall it for updated scopes, and lets you keep or replace the bot token. If a config already exists, normal onboarding offers repair mode: re-verify, reinstall the service, or replace a token. An interrupted walkthrough resumes from `$SLACK_COORDINATOR_HOME/onboard.json`; successful verification removes the checkpoint. The app configuration token comes from Slack’s **Your App Configuration Tokens** page, is requested only when needed, and is never written to config or the checkpoint.

The full embedded app manifest is [slack-app-manifest.yaml](../tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml). Setup’s `onboard` command is interactive; `slack-coordinator setup` remains available for non-interactive configuration when tokens and owner are already known.

## Maintain

Everything the daemon owns lives under `$SLACK_COORDINATOR_HOME` (default `~/.slack-coordinator`, mode 0700):

| Path | Role |
|---|---|
| `config.yaml` | Bot token, app-level token, owner, and optional `agent` and `retention` settings. Mode 0600. |
| `state.sqlite` | Runs, standing tasks, and DM threads. |
| `socket` | Unix socket the CLI uses to reach the daemon. |
| `daemon.log` | Daemon stdout and stderr, including the supervised process. |
| `daemon.pid` | Pid recorded by `daemon start`. |
| `daemon.lock` | Refuses a second daemon for this home. |
| `onboard.json` | Walkthrough checkpoint. A verified setup deletes it. |
| `workspace/runs/<id>` | One headless agent run: `prompt.md` in, `result.md` or `proposal.json` out. |
| `slack-coordinator.plist` | macOS launchd agent. |

On Linux the unit is `~/.config/systemd/user/com.marktripoli.slack-coordinator.service`. The label on both platforms is `com.marktripoli.slack-coordinator`.

### Service

```sh
slack-coordinator service install
slack-coordinator service status
slack-coordinator service uninstall
```

`service install` writes the definition for this binary and this home, then starts supervision. The definition runs `slack-coordinator daemon serve` at login and restarts it after exit. Run `service install` again after the binary moves or `SLACK_COORDINATOR_HOME` changes; the definition records both. macOS loads `slack-coordinator.plist` with `launchctl load -w`. Linux runs `systemctl --user daemon-reload` and `systemctl --user enable --now`.

`daemon start` launches a detached process until logout or reboot when no service is installed, and prints `daemon already running` when the socket already answers. `daemon status` prints `{"socket_mode":"…"}`. `daemon stop` asks for a clean shutdown. If a service is installed it also prints `service installed; use service uninstall to stop supervision`, because the supervisor starts the daemon again. `service uninstall` is what ends that loop.

### Upgrade

1. Rebuild or replace the `slack-coordinator` binary on `PATH`.
2. Run `slack-coordinator service install` so supervision points at that binary.
3. When a release adds Slack scopes, run `slack-coordinator onboard --existing`. It updates the installed app’s manifest, asks you to reinstall the app, and accepts a new bot token or Enter to keep the current one.

Config, `state.sqlite`, and `workspace/` stay in place across an upgrade.

### Tokens

The app configuration token (`xoxe.xoxp-…`) is typed only while creating or updating the app. It is held in memory and is never written to `config.yaml` or `onboard.json`. Slack expires it; if a later step rejects it, generate another at [api.slack.com/apps](https://api.slack.com/apps) under **Your App Configuration Tokens**.

The bot token (`xoxb-…`) and the app-level token (`xapp-…`, scope `connections:write`) are the tokens stored in `config.yaml`. To rotate one, run `slack-coordinator onboard` where a config already exists. The menu is `Existing setup found. [1] re-verify [2] reinstall service [3] replace a token`.

- `1` checks the current setup by asking the owner to answer a DM.
- `2` reinstalls the service. With `--no-service` it restarts the detached daemon instead.
- `3` asks which token, checks the new value against Slack, writes it, leaves every other config key as it was, and restarts the daemon.

Repair never creates a second Slack app.

### When the daemon is down

1. Run `slack-coordinator daemon status`. Exit `11` with `daemon unreachable` means nothing is listening on `socket`.
2. Read `daemon.log`.
3. If `slack-coordinator service status` reports the service installed, run `slack-coordinator service install` to rewrite and reload it. If the service is not installed, run `slack-coordinator daemon start`.
4. If the process is up but Slack rejects the tokens, run `slack-coordinator onboard` and choose re-verify or replace a token.

An agent that gets exit `11` from `run check` waits and retries. It does not install the service, start the daemon, or rotate a token.

## Assistant DMs

The owner can send these commands as a top-level DM:

- `!help` — list commands; other text starts an assistant request.
- `!status` — show daemon uptime, Socket Mode, run/task counts, agent, and disk use.
- `!tasks` — list active and paused standing tasks.
- `!show <id>` — show a task’s details and recent run results.
- `!runs` — list active coding-agent runs.
- `!pause <id>` — pause a standing task.
- `!resume <id>` — resume a paused task.
- `!cancel <id>` — cancel a standing task.
- `!to <run-id> <message>` — post an owner message in that active run’s thread.

A new request gets an eyes reaction and a threaded `Working on it` acknowledgement, or `Queued behind <n>` when earlier work is ahead. On success, the acknowledgement is edited with the answer when it fits; longer answers edit it to `Done` and post the answer in thread replies. On failure, the acknowledgement becomes `Failed` and a thread reply includes the failure and stderr tail. Owner follow-ups in a request thread are collected for the next run; messages from non-owners receive one refusal and later messages are silently dropped.

For `omp` and `claude` assistant runs, the last recognized model name in the owner’s request selects the model; a later name corrects an earlier one. Recognized names include Sonnet, Haiku, and Opus (including supported version phrases). `omp` uses the corresponding `claude-bridge` model ID and `claude` uses its short alias. `codex` always uses `gpt-6-luna`, regardless of model names in the request.

The embedded agent instructions are [ASSISTANT.md](../tools/slack-coordinator/internal/assistant/skill/ASSISTANT.md).

## Standing tasks

An owner can ask the assistant for recurring work or work that waits on future channel messages. The agent proposes a task in the request thread; the owner must confirm the rendered proposal by replying `yes`, `y`, `confirm`, `confirmed`, `ok`, `okay`, `go`, `do it`, `👍`, or `:+1:`. Reply `no`, `n`, `cancel`, `never mind`, `nevermind`, `forget it`, or `drop it` to discard it, or reply with changes to revise it. A proposal with unresolved channels cannot be confirmed until the bot is invited and the channel resolves.

Triggers are `schedule` (daily at a timezone, every N hours, or once at a time), `window end` (run when the requested collection window ends), and `each message` (collect channel messages and run after a quiet debounce). The default debounce is 5 minutes; the enforced minimum gap between `each message` runs is 10 minutes. `agent.max_runs_per_hour` caps how many runs the daemon starts in an hour. Delivery begins with `t<id> · #chan · N new items`. Three consecutive task failures pause the task and DM the owner; fix the cause and use `!resume <id>` to continue.

## Configuration

`config.yaml` can include these optional agent settings and retention windows:

| Key | Meaning | Default |
|---|---|---|
| `agent.command` | Agent binary: `omp`, `claude`, or `codex`. | Required when `agent` is set |
| `agent.approval` | `edits` permits file edits in the run directory, workspace, and `extra_dirs`; `full` also permits commands that change things outside those locations. | `edits` |
| `agent.timeout` | Maximum run time. | `10m` |
| `agent.max_runs_per_hour` | Maximum runs started in an hour. | `30` |
| `agent.extra_dirs` | Additional absolute paths the agent may edit. | `[]` |
| `retention.days` | Age after which old runs, completed/cancelled tasks, and inactive DM threads are purged. | `30` |
| `retention.consumed_days` | Age after which messages already consumed by the owner are removed. | `7` |

Purge bounds are:

| Data | Purge rule |
|---|---|
| Consumed task messages | Remove after `consumed_days`; unconsumed messages are retained. |
| Run history | Remove finished runs older than `days` only when more than the newest 20 for that task or DM thread. |
| Completed or cancelled tasks | Remove the task and its runs after `days`. |
| Inactive DM threads | Remove the request, messages, and runs after `days` since the last message. |
| Run directories | Remove when their run records are purged; orphan run directories are cleaned up. |

## Trust boundary

The agent runs in `<root>/workspace/runs/<id>` with a scrubbed environment; it never holds a Slack token. Approval mode `edits` is the default. The daemon alone owns Slack tokens, the Socket Mode connection, and SQLite; the CLI communicates with it over a local Unix socket. The daemon, CLI, and coding agents run as the same operating-system user, so this is not a security boundary against code already running as that user.

## Operating model

Use the CLI when an orchestrator has explicitly requested Slack coordination for a work run. Start one Slack thread for the run; a private run can use the configured owner’s bot DM:

```sh
slack-coordinator run start --work <s> --goal <s> --scope <s> [--link <url>]... [--dm | --channel <C…|#name>] [--repo <path>] [--run-id <id>]
```

The command prints `{"run_id","channel_id","thread_ts","permalink"}`. Keep the `run_id`: every later command addresses that run. Unless `--channel` is supplied, the channel is selected from the repository root `AGENTS.md`; `--dm` and `--channel` are mutually exclusive.

Before every state-changing action, run `slack-coordinator run check --run-id <id>`. Exit `0` permits the action; exit `10` means handle the oldest owner reply, then use `run resolve --run-id <id> --message-ts <input.message_ts> --outcome applied|rejected|answered --reply <s>` and check again. Exit `11` means pause and retry the check; exit `12` means a local operator disabled Slack for this run, so proceed without further Slack calls. `run wait` can wait briefly for input while idle, but never replaces the check immediately before an action.

Report phase changes and blocker changes with `run event`. Routine changes are coalesced into an edit of the root message no more often than the run’s cadence (three hours by default); unchanged events do nothing. A new blocker and blocker changes update the root immediately. There are no hourly or other periodic reposts. Change the interval for one active run with `run cadence --run-id <id> --every <duration>`; positive whole-second durations such as `15m`, `1h`, or `3h` are accepted. Pending updates are rescheduled relative to the last root edit.

Other supported run operations:

- `run content --run-id <id> [--page <n>]` lists paged channel file metadata, bookmarks, tabs, and canvas ID/permalink. Canvas bodies and folder contents are not exposed by Slack’s documented API.
- `run list-items --run-id <id> --list-id <F…> [--cursor <cursor>]` reads one page from a List shared in the run channel; use the returned `response_metadata.next_cursor` for the next page.
- `run upload --run-id <id> --path <file> [--title <title>]` shares a regular, nonempty local file up to 20 MiB in the run thread. The daemon must be able to access the path. Check immediately before upload; the daemon checks again before writing.
- `run react --run-id <id> --emoji <name>` adds a reaction to the root message.
- `run finish --run-id <id> --outcome completed|failed|cancelled [--emoji <name|none>] [--completed <s>]... [--decision <s>]... [--unresolved <s>]... [--evidence <s>]... [--link <url>]...` updates the root immediately and makes the run terminal. It adds `white_check_mark`, `x`, or `black_square_for_stop` by default for completed, failed, or cancelled; `--emoji <name|none>` overrides or skips the reaction. A reaction failure does not undo the finished run and can be retried with `run react`.

The fixed fields and rendering for root, event, and completion messages are in the skill’s [messages reference](../skills/slack-coordinator/references/messages.md); command flags, JSON shapes, and exit codes are in the [command reference](../skills/slack-coordinator/references/commands.md).

## Break glass

`slack-coordinator run disable-slack --run-id <id>` prints the run's id, channel, and permalink and reads one line from stdin. Only the exact answer `yes` disables Slack for that run; anything else exits `1` and changes nothing. Afterwards `run check` exits `12`, `run event` and `run finish` keep recording in SQLite without posting, and every other run is untouched. Break glass is typed by a local operator at a terminal; the skill forbids an agent from piping the answer.

## Proof boundary

`npm run test:slack-coordinator` runs `go test -race`, `go vet`, and a temporary binary build without Slack credentials. Socket Mode inbound handling and connection health are unit-tested with injected events and an injected health source; the Slack Web API is represented by a fake HTTP server supplied through the test-only config key `slack.api_url`.

Live Slack delivery and owner replies over a real WebSocket, launchd or systemd restart after the daemon is killed, and live validation of run DM, cadence/root edits, channel content and List reads, file upload, reactions, and finish remain deferred evidence; they require a Slack workspace or supervising host. `run check` is a coordination gate, not a transaction around the action it precedes: an owner reply that arrives after a `ready` answer is seen at the next check.

## Documentation map

- [Agent skill](../skills/slack-coordinator/SKILL.md): when an agent calls each verb and the gate rule.
- [Command flow](../skills/slack-coordinator/references/commands.md): verbs, flags, JSON shapes, and exit codes.
- [Channel selection](../skills/slack-coordinator/references/channel-selection.md): when `--channel` is set and when `AGENTS.md` decides.
- [Messages](../skills/slack-coordinator/references/messages.md): fields of the root, status, and completion messages.
- [Testing](testing.md#slack-coordinator-proof-boundaries): the offline gate and deferred evidence.
