#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const SUPPORTED_SOURCES = new Set(["claude-code", "codex", "oh-my-pi", "pi"]);
const DAY_MS = 86_400_000;
const COVERAGE_LAG_MS = DAY_MS;

function parseTimestamp(value) {
  if (typeof value !== "string") return NaN;
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.exec(value);
  if (!match) return NaN;
  const calendar = new Date(0);
  calendar.setUTCFullYear(Number(match[1]), Number(match[2]), 0);
  if (Number(match[3]) > calendar.getUTCDate()) return NaN;
  return Date.parse(value);
}

export function buildReport(input) {
  if (!input || !Array.isArray(input.inventory) || !Array.isArray(input.events)) {
    throw new Error("input must contain inventory and events arrays");
  }
  const coverage = input.coverage;
  const now = Date.now();
  const from = parseTimestamp(coverage?.observedFrom);
  const through = parseTimestamp(coverage?.observedThrough);
  const validInterval = Number.isFinite(from) && Number.isFinite(through) && from <= through && from <= now && through <= now;
  const days = validInterval ? (through - from) / DAY_MS : null;
  const provenCoverage = coverage?.complete === true
    && coverage?.consent === true
    && SUPPORTED_SOURCES.has(coverage?.source)
    && validInterval;
  const currentCoverage = provenCoverage && now - through <= COVERAGE_LAG_MS;
  const sufficient = currentCoverage && days >= 30;
  const usage = new Set();
  const unplaced = new Set();
  if (currentCoverage) {
    for (const event of input.events) {
      if (event?.consent !== true || event.source !== coverage.source) continue;
      if (typeof event.name !== "string" || typeof event.version !== "string" || !["success", "failure", "interrupted"].includes(event.outcome)) continue;
      const key = `${event.name}\0${event.version}`;
      const timestamp = parseTimestamp(event.timestamp);
      if (!Number.isFinite(timestamp)) unplaced.add(key);
      else if (timestamp >= from && timestamp <= through) usage.add(key);
    }
  }
  return {
    coverage: { sufficient, source: SUPPORTED_SOURCES.has(coverage?.source) ? coverage.source : null, days },
    suggestions: input.inventory.map((item) => {
      const key = `${item.name}\0${item.version}`;
      const observed = usage.has(key);
      // presentSince attests uninterrupted presence, which event coverage alone cannot establish.
      const presentSince = parseTimestamp(item.presentSince);
      const continuouslyPresent = Number.isFinite(presentSince)
        && presentSince <= now - 30 * DAY_MS
        && through - Math.max(from, presentSince) >= 30 * DAY_MS;
      let status = "unknown";
      if ((item.pinned !== undefined && typeof item.pinned !== "boolean")
        || (item.ignored !== undefined && typeof item.ignored !== "boolean")) status = "unknown";
      else if (item.pinned === true) status = "pinned";
      else if (item.ignored === true) status = "ignored";
      else if (observed) status = "active";
      else if (sufficient && continuouslyPresent && !unplaced.has(key)) status = "stale-candidate";
      return { name: item.name, version: item.version, status };
    }),
    policy: "Suggestions only. No skill is deleted or disabled; usage stays local.",
  };
}

function main(argv) {
  const file = argv[0];
  if (!file || argv.length !== 1) {
    console.error("usage: node scripts/skill-usage-lifecycle.mjs <local-events.json>");
    return 2;
  }
  try {
    const input = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(JSON.stringify(buildReport(input), null, 2));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1]) {
  try {
    const invoked = fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
    if (invoked) process.exitCode = main(process.argv.slice(2));
  } catch {
    // Importing the module or an unresolved argv path must not execute the CLI.
  }
}
