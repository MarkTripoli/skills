# Slack coordinator

Slack coordinator posts one Slack thread per run of agent work and lets the run owner steer that run from the thread. It is distributed as the `slack-coordinator` binary, built from `tools/slack-coordinator/`, and installed separately from agent skills. The agent skill lives at `skills/slack-coordinator/`. Delivery skills may use it, and none of them require it. The daemon coordinates externally started runs; it does not launch coding agents or schedule work from Slack messages.

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

When the bot token, the app-level token, and the owner ID are already known, skip the walkthrough:

```sh
read -s SLACK_BOT_TOKEN; echo
read -s SLACK_APP_TOKEN; echo
export SLACK_BOT_TOKEN SLACK_APP_TOKEN
slack-coordinator setup --owner U0123456789 --install-service
slack-coordinator daemon status
```

`read -s` keeps tokens out of shell history. `--bot-token-stdin` and `--app-token-stdin` read them from stdin instead, bot token first when both flags are set. Never paste a completed command containing a token into chat, a ticket, or a shared log. If that happens, delete it from shell history and rotate both tokens.

`setup` checks both tokens against Slack, resolves the owner with `users.info`, and writes `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator`, mode 0600). `--owner` is your member ID, not the bot and not the placeholder `U…`. It never reads a repository `.env`. Existing Jira settings survive a token replacement. Successful setup deletes a leftover `onboard.json`. `--install-service` installs the supervisor and waits until the daemon socket answers, or that wait times out. Without it, an already-running daemon restarts to load the config; otherwise start it with `slack-coordinator daemon start`.

For Jira backlinks from `run start --jira-issue`, pass `--jira-base-url <url> --jira-email <email> --jira-field-id <customfield_N>` with `JIRA_API_TOKEN` in the environment; all four or none.

## Onboarding

