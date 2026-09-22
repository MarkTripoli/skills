# Slack coordinator

Slack coordinator posts one Slack thread per run of agent work and lets the run owner steer that run from the thread. It is distributed as the `slack-coordinator` binary, built from `tools/slack-coordinator/`, and installed separately from agent skills.

## Trust model

One per-user daemon owns the Slack bot and app tokens, the single Socket Mode connection, and the state database `~/.slack-coordinator/state.sqlite`. Agents never hold a token: the `slack-coordinator` CLI sends JSON-RPC requests over a Unix socket in the same home, and only the daemon writes Slack or SQLite. The daemon, CLI, and coding agents run as the same operating-system user; the socket and home directory are protected by file permissions, not by a security boundary against code already running as that user.

Steering is owner-only. `setup --owner <U…>` names the Slack user whose thread replies become pending input; the daemon stamps that user on every run it opens, and replies from anyone else are ignored. A reply is never executed: the agent reads it, decides, and answers through `run resolve`.

## Setup

1. Create the Slack app from [tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml](../tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml) ("Create New App > From an app manifest"); it enables Socket Mode and declares the bot scopes and message events the daemon needs. Install it to the workspace for the bot token, and create an app-level token with `connections:write` under "Basic Information > App-Level Tokens". An existing app must apply the updated manifest under "App Manifest" in its settings and be reinstalled to the workspace before the daemon receives DMs.
2. Build the binary: `cd tools/slack-coordinator && go build ./cmd/slack-coordinator`, and place it on `PATH`.
3. Export `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`, then run `slack-coordinator setup --owner <U…>`. Setup checks both tokens against Slack and writes `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator`); it never reads a repository `.env`. Add `--install-service` to install the launchd (macOS) or systemd (Linux) user service in the same step, or run `slack-coordinator service install` later. Without a service, `slack-coordinator daemon start` runs the daemon in the background until `daemon stop`.
4. Invite the bot to each channel runs will post in, and put one `Slack default channel: #name` line in the repository root `AGENTS.md`; `run start --channel` overrides it per run.
5. Optional Jira backlinks: pass `--jira-base-url`, `--jira-email`, and `--jira-field-id customfield_N` to `setup` with `JIRA_API_TOKEN` in the environment. `run start --jira-issue PROJ-123` then writes the thread permalink to that field.

`slack-coordinator daemon status` prints the daemon's health JSON, including the Socket Mode state.

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

Every message renders its fixed fields in order and shows `None` for an empty one; the field tables are in the skill's [messages reference](../skills/delivery/slack-coordinator/references/messages.md).

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
