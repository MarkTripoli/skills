# Slack coordinator commands

The `slack-coordinator` executable reports one run to one Slack thread and reads the owner's replies. Run it from the repository the run works in, keep the `run_id` it prints, and preserve every exit status; the codes carry the decision. The agent never holds a Slack token and never calls the Slack Web API. Each command talks to the per-user daemon over the Unix socket at `$SLACK_COORDINATOR_HOME/socket` (default `~/.slack-coordinator/socket`).

## Command flow

```text
1. slack-coordinator run start …            once, choose --dm for an owner-DM thread; keep run_id
2. slack-coordinator run check --run-id …   immediately before every state-changing action, and at least once a minute while working
     exit 0  → proceed
     exit 10 → read input.text, apply or reject, run resolve --outcome …, go to 2
     exit 11 → pause; retry 2 after a short wait; never bypass; report the reason
     exit 12 → proceed without further Slack calls
   slack-coordinator run wait --run-id … --for <d>   repeat while idle instead of ending the turn; exits as 2
3. slack-coordinator run event …            on phase change or blocker start/clear; a blocker starts the seven-day watch in SKILL.md
   slack-coordinator run cadence …          optional; change this run's status-card interval
4. slack-coordinator run finish …           once, with --outcome
```

## Exit codes

| Code | Meaning | Agent action |
|---|---|---|
| `0` | ok; `run check` answered `ready` | Proceed |
| `1` | confirmation refused (`run disable-slack` read anything but `yes`) | Nothing changed; report it |
| `2` | usage, config, or repository error (missing flag, unknown run, unresolvable channel, no daemon config) | Report the message verbatim; fix the input before retrying |
| `10` | `owner_input`: the run owner replied in the thread | Read `input.text`, act on it, `run resolve`, check again |
| `11` | `unavailable`: Socket Mode down, a required post failed, or no daemon answered | Pause, retry the check, report the reason; never bypass a started run's check |
| `12` | `slack_disabled`: an operator broke glass on this run | Proceed without further Slack calls |

`run start`, `run event`, and `run finish` exit `11` for the same delivery failures as `run check`. Before a run exists, an exit from `run start` (`2` or `11`) is the caller's to handle: `/deliver` records it in `## Decisions` and continues without Slack unless the request made Slack a gate. Never bypass applies to a started run. `run wait` uses the same answer shape and exit codes as `run check`; it is for an idle agent, not a substitute for the check immediately before a change. Owner replies reach the agent only through these two commands, so an active run reads its inbox at least once a minute ([SKILL.md](../SKILL.md)).

## Start

```sh
slack-coordinator run start --work <s> --goal <s> --scope <s> [--link <url>]... [--dm | --channel <C…|#name>] [--repo <path>] [--run-id <id>] [--jira-issue <KEY>]
```

Prints one JSON object: `{"run_id","channel_id","thread_ts","permalink"}`. `--run-id` defaults to a new ULID. `--dm` opens a new run thread in the configured owner's DM with the bot; it cannot be combined with `--channel` or `--jira-issue`. Without `--dm`, the channel comes from `--channel` or the root `AGENTS.md` directive ([channel-selection.md](channel-selection.md)). Every addressable run has its own thread even when many runs share one DM channel. `--jira-issue PROJ-123` asks the daemon to write a channel-thread permalink to the configured Jira field; a private DM link is not published to Jira. If Jira is not configured, the command exits `2` before opening a thread. A Jira write that fails after the thread exists is retried in the background and does not fail the run.

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

`reason` appears only with `unavailable`; `input` only with `owner_input`, holding the oldest unanswered owner reply; `run` on every answer the daemon gives. A daemon that does not answer yields `{"kind":"unavailable","reason":"daemon unreachable: …"}` and exit `11`. An unknown or finished run exits `2` instead of reporting `ready`.

When idle, `slack-coordinator run wait --run-id <id> [--for <duration>]` waits for a reply and returns the same JSON and exit code as `run check`; a timeout returns the current gate. Without `--for` it waits up to 20 seconds. `--for 9m` repeats 20-second waits until nine minutes have passed, so one tool call covers a longer idle stretch; keep it below the tool's command timeout. It does not inject messages into an agent that is busy reasoning or running a tool. Always run `run check` again immediately before a state-changing action.

## Resolve

```sh
slack-coordinator run resolve --run-id <id> --message-ts <input.message_ts> --outcome applied|rejected|answered --reply <s>
```

Posts `--reply` in the thread and marks the input handled. `applied` means the run changed course as asked, `rejected` means it did not and the reply says why, `answered` means the reply was a question and the reply answers it. An input that is not pending exits `2` before anything is posted.

Only one agent should consume a given `run_id`. An explicit Slack refusal releases the input for a retry; a timeout or other ambiguous delivery leaves it claimed and makes `run check` unavailable. Do not retry a claimed reply: it might already be visible in Slack. Report the blocked run to the operator, who inspects its thread, cancels the old run when Slack is available, and starts a new one; repeat any unanswered instruction in the new thread. The daemon never guesses whether Slack accepted the original reply.

## Event and finish

```sh
slack-coordinator run event --run-id <id> --current <s> [--completed <s>]... [--decision <s>]... [--blocker <s>]... [--next <s>]...
slack-coordinator run finish --run-id <id> --outcome completed|failed|cancelled [--emoji <name|none>] [--completed <s>]... [--decision <s>]... [--unresolved <s>]... [--evidence <s>]... [--link <url>]...
```