Run `slack-coordinator onboard` in a terminal to create a new Slack app. The configuration token is generated at [api.slack.com/apps](https://api.slack.com/apps), under **Your App Configuration Tokens > Generate**, not inside an app. It starts with `xoxe.xoxp-` or `xoxe-`, is held only in memory, and is never stored.

The walkthrough performs these steps:

1. Collect an app configuration token.
2. Ask for an app name, defaulting to **Slack coordinator**, and create the app from the embedded manifest with that name as the app and bot display name.
3. Open the workspace install page. Allow the install, then copy the **Bot User OAuth Token** (`xoxb-…`) from **OAuth & Permissions** at `https://api.slack.com/apps/<app-id>/oauth`.
4. Open **Basic Information** at `https://api.slack.com/apps/<app-id>/general`. Generate an **App-Level Token** with `connections:write`, then paste the `xapp-…` token.
5. Resolve the owner's workspace email or Slack user ID and ask for confirmation.
6. Check both tokens, write config.yaml, and install a launchd or systemd user service.
7. Wait for the daemon's local health endpoint, remove the checkpoint, and print how to start run coordination. No verification DM or conversational request is sent.

Use `--no-service` to start the daemon detached until logout or reboot instead of installing a service. `slack-coordinator service install` can add supervision later. An interrupted walkthrough resumes from `$SLACK_COORDINATOR_HOME/onboard.json`; successful setup removes the checkpoint. A failed local health check leaves the saved config, service, and checkpoint intact.

To connect an existing Slack app without updating its manifest, use `setup` with that app's bot token and app-level token. The app needs Socket Mode, the scopes in the [embedded manifest](../tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml), and the `app_mention`, `message.channels`, `message.groups`, and `message.im` events. These events deliver owner steering for known run threads, not new work requests. The App Home Messages tab must allow users to send messages. Otherwise Slack shows “Sending messages to this app has been turned off.”

`onboard --existing` updates an installed app's manifest. It first exports the live manifest, prints the app ID, owner, scopes and events, then requires `yes` before replacing it. The update preserves the live app name, descriptions, background color, bot display name, and enabled org-wide deployment. Other settings and scopes come from the embedded manifest. Reinstall the app when prompted to grant updated scopes; paste a new bot token or press Enter to keep the current one. The CLI uses JSON for Slack's manifest methods and reports rejected manifest fields.

With config.yaml already present, normal onboarding offers repair rather than creating a second app:

- `1`, **check daemon**: wait for the current daemon's local health endpoint.
- `2`, **reinstall service**: reinstall supervision, or restart the detached daemon with `--no-service`, then check health.
- `3`, **replace a token**: collect and check the chosen token, save it with other supported configuration unchanged, restart the daemon, then check health.

When the app ID is known, token replacement prints its token page. Otherwise select the existing app at [api.slack.com/apps](https://api.slack.com/apps).

## Maintain

Runtime files live under `$SLACK_COORDINATOR_HOME` (default `~/.slack-coordinator`, mode 0700):

| Path | Role |
|---|---|
| `config.yaml` | Slack tokens, owner, and optional Jira settings. Mode 0600. |
| `state.sqlite` | Run identities, status cards, owner inputs, terminal notices, and Jira backlinks. |
| `socket` | Unix socket used by the CLI. |
| `daemon.log` | Daemon stdout and stderr. |
| `daemon.pid` | PID recorded by daemon startup. |
| `daemon.lock` | Exclusive lock for one daemon per runtime home. |
| `onboard.json` | Walkthrough checkpoint, removed after successful setup. |
| `slack-coordinator.plist` | macOS launchd agent. |

On Linux the unit is `~/.config/systemd/user/com.marktripoli.slack-coordinator.service`. The service label on both platforms is `com.marktripoli.slack-coordinator`.

### Service

```sh
slack-coordinator service install
slack-coordinator service status
slack-coordinator service uninstall
```

`service install` writes the definition for this binary and runtime home, then starts supervision and waits for daemon health. The definition runs `slack-coordinator daemon serve` at login and restarts it after exit. macOS uses `launchctl load -w`; Linux uses `systemctl --user daemon-reload` and `systemctl --user enable --now`. The daemon no longer needs a coding-agent executable or a captured shell PATH.

`daemon start` launches a detached process when no service is installed and prints `daemon already running` when the socket already answers. `daemon status` prints `{"socket_mode":"…"}`. `daemon stop` requests clean shutdown. With supervision installed it also prints `service installed; use service uninstall to stop supervision`, because the supervisor restarts the daemon. `service uninstall` ends supervision.

`daemon start` accepts `--status-interval` for older invocations; routine card cadence is stored per run. `run disable-slack --run-id <id>` is the local break-glass command. It prints the run ID, channel, and permalink, then requires exact `yes` from an interactive terminal. Piped input is refused. Afterwards `run check` exits `12`, while `run event` and `run finish` record without posting. Other runs are untouched. An agent never pipes `yes` into it.

### Upgrade and compatibility

1. Rebuild or replace the coordinator binary at its installed path.
2. Run `slack-coordinator service install` so supervision uses the current binary.
3. If Slack scopes changed, run `slack-coordinator onboard --existing` and reinstall the Slack app when prompted.

Only `slack` and optional `jira` settings are supported. Old `agent` and `retention` keys are unknown, inert YAML keys: loading them cannot enable dispatch or purge. A config save from setup, onboarding, or token replacement omits them. Remove them manually if you want the existing file to contain only supported settings. No coding-agent command or binary is required.

Database upgrades are additive for coordinator tables. Existing runs and pending owner inputs stay readable. Historical automation tables and their rows are left untouched, even queued rows; the current daemon neither dispatches nor purges them. New databases do not create those tables. Existing `workspace/` files are not touched, and there is no automatic retention cleanup.

Reinstallation stops and reloads only the owned `com.marktripoli` service. Activation failure restores the previous owned definition and reloads it. Inspect service status and daemon.log before retrying. To roll back, uninstall the new owned service, restore the previous binary, and reinstall it; runtime data stays in place. An older binary may resume its own automation if old configuration and queued historical rows remain, so review those before a rollback.

### Tokens

The app configuration token is held only in memory while creating or updating the app. It is never written to config.yaml or onboard.json. If Slack rejects an expired token, generate another at [api.slack.com/apps](https://api.slack.com/apps).

The bot token (`xoxb-…`) and app-level token (`xapp-…`, `connections:write`) are stored in config.yaml. To rotate one, run `slack-coordinator onboard` and choose **replace a token**. Repair never creates a second app.

### When the daemon is down

1. Run `slack-coordinator daemon status`. Exit `11` with `daemon unreachable` means nothing is listening on the socket.
2. Read daemon.log.
3. If service status reports supervision installed, run `slack-coordinator service install`. Otherwise run `slack-coordinator daemon start`.
4. If Slack rejects the tokens, run onboarding and choose **replace a token**.

An agent receiving exit `11` from `run check` waits and retries. It does not install the service, start the daemon, or rotate tokens.

## Run-associated DMs and owner steering

External agents can start a run with `slack-coordinator run start --dm` to open a separate thread in the owner's bot DM, or start in an invited channel. The root shows the issue, Goal, and Scope. One status card is edited in place every three hours by default; completion replaces that card. New blockers post immediate replies mentioning the owner. `run cadence --run-id <id> --every 1h` changes the active run's cadence.

`run reply --run-id <id> --text <s>` adds one progress reply without editing the root or card. The daemon refuses it while owner input is pending or the run is finished. `run check`, `run wait`, and `run resolve` preserve the same per-run write gate for DM and channel runs.

Owner messages are addressed by known run identity:

- Reply in an active run thread, including an owner `@mention` in a known channel run thread, to steer that run.
- Send top-level `!to <run-id> <message>` in the bot DM to steer one active Slack-enabled run owned by you.
- Send top-level `!runs` in the bot DM to list your active coordinator runs and their thread links.

Other top-level DMs, unknown threads, and mentions outside known run threads are ignored. They do not launch agents, create requests, or collect channel messages. Non-owner messages do not steer a run. A reply to a finished run receives guidance without reopening work; redelivery of the same Slack message does not repeat that guidance.

The daemon persists each run's ID, channel, and thread independently of agent processes. Owner inputs are stored before their Socket Mode envelopes are acknowledged. An eyes reaction marks receipt; a failed reaction does not discard durable input. Unhandled inputs remain until an agent reads and resolves them. If an input is unread for five minutes, the daemon posts one notice that the agent may have stopped and points to `!runs`.

An active run should read input at least once a minute using `run check` between steps and before mutations, and repeated `run wait --for <duration>` while idle. `run resolve` posts the answer in the matching thread. These commands do not interrupt a tool or an agent already reasoning. A run left active after its agent exits can still receive input, but no process will read it. Use one run per directly addressable agent.

## Configuration and trust boundary

config.yaml requires `slack.bot_token`, `slack.app_token`, and `slack.owner_user_id`. Optional Jira configuration requires all of `jira.base_url`, `jira.email`, `jira.api_token`, and `jira.field_id` (`customfield_<digits>`). A DM run cannot carry a Jira backlink.

The daemon owns Slack tokens, Socket Mode, and SQLite. The CLI communicates over a local Unix socket. The daemon never spawns an LLM or coding agent. External agents, CLI, and daemon run as the same operating-system user; this is not a security boundary against other code running as that user.

Run content is available through `run content --run-id <id>` for files, bookmarks, tabs, and canvas permalinks; `run upload --run-id <id> --path <local-file>` attaches a file to the run thread. `run list-items --run-id <id> --list-id <F…>` reads paged List rows and schema for Lists shared in the run channel, on paid Slack workspaces. Canvas access is a permalink, not body text, and folder enumeration is unavailable through the bot API. See [commands](../skills/slack-coordinator/references/commands.md#channel-content) for limits and the required content scopes.

For run commands, exit codes, and Block Kit fields, use the [skill](../skills/slack-coordinator/SKILL.md) and linked references. A `run check` result is not a transaction: replies arriving after `ready` appear at the next check. [Testing](testing.md#slack-coordinator-proof-boundaries) records what offline checks do and do not prove.
