#!/usr/bin/env node
// One live `judge.mjs compose` call per sample in tests/fixtures/compose-samples.json, printing the
// probability the model gave each phase against the bar it was compared to. This is how the PHASES wording
// is tuned: change a question, rerun, read the two columns that matter. Costs model time and needs a key,
// so it is never part of `npm test`.
//
// Usage: TYPESAFE_API_KEY=$(cat ~/.config/typesafe/api_key) node evals/compose-probe.mjs [sample-id ...]
// Exit 1 when a oneshot-shaped sample scores research or design above the bar, or a full-shaped one at or
// below it; exit 3 when the helper is unavailable, the same word the helper uses.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const judge = path.join(repoRoot, "skills", "delivery", "typed-judgment", "judge.mjs");
const fixture = path.join(repoRoot, "tests", "fixtures", "compose-samples.json");

const args = process.argv.slice(2);
const json = args.includes("--json");
const ids = args.filter((arg) => arg !== "--json");

const { samples } = JSON.parse(fs.readFileSync(fixture, "utf8"));
const selected = ids.length ? samples.filter((sample) => ids.includes(sample.id)) : samples;
const missing = ids.filter((id) => !samples.some((sample) => sample.id === id));
if (missing.length) {
  process.stderr.write(`compose-probe: unknown sample id${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}\n`);
  process.exit(2);
}

// research and design are the two phases the acceptance criterion is about: an oneshot-shaped sample
// must skip both, a full-shaped sample must keep both. The other six phases are printed for context but
// do not decide pass or fail here.
const WATCH = ["research", "design"];

// Async, like `judge()` in tests/judge.test.mjs: a synchronous spawn would block this process's event
// loop, which would deadlock against any stub server sharing it. The live endpoint never shares this
// process, but the async form is the one already proven safe in this repo.
function runCompose(task) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [judge, "compose", "--json", "-"]);
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (status) => resolve({ status, out, err }));
    child.stdin.end(task);
  });
}

const rows = [];
let failures = 0;
for (const sample of selected) {
  const result = await runCompose(sample.task);
  if (result.status === 3 || (result.status !== 0 && !result.out.trim())) {
    process.stderr.write(result.err || "judge: unavailable\n");
    process.exit(3);
  }
  if (result.status !== 0) {
    process.stderr.write(result.err || `judge exited ${result.status}\n`);
    process.exit(result.status ?? 1);
  }
  const out = JSON.parse(result.out);
  const watched = WATCH.map((phase) => out.phases.find((row) => row.phase === phase));
  const expectSkip = sample.shape === "oneshot";
  const mismatches = watched.filter((row) => (row.verdict === "skip") !== expectSkip).map((row) => ({ phase: row.phase, probability: row.probability, bar: row.bar }));
  const pass = mismatches.length === 0;
  if (!pass) failures++;
  rows.push({ id: sample.id, shape: sample.shape, pass, phases: out.phases, mismatches });
  const summary = watched.map((row) => `${row.phase}=${row.probability}`).join(" ");
  process.stdout.write(`${sample.id} ${sample.shape} ${summary} -> ${pass ? "pass" : "fail"}\n`);
  for (const mismatch of mismatches) process.stdout.write(`  mismatch: ${mismatch.phase} probability=${mismatch.probability} bar=${mismatch.bar}\n`);
}
if (json) process.stdout.write(`${JSON.stringify(rows)}\n`);
process.exit(failures ? 1 : 0);
