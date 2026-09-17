#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collect, exposition, influxLines, lokiPayload, otlpLogs, otlpMetrics, parseSince } from "./metrics-core.mjs";
export { collect, exposition, influxLines, lokiPayload, otlpLogs, otlpMetrics, parseSince } from "./metrics-core.mjs";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { DatabaseSync = undefined; }
const dbDefault = () => path.join(process.env.ARCHON_HOME || path.join(os.homedir(), ".archon"), "archon.db");
const appendUrl = (base, suffix) => `${String(base).replace(/\/+$/, "")}${suffix}`;
const json = (value, fallback = {}) => { try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" ? parsed : fallback; } catch { return fallback; } };
const openDb = (file) => { if (!DatabaseSync) throw new Error("node:sqlite is unavailable; use Node 22.13 or later"); return new DatabaseSync(file, { readOnly: true }); };
const headers = (extra = {}) => ({ "content-type": "application/json", ...extra });
async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, options); } catch (error) { throw new Error(`${url}: ${error.message}`); }
  const body = await response.text();
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 500)}`);
  return body;
}
const cursorValue = (file) => { try { return Number(json(fs.readFileSync(file, "utf8"), { last_event_order: 0 }).last_event_order) || 0; } catch { return 0; } };
function saveCursor(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify({ last_event_order: value })}\n`); }

// Grafana Cloud ingestion (metrics and Loki) takes an access-policy token (`glc_...`) with the write
// scopes; the Grafana HTTP API behind --provision takes a service-account token (`glsa_...`). One
// variable each, with the older single-variable form still accepted.
const cloudToken = () => process.env.GRAFANA_CLOUD_TOKEN || process.env.GRAFANA_SA_TOKEN;
async function push(options, model) {
  const cloud = process.env.GRAFANA_CLOUD_METRICS_URL && process.env.GRAFANA_CLOUD_METRICS_USER && cloudToken();
  const otlp = process.env.OTLP_ENDPOINT;
  if (!process.env.PROM_PUSHGATEWAY_URL && !cloud && !process.env.LOKI_URL && !otlp) throw new Error("--push: set OTLP_ENDPOINT (+ OTLP_AUTH) for an OTLP gateway such as Grafana Cloud's, PROM_PUSHGATEWAY_URL for Pushgateway, GRAFANA_CLOUD_METRICS_URL + GRAFANA_CLOUD_METRICS_USER + GRAFANA_CLOUD_TOKEN for Grafana Cloud Influx, or LOKI_URL for Loki");
  const tasks = [];
  // OTLP: metrics every push; events past the cursor as log records, sharing the Loki cursor file.
  if (otlp) {
    const auth = process.env.OTLP_AUTH ? { authorization: process.env.OTLP_AUTH } : {};
    tasks.push(request(appendUrl(otlp, "/v1/metrics"), { method: "POST", headers: headers(auth), body: JSON.stringify(otlpMetrics(model)) }));
    const cursorFile = options.cursor || path.join(path.dirname(options.db), "metrics-cursor.json");
    const cursor = options.since ? 0 : cursorValue(cursorFile);
    const events = model.events.filter((event) => options.since || (Number(event.event_order) || 0) > cursor);
    const payload = otlpLogs(events);
    if (payload.resourceLogs[0].scopeLogs[0].logRecords.length) {
      tasks.push(request(appendUrl(otlp, "/v1/logs"), { method: "POST", headers: headers(auth), body: JSON.stringify(payload) }).then(() => {
        const last = Math.max(cursor, ...events.map((event) => Number(event.event_order) || 0));
        if (last > cursor) saveCursor(cursorFile, last);
      }));
    }
  }
  if (process.env.PROM_PUSHGATEWAY_URL) tasks.push(request(appendUrl(process.env.PROM_PUSHGATEWAY_URL, "/metrics/job/skills_delivery"), { method: "PUT", headers: { "content-type": "text/plain; version=0.0.4" }, body: exposition(model) }));
  if (cloud) {
    const auth = Buffer.from(`${process.env.GRAFANA_CLOUD_METRICS_USER}:${cloudToken()}`).toString("base64");
    tasks.push(request(appendUrl(process.env.GRAFANA_CLOUD_METRICS_URL, "/api/v1/push/influx/write"), { method: "POST", headers: headers({ authorization: `Basic ${auth}`, "content-type": "text/plain" }), body: influxLines(model).join("\n") }));
  }
  if (process.env.LOKI_URL) {
    const cursorFile = options.cursor || path.join(path.dirname(options.db), "metrics-cursor.json");
    const cursor = options.since ? 0 : cursorValue(cursorFile);
    const events = model.events.filter((event) => options.since || (Number(event.event_order) || 0) > cursor);
    const token = process.env.LOKI_TOKEN || cloudToken();
    const auth = token ? { authorization: process.env.LOKI_USER ? `Basic ${Buffer.from(`${process.env.LOKI_USER}:${token}`).toString("base64")}` : `Bearer ${token}` } : {};
    tasks.push(request(appendUrl(process.env.LOKI_URL, "/loki/api/v1/push"), { method: "POST", headers: headers(auth), body: JSON.stringify(lokiPayload(events)) }).then(() => {
      const sent = events.filter((event) => lokiPayload([event]).streams.length);
      const last = Math.max(cursor, ...sent.map((event) => Number(event.event_order) || 0));
      if (last > cursor) saveCursor(cursorFile, last);
    }));
  }
  await Promise.all(tasks);
}

