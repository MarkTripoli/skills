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
   optional: slack-coordinator run cadence …  change this run's routine root-edit interval
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
slack-coordinator run start --work <s> --goal <s> --scope <s> [--link <url>]... [--dm | --channel <C…|#name>] [--repo <path>] [--run-id <id>]
```

Prints one JSON object: `{"run_id","channel_id","thread_ts","permalink"}`. `--run-id` defaults to a new ULID. `--dm` opens a new run thread in the configured owner's DM with the bot and cannot be combined with `--channel`; otherwise the channel comes from `--channel` or the root `AGENTS.md` directive ([channel-selection.md](channel-selection.md)). Every addressable run has its own thread even when many runs share one DM channel.

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

When idle, `slack-coordinator run wait --run-id <id>` waits briefly for a reply and returns the same JSON and exit code as `run check`; a timeout returns the current gate. It does not inject messages into an agent that is busy reasoning or running a tool. Always run `run check` again immediately before a state-changing action.

## Resolve

```sh
slack-coordinator run resolve --run-id <id> --message-ts <input.message_ts> --outcome applied|rejected|answered --reply <s>
```

Posts `--reply` in the thread and marks the input handled. `applied` means the run changed course as asked, `rejected` means it did not and the reply says why, `answered` means the reply was a question and the reply answers it. An input that is not pending exits `2` before anything is posted.

## Event and finish

```sh
slack-coordinator run event --run-id <id> --current <s> [--completed <s>]... [--decision <s>]... [--blocker <s>]... [--next <s>]...
slack-coordinator run finish --run-id <id> --outcome completed|failed|cancelled [--emoji <name|none>] [--completed <s>]... [--decision <s>]... [--unresolved <s>]... [--evidence <s>]... [--link <url>]...
```

`run event` stores the latest status. Routine changed events are coalesced into one root edit no more often than this run's cadence (three hours by default); unchanged events do nothing. New blockers receive an immediate thread reply and blocker changes update the root immediately. There are no periodic reposts when nothing changed. `run finish` updates the root immediately and makes the run terminal. By default it reacts with `white_check_mark` for completed, `x` for failed, or `black_square_for_stop` for cancelled; `--emoji` overrides that choice and `--emoji none` skips it. A failed reaction leaves the run finished and can be retried with `run react`. Field rendering is in [messages.md](messages.md).

Change the cadence for one active run without restarting the daemon:

```sh
slack-coordinator run cadence --run-id <id> --every 3h
```

`--every` accepts positive whole-second durations such as `15m`, `1h`, or `3h`. Blocker notifications and completion bypass the cadence. A pending update is rescheduled relative to the last root edit.

## Channel content and reactions

```sh
slack-coordinator run content --run-id <id> [--page <n>]
slack-coordinator run list-items --run-id <id> --list-id <F…> [--cursor <cursor>]
slack-coordinator run upload --run-id <id> --path <file> [--title <title>]
slack-coordinator run react --run-id <id> --emoji <name>
```

`content` lists paged channel file metadata, bookmarks, channel tabs, and the channel canvas ID and permalink. `list-items` reads one page of rows from a List shared in the run channel; pass `response_metadata.next_cursor` to continue. Slack's documented Web API does not expose canvas bodies or folder contents. `upload` shares a regular nonempty local file up to 20 MiB in the run thread; the daemon must be able to access the path. Check `run check` immediately before upload; the daemon checks again before writing. `react` adds one emoji to the run's root message while the run is active or finished; repeat it with different names to add more. A Slack-disabled run refuses reactions without contacting Slack.

## Break glass

```sh
slack-coordinator run disable-slack --run-id <id>
```

Prints the run's id, channel, and permalink, then reads one line from stdin. Only the exact answer `yes` disables Slack for this run (exit `0`); anything else exits `1` and changes nothing. Afterwards `run check` exits `12`, `run event` and `run finish` record in SQLite without posting, and other Slack operations—including `run react`—are refused (exit `2`) without contacting Slack. Other runs are untouched. This is a local operator decision typed at a terminal; an agent never pipes `yes` into it.

## Daemon and service

```sh
slack-coordinator setup --owner <U…> [--install-service]
slack-coordinator daemon start [--status-interval 1h]
slack-coordinator daemon status
slack-coordinator daemon stop
slack-coordinator service install
slack-coordinator service status
slack-coordinator service uninstall
```

`setup` reads `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` from the environment, checks both against Slack, and writes `$SLACK_COORDINATOR_HOME/config.yaml` (default `~/.slack-coordinator`); it never reads a repository `.env`. `daemon status` prints the health JSON, including the Socket Mode state. `service install` writes a launchd agent (macOS) or systemd user unit (Linux) that starts the daemon at login and restarts it after exit; because supervision restarts a stopped daemon, `daemon stop` prints a notice when the service is installed and `service uninstall` is how supervision ends. These are operator commands: an agent that finds no daemon reports exit `11` and waits rather than running them itself.
