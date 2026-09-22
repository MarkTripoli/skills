# Messages

Every message renders every field in fixed order as Slack mrkdwn: `*Label:* value` for single values, `*Label:*` followed by one `• item` line per value for lists. A field with no value renders `None`, so a reader always sees the full shape and an omitted field is a visible fact, not a silent gap. Fill every field the run has information for; write `None` by omitting the flag, never by passing the string.

## Root message (`run start`)

Posted once as the thread's first message.

| Field | Flag | When omitted |
|---|---|---|
| Work | `--work <s>` (required) | not allowed |
| Goal | `--goal <s>` (required) | not allowed |
| Scope | `--scope <s>` (required) | not allowed |
| Owner | `--owner <U…>`, default the `setup --owner` value | `None` when neither is set; owner replies are then never recognized |
| Links | `--link <url>` (repeatable) | `None` |
| Started at | filled by the daemon (RFC 3339, UTC) | never omitted |

## Status message (`run event` and the quiet-interval repost)

Posted as a thread reply on each `run event`, and reposted unchanged after one quiet interval with no newer event.

| Field | Flag | When omitted |
|---|---|---|
| Current work | `--current <s>` (required) | not allowed |
| Completed since last update | `--completed <s>` (repeatable) | `None` |
| Decisions | `--decision <s>` (repeatable) | `None` |
| Blockers | `--blocker <s>` (repeatable) | `None` |
| Up next | `--next <s>` (repeatable) | `None` |

Send `run event` on a phase change and when a blocker starts or clears; the repost keeps the owner informed during long quiet stretches without another call.

## Completion message (`run finish`)

Posted once as a thread reply; the run is terminal afterwards.

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
