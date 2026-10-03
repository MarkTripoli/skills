## Summary

`notifyctl send` no longer rewrites the whole delivery log on every send. The store appends one JSON line to `outbox/log.jsonl` instead of rewriting the `outbox/log.json` array, which makes sends on big logs roughly 10x faster. `list` reads an existing `log.json` first, so old logs keep working.

## Changes

- `src/store.mjs`: append-only JSON Lines log; `readLog` reads the legacy array, then the new log.
- `bench/send-probe.mjs`: times `send` on a seeded log.

## Evidence

See `02-evidence-jsonl-log.md`.