async function provision() {
  if (!process.env.GRAFANA_URL || !process.env.GRAFANA_SA_TOKEN) throw new Error("--provision needs GRAFANA_URL and GRAFANA_SA_TOKEN");
  const auth = { authorization: `Bearer ${process.env.GRAFANA_SA_TOKEN}` };
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "observability", "grafana-dashboard.json");
  const dashboard = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = json(await request(appendUrl(process.env.GRAFANA_URL, "/api/dashboards/db"), { method: "POST", headers: headers(auth), body: JSON.stringify({ dashboard, overwrite: true }) }));
  if (process.env.GRAFANA_PROMETHEUS_URL) {
    let existing;
    try { existing = json(await request(appendUrl(process.env.GRAFANA_URL, "/api/datasources/name/skills-prometheus"), { headers: auth })); } catch (error) { if (!error.message.includes("HTTP 404")) throw error; }
    const data = { name: "skills-prometheus", type: "prometheus", access: "proxy", url: process.env.GRAFANA_PROMETHEUS_URL, basicAuth: false };
    const known = existing && existing.id !== undefined;
    await request(appendUrl(process.env.GRAFANA_URL, known ? `/api/datasources/${existing.id}` : "/api/datasources"), { method: known ? "PUT" : "POST", headers: headers(auth), body: JSON.stringify(data) });
  }
  console.log(result.url || appendUrl(process.env.GRAFANA_URL, "/d/skills-delivery"));
}

function optionsFrom(argv) {
  const options = { db: dbDefault(), mode: "print", since: null, cursor: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help") return { help: true };
    if (["--db", "--since", "--serve", "--cursor"].includes(arg)) {
      const value = argv[++index]; if (!value) throw new Error(`${arg} needs a value`);
      if (arg === "--db") options.db = value; if (arg === "--since") options.since = value; if (arg === "--cursor") options.cursor = value;
      if (arg === "--serve") { options.mode = "serve"; options.port = Number(value); }
    } else if (["--print", "--push", "--provision"].includes(arg)) options.mode = arg.slice(2);
    else throw new Error(`unknown option: ${arg}`);
  }
  if (options.mode === "serve" && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) throw new Error("--serve port must be 1-65535");
  return options;
}
function usage() { console.log("Usage: node scripts/metrics.mjs [--db path] [--since duration|iso] [--print | --serve port | --push | --provision]"); }

async function main(argv = process.argv.slice(2)) {
  const options = optionsFrom(argv); if (options.help) return usage();
  if (!DatabaseSync) { console.error("node:sqlite is unavailable; use Node 22.13 or later"); process.exitCode = 2; return; }
  if (options.mode === "provision") return provision();
  if (options.mode === "serve") {
    const server = http.createServer((request, response) => {
      if (request.url === "/healthz") { response.writeHead(200, { "content-type": "text/plain" }); response.end("ok\n"); return; }
      if (request.url !== "/metrics") { response.writeHead(404); response.end("not found\n"); return; }
      let db;
      try { db = openDb(options.db); response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" }); response.end(exposition(collect(db, options.since))); } catch (error) { response.writeHead(500); response.end(`${error.message}\n`); } finally { db?.close(); console.error("metrics scrape path=/metrics"); }
    });
    process.once("SIGINT", () => server.close(() => process.exit(0))); server.listen(options.port); return;
  }
  const db = openDb(options.db);
  try { const model = collect(db, options.since); if (options.mode === "push") await push(options, model); else process.stdout.write(exposition(model)); } finally { db.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = error.message.startsWith("--push:") ? 2 : 1; });
