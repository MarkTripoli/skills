#!/usr/bin/env node
// Read-only project stack detection and explicitly approved minimal Node bootstrap.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function detectProject(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
  const nodeSignals = [has("package.json"), has("pnpm-lock.yaml"), has("yarn.lock"), has("package-lock.json"), has("npm-shrinkwrap.json"), has(".nvmrc"), has(".node-version")];
  const pythonSignals = [has("pyproject.toml"), has("uv.lock"), has("poetry.lock"), has("Pipfile"), has("Pipfile.lock")];
  const node = nodeSignals.some(Boolean);
  const python = pythonSignals.some(Boolean);
  if (node && python) return { status: "unsupported", reason: "Mixed Node and Python project signals are unsupported." };
  if (python) return { status: "unsupported", reason: "Python project bootstrap is unsupported." };
  if (has("package.json")) {
    const manager = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("package-lock.json") || has("npm-shrinkwrap.json") ? "npm" : "unknown";
    return { status: "detected", stack: "node", manager, manifest: "package.json" };
  }
  if (node) return { status: "detected", stack: "node", manager: "npm", manifest: "package.json" };
  return { status: "unsupported", reason: "No supported Node project signals detected." };
}

function normalizeProject(root) {
  const requested = path.resolve(root);
  const parent = fs.realpathSync(path.dirname(requested));
  return path.join(parent, path.basename(requested));
}

export function createPlan(root) {
  const project = normalizeProject(root);
  const detection = detectProject(project);
  const canCreate = detection.status === "detected" && detection.stack === "node" && !fs.existsSync(path.join(project, "package.json"));
  return {
    version: 1,
    mode: canCreate ? "supported" : detection.status === "detected" ? "supported" : "unsupported",
    project,
    detected: detection.status === "detected" ? [{ stack: detection.stack, manager: detection.manager, manifest: detection.manifest }] : [],
    actions: canCreate ? [{ type: "create-file", path: "package.json", contents: '{\n  "private": true\n}\n' }] : [],
    explanation: canCreate
      ? "Supported empty Node target. A minimal package.json can be created only with --apply --approve."
      : detection.status === "detected"
        ? "Existing Node project detected. Existing configuration is preserved; no changes are proposed."
        : detection.reason,
  };
}

export function applyPlan(root, plan) {
  const requested = normalizeProject(root);
  if (plan.project !== requested || plan.mode !== "supported" || plan.actions.length !== 1 ||
      plan.actions[0].path !== "package.json" || plan.actions[0].contents !== '{\n  "private": true\n}\n') {
    throw new Error("No applicable bootstrap action.");
  }
  const targetInfo = fs.lstatSync(requested);
  if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory()) {
    throw new Error("Target must be a real directory; refusing to write.");
  }
  const action = plan.actions[0];
  const target = path.join(requested, action.path);
  const fd = fs.openSync(target, "wx", 0o644);
  try {
    fs.writeFileSync(fd, action.contents, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function cli(argv) {
  let target = process.cwd();
  let apply = false;
  let approve = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--target") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--target requires a directory.");
      target = path.resolve(argv[++i]);
    } else if (argv[i] === "--apply") apply = true;
    else if (argv[i] === "--approve") approve = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (apply !== approve) throw new Error("--apply and --approve must be supplied together.");
  const plan = createPlan(target);
  if (apply && plan.actions.length) applyPlan(target, plan);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (plan.mode === "unsupported") process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
