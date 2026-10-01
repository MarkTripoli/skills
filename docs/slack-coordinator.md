# Slack coordinator

Slack coordinator posts one Slack thread per run of agent work and lets the run owner steer that run from the thread. It is distributed as the `slack-coordinator` binary, built from `tools/slack-coordinator/`, and installed separately from agent skills. The agent skill lives at `skills/slack-coordinator/`, beside the delivery group. Delivery skills may use it, and none of them require it.

## Install

Skill installation does not install this binary. From a checkout of this collection, with the Go version named in `tools/slack-coordinator/go.mod`:

```sh
cd tools/slack-coordinator
mkdir -p "$HOME/.local/bin"
go build -o "$HOME/.local/bin/slack-coordinator" ./cmd/slack-coordinator
export PATH="$HOME/.local/bin:$PATH"
slack-coordinator onboard
```

Keep the binary at that path while the service is installed; if you move or rebuild it elsewhere, rerun `slack-coordinator service install`.

When the bot token, the app-level token, and the owner id are already known, skip the walkthrough:

```sh
read -s SLACK_BOT_TOKEN; echo
read -s SLACK_APP_TOKEN; echo
export SLACK_BOT_TOKEN SLACK_APP_TOKEN
slack-coordinator setup --owner U0123456789 --install-service
slack-coordinator daemon status
```

`read -s` keeps the tokens out of the shell history. `--bot-token-stdin` and `--app-token-stdin` read them from stdin instead (bot token first when both flags are set). Never paste a completed command that contains a token into chat, a ticket, or a shared log. If that happens, delete the line from shell history and rotate both tokens.

`setup` checks both tokens against Slack and writes `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator`, mode 0600). `--owner` is your member ID, not the bot, and not the placeholder `U…`. It never reads a repository `.env`. An `agent` block already in the file is kept. A successful setup deletes a leftover `onboard.json`, so a later `onboard` does not resume an abandoned app-creation flow when config.yaml is already valid. `--install-service` installs the supervisor and does not return until the daemon socket answers, or until that wait times out. When `agent.command` is set and `agent.bin` is empty, setup records that command's absolute path as `agent.bin` and runs `agent.bin --version` before reporting success. An existing `agent.bin` is left unchanged. Without `--install-service`, start the process with `slack-coordinator daemon start`. Direct messages other than `!` commands stay refused until `agent.command` is `pi`, `claude`, or `codex`.

## Onboarding

