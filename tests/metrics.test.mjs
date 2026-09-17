import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { collect, exposition, influxLines, lokiPayload } from "../scripts/metrics.mjs";

const execFileAsync = promisify(execFile);
const script = path.resolve("scripts/metrics.mjs");
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "archon-metrics-"));
  const file = path.join(dir, "archon.db");
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE remote_agent_workflow_runs (id TEXT PRIMARY KEY, workflow_name TEXT, status TEXT, outcome TEXT, started_at TEXT, completed_at TEXT, last_activity_at TEXT, metadata TEXT, codebase_id TEXT, parent_run_id TEXT, adopted_from_run_id TEXT);
    CREATE TABLE remote_agent_workflow_events (workflow_run_id TEXT, event_order INTEGER, event_type TEXT, step_name TEXT, data TEXT, created_at TEXT);`);
  const run = db.prepare("INSERT INTO remote_agent_workflow_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  run.run("r1", "delivery-full", "completed", null, "2026-01-01 00:00:00", "2026-01-01 00:10:00", "2026-01-01 00:10:00", '{"inputs":{"gates":"pr"}}', null, null, null);
  run.run("r2", "delivery-oneshot-omp", "completed", null, "2026-01-01 00:00:00", "2026-01-01 00:02:00", "2026-01-01 00:02:00", '{"inputs":{"gates":"none"}}', null, null, null);
  run.run("r3", "delivery-bugfix", "failed", "failed", "2026-01-01 00:00:00", "2026-01-01 00:03:00", "2026-01-01 00:03:00", "{}", null, null, null);
  // A resumed run: Archon resets started_at on the last continuation, so the row spans 0 s while its events span 15 min.
  run.run("r4", "delivery-lean", "completed", null, "2026-01-01 00:15:00", "2026-01-01 00:15:00", "2026-01-01 00:15:00", "{}", null, null, null);
  const event = db.prepare("INSERT INTO remote_agent_workflow_events VALUES (?, ?, ?, ?, ?, ?)");
  const add = (id, order, type, node, data, created) => event.run(id, order, type, node, JSON.stringify(data), `2026-01-01 ${created}`);
  add("r1", 1, "workflow_started", null, { provider: "claude", origin: "cli", model: null }, "00:00:00");
  add("r1", 2, "approval_requested", "gate", {}, "00:00:00");
  add("r1", 3, "approval_received", "gate-result", { decision: "rejected", reason: "needs review" }, "00:01:00");
  add("r1", 4, "approval_requested", "gate", {}, "00:02:00");
  add("r1", 5, "approval_received", "gate-result", { decision: "approved" }, "00:03:00");
  add("r1", 6, "loop_iteration_completed", "review-loop", { iteration: 2, nodeId: "review-loop" }, "00:04:00");
  add("r1", 7, "loop_iteration_completed", "review-loop", { iteration: 4, nodeId: "review-loop" }, "00:04:01");
  add("r1", 8, "node_started", "prompt", { type: "prompt" }, "00:05:00");
  add("r1", 9, "node_completed", "prompt", { type: "prompt", duration_ms: 1000, tokens: { input: 10, output: 20, cacheRead: 3, cacheWrite: 4 }, cost_usd: 0.25, model_usage: { requested: "opus", resolved: "claude-opus-4" } }, "00:05:01");
  add("r1", 10, "workflow_completed", null, { duration_ms: 600000, node_output: "x".repeat(600) }, "00:10:00");
  add("r2", 1, "workflow_started", null, { provider: "claude", origin: "web" }, "00:00:00");
  add("r2", 2, "workflow_cancelled", null, { reason: "cancelled by test" }, "00:02:00");
  add("r3", 1, "node_failed", "bash", { type: "bash", duration_ms: 2000, error: "e".repeat(600) }, "00:01:00");
  add("r3", 2, "workflow_failed", null, { error: "failed" }, "00:03:00");
  add("r4", 1, "workflow_started", null, {}, "00:00:00");
  add("r4", 2, "approval_requested", "gate", {}, "00:05:00");
  add("r4", 3, "workflow_completed", null, { duration_ms: 50 }, "00:15:00");
  db.close();
  return { dir, file };
}
function server() {
  const requests = [];
  const value = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => { requests.push({ method: request.method, path: request.url, headers: request.headers, body }); response.writeHead(200, { "content-type": "application/json" }); response.end('{"url":"/d/skills-delivery"}'); });
  });
  return { requests, server: value };
}
async function listen(value) {
  return new Promise((resolve, reject) => {
    value.once("error", reject);
    value.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${value.address().port}`));
  });
}
async function close(value) { value.close(); await once(value, "close"); }

