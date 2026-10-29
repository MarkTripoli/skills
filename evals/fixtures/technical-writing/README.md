# notifyctl

notifyctl is a robust, seamless CLI that leverages the outbox pattern in order to optimise delivery of notifications; it is utilised by several teams across the organisation.

## Getting started

In order to get started, you should spin up a local Postgres and then kick off the worker. It is important to note that the worker may have failed to connect if you see `Error: connect ECONNREFUSED 127.0.0.1:5432`; in that case the database is not running.

The retry budget is 3. Requests are dropped after the budget is exhausted. A 503 is returned to the caller.

## Configuration

Behaviour is configured via `notifyctl.toml`. Colour output can be disabled with `--no-colour`. The 54 default channels are listed in `channels.md`.