Run `slack-coordinator onboard` in a terminal to create a new Slack app. The configuration token is generated from the apps list at [api.slack.com/apps](https://api.slack.com/apps), under **Your App Configuration Tokens > Generate**, not from inside an app. It starts with `xoxe.xoxp-` or `xoxe-`, is held only in memory, and is never stored.

To connect a Slack app that already exists, use `setup` with that app's bot token and app-level token (`connections:write`). The app needs Socket Mode, the bot scopes in the embedded manifest, the `app_mention`, `message.channels`, `message.groups`, and `message.im` events, and the App Home Messages tab with **Allow users to send Slash commands and messages from the messages tab** checked. Without that checkbox Slack will not let anyone DM the bot, and the DM box shows “Sending messages to this app has been turned off.” The embedded manifest turns on the Messages tab and that checkbox, so `onboard` and `onboard --existing` set them. An app created by an older `onboard` has them off: run `onboard --existing`, or turn them on at `https://api.slack.com/apps/<app-id>/app-home`, then reload Slack. An `@mention` in a public or private channel starts or continues work only when the sender is `slack.owner_user_id`. A mention from anyone else is ignored: no reply and no run. `!` commands stay direct-message-only. An app installed before `app_mentions:read` was in the manifest must be reinstalled. `onboard --existing` updates the manifest of an app already recorded in config.yaml. Before it calls `apps.manifest.update` it prints the app ID, the owner recorded in config.yaml, and the scopes and events the embedded manifest will set, and it waits for `yes`. The CLI sends the manifest as JSON, the only format those Slack methods accept. The CLI first reads the live manifest with `apps.manifest.export`. The update keeps the live app name, description, long description, background color, and bot display name, and keeps `org_deploy_enabled: true` when org-wide deployment is enabled, because Slack refuses to turn it off. Everything else is replaced from the embedded manifest; scopes that are not in it are not kept. When Slack rejects a manifest, the error names each rejected field, for example `apps.manifest.update: invalid_manifest (/settings/org_deploy_enabled: Org readiness cannot be disabled once enabled)`.

The create walkthrough then prints and performs these steps:

1. Create an app configuration token at [api.slack.com/apps](https://api.slack.com/apps) under **Your App Configuration Tokens > Generate**. This token authorizes app creation and manifest updates; it is held only in memory and never stored.
2. Enter an app name, or press Enter to use “Slack assistant”; the CLI creates the app from its embedded manifest with that name as the app name and the bot display name.
3. The browser opens the workspace install page. Allow the install, then open **OAuth & Permissions** at `https://api.slack.com/apps/<app-id>/oauth` and copy the **Bot User OAuth Token** (`xoxb-…`). The CLI prints the URL with your app ID.
4. The browser opens **Basic Information** at `https://api.slack.com/apps/<app-id>/general`. Under **App-Level Tokens**, generate a token with `connections:write` and paste the `xapp-…` token.
5. Enter the owner’s workspace email or Slack user ID, then confirm the resolved user.
6. The CLI checks both tokens, writes `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator`), and installs a launchd (macOS) or systemd user service.
7. The bot DMs the owner; reply in Slack within two minutes to verify the setup. If no reply arrives, the CLI lists the likely causes, including a Messages tab that is turned off.
8. The CLI reports verification and tells you to invite the bot to watched channels and DM it `!help`.

Use `--no-service` to start the daemon detached until logout or reboot instead of installing a service; `slack-coordinator service install` can add supervision later. For an already installed app, `--existing` updates its manifest, asks you to reinstall it for updated scopes, and lets you keep or replace the bot token. If a config already exists, normal onboarding offers repair mode: re-verify, reinstall the service, or replace a token. During replacement, the CLI points to the app's token page when it knows the app ID; otherwise select the existing app at https://api.slack.com/apps first. An interrupted walkthrough resumes from `$SLACK_COORDINATOR_HOME/onboard.json`; successful verification removes the checkpoint. The app configuration token comes from Slack’s **Your App Configuration Tokens** page, is requested only when needed, and is never written to config or the checkpoint.

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

`service install` writes the definition for this binary and this home, then starts supervision. The definition runs `slack-coordinator daemon serve` at login and restarts it after exit. It also records the PATH of the shell that runs install, plus `/opt/homebrew/bin`, `/usr/local/bin`, and `~/.local/bin`. Launchd and systemd do not use a login shell's PATH; without that record the daemon reports `agent binary "pi" not found on PATH` even when a terminal can run `pi`. Run `service install` again from a shell where `command -v pi` (or `claude`, or `codex`) succeeds after the binary moves or that error appears. macOS loads `slack-coordinator.plist` with `launchctl load -w`. Linux runs `systemctl --user daemon-reload` and `systemctl --user enable --now`.

`daemon start` launches a detached process until logout or reboot when no service is installed, and prints `daemon already running` when the socket already answers. `daemon status` prints `{"socket_mode":"…"}`. `daemon stop` asks for a clean shutdown. If a service is installed it also prints `service installed; use service uninstall to stop supervision`, because the supervisor starts the daemon again. `service uninstall` is what ends that loop.

### Upgrade

1. Rebuild or replace the `slack-coordinator` binary on `PATH`.
2. In `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator/config.yaml`), set `agent.command` to `pi`, `claude`, or `codex`. The daemon will not load the file while that value is `omp` or anything else. `setup` keeps an existing agent block, so it does not change this line for you. If `agent.bin` still points at the previous binary, delete that line or set it to the absolute path of the new command. `service install` fills `agent.bin` only when the line is empty; a leftover path keeps launching the old binary.
3. Run `slack-coordinator service install` from a shell where `command -v` finds that command, so supervision points at the new coordinator binary and an empty `agent.bin` is recorded.
4. When a release adds Slack scopes, run `slack-coordinator onboard --existing`. It updates the installed app’s manifest, asks you to reinstall the app, and accepts a new bot token or Enter to keep the current one. Reinstall after `app_mentions:read` is added so an owner `@mention` in a channel reaches the bot.

Config, state.sqlite and workspace/ stay in place across an upgrade. Reinstall stops and reloads only the owned com.marktripoli service. Activation failure restores the previous owned definition and reloads it; inspect service status and daemon.log before retrying. No company-label migration occurs. To roll back, uninstall the new owned service, restore the prior binary and reinstall it; runtime data stays untouched.

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

The owner can send these nine commands as a top-level DM:

- `!help` — list commands; other text starts an assistant request.
- `!status` — show daemon uptime, Socket Mode, run/task counts, agent, and disk use.
- `!tasks` — list active and paused standing tasks.
- `!show <id>` — show a task’s details and recent run results.
- `!runs` — list active coding-agent runs.
- `!to <run-id> <message>` — deliver a message to one active coding-agent run; use `!runs` to find its ID and thread link.
- `!pause <id>` — pause a standing task.
- `!resume <id>` — resume a paused task.
- `!cancel <id>` — cancel a standing task.

A new request gets an eyes reaction and a threaded `Working on it` acknowledgement, or `Queued behind <n>` when earlier work is ahead. On success, the acknowledgement is edited with the answer when it fits; longer answers edit it to `Done` and post the answer in thread replies. On failure, the acknowledgement becomes `Failed` and a thread reply includes the failure and stderr tail. Owner follow-ups in a request thread are collected for the next run; messages from non-owners receive one refusal and later messages are silently dropped.

The same request path accepts an `@mention` of the bot in a public or private channel, but only from `slack.owner_user_id`. The acknowledgement is posted in that channel thread. A later message from the owner in that thread is a follow-up. A mention inside an active `slack-coordinator run` thread is steering for that run, not a second request. A mention from anyone else does nothing: no reply and no run. `!` commands are not recognized in a channel.

