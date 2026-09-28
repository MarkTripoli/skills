#!/usr/bin/env node
// Read-only project stack detection and explicitly approved minimal Node bootstrap.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NODE_MARKERS = [".nvmrc", ".node-version"];
const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];
const PYTHON_MARKERS = ["pyproject.toml", "uv.lock", "poetry.lock", "Pipfile", "Pipfile.lock", "requirements.txt"];
const OTHER_PROJECT_MARKERS = ["go.mod"];

export function detectProject(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
  const nodeMarkers = NODE_MARKERS.filter(has);
  const lockfiles = LOCKFILES.filter(([file]) => has(file));
  const pythonMarkers = PYTHON_MARKERS.filter(has);
  const otherProjectMarkers = OTHER_PROJECT_MARKERS.filter(has);
  const hasManifest = has("package.json");
  if (pythonMarkers.length || otherProjectMarkers.length) {
    return { status: "unsupported", reason: "Existing non-Node project signals are unsupported." };
  }
  if (nodeMarkers.length > 1) return { status: "unsupported", reason: "Multiple Node version markers are ambiguous." };
  if (lockfiles.length > 1) return { status: "unsupported", reason: "Conflicting or multiple package-manager lockfiles are unsupported." };
  if (hasManifest) {
    return { status: "detected", stack: "node", manager: lockfiles[0]?.[1] ?? "unknown", manifest: "package.json" };
  }
  if (nodeMarkers.length && !lockfiles.length) {
    return { status: "detected", stack: "node", manager: "npm", manifest: "package.json" };
  }
  if (lockfiles.length) return { status: "unsupported", reason: "A lockfile without package.json is unsupported." };
  return { status: "unsupported", reason: "No supported Node project signals detected." };
}

function assertNoSymlinkComponents(root) {
  const resolved = path.resolve(root);
  const { root: volume } = path.parse(resolved);
  let current = volume;
  for (const component of resolved.slice(volume.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (!stat.isSymbolicLink()) continue;
    const real = fs.realpathSync(current);
    const knownDarwinAlias = process.platform === "darwin" &&
      ((current === "/tmp" && real === "/private/tmp") || (current === "/var" && real === "/private/var"));
    if (!knownDarwinAlias) throw new Error("Target path contains a symlink; refusing to write.");
  }
}

function normalizeProject(root) {
  assertNoSymlinkComponents(root);
  const requested = path.resolve(root);
  const parent = fs.realpathSync(path.dirname(requested));
  return path.join(parent, path.basename(requested));
}
function containsOnlyVersionMarkers(project) {
  return fs.readdirSync(project, { withFileTypes: true }).every((entry) =>
    NODE_MARKERS.includes(entry.name) && entry.isFile(),
  );
}


export function createPlan(root) {
  const project = normalizeProject(root);
  const detection = detectProject(project);
  const canCreate = detection.status === "detected" && detection.stack === "node" &&
    !fs.existsSync(path.join(project, "package.json")) && containsOnlyVersionMarkers(project);
  return {
    version: 1,
    mode: canCreate ? "supported" : detection.status === "detected" ? "supported" : "unsupported",
    outcome: "planned",
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
  if (!targetInfo.isDirectory()) throw new Error("Target must be a directory; refusing to write.");
  const current = createPlan(requested);
  if (current.mode !== "supported" || JSON.stringify(current.actions) !== JSON.stringify(plan.actions)) {
    throw new Error("Bootstrap plan is stale; refusing to write.");
  }
  // Node has no openat: pin the directory as cwd, and verify its inode before
  // using relative names. A swapped parent path cannot redirect the write.
  if (typeof fs.constants.O_DIRECTORY !== "number" || typeof fs.constants.O_NOFOLLOW !== "number") {
    throw new Error("Cannot securely open the target directory on this platform.");
  }
  const previousDirectory = process.cwd();
  const directoryFd = fs.openSync(requested, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    const pinned = fs.fstatSync(directoryFd);
    if (!pinned.isDirectory() || pinned.dev !== targetInfo.dev || pinned.ino !== targetInfo.ino) {
      throw new Error("Bootstrap target changed; refusing to write.");
    }
    process.chdir(requested);
    const cwd = fs.statSync(".");
    if (cwd.dev !== pinned.dev || cwd.ino !== pinned.ino) {
      throw new Error("Bootstrap target changed; refusing to write.");
    }
    // Write before publishing. An exclusive hard link publishes the complete
    // inode without overwriting a manifest created by another invocation.
    const staged = `.package.json.${randomUUID()}`;
    const fd = fs.openSync(staged, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o644);
    let created;
    try {
      created = fs.fstatSync(fd);
      fs.writeFileSync(fd, plan.actions[0].contents, "utf8");
      const entry = fs.lstatSync(staged);
      if (entry.dev !== created.dev || entry.ino !== created.ino) {
        throw new Error("Bootstrap staging file changed; refusing to write.");
      }
      fs.linkSync(staged, "package.json");
    } finally {
      try {
        fs.closeSync(fd);
      } finally {
        if (created) {
          try {
            const entry = fs.lstatSync(staged);
            if (entry.dev === created.dev && entry.ino === created.ino) fs.unlinkSync(staged);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      }
    }
  } finally {
    try {
      process.chdir(previousDirectory);
    } finally {
      fs.closeSync(directoryFd);
    }
  }
  return { ...plan, outcome: "applied" };
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
  let result = createPlan(target);
  if (apply && result.actions.length) result = applyPlan(target, result);
  else if (apply && result.mode === "supported") result = { ...result, outcome: "unchanged" };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.mode === "unsupported") process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
