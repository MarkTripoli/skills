# Slack coordinator

Slack coordinator posts one Slack thread per run of agent work and lets the run owner steer that run from the thread. It is distributed as the `slack-coordinator` binary, built from `tools/slack-coordinator/`, and installed separately from agent skills.

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
| `config.yaml` | Bot token, app-level token, owner, and any `agent`, `retention`, or Jira keys. Mode 0600. |
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

The owner can send these eight commands as a top-level DM:

- `!help` — list commands; other text starts an assistant request.
- `!status` — show daemon uptime, Socket Mode, run/task counts, agent, and disk use.
- `!tasks` — list active and paused standing tasks.
- `!show <id>` — show a task’s details and recent run results.
- `!runs` — list active coding-agent runs.
- `!pause <id>` — pause a standing task.
- `!resume <id>` — resume a paused task.
- `!cancel <id>` — cancel a standing task.

A new request gets an eyes reaction and a threaded `Working on it` acknowledgement, or `Queued behind <n>` when earlier work is ahead. On success, the acknowledgement is edited with the answer when it fits; longer answers edit it to `Done` and post the answer in thread replies. On failure, the acknowledgement becomes `Failed` and a thread reply includes the failure and stderr tail. Owner follow-ups in a request thread are collected for the next run; messages from non-owners receive one refusal and later messages are silently dropped.

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

1. `run start --work --goal --scope [--link]...` posts the root message and prints `{"run_id","channel_id","thread_ts","permalink"}`. One run is one thread.
2. `run check --run-id <id>` runs immediately before every state-changing action. Its JSON `kind` and exit code decide what the agent does:

| Kind | Exit | Meaning |
|---|---|---|
| `ready` | `0` | Proceed |
| `owner_input` | `10` | The owner replied; `input.text` holds the oldest unanswered reply. Act on it, then `run resolve --message-ts <input.message_ts> --outcome applied\|rejected\|answered --reply <s>` and check again |
| `unavailable` | `11` | Socket Mode is down, a required post failed, or no daemon answered. Pause and retry; never bypass |
| `slack_disabled` | `12` | An operator broke glass on this run; proceed without further Slack calls |

Exit `1` is a refused confirmation, exit `2` a usage, config, or repository error; `run start`, `run event`, and `run finish` exit `11` for the same reasons `run check` does.

3. `run event --current [--completed]... [--decision]... [--blocker]... [--next]...` posts a status reply on phase changes and blockers; the daemon reposts the last status after one quiet interval (`daemon start --status-interval`, default one hour) with no newer event.
4. `run finish --outcome completed|failed|cancelled [--completed]... [--decision]... [--unresolved]... [--evidence]... [--link]...` posts the completion reply and makes the run terminal.

Every message renders its fixed fields in order and shows `None` for an empty one; the field tables are in the skill’s [messages reference](../skills/delivery/slack-coordinator/references/messages.md).

## Break glass

`slack-coordinator run disable-slack --run-id <id>` prints the run's id, channel, and permalink and reads one line from stdin. Only the exact answer `yes` disables Slack for that run; anything else exits `1` and changes nothing. Afterwards `run check` exits `12`, `run event` and `run finish` keep recording in SQLite without posting, and every other run is untouched. Break glass is typed by a local operator at a terminal; the skill forbids an agent from piping the answer.

## Proof boundary

`npm run test:slack-coordinator` runs `go test -race`, `go vet`, and a temporary binary build without Slack credentials. Socket Mode inbound handling and connection health are unit-tested with injected events and an injected health source; the Slack Web API is a fake HTTP server handed to the daemon through the test-only config key `slack.api_url`.

Live Slack delivery, owner replies over a real WebSocket, launchd or systemd restart after the daemon is killed, and Jira field writes are recorded under `.agents/tasks/i-want-new-skill/evidence/` and gate nothing. `run check` is a coordination gate, not a transaction around the action it precedes: an owner reply that arrives after a `ready` answer is seen at the next check.

## Documentation map

- [Agent skill](../skills/delivery/slack-coordinator/SKILL.md): when an agent calls each verb and the gate rule.
- [Command flow](../skills/delivery/slack-coordinator/references/commands.md): verbs, flags, JSON shapes, and exit codes.
- [Channel selection](../skills/delivery/slack-coordinator/references/channel-selection.md): when `--channel` is set and when `AGENTS.md` decides.
- [Messages](../skills/delivery/slack-coordinator/references/messages.md): fields of the root, status, and completion messages.
- [Testing](testing.md#slack-coordinator-proof-boundaries): the offline gate and deferred evidence.