External coding agents can start a run with `slack-coordinator run start --dm` to open a separate thread in this same bot DM. The root shows the issue, Goal, and Scope; one thread status card is edited in place every three hours by default, and completion replaces that card. New blockers are separate immediate replies that mention the owner, so Slack notifies them. An agent can change its active run's cadence with `slack-coordinator run cadence --run-id <id> --every 1h`. A reply in that thread goes to the matching active run, not the headless assistant; a reply to a finished run receives guidance rather than starting new work. Top-level DMs without `!to` keep the assistant behavior above. The bot has one Slack identity, so tagging it outside a known run thread addresses the assistant, not a particular external agent. A run in a channel can still be steered by replying there.

The daemon persists each run's `run_id`, channel, and thread; it does not need to own the coding-agent processes. Replies wait in that inbox until the agent reads them. The daemon reacts with `:eyes:` to each owner reply it stores for an active run, including `!to` messages, so the owner sees the reply arrived before the agent answers. If no agent reads a reply within five minutes, the daemon posts one notice in the run's thread saying the agent may have stopped and that `!runs` lists active runs. The skill has an active run read it at least once a minute: `run check` between steps and before each state-changing action, and repeated `run wait --for <duration>` while idle, then `run resolve` to answer in its thread. Neither command interrupts an agent already reasoning or executing a tool. A run left active after its agent exits keeps receiving replies that nobody reads; `!runs` lists such runs. Use one run per directly addressable agent.

The embedded agent instructions are [ASSISTANT.md](../tools/slack-coordinator/internal/assistant/skill/ASSISTANT.md).

Every run passes `--model`. `pi` uses the `claude-bridge` provider on `claude-sonnet-5` (`claude-bridge/claude-sonnet-5`), never Anthropic and never pi's own default provider. `claude` uses `sonnet`. `codex` uses `gpt-6-luna`. An owner can name another model in that message, such as `for this please use opus 5.5`, and only that run changes. The next message that names no model returns to Sonnet or Luna. A standing task has no owner message, so it uses the command default. Codex stays on `gpt-6-luna` when the message names a Claude model.

## Standing tasks

An owner can ask the assistant for recurring work or work that waits on future channel messages. The agent proposes a task in the request thread; the owner must confirm the rendered proposal by replying `yes`, `y`, `confirm`, `confirmed`, `ok`, `okay`, `go`, `do it`, `👍`, or `:+1:`. Reply `no`, `n`, `cancel`, `never mind`, `nevermind`, `forget it`, or `drop it` to discard it, or reply with changes to revise it. A proposal with unresolved channels cannot be confirmed until the bot is invited and the channel resolves.

Triggers are `schedule` (daily at a timezone, every N hours, or once at a time), `window end` (run when the requested collection window ends), and `each message` (collect channel messages and run after a quiet debounce). The default debounce is 5 minutes; the enforced minimum gap between `each message` runs is 10 minutes. `agent.max_runs_per_hour` caps how many runs the daemon starts in an hour. Delivery begins with `t<id> · #chan · N new items`. Three consecutive task failures pause the task and DM the owner; fix the cause and use `!resume <id>` to continue.

## Configuration

`config.yaml` can include these optional agent settings and retention windows:

| Key | Meaning | Default |
|---|---|---|
| `agent.command` | Agent binary: `pi`, `claude`, or `codex`. | Required when `agent` is set |
| `agent.bin` | Absolute path of that binary. `setup` and `service install` fill it from this shell's PATH when it is empty. | Look up `agent.command` on PATH |
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

Run-channel content is available through `slack-coordinator run content --run-id <id>` (file metadata, bookmarks/links, tabs, channel canvas permalink) and `slack-coordinator run upload --run-id <id> --path <local-file>` (thread attachment). `slack-coordinator run list-items --run-id <id> --list-id <F…>` reads paged List rows and schema for Lists shared in the run channel (paid Slack workspaces only). Slack's documented [canvas section lookup](https://docs.slack.dev/reference/methods/canvases.sections.lookup/) do not include reading a canvas body, and its [method index](https://docs.slack.dev/reference/methods/) does not expose folder enumeration. Canvas access here is a permalink, not text; folder contents remain unavailable through the bot API. [List items](https://docs.slack.dev/reference/methods/slackLists.items.list/) are available to paid workspaces. Upgrade an existing installation with `slack-coordinator onboard --existing` and reinstall the Slack app to grant `files:read`, `files:write`, `bookmarks:read`, and `lists:read`, then restart the daemon on the new binary. See [commands](../skills/slack-coordinator/references/commands.md#channel-content) for limits.

For agent run commands, exit codes, break-glass rules, and Block Kit fields, use the [skill](../skills/slack-coordinator/SKILL.md) and its linked references. A `run check` result is not a transaction: replies arriving after `ready` appear at the next check. [Testing](testing.md#slack-coordinator-proof-boundaries) records what offline checks do and do not prove.