test("collect and render all metric families", () => {
  const { file } = fixture();
  const db = new DatabaseSync(file, { readOnly: true });
  const model = collect(db);
  const output = exposition(model);
  db.close();
  assert.match(output, /delivery_runs_total\{gates="pr",harness="claude-code",origin="cli",outcome="completed",workflow="delivery-full"\} 1/);
  assert.match(output, /delivery_runs_total\{gates="all",harness="unknown",origin="unknown",outcome="failed",workflow="delivery-bugfix"\} 1/);
  assert.match(output, /delivery_runs_total\{gates="none",harness="oh-my-pi",origin="web",outcome="completed",workflow="delivery-oneshot-omp"\} 1/, "the -omp flavor is the Oh My Pi harness whatever provider Archon defaulted to");
  assert.match(output, /delivery_run_duration_seconds_bucket\{gates="pr",harness="claude-code",le="900",workflow="delivery-full"\} 1/);
  assert.match(output, /delivery_run_duration_seconds_sum\{gates="pr",harness="claude-code",workflow="delivery-full"\} 600/);
  assert.match(output, /delivery_run_duration_seconds_count\{gates="pr",harness="claude-code",workflow="delivery-full"\} 1/);
  assert.match(output, /delivery_node_duration_seconds_sum\{harness="unknown",model="unknown",node="bash",type="bash",workflow="delivery-bugfix"\} 2/);
  assert.match(output, /delivery_node_failures_total\{harness="unknown",node="bash",workflow="delivery-bugfix"\} 1/);
  assert.match(output, /delivery_gate_wait_seconds_sum\{node="gate",workflow="delivery-full"\} 120/);
  assert.match(output, /delivery_gate_decisions_total\{decision="rejected",node="gate-result",workflow="delivery-full"\} 1/);
  assert.match(output, /delivery_loop_iterations_bucket\{le="4",node="review-loop",workflow="delivery-full"\} 1/);
  assert.match(output, /delivery_tokens_total\{harness="claude-code",kind="cache_read",model="claude-opus-4",node="prompt",workflow="delivery-full"\} 3/);
  assert.match(output, /delivery_cost_usd_total\{harness="claude-code",model="claude-opus-4",node="prompt",workflow="delivery-full"\} 0.25/);
  assert.match(output, /delivery_run_duration_seconds_sum\{gates="all",harness="unknown",workflow="delivery-lean"\} 900/, "a resumed run is measured from its first event to its last, not from the reset started_at");
  assert.match(output, /delivery_metrics_runs_scanned 4/);
  assert.match(output, /delivery_metrics_db_mtime_seconds [0-9]+\.[0-9]+/);
  const lines = influxLines(model);
  assert.ok(lines.some((line) => line.startsWith("delivery_runs_total,")));
  assert.ok(lines.some((line) => line.includes("delivery_run_duration_seconds_bucket") && line.endsWith("value=1")));
  const payload = lokiPayload(model.events);
  assert.equal(payload.streams.length, 9, "one Loki stream per workflow and event type that is pushed");
  const failed = payload.streams.find((stream) => stream.stream.event_type === "node_failed");
  assert.equal(failed.values[0][0], String(Date.UTC(2026, 0, 1, 0, 1, 0) * 1000000), "SQLite timestamps are UTC, not local time");
  assert.equal(JSON.parse(failed.values[0][1]).error.length, 500);
});

