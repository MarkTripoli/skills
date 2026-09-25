# Messages

The root is posted once. Status, note, and completion edit that same root message; routine changes do not create thread replies or hourly notifications. New blockers post a single thread reply when first reported. Owner acknowledgements and file uploads remain thread replies. The root uses a Block Kit payload with a top-level `text` fallback and an ordered `blocks` array. Each array starts with a `header` block (`plain_text`), followed by one `section` block (`mrkdwn`) per field that has content. The complete legacy mrkdwn rendering remains the accessible `text` fallback, including `None` for an empty field. Blocks omit those empty fields. If a section exceeds Slack's 3,000-character limit, the daemon sends the full fallback without blocks instead of truncating it. Acknowledgements remain plain-text thread replies.

| Message | Header text | Ordered section blocks |
|---|---|---|
| Root (`run start`) | the `--work` title | Work, Goal, Scope, Owner, Links, Started at |
| Status (`run event`) | the work title | Original root fields, then Current work, Completed since last update, Decisions, Blockers, Up next |
| Note (`run note`) | the work title | Original root fields, then Latest update |
| Completion (`run finish`) | `Run finished: <outcome>` | Original root fields, then Outcome, Completed work, Decisions, Unresolved items, Evidence, Links, Finished at |

A single value renders as `*Label:* value`; a list renders as `*Label:*` followed by one `• item` line per value. The text fallback renders an empty field as `None`. Fill every field the run has information for; write `None` by omitting the flag, never by passing the string. `--evidence` is text or a URL. To attach a file in the run thread use `run upload`; `run content` reports the channel canvas ID but does not read its body.

## Root message (`run start`)

Posted once as the thread's first message.

| Field | Flag | When omitted |
|---|---|---|
| Work | `--work <s>` (required) | not allowed |
| Goal | `--goal <s>` (required) | not allowed |
| Scope | `--scope <s>` (required) | not allowed |
| Owner | the configured owner (`setup --owner`) | never omitted; the daemon stamps it on every run |
| Links | `--link <url>` (repeatable) | `None` |
| Started at | filled by the daemon (RFC 3339, UTC) | never omitted |

## Status on the root (`run event`)

Routine changed events replace the root details at most once per run cadence (three hours by default), using the latest saved status. Repeated identical events do nothing. A new blocker receives an immediate thread reply; blocker changes also edit the root immediately. Neither unchanged status nor an idle run causes a timed repost.

| Field | Flag | When omitted |
|---|---|---|
| Current work | `--current <s>` (required) | not allowed |
| Completed since last update | `--completed <s>` (repeatable) | `None` |
| Decisions | `--decision <s>` (repeatable) | `None` |
| Blockers | `--blocker <s>` (repeatable) | `None` |
| Up next | `--next <s>` (repeatable) | `None` |

Send `run event` on a phase change and when a blocker starts or clears. Use `run cadence --run-id <id> --every <duration>` to change this active run's cadence at runtime. The root shows the latest delivered state without generating routine thread notifications.

## Completion message (`run finish`)

Edits the root once; the run is terminal afterwards.

For runs opened before this change, the original root fields were not stored locally; their first edit uses the saved owner and start time but cannot retain the original work, goal, scope, or links.

After the completion edit, the main message gets an outcome reaction: `white_check_mark` for completed, `x` for failed, or `black_square_for_stop` for cancelled. `run finish --emoji <name>` chooses another emoji; `--emoji none` omits it. A failed reaction leaves the run finished with a recorded delivery error and can be retried with `run react`.

| Field | Flag | When omitted |
|---|---|---|
| Outcome | `--outcome completed\|failed\|cancelled` (required) | not allowed |
| Completed work | `--completed <s>` (repeatable) | `None` |
| Decisions | `--decision <s>` (repeatable) | `None` |
| Unresolved items | `--unresolved <s>` (repeatable) | `None` |
| Evidence | `--evidence <s>` (repeatable) | `None` |
| Links | `--link <url>` (repeatable) | `None` |
| Finished at | filled by the daemon (RFC 3339, UTC) | never omitted |

## Acknowledgement (`run resolve`)

`--reply <s>` is posted verbatim as a thread reply to the owner's message; there are no fixed fields. Say what the run did with the input: what changed for `applied`, why not for `rejected`, the answer for `answered`.

## Channel @mentions

An `@mention` of the bot in a public or private channel is an instruction only when the sender is `slack.owner_user_id`. Anyone else is ignored: no reply and no run. The owner's mention starts an assistant request in that thread, or steers an active coordinator run when the mention is already in that run's thread. `!` commands remain direct-message-only. The app needs `app_mentions:read` and the `app_mention` event; reinstall the app after that scope is added.
