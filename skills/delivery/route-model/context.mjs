export const CONTEXT_THRESHOLD_PERCENT = 60;

function number(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Accept only the native live metric shape; estimates and token counts alone are not enough. */
export function contextUsageFrom(value) {
  if (value?.type === 'response' && (value.command !== 'get_state' || value.success !== true)) return null;
  const usage = value?.data?.contextUsage ?? value?.contextUsage ?? value?.context_usage ?? value;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const tokens = usage.tokens;
  const contextWindow = usage.contextWindow;
  const percent = usage.percent;
  if (!number(tokens) || tokens < 0 || !number(contextWindow) || contextWindow <= 0 || !number(percent) || percent < 0 || percent > 100) return null;
  return { tokens, contextWindow, percent };
}

/**
 * Decide only from a live native metric. A missing metric is a stop, never a guess.
 */
export function evaluateContextBoundary(value, options = {}) {
  const threshold = options.thresholdPercent ?? CONTEXT_THRESHOLD_PERCENT;
  if (!number(threshold) || threshold <= 0 || threshold > 100) throw new Error('context threshold must be finite in (0,100]');
  const usage = contextUsageFrom(value);
  if (!usage) return { action: 'stop', status: 'unknown', reason: 'live context metric unavailable' };
  if (usage.percent >= threshold) {
    return {
      action: 'fresh-session',
      status: 'threshold',
      thresholdPercent: threshold,
      usage,
      reason: `context reached ${threshold}% boundary; checkpoint and start a fresh session`,
    };
  }
  return { action: 'continue', status: 'below-threshold', thresholdPercent: threshold, usage };
}

export function freshSessionHandoff(phase, boundary) {
  if (typeof phase !== 'string' || !phase.trim()) throw new Error('phase is required for a fresh-session handoff');
  if (!boundary || boundary.action !== 'fresh-session') throw new Error('a threshold boundary is required for a fresh-session handoff');
  return {
    type: 'fresh-session',
    phase,
    reason: boundary.reason,
    instruction: 'Save the current artifact and start a new session; do not compact this phase.',
  };
}