test("push sends all configured targets and cursor filters Loki events", async (t) => {
  const { file, dir } = fixture(); const target = server(); const base = await listen(target.server);
  const cursor = path.join(dir, "cursor.json");
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, PROM_PUSHGATEWAY_URL: base, GRAFANA_CLOUD_METRICS_URL: base, GRAFANA_CLOUD_METRICS_USER: "123", GRAFANA_CLOUD_TOKEN: "secret", LOKI_URL: base, LOKI_USER: "loki", LOKI_TOKEN: "token", OTLP_ENDPOINT: `${base}/otlp`, OTLP_AUTH: "Basic c3RhY2s6Z2xj" };
  await execFileAsync(process.execPath, [script, "--push", "--db", file, "--cursor", cursor], { env });
  assert.equal(target.requests.length, 5);
  const otlpMetricsRequest = target.requests.find((request) => request.path === "/otlp/v1/metrics");
  assert.equal(otlpMetricsRequest.headers.authorization, "Basic c3RhY2s6Z2xj");
  const otlpBody = JSON.parse(otlpMetricsRequest.body).resourceMetrics[0].scopeMetrics[0].metrics;
  assert.ok(otlpBody.find((metric) => metric.name === "delivery_runs_total").sum.isMonotonic);
  const runHistogram = otlpBody.find((metric) => metric.name === "delivery_run_duration_seconds").histogram.dataPoints.find((point) => point.attributes.some((a) => a.value.stringValue === "delivery-full"));
  assert.deepEqual({ count: runHistogram.count, sum: runHistogram.sum, bucketCounts: runHistogram.bucketCounts }, { count: "1", sum: 600, bucketCounts: ["0", "0", "1", "0", "0", "0", "0"] }, "600 s lands in the (300, 900] bucket");
  const otlpLogsRequest = target.requests.find((request) => request.path === "/otlp/v1/logs");
  const records = JSON.parse(otlpLogsRequest.body).resourceLogs[0].scopeLogs[0].logRecords;
  assert.ok(records.length > 0 && records.every((record) => record.attributes.some((a) => a.key === "event_type")));
  assert.ok(target.requests.some((request) => request.method === "PUT" && request.path === "/metrics/job/skills_delivery" && request.body.includes("delivery_runs_total")));
  const influx = target.requests.find((request) => request.path === "/api/v1/push/influx/write");
  assert.equal(influx.headers.authorization, `Basic ${Buffer.from("123:secret").toString("base64")}`);
  assert.ok(influx.body.includes("delivery_runs_total"));
  const loki = target.requests.find((request) => request.path === "/loki/api/v1/push");
  assert.equal(loki.headers.authorization, `Basic ${Buffer.from("loki:token").toString("base64")}`);
  assert.ok(JSON.parse(loki.body).streams.length > 0);
  assert.equal(JSON.parse(fs.readFileSync(cursor, "utf8")).last_event_order, 10);
  target.requests.length = 0;
  await execFileAsync(process.execPath, [script, "--push", "--db", file, "--cursor", cursor], { env });
  assert.deepEqual(JSON.parse(target.requests.find((request) => request.path === "/loki/api/v1/push").body), { streams: [] });
  assert.ok(!target.requests.some((request) => request.path === "/otlp/v1/logs"), "no new events, no OTLP log request");
  await close(target.server);
});

test("provision posts the dashboard and creates the Prometheus datasource", async (t) => {
  const target = server(); const base = await listen(target.server);
  const env = { ...process.env, GRAFANA_URL: base, GRAFANA_SA_TOKEN: "grafana-secret", GRAFANA_PROMETHEUS_URL: "http://prometheus:9090" };
  target.server.removeAllListeners("request");
  target.server.on("request", (request, response) => {
    let body = ""; request.on("data", (chunk) => { body += chunk; }); request.on("end", () => { target.requests.push({ method: request.method, path: request.url, headers: request.headers, body }); response.writeHead(request.url.includes("datasources/name") ? 404 : 200, { "content-type": "application/json" }); response.end(request.url === "/api/dashboards/db" ? '{"url":"/d/skills-delivery"}' : "{}"); });
  });
  await execFileAsync(process.execPath, [script, "--provision"], { env });
  const dashboard = target.requests.find((request) => request.path === "/api/dashboards/db");
  assert.equal(dashboard.headers.authorization, "Bearer grafana-secret");
  assert.equal(JSON.parse(dashboard.body).overwrite, true);
  assert.equal(JSON.parse(dashboard.body).dashboard.uid, "skills-delivery");
  const datasource = target.requests.find((request) => request.path === "/api/datasources");
  assert.equal(JSON.parse(datasource.body).name, "skills-prometheus");
  await close(target.server);
});

test("push without a target exits 2 with configuration guidance", () => {
  const { file } = fixture();
  const env = { ...process.env, PROM_PUSHGATEWAY_URL: undefined, GRAFANA_CLOUD_METRICS_URL: undefined, GRAFANA_CLOUD_METRICS_USER: undefined, GRAFANA_SA_TOKEN: undefined, LOKI_URL: undefined };
  const result = spawnSync(process.execPath, [script, "--push", "--db", file], { encoding: "utf8", env });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /PROM_PUSHGATEWAY_URL/);
  assert.match(result.stderr, /LOKI_URL/);
});
