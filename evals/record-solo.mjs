#!/usr/bin/env node
// Opt-in paid leg for: node evals/run.mjs --compare <solo-dir> <delivery-scenario-dir>.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { metricsForOutput } from "./metrics.mjs";
import { fingerprintDirectory, fingerprintEvalSource } from "./evidence.mjs";
import { validateRetainedDeliveryCohort } from "./feedback.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1];
};
const deliveryDir = value("--delivery");
const outputDir = value("--out");
const model = value("--model");
const maxMinutes = Number(value("--max-time") ?? 10);
const requestedSamples = value("--samples");
if (!deliveryDir || !outputDir || !model || !Number.isFinite(maxMinutes) || maxMinutes <= 0 ||
    args.some((arg, index) => index % 2 === 0 ? !["--delivery", "--out", "--model", "--max-time", "--samples"].includes(arg) : arg.startsWith("--")) ||
    args.length % 2 !== 0) {
  console.error("usage: node evals/record-solo.mjs --delivery <run-or-cohort> --out <new-directory> --model <same-model> [--samples COUNT] [--max-time MINUTES]");
  process.exit(2);
}

const evaluatorRoot = path.resolve(here, "..");
const delivery = JSON.parse(fs.readFileSync(path.join(path.resolve(deliveryDir), "comparison-run.json"), "utf8"));
const deliveryOutput = delivery.rawOutput ? path.resolve(evaluatorRoot, delivery.rawOutput) : null;
const output = path.resolve(outputDir);
const sampleCount = requestedSamples === null ? delivery.sampleRuns?.length ?? 1 : Number(requestedSamples);
if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 100 ||
    (Array.isArray(delivery.sampleRuns) && delivery.sampleRuns.length !== sampleCount)) {
  console.error("sample count must be 1–100 and match the delivery cohort");
  process.exit(2);
}
function usableDeliveryRun(run, directory) {
  const dist = path.join(path.dirname(directory), ".dist");
  if (run.sampleRuns || run.kind !== "delivery" || run.phases?.length !== 1 ||
      run.phases[0]?.phase !== "1-verify-implementation" ||
      run.name !== "verify-required-arguments" || run.model !== model ||
      !run.repo || !fs.existsSync(run.repo) || !/^[a-f0-9]{40}$/.test(run.fixtureRevision ?? "") ||
      !/^[a-f0-9]{64}$/.test(run.sourceRevision ?? "") || !/^[a-f0-9]{64}$/.test(run.fixtureSnapshotRevision ?? "") ||
      run.fixtureVersion !== run.fixtureSnapshotRevision ||
      !run.rawOutput || path.resolve(evaluatorRoot, run.rawOutput) !== directory) return false;
  try {
    execFileSync("git", ["cat-file", "-e", `${run.fixtureRevision}^{commit}`], { cwd: run.repo, stdio: "ignore" });
    return fingerprintDirectory(path.join(dist, "fixtures")) === run.fixtureSnapshotRevision &&
      fingerprintEvalSource(dist, run.name, run.fixtureSnapshotRevision) === run.sourceRevision;
  } catch { return false; }
}
if (sampleCount > 1) {
  const cohortValidation = validateRetainedDeliveryCohort(delivery, { sampleCount, model });
  if (path.resolve(deliveryDir) !== deliveryOutput || cohortValidation.problems.length > 0) {
    console.error(`delivery cohort invalid: ${cohortValidation.problems.join("; ") || "delivery directory aliases its retained manifest"}`);
    process.exit(2);
  }
  if (fs.existsSync(output)) {
    console.error(`refusing to overwrite recorded run: ${output}`);
    process.exit(2);
  }
  const deliverySamples = cohortValidation.sampleDirs;
  if (deliverySamples.some((directory) => !usableDeliveryRun(
    JSON.parse(fs.readFileSync(path.join(directory, "comparison-run.json"), "utf8")), directory
  ))) {
    console.error("delivery cohort contains a child without a retained fixture repository or usable pinned sources");
    process.exit(2);
  }
  fs.mkdirSync(output, { recursive: true });
  const sampleRuns = [];
  let first = null;
  let allPassed = true;
  for (let index = 0; index < sampleCount; index++) {
    const sampleDir = path.join(output, `sample-${String(index + 1).padStart(2, "0")}`);
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--delivery", deliverySamples[index], "--out", sampleDir, "--model", model, "--max-time", String(maxMinutes)], { cwd: evaluatorRoot, encoding: "utf8" });
    const manifest = path.join(sampleDir, "comparison-run.json");
    if (fs.existsSync(manifest)) {
      const sample = JSON.parse(fs.readFileSync(manifest, "utf8"));
      first ??= sample;
      allPassed &&= sample.ok === true;
      sampleRuns.push(path.relative(output, sampleDir));
    } else {
      allPassed = false;
      sampleRuns.push(path.relative(output, sampleDir));
    }
    if (result.error) allPassed = false;
  }
  const cohort = {
    ...(first ?? {}),
    name: first?.name ?? delivery.name,
    rawOutput: output,
    sampleRuns,
    sampleCount: sampleRuns.length,
    ok: allPassed,
  };
  delete cohort.phases;
  delete cohort.executionId;
  fs.writeFileSync(path.join(output, "comparison-run.json"), `${JSON.stringify(cohort, null, 2)}\n`);
  console.log(JSON.stringify(cohort, null, 2));
  process.exit(allPassed ? 0 : 1);
}
const deliveryDist = deliveryOutput ? path.join(path.dirname(deliveryOutput), ".dist") : null;
if (!deliveryOutput || deliveryOutput !== path.resolve(deliveryDir) || !usableDeliveryRun(delivery, deliveryOutput)) {
  console.error("delivery run must retain matching source and fixture snapshots, its fixture repository, and the same explicit model");
  process.exit(2);
}
const source = path.resolve(delivery.repo);
if (fs.existsSync(output)) {
  console.error(`refusing to overwrite recorded run: ${output}`);
  process.exit(2);
}
fs.mkdirSync(output, { recursive: true });
const repository = path.join(output, "repo");
execFileSync("git", ["clone", "-q", "--no-hardlinks", source, repository]);
execFileSync("git", ["checkout", "--detach", "-q", delivery.fixtureRevision], { cwd: repository });
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
const outputDist = path.join(output, ".dist");
fs.mkdirSync(outputDist, { recursive: true });
for (const snapshot of ["fixtures", "agents", "skills", "shared", "eval-sources"]) {
  fs.cpSync(path.join(deliveryDist, snapshot), path.join(outputDist, snapshot), { recursive: true });
}
const fixtureSnapshot = path.join(outputDist, "fixtures");
const fixtureSnapshotRevision = fingerprintDirectory(fixtureSnapshot);
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureSnapshot, "delivery-comparison", "acceptance.json"), "utf8"));
if (fixtureSnapshotRevision !== delivery.fixtureSnapshotRevision) {
  console.error("local fixture snapshot differs from the retained delivery run");
  process.exit(2);
}
const prompt = [
  "Solo verification task: no delivery skills or task artifacts. Inspect this repository and independently verify its notification CLI.",
  "Read task.md, package.json, CI, and README. Run the build with its required runtime argument and inspect the produced output.",
  "Acceptance conditions:",
  ...fixture.acceptance.map((criterion) => `- ${criterion}`),
  "Report the exact command, observed output, and any failures. Do not modify source or treat a bare build usage error as a product failure.",
].join("\n");
fs.writeFileSync(path.join(output, "prompt.md"), prompt);
const started = Date.now();
const child = spawn("omp", ["-p", "--auto-approve", "--no-session", "--mode", "json", "--no-skills", "--no-extensions", "--no-rules", `--max-time=${maxMinutes}m`, "--model", model, prompt], {
  cwd: repository, stdio: ["ignore", "pipe", "pipe"], detached: true,
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
const timer = setTimeout(() => {
  try { process.kill(-child.pid, "SIGKILL"); }
  catch { child.kill("SIGKILL"); }
}, (maxMinutes + 1) * 60 * 1000);
const exitCode = await new Promise((resolve) => {
  child.on("error", (error) => { stderr += error.message; resolve(null); });
  child.on("close", resolve);
});
clearTimeout(timer);
const wallMs = Date.now() - started;
const metrics = metricsForOutput(stdout, wallMs);
const answer = metrics.answer ?? "";
const phase = "1-solo-verification";
const phaseDir = path.join(output, phase);
fs.mkdirSync(path.join(phaseDir, "task"), { recursive: true });
fs.writeFileSync(path.join(phaseDir, "omp.jsonl"), stdout);
fs.writeFileSync(path.join(output, "answer.md"), answer);
fs.writeFileSync(path.join(phaseDir, "answer.md"), answer);
fs.writeFileSync(path.join(phaseDir, "task", "task.md"), prompt);
let runtime = null;
try { runtime = fs.readFileSync(path.join(repository, "dist", "runtime.txt"), "utf8").trim(); }
catch { /* A missing build output fails acceptance below. */ }
if (runtime !== null) fs.writeFileSync(path.join(phaseDir, "runtime.txt"), runtime);
const changed = execFileSync("git", ["diff", "--name-only", revision], { cwd: repository, encoding: "utf8" }).trim();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
const answerProblems = [
  ...(answer.trim() ? [] : ["solo answer was empty"]),
  ...(/npm run build -- RUNTIME=node/.test(answer) ? [] : ["answer omitted the required npm run build -- RUNTIME=node command"]),
  ...(/built for node/.test(answer) ? [] : ["answer omitted observed built for node output"]),
  ...(!/npm run build[^\n`]*usage[^\n]*\|\s*fail/i.test(answer) ? [] : ["answer treated a bare build usage error as a product failure"]),
];
const problems = [
  ...(exitCode === 0 ? [] : [`omp exited ${exitCode}`]),
  ...answerProblems,
  ...(runtime === "built for node" ? [] : [`build output was ${JSON.stringify(runtime)}`]),
  ...(head === revision && !changed ? [] : ["solo run changed tracked source or committed a new revision"]),
];
const ok = problems.length === 0;
const result = {
  name: delivery.name, kind: "solo", executionId: crypto.randomUUID(), ok, ompExitCode: exitCode, actualModel: metrics.coverage.models.length === 1 ? metrics.coverage.models[0] : null,
  fixtureId: fixture.id, model, fixtureRevision: revision, fixtureVersion: fixtureSnapshotRevision, fixtureSnapshotRevision, sourceRevision: delivery.sourceRevision,
  wallTimeSeconds: Math.round(wallMs / 1000), metrics,
  phases: [{ phase, exitCode, wall_ms: wallMs, tokens: metrics.tokens, cost: metrics.cost, cost_basis: metrics.cost_basis, cost_source: metrics.cost_source,
    coverage: metrics.coverage, ok, problems }],
  repo: repository, rawOutput: output, problems,
};
fs.writeFileSync(path.join(output, "comparison-run.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(ok ? 0 : 1);
