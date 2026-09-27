#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SUPPORTED_SOURCES = new Set(["claude-code", "codex", "oh-my-pi", "pi"]);

export function buildReport(input) {
  if (!input || !Array.isArray(input.inventory) || !Array.isArray(input.events)) {
    throw new Error("input must contain inventory and events arrays");
  }
  const coverage = input.coverage;
  const from = Date.parse(coverage?.observedFrom);
  const through = Date.parse(coverage?.observedThrough);
  const days = Number.isFinite(from) && Number.isFinite(through) && through >= from
    ? (through - from) / 86_400_000
    : null;
  const sufficient = coverage?.complete === true
    && coverage?.consent === true
    && SUPPORTED_SOURCES.has(coverage?.source)
    && days !== null
    && days >= 30;
  const usage = new Set();
  for (const event of input.events) {
    if (event?.consent !== true || !SUPPORTED_SOURCES.has(event.source)) continue;
    if (typeof event.name !== "string" || typeof event.version !== "string" || !["success", "failure", "interrupted"].includes(event.outcome)) continue;
    usage.add(`${event.name}\0${event.version}`);
  }
  return {
    coverage: { sufficient, source: SUPPORTED_SOURCES.has(coverage?.source) ? coverage.source : null, days },
    suggestions: input.inventory.map((item) => {
      const observed = usage.has(`${item.name}\0${item.version}`);
      let status = "unknown";
      if (item.pinned === true) status = "pinned";
      else if (item.ignored === true) status = "ignored";
      else if (sufficient) status = observed ? "active" : "stale-candidate";
      else if (observed) status = "active";
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
