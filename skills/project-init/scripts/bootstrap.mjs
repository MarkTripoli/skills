#!/usr/bin/env node
// Read-only project stack detection and deterministic bootstrap plan.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function detectProject(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
  const signals = [];
  if (has("package.json")) {
    const manager = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("package-lock.json") || has("npm-shrinkwrap.json") ? "npm" : "unknown";
    signals.push({ stack: "node", manager, manifest: "package.json" });
  }
  if (has("pyproject.toml")) {
    const manager = has("uv.lock") ? "uv" : has("poetry.lock") ? "poetry" : has("Pipfile.lock") ? "pipenv" : "unknown";
    signals.push({ stack: "python", manager, manifest: "pyproject.toml" });
  }
  return signals;
}

export function createPlan(root) {
  const detected = detectProject(root);
  return {
    version: 1,
    mode: detected.length ? "supported" : "unsupported",
    project: path.resolve(root),
    detected,
    actions: [],
    explanation: detected.length
      ? "Existing project configuration detected. No dependency, service, or installation changes are proposed automatically."
      : "No supported project manifest detected; no changes proposed.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? ".");
  const plan = createPlan(root);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (plan.mode === "unsupported") process.exitCode = 2;
}
