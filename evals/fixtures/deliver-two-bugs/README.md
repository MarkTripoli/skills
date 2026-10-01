# notifyctl retry and timeout helpers

- `backoffDelay(attempt, baseMs, maxMs)` in `src/retry.mjs` returns the wait before retry `attempt` (0-based): `baseMs` doubled per attempt, capped at `maxMs`.
- `clampTimeout(ms, minMs, maxMs)` in `src/timeout.mjs` keeps a request timeout between `minMs` and `maxMs` inclusive.

Run the checks with `npm test`.
