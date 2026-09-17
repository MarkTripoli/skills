import fs from "node:fs";

const OUTCOMES = ["completed", "failed", "cancelled", "paused", "running"];
export const HISTOGRAMS = {
  archon_run_duration_seconds: [60, 300, 900, 1800, 3600, 7200],
  archon_node_duration_seconds: [5, 30, 60, 300, 900, 1800],
  archon_gate_wait_seconds: [60, 600, 3600, 14400, 86400],
  archon_loop_iterations: [1, 2, 3, 4, 8, 16],
};
const LOKI_TYPES = new Set(["approval_requested", "approval_received", "node_failed", "workflow_completed", "workflow_failed", "workflow_cancelled", "loop_iteration_completed"]);
const HELP = {
  archon_runs_total: "Workflow runs by outcome.", archon_run_duration_seconds: "Completed workflow run duration in seconds.",
  archon_node_duration_seconds: "Completed or failed node duration in seconds.", archon_node_failures_total: "Failed workflow nodes.",
  archon_gate_wait_seconds: "Approval gate wait time in seconds.", archon_gate_decisions_total: "Approval gate decisions.",
  archon_loop_iterations: "Maximum loop iterations per run.", archon_tokens_total: "Workflow token usage.",
  archon_cost_usd_total: "Workflow cost in US dollars.", archon_metrics_runs_scanned: "Workflow runs scanned from the Archon database.",
  archon_metrics_db_mtime_seconds: "Archon database modification time as Unix seconds.",
};
const json = (value, fallback = {}) => {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; }
};
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const text = (value, fallback = "unknown") => value === null || value === undefined || value === "" ? fallback : String(value);
const keyOf = (labels) => JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
const sorted = (labels) => Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
const duration = (start, end) => {
  const first = Date.parse(start || ""); const last = Date.parse(end || "");
  return Number.isFinite(first) && Number.isFinite(last) && last >= first ? (last - first) / 1000 : null;
};
const sinceDate = (value, now = Date.now()) => {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(value);
  if (match) return new Date(now - Number(match[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`invalid --since value: ${value}`);
  return new Date(time);
};
export function parseSince(value, now = Date.now()) { return sinceDate(value, now); }

function family(model, name, type, buckets) {
  if (!model.families.has(name)) model.families.set(name, { name, type, buckets, samples: new Map(), values: [] });
  return model.families.get(name);
}
function add(model, name, type, labels, value, buckets) {
  const number = finite(value); if (number === null) return;
  const target = family(model, name, type, buckets); const key = keyOf(labels);
  target.samples.set(key, { labels: sorted(labels), value: (target.samples.get(key)?.value || 0) + number });
}
function observe(model, name, labels, value) {
  const number = finite(value); if (number === null) return;
  family(model, name, "histogram", HISTOGRAMS[name]).values.push({ labels: sorted(labels), value: number });
}
function eventRows(db, ids) {
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(",");
  return db.prepare(`SELECT workflow_run_id, event_order, event_type, step_name, data, created_at FROM remote_agent_workflow_events WHERE workflow_run_id IN (${marks}) ORDER BY workflow_run_id, event_order`).all(...ids);
}
function runOutcome(run) { return run.status === "failed" || run.outcome === "failed" ? "failed" : OUTCOMES.includes(run.status) ? run.status : "running"; }
function gatesFor(run) {
  const gates = json(run.metadata).inputs?.gates;
  return Array.isArray(gates) ? gates.join(",") || "all" : text(gates, "all");
}

export function collect(db, since) {
  const filter = since ? sinceDate(since) : null;
  const base = "id, workflow_name, status, outcome, started_at, completed_at, last_activity_at, metadata, codebase_id, parent_run_id, adopted_from_run_id";
  const query = filter ? `SELECT ${base} FROM remote_agent_workflow_runs WHERE julianday(started_at) >= julianday(?) ORDER BY started_at, id` : `SELECT ${base} FROM remote_agent_workflow_runs ORDER BY started_at, id`;
  const runs = filter ? db.prepare(query).all(filter.toISOString()) : db.prepare(query).all();
  const model = { families: new Map(), runs, events: [], runsScanned: runs.length };
  for (const [name, type, buckets] of [["archon_runs_total", "counter"], ["archon_run_duration_seconds", "histogram", HISTOGRAMS.archon_run_duration_seconds], ["archon_node_duration_seconds", "histogram", HISTOGRAMS.archon_node_duration_seconds], ["archon_node_failures_total", "counter"], ["archon_gate_wait_seconds", "histogram", HISTOGRAMS.archon_gate_wait_seconds], ["archon_gate_decisions_total", "counter"], ["archon_loop_iterations", "histogram", HISTOGRAMS.archon_loop_iterations], ["archon_metrics_runs_scanned", "gauge"], ["archon_metrics_db_mtime_seconds", "gauge"]]) family(model, name, type, buckets);
  const workflows = new Map(runs.map((run) => [run.id, text(run.workflow_name)]));
  model.events = eventRows(db, runs.map((run) => run.id)).map((event) => ({ ...event, workflow: workflows.get(event.workflow_run_id) || "unknown" }));
  // A run that paused and resumed gets its `started_at` reset by the last continuation, so the row's
  // own span is the last leg only; the first and last event of the run bound the real wall time.
  const span = new Map();
  for (const event of model.events) {
    const current = span.get(event.workflow_run_id) || { first: event.created_at, last: event.created_at };
    if (event.created_at < current.first) current.first = event.created_at;
    if (event.created_at > current.last) current.last = event.created_at;
    span.set(event.workflow_run_id, current);
  }
  for (const run of runs) {
    const labels = { workflow: text(run.workflow_name), gates: gatesFor(run) };
    add(model, "archon_runs_total", "counter", { ...labels, outcome: runOutcome(run) }, 1);
    if (!run.completed_at) continue;
    const events = span.get(run.id);
    const seconds = events ? duration(events.first, events.last) : duration(run.started_at, run.completed_at);
    if (seconds !== null) observe(model, "archon_run_duration_seconds", labels, seconds);
  }
  const loops = new Map();
  for (const event of model.events) {
    const data = json(event.data); const workflow = event.workflow; const node = text(event.step_name || data.nodeId);
    if (event.event_type === "node_completed" || event.event_type === "node_failed") {
      if (event.event_type === "node_failed") add(model, "archon_node_failures_total", "counter", { workflow, node }, 1);
      if (finite(data.duration_ms) !== null) observe(model, "archon_node_duration_seconds", { workflow, node, type: text(data.type) }, Number(data.duration_ms) / 1000);
      const tokens = data.tokens && typeof data.tokens === "object" ? data.tokens : {};
      for (const [source, kind] of [["input", "input"], ["output", "output"], ["cacheRead", "cache_read"], ["cacheWrite", "cache_write"]]) if (finite(tokens[source]) !== null) add(model, "archon_tokens_total", "counter", { workflow, node, kind }, tokens[source]);
      if (finite(data.cost_usd) !== null) add(model, "archon_cost_usd_total", "counter", { workflow, node }, data.cost_usd);
    }
    if (event.event_type === "approval_received") add(model, "archon_gate_decisions_total", "counter", { workflow, node, decision: text(data.decision) }, 1);
    if (event.event_type === "loop_iteration_completed") {
      const key = `${event.workflow_run_id}\0${workflow}\0${node}`; loops.set(key, Math.max(loops.get(key) || 0, finite(data.iteration) || 0));
    }
  }
  for (const [key, value] of loops) { const [, workflow, node] = key.split("\0"); observe(model, "archon_loop_iterations", { workflow, node }, value); }
  const pending = new Map();
  for (const event of model.events) {
    if (event.event_type === "approval_requested") {
      if (!pending.has(event.workflow_run_id)) pending.set(event.workflow_run_id, []);
      pending.get(event.workflow_run_id).push(event);
    }
    if (event.event_type === "approval_received" && pending.get(event.workflow_run_id)?.length) {
      const request = pending.get(event.workflow_run_id).shift();
      const seconds = duration(request.created_at, event.created_at); if (seconds !== null) observe(model, "archon_gate_wait_seconds", { workflow: event.workflow, node: text(request.step_name) }, seconds);
    }
  }
  add(model, "archon_metrics_runs_scanned", "gauge", {}, runs.length);
  try { const location = typeof db.location === "function" ? db.location() : null; if (location) add(model, "archon_metrics_db_mtime_seconds", "gauge", {}, fs.statSync(location).mtimeMs / 1000); } catch { /* memory databases have no mtime */ }
  return model;
}

function labelsText(labels) {
  const escaped = (value) => String(value).replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? `{${entries.map(([key, value]) => `${key}="${escaped(value)}"`).join(",")}}` : "";
}
function samples(target) {
  if (target.type !== "histogram") return [...target.samples.values()].map((sample) => ({ name: target.name, ...sample }));
  const groups = new Map();
  for (const item of target.values) { const key = keyOf(item.labels); if (!groups.has(key)) groups.set(key, { labels: item.labels, values: [] }); groups.get(key).values.push(item.value); }
  return [...groups.values()].flatMap(({ labels, values }) => {
    const buckets = [...target.buckets, Infinity].map((bound) => ({ name: `${target.name}_bucket`, labels: { ...labels, le: bound === Infinity ? "+Inf" : String(bound) }, value: values.filter((value) => value <= bound).length }));
    return [...buckets, { name: `${target.name}_sum`, labels, value: values.reduce((sum, value) => sum + value, 0) }, { name: `${target.name}_count`, labels, value: values.length }];
  });
}
const numberText = (value) => Number.isInteger(value) ? String(value) : String(Number(value));
export function exposition(model) {
  const lines = [];
  for (const target of model.families.values()) {
    if (target.type !== "histogram" && !target.samples.size) continue;
    lines.push(`# HELP ${target.name} ${HELP[target.name]}`, `# TYPE ${target.name} ${target.type}`);
    for (const sample of samples(target)) if (Number.isFinite(sample.value)) lines.push(`${sample.name}${labelsText(sample.labels)} ${numberText(sample.value)}`);
  }
  return `${lines.join("\n")}\n`;
}
export function influxLines(model) {
  const escape = (value) => String(value).replaceAll("\\", "\\\\").replaceAll(" ", "\\ ").replaceAll(",", "\\,").replaceAll("=", "\\=");
  return [...model.families.values()].flatMap(samples).filter((sample) => Number.isFinite(sample.value)).map((sample) => `${escape(sample.name)}${Object.entries(sample.labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `,${escape(key)}=${escape(value)}`).join("")} value=${numberText(sample.value)}`);
}
function lokiLine(event) {
  const data = json(event.data);
  for (const field of ["node_output", "structured_output", "reason", "error"]) if (data[field] !== undefined) { const value = typeof data[field] === "string" ? data[field] : JSON.stringify(data[field]); data[field] = value.length > 500 ? `${value.slice(0, 497)}...` : value; }
  return JSON.stringify({ run: event.workflow_run_id, node: event.step_name, ...data });
}
export function lokiPayload(events) {
  const streams = new Map();
  for (const event of events.filter((item) => LOKI_TYPES.has(item.event_type))) {
    const workflow = text(event.workflow || event.workflow_name); const key = `${workflow}\0${event.event_type}`;
    if (!streams.has(key)) streams.set(key, { stream: { job: "archon_delivery", workflow, event_type: event.event_type }, values: [] });
    const timestamp = Date.parse(event.created_at || ""); streams.get(key).values.push([String((Number.isFinite(timestamp) ? timestamp : Date.now()) * 1000000), lokiLine(event)]);
  }
  return { streams: [...streams.values()] };
}
