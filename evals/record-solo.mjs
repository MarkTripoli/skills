#!/usr/bin/env node
// Opt-in paid leg for: node evals/run.mjs --compare <solo-dir> <delivery-scenario-dir>.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { metricsForOutput } from "./metrics.mjs";
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
if (!deliveryDir || !outputDir || !model || !Number.isFinite(maxMinutes) || maxMinutes <= 0 ||
    args.some((arg, index) => index % 2 === 0 ? !["--delivery", "--out", "--model", "--max-time"].includes(arg) : arg.startsWith("--")) ||
    args.length % 2 !== 0) {
  console.error("usage: node evals/record-solo.mjs --delivery <verify-required-arguments-run> --out <new-directory> --model <same-model> [--max-time MINUTES]");
  process.exit(2);
}

const delivery = JSON.parse(fs.readFileSync(path.join(path.resolve(deliveryDir), "comparison-run.json"), "utf8"));
if (delivery.name !== "verify-required-arguments" || delivery.model !== model ||
    !delivery.repo || !fs.existsSync(delivery.repo) || !/^[a-f0-9]{40}$/.test(delivery.fixtureRevision ?? "")) {
  console.error("delivery run must retain the verify-required-arguments fixture repository (--keep), its revision, and the same explicit model");
  process.exit(2);
}
const source = path.resolve(delivery.repo);
const output = path.resolve(outputDir);
if (fs.existsSync(output)) {
  console.error(`refusing to overwrite recorded run: ${output}`);
  process.exit(2);
}
fs.mkdirSync(output, { recursive: true });
const repository = path.join(output, "repo");
execFileSync("git", ["clone", "-q", "--no-hardlinks", source, repository]);
execFileSync("git", ["checkout", "--detach", "-q", delivery.fixtureRevision], { cwd: repository });
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
const fixture = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "delivery-comparison", "acceptance.json"), "utf8"));
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
fs.writeFileSync(path.join(output, "answer.md"), metrics.answer ?? "");
let runtime = null;
try { runtime = fs.readFileSync(path.join(repository, "dist", "runtime.txt"), "utf8").trim(); }
catch { /* A missing build output fails acceptance below. */ }
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
const changed = execFileSync("git", ["diff", "--name-only", revision], { cwd: repository, encoding: "utf8" }).trim();
const ok = exitCode === 0 && runtime === "built for node" &&
  /npm run build -- RUNTIME=node/.test(metrics.answer ?? "") && head === revision && !changed;
const result = {
  name: fixture.id, ok, model, fixtureRevision: revision,
  wallTimeSeconds: Math.round(wallMs / 1000), metrics,
  repo: repository, rawOutput: output,
  problems: [
    ...(exitCode === 0 ? [] : [`omp exited ${exitCode}`]),
    ...(runtime === "built for node" ? [] : [`build output was ${JSON.stringify(runtime)}`]),
    ...(/npm run build -- RUNTIME=node/.test(metrics.answer ?? "") ? [] : ["answer omitted required build command"]),
    ...(head === revision && !changed ? [] : ["solo run changed tracked source or committed a new revision"]),
  ],
};
fs.writeFileSync(path.join(output, "comparison-run.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(ok ? 0 : 1);
