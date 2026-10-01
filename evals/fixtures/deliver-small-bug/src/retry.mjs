// Delay before retry number `attempt` (0-based): doubles from `baseMs` and never exceeds `maxMs`.
export function backoffDelay(attempt, baseMs, maxMs) {
  return Math.max(baseMs * 2 ** attempt, maxMs);
}
