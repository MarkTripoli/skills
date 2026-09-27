const USAGE_KEYS = ["input", "output", "cacheRead", "cacheWrite"];

const numberOrNull = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;

function addUsage(total, usage) {
  if (!usage || typeof usage !== "object" ||
      !USAGE_KEYS.every(key => numberOrNull(usage[key] ?? usage[`${key}_tokens`]) !== null)) return false;
  for (const key of USAGE_KEYS) {
    total[key] = (total[key] ?? 0) + (usage[key] ?? usage[`${key}_tokens`]);
  }
  return true;
}

function addCost(total, cost) {
  if (!cost || typeof cost !== "object" || numberOrNull(cost.total) === null) return false;
  for (const key of [...USAGE_KEYS, "total"]) {
    const value = numberOrNull(cost[key]);
    if (value !== null) total[key] = (total[key] ?? 0) + value;
  }
  return true;
}

export function parseOmpJson(stdout) {
  const events = [];
  for (const line of String(stdout).split("\n")) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object") events.push(value);
    } catch { /* non-JSON diagnostics are not metrics */ }
  }
  const usage = {};
  const cost = {};
  const models = new Set();
  let turns = 0;
  let usageEvents = 0;
  let costEvents = 0;
  let completed = false;
  let answer = null;
  for (const event of events) {
    if (event.type === "agent_end") {
      completed = event.isTerminal === true;
      const final = Array.isArray(event.messages) ? event.messages.filter(message => message.role === "assistant").at(-1) : null;
      if (final) answer = contentText(final.content);
    }
    // turn_end is authoritative. message_end repeats the same usage and is excluded.
    if (event.type !== "turn_end") continue;
    turns++;
    const message = event.message;
    if (!message || typeof message !== "object") continue;
    if (typeof message.model === "string" && message.model) models.add(`${message.provider ?? "unknown"}/${message.model}`);
    if (addUsage(usage, message.usage)) usageEvents++;
    if (addCost(cost, message.usage?.cost ?? message.cost)) costEvents++;
  }
  return { events, answer, usage, cost, turns, usageEvents, costEvents, completed, models: [...models] };
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  return content.filter(part => typeof part === "string" || part?.type === "text").map(part => typeof part === "string" ? part : part.text ?? "").join("");
}

export function metricsForOutput(stdout, wallMs) {
  const parsed = parseOmpJson(stdout);
  const usageKnown = parsed.completed && parsed.turns > 0 && parsed.usageEvents === parsed.turns &&
    USAGE_KEYS.every(key => parsed.usage[key] !== undefined);
  const costKnown = parsed.completed && parsed.turns > 0 && parsed.costEvents === parsed.turns && parsed.cost.total !== undefined;
  return {
    wall_ms: numberOrNull(wallMs),
    tokens: usageKnown ? Object.fromEntries(USAGE_KEYS.map((key) => [key, parsed.usage[key] ?? null])) : null,
    cost: costKnown ? { total: parsed.cost.total, input: parsed.cost.input ?? null, output: parsed.cost.output ?? null, cacheRead: parsed.cost.cacheRead ?? null, cacheWrite: parsed.cost.cacheWrite ?? null } : null,
    cost_basis: costKnown ? "provider_reported_usd" : null,
    cost_source: costKnown ? "omp.turn_end.message.usage.cost" : null,
    coverage: { complete: usageKnown && costKnown && parsed.models.length === 1 && !parsed.models[0].startsWith("unknown/"), turns: parsed.turns,
      usage_events: parsed.usageEvents, cost_events: parsed.costEvents, models: parsed.models },
    answer: parsed.answer,
  };
}
