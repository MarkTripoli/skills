# notifyctl retry helper

`backoffDelay(attempt, baseMs, maxMs)` in `src/retry.mjs` returns the wait before retry `attempt` (0-based): `baseMs` doubled per attempt, capped at `maxMs`. Run the checks with `npm test`.
