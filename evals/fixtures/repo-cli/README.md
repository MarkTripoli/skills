# notifyctl

Sends account notifications through the channels listed in `notifyctl.config.json`.

```sh
notifyctl send --channel email --to owner@example.com --message "Invoice 42 is overdue"
notifyctl list
```

`send` resolves the channel by name in `src/channels/`, calls its `deliver()`, and appends the result to `outbox/log.json`. `list` prints that log.

Channels: `console` (prints to stdout), `email` (writes an `.eml` file into `outbox/`). A channel module exports `name` and `deliver({ to, message, config })` and returns `{ id, status }`.

Tests: `npm test`.
