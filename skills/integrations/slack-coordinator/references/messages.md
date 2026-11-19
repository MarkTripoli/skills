# Messages

Each run has one compact root and one editable status card in its thread. The root shows the issue name, Goal, and Scope. At start, the daemon posts a `Progress` card with `Now: Starting` and saves its Slack timestamp. Routine status and notes edit that same card; completion replaces it with the terminal summary. A card edit retry targets the saved timestamp, so it does not add another routine reply. New blockers remain separate immediate thread replies.

Fixed messages use Block Kit to express their hierarchy: a `header`, a primary `section`, and—when there are secondary details—a `divider` and another `section`. Optional links use a compact `context` block. Each message also has an accessible top-level `text` fallback. Empty fields are omitted. Fields over Slack's 2,000-character limit use the complete fallback without blocks rather than being truncated. Free-form owner acknowledgements, progress replies, and file uploads remain thread replies.

| Message | Header | Blocks |
|---|---|---|
| Root (`run start`) | issue name | Goal and Scope fields |
| Status (`run event`) | `Progress` | Now/Next fields; optional Links context |
| Note (`run note`) | `Progress` | Update field; optional Links context |
| Completion (`run finish`) | `Run summary` | Outcome/Summary fields; optional Unresolved/Evidence section; optional Links context |
| Blocker reply | `⚠️ Blocked` | Blocker and Owner fields |
| Progress reply (`run reply`) | none | none; text only, rendered as mrkdwn |

The root fallback includes `*Issue:* <name>`; its Block Kit header already shows the issue name. Section fields render in two columns. Repeated list values are joined compactly with ` · `. Links are embedded: Jira links use the issue key as the label, pull and pull requests use `PR #n` or `PR !n`, and other links use the host. Start links appear as a context line on the status card, not the root. `--evidence` accepts text or a URL; to attach a file in the thread use `run upload`. `run content` reports the channel canvas ID but does not read its body.

## Root (`run start`)

Posted once as the first message in the thread. The issue name is the header, not a separate Block Kit field; `--work` remains the CLI input for that title. The root contains only Goal and Scope beneath the title. Optional links move to the thread's status card.

| Field | Flag | When omitted |
|---|---|---|
| Issue name (header) | `--work <s>` | `Run started` |
| Goal | `--goal <s>` | omitted |
| Scope | `--scope <s>` | omitted |
| Links | `--link <url>` (repeatable) | omitted from the status card |

## Status card (`run event` / `run note`)

The initial `Progress` card is posted at run start. Routine changes replace it no more often than the run cadence (three hours by default); the scheduler applies the latest pending event when due. Repeated identical events do nothing. New blockers get an immediate reply of their own and do not create or edit a blocker section on the status card. A blocker-only change does not force a routine card edit. Idle runs are not reposted.

| Field | Flag | Rendering |
|---|---|---|
| Now | `--current <s>` (required for `run event`) | Current work |
| Next | `--next <s>` (repeatable) | Joined compactly; omitted when empty |
| Update | `run note --text <s>` | Replaces Now/Next for that card edit |
| Links | `run start --link <url>` (repeatable) | Optional run context in a context block |

Routine cards show only Now/Next (and any start links); blockers are separate replies. `run note` puts its sentence in the Update field. Send an event on a phase change and when a blocker starts or clears. Use `run cadence --run-id <id> --every <duration>` to change this run's cadence.

## Completion (`run finish`)

Replaces the saved status card once; the run is terminal afterwards. The primary section shows the outcome and a compact Summary made from any `--completed` values. A divider separates optional Unresolved and Evidence fields. Links, when supplied, appear in a context block. Decisions and finish timestamps are not rendered. The main root receives the outcome reaction after the card edit: `white_check_mark` for completed, `x` for failed, or `black_square_for_stop` for cancelled. `run finish --emoji <name>` chooses another emoji; `--emoji none` omits it. A failed reaction leaves the run finished with a delivery error and can be retried with `run react`.

| Field | Flag | When omitted |
|---|---|---|
| Outcome | `--outcome completed\|failed\|cancelled` (required) | not allowed |
| Summary | `--completed <s>` (repeatable) | omitted |
| Decisions | `--decision <s>` (repeatable) | omitted |
| Unresolved | `--unresolved <s>` (repeatable) | omitted |
| Evidence | `--evidence <s>` (repeatable) | omitted |
| Links | `--link <url>` (repeatable) | omitted |
| Finished at | filled by the daemon (RFC 3339, UTC) | stored, not rendered |

## Blocker reply

Each newly reported blocker posts one immediate `⚠️ Blocked` reply with the blocker text and an Owner field that mentions `slack.owner_user_id` (`<@U…>`), in the blocks and the fallback text, so Slack notifies the owner. The same blocker is not reposted on later events; a follow-up with different text, such as the 24-hour reminder in [blocked-runs.md](blocked-runs.md), posts and mentions again. Clearing a blocker does not add a reply or edit the card by itself; include a changed Now/Next value when that context should be shared.

## Acknowledgement (`run resolve`)

`--reply <s>` is posted verbatim as a thread reply to the owner's message; there are no fixed fields. Say what the run did with the input: what changed for `applied`, why not for `rejected`, the answer for `answered`.

## Progress reply (`run reply`)

`--text <s>` is posted verbatim as a thread reply under the root, without blocks or fixed fields. Slack renders its mrkdwn as typed, so a `<@U…>`, `<!here>`, or `<!channel>` in it notifies. It does not edit the root or the status card. Use it for a running log the owner asked for; milestones still go through `run event`, `run note`, and `run finish`.

## Channel @mentions

An `@mention` of the bot in a public or private channel is an instruction only when the sender is `slack.owner_user_id`. Anyone else is ignored: no reply and no run. The owner's mention starts an assistant request in that thread, or steers an active coordinator run when the mention is already in that run's thread. `!` commands remain direct-message-only. The app needs `app_mentions:read` and the `app_mention` event; reinstall the app after that scope is added.