`run event` stores the latest status. Routine changes are coalesced into the one thread status card, edited no more often than this run's cadence (default three hours, measured from the root post or latest successful card edit); the scheduler applies the latest pending event when due. Unchanged events do nothing. New blockers receive an immediate separate Block Kit thread reply that mentions the run owner. Blocker-only changes do not force a status-card edit. There are no periodic reposts when nothing changed. `run finish` replaces the status card with completion and makes the run terminal; a later `run event` or `run finish` for the same run exits `2`. Existing active runs keep root-edit behavior. Field rendering is in [messages.md](messages.md).

`run finish` reacts to the main message after editing the completion details: `white_check_mark` for completed, `x` for failed, `black_square_for_stop` for cancelled. `--emoji <name>` overrides the default; `--emoji none` skips the reaction. A reaction failure is recorded as a delivery error but does not keep the run open; use `run react` to retry.

```sh
slack-coordinator run note --run-id <id> --text "Three backend PRs merged; wave 6 started."
```

`run note` stores that sentence as an Update instead of Now/Next; it edits the same status card at the routine cadence. Repeating the same sentence does nothing.

Change the cadence for one active run without restarting the daemon or changing other runs:

```sh
slack-coordinator run cadence --run-id <id> --every 3h
```

`--every` accepts positive whole-second durations such as `15m`, `1h`, or `3h`. A pending update is rescheduled relative to the last successful status-card edit; reducing the interval below elapsed time makes it eligible at the next scheduler tick. Critical blocker notifications and completion bypass the cadence. Each agent may change the cadence of its own run; see the single-owner rule below.

One run has one last-status record and one owner-input consumer. When several agents collaborate, give each directly addressable agent its own run thread or have one agent own the shared run. The others report to it. Two writers overwrite each other's status and can compete for the same owner input.

`--evidence` is text or a URL. For a file attachment use `run upload` instead; the completion message's evidence field does not attach files.

## Channel content

```sh
slack-coordinator run content --run-id <id> [--page <n>]
slack-coordinator run list-items --run-id <id> --list-id <F…> [--cursor <cursor>]
slack-coordinator run upload --run-id <id> --path <file> [--title <title>]
```

`content` returns JSON for a page of up to 100 channel files with their types and permalinks, the page count, channel bookmarks (including links), and the channel canvas file ID and permalink, and channel tabs (which may include Lists). The channel is fixed by the active run. `list-items` returns one page (up to 100) of typed rows and the List schema, plus `response_metadata.next_cursor`; pass that cursor to fetch the next page. It accepts only List IDs shared in the run channel according to Slack's file shares or channel tabs. Lists require a paid Slack workspace and the `lists:read` scope. Slack's documented Web API has no method to retrieve a canvas body or enumerate folder contents; a permalink is not the canvas text. A blank canvas ID means no channel canvas was reported. Use `--page` starting at 1 for further files.

`upload` shares a regular nonempty local file (maximum 20 MiB) in the active run thread via Slack's external upload flow and returns its file ID/title. The daemon reads `--path` on its host: paths on another machine are not accessible. Run `run check` immediately before invoking it; the daemon checks again and refuses the upload when coordination is unavailable, owner input is pending, or Slack is disabled. A failed Slack upload exits `11`; verify in Slack before retrying because failure after byte transfer may be ambiguous. Updating scopes requires `onboard --existing` and reinstalling the app.

## React

```sh
slack-coordinator run react --run-id <id> --emoji <name>
```

Adds one emoji to the run's main message whether the run is active or finished. Repeat with different names to add more reactions. Pass a Slack emoji name such as `rocket`, `:rocket:`, or a workspace custom name; surrounding colons are optional. An empty name, unknown run, or Slack `invalid_name` (emoji absent from the workspace) exits `2`, with the invalid name in the error. `already_reacted` succeeds. Unreachable Slack exits `11`; a Slack-disabled run exits `12` without contacting Slack.

## Break glass

```sh
slack-coordinator run disable-slack --run-id <id>
```

Prints the run's id, channel, and permalink, then requires an exact `yes` from an interactive terminal. Piped input is refused; anything other than `yes` exits `1` and changes nothing. Afterwards `run check` exits `12`, `run event` and `run finish` record in SQLite without posting, and every other run is untouched. This is a local operator decision typed at a terminal; an agent never pipes `yes` into it.

## Daemon and service

```sh
slack-coordinator setup --owner <U…> [--install-service] [--jira-base-url <url> --jira-email <email> --jira-field-id <customfield_N>]
slack-coordinator daemon start  # --status-interval is accepted for compatibility but ignored
slack-coordinator daemon status
slack-coordinator daemon stop
slack-coordinator service install
slack-coordinator service status
slack-coordinator service uninstall
```

`setup` reads `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` from the environment, or from stdin with `--bot-token-stdin` and `--app-token-stdin`. Do not put the tokens on the command line. A successful setup removes `onboard.json`. `--install-service` and `service install` wait until the daemon socket answers. When `agent.command` is set and `agent.bin` is empty, both commands store that command's absolute path in `agent.bin` (so a later service install does not depend on a hand-edited unit PATH) and require `agent.bin --version` to succeed. A non-empty `agent.bin` is left as it is. `agent.command` must be `pi`, `claude`, or `codex` before install; the upgrade steps are in [docs/slack-coordinator.md](../../../docs/slack-coordinator.md). `daemon status` prints the health JSON, including the Socket Mode state. `service install` writes a launchd agent (macOS) or systemd user unit (Linux) that starts the daemon at login and restarts it after exit; because supervision restarts a stopped daemon, `daemon stop` prints a notice when the service is installed and `service uninstall` is how supervision ends. These are operator commands: an agent that finds no daemon reports exit `11` and waits rather than running them itself.
