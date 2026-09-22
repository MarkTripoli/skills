# Slack coordinator commands

The `slack-coordinator` executable reports one run to one Slack thread and reads the owner's replies. Run it from the repository the run works in, keep the `run_id` it prints, and preserve every exit status; the codes carry the decision. The agent never holds a Slack token and never calls the Slack Web API. Each command talks to the per-user daemon over the Unix socket at `$SLACK_COORDINATOR_HOME/socket` (default `~/.slack-coordinator/socket`).

## Command flow

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

## Exit codes

| Code | Meaning | Agent action |
|---|---|---|
| `0` | ok; `run check` answered `ready` | Proceed |
| `1` | confirmation refused (`run disable-slack` read anything but `yes`) | Nothing changed; report it |
| `2` | usage, config, or repository error (missing flag, unknown run, unresolvable channel, no daemon config) | Report the message verbatim; fix the input before retrying |
| `10` | `owner_input`: the run owner replied in the thread | Read `input.text`, act on it, `run resolve`, check again |
| `11` | `unavailable`: Socket Mode down, a required post failed, or no daemon answered | Pause, retry the check, report the reason; never bypass |
| `12` | `slack_disabled`: an operator broke glass on this run | Proceed without further Slack calls |

`run start`, `run event`, and `run finish` exit `11` for the same reasons `run check` does.

## Start

```sh
slack-coordinator run start --work <s> --goal <s> --scope <s> [--link <url>]... [--channel <C…|#name>] [--repo <path>] [--run-id <id>] [--jira-issue <KEY>]
```

Prints one JSON object: `{"run_id","channel_id","thread_ts","permalink"}`. `--run-id` defaults to a new ULID. The channel comes from `--channel` or the root `AGENTS.md` directive ([channel-selection.md](channel-selection.md)). `--jira-issue PROJ-123` asks the daemon to write the permalink to the configured Jira field; it exits `2` when Jira is not configured and never blocks the run afterwards.

## Check

```sh
slack-coordinator run check --run-id <id>
```

stdout holds one JSON object; the exit code follows its `kind`:

```json
{"kind":"ready|owner_input|unavailable|slack_disabled",
 "reason":"…",
 "input":{"run_id":"…","channel_id":"…","thread_ts":"…","message_ts":"…","text":"…"},
 "run":{"run_id":"…","channel_id":"…","permalink":"…"}}
```

`reason` appears only with `unavailable`; `input` only with `owner_input`, holding the oldest unanswered owner reply; `run` on every answer the daemon gives. A daemon that does not answer yields `{"kind":"unavailable","reason":"daemon unreachable: …"}` and exit `11`.

## Resolve

```sh
slack-coordinator run resolve --run-id <id> --message-ts <input.message_ts> --outcome applied|rejected|answered --reply <s>
```

Posts `--reply` in the thread and marks the input handled. `applied` means the run changed course as asked, `rejected` means it did not and the reply says why, `answered` means the reply was a question and the reply answers it. An input that is not pending exits `2` before anything is posted.

## Event and finish

```sh
slack-coordinator run event --run-id <id> --current <s> [--completed <s>]... [--decision <s>]... [--blocker <s>]... [--next <s>]...
slack-coordinator run finish --run-id <id> --outcome completed|failed|cancelled [--completed <s>]... [--decision <s>]... [--unresolved <s>]... [--evidence <s>]... [--link <url>]...
```

`run event` stores the update as the run's last status; the daemon reposts it after one quiet interval (`daemon start --status-interval`, default one hour) with no newer event. `run finish` makes the run terminal; a later `run event` or `run finish` for the same run exits `2`. Field rendering is in [messages.md](messages.md).

## Break glass

```sh
slack-coordinator run disable-slack --run-id <id>
```

Prints the run's id, channel, and permalink, then reads one line from stdin. Only the exact answer `yes` disables Slack for this run (exit `0`); anything else exits `1` and changes nothing. Afterwards `run check` exits `12`, `run event` and `run finish` record in SQLite without posting, and every other run is untouched. This is a local operator decision typed at a terminal; an agent never pipes `yes` into it.

## Daemon and service

```sh
slack-coordinator setup --owner <U…> [--install-service] [--jira-base-url <url> --jira-email <email> --jira-field-id <customfield_N>]
slack-coordinator daemon start [--status-interval 1h]
slack-coordinator daemon status
slack-coordinator daemon stop
slack-coordinator service install
slack-coordinator service status
slack-coordinator service uninstall
```

`setup` reads `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` from the environment, checks both against Slack, and writes `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator`); it never reads a repository `.env`. `daemon status` prints the health JSON, including the Socket Mode state. `service install` writes a launchd agent (macOS) or systemd user unit (Linux) that starts the daemon at login and restarts it after exit; because supervision restarts a stopped daemon, `daemon stop` prints a notice when the service is installed and `service uninstall` is how supervision ends. These are operator commands: an agent that finds no daemon reports exit `11` and waits rather than running them itself.
