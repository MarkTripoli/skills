#!/usr/bin/env node
// Read-only project stack detection and explicitly approved minimal Node bootstrap.
import { createHash } from "node:crypto";
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


function withPinnedDirectory(root, use) {
  const project = normalizeProject(root);
  if (typeof fs.constants.O_DIRECTORY !== "number" || typeof fs.constants.O_NOFOLLOW !== "number") {
    throw new Error("Cannot securely open the target directory on this platform.");
  }
  const previousDirectory = process.cwd();
  const directoryFd = fs.openSync(project, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    const pinned = fs.fstatSync(directoryFd);
    if (!pinned.isDirectory()) throw new Error("Target must be a directory; refusing to write.");
    process.chdir(project);
    const cwd = fs.statSync(".");
    if (cwd.dev !== pinned.dev || cwd.ino !== pinned.ino) {
      throw new Error("Bootstrap target changed; refusing to write.");
    }
    return use(project, { dev: pinned.dev, ino: pinned.ino });
  } finally {
    try {
      process.chdir(previousDirectory);
    } finally {
      fs.closeSync(directoryFd);
    }
  }
}

function planInPinnedDirectory(project, identity) {
  const detection = detectProject(".");
  const canCreate = detection.status === "detected" && detection.stack === "node" &&
    !fs.existsSync("package.json") && containsOnlyVersionMarkers(".");
  const plan = {
    version: 1,
    mode: canCreate ? "supported" : detection.status === "detected" ? "supported" : "unsupported",
    outcome: "planned",
    project,
    identity,
    detected: detection.status === "detected" ? [{ stack: detection.stack, manager: detection.manager, manifest: detection.manifest }] : [],
    actions: canCreate ? [{ type: "create-file", path: "package.json", contents: '{\n  "private": true\n}\n' }] : [],
    explanation: canCreate
      ? "Supported empty Node target. A minimal package.json can be created only with --apply --approve <planId> from this dry run."
      : detection.status === "detected"
        ? "Existing Node project detected. Existing configuration is preserved; no changes are proposed."
        : detection.reason,
  };
  return { ...plan, planId: createHash("sha256").update(JSON.stringify(plan)).digest("hex") };
}

export function createPlan(root) {
  return withPinnedDirectory(root, planInPinnedDirectory);
}

export function applyPlan(root, plan) {
  return withPinnedDirectory(root, (requested, identity) => {
    if (plan.project !== requested || plan.mode !== "supported" || plan.actions.length !== 1 ||
        plan.actions[0].path !== "package.json" || plan.actions[0].contents !== '{\n  "private": true\n}\n') {
      throw new Error("No applicable bootstrap action.");
    }
    if (plan.identity?.dev !== identity.dev || plan.identity?.ino !== identity.ino) {
      throw new Error("Bootstrap target changed; refusing to write.");
    }
    const current = planInPinnedDirectory(requested, identity);
    if (current.mode !== "supported" || JSON.stringify(current.actions) !== JSON.stringify(plan.actions)) {
      throw new Error("Bootstrap plan is stale; refusing to write.");
    }
    // A private stage is not protected if another user owns its parent entry
    // or can rename it through group/world write permissions.
    const target = fs.statSync(".");
    if (target.uid !== process.geteuid() || (target.mode & 0o022)) {
      throw new Error("Bootstrap target permits replacement of staged files; refusing to write.");
    }
    // Stage on the approved filesystem inside a private directory. Other
    // users cannot replace the source between the ownership check and cleanup.
    // An exclusive hard link publishes the complete inode without overwriting.
    const stagingDir = fs.mkdtempSync(".package-staging-");
    const staged = path.join(stagingDir, "package.json");
    let fd;
    let created;
    try {
      fd = fs.openSync(staged, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o644);
      created = fs.fstatSync(fd);
      fs.writeFileSync(fd, plan.actions[0].contents, "utf8");
      const entry = fs.lstatSync(staged);
      if (entry.dev !== created.dev || entry.ino !== created.ino) {
        throw new Error("Bootstrap staging file changed; refusing to write.");
      }
      fs.linkSync(staged, "package.json");
      // The source name can be replaced between lstat and link; never report
      // success for a different inode or remove another actor's published entry.
      const published = fs.lstatSync("package.json");
      if (!published.isFile() || published.dev !== created.dev || published.ino !== created.ino) {
        throw new Error("Bootstrap publication changed; refusing to report success.");
      }
    } finally {
      try {
        if (created) {
          try {
            const entry = fs.lstatSync(staged);
            if (entry.dev !== created.dev || entry.ino !== created.ino) {
              throw new Error("Bootstrap staging file changed; refusing to remove.");
            }
            fs.unlinkSync(staged);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
        fs.rmdirSync(stagingDir);
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
    return { ...plan, outcome: "applied" };
  });
}

function cli(argv) {
  let target = process.cwd();
  let apply = false;
  let approve;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--target") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--target requires a directory.");
      target = path.resolve(argv[++i]);
    } else if (argv[i] === "--apply") apply = true;
    else if (argv[i] === "--approve") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("--approve requires the dry-run planId.");
      approve = argv[++i];
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (apply !== (approve !== undefined)) throw new Error("--apply and --approve <planId> must be supplied together.");
  let result = createPlan(target);
  if (apply && approve !== result.planId) throw new Error("Bootstrap plan changed; refusing to write.");
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
