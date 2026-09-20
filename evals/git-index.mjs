import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const GIT_ROUTING_ENVIRONMENT = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NAMESPACE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
];

function nulSeparated(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

export function snapshotGitIndex(root) {
  const gitRoot = path.join(root, ".git");
  let gitRootStats;
  try {
    gitRootStats = fs.lstatSync(gitRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "unavailable", reason: "absent-git-root" };
    return { kind: "unavailable", reason: "unreadable-git-root" };
  }
  if (!gitRootStats.isDirectory() || gitRootStats.isSymbolicLink()) {
    return { kind: "unavailable", reason: "unsafe-git-root" };
  }
  const gitEnvironment = { ...process.env };
  for (const variable of GIT_ROUTING_ENVIRONMENT) delete gitEnvironment[variable];

  const indexDigest = () => {
    try {
      const index = path.join(gitRoot, "index");
      const stats = fs.lstatSync(index);
      if (!stats.isFile() || stats.isSymbolicLink()) return null;
      return crypto.createHash("sha256").update(fs.readFileSync(index)).digest("hex");
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      return null;
    }
  };
  const errorEvidence = (operation, error, fallbackCode = null) => {
    let code = fallbackCode;
    if (code === null && Number.isInteger(error?.status) && error.status > 0) code = `exit-${error.status}`;
    else if (code === null && error?.code === "ENOENT") code = "spawn-enoent";
    else if (code === null) code = "spawn-error";
    return { kind: "error", operation, code, indexSha256: indexDigest() };
  };
  const run = (operation, args) => {
    try {
      return {
        ok: true,
        value: execFileSync(
          "git",
          ["--git-dir", gitRoot, "--work-tree", root, ...args],
          { cwd: root, env: gitEnvironment, stdio: ["ignore", "pipe", "pipe"] },
        ),
      };
    } catch (error) {
      return { ok: false, evidence: errorEvidence(operation, error) };
    }
  };

  const visible = run("diff-visible-intent", ["diff", "--cached", "--name-only", "-z", "--ita-visible-in-index"]);
  if (!visible.ok) return visible.evidence;
  const ordinary = run("diff-ordinary-staged", ["diff", "--cached", "--name-only", "-z", "--ita-invisible-in-index"]);
  if (!ordinary.ok) return ordinary.evidence;
  const stagedResult = run("ls-files", ["ls-files", "--stage", "-v", "-z"]);
  if (!stagedResult.ok) return stagedResult.evidence;

  const visibleIntentPaths = new Set(nulSeparated(visible.value));
  const ordinaryStagedPaths = new Set(nulSeparated(ordinary.value));
  const entries = [];
  for (const record of nulSeparated(stagedResult.value)) {
    const match = /^([A-Za-z?]) ([0-7]{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(record);
    if (!match) return errorEvidence("parse-ls-files", null, "unexpected-record");
    const [, tag, mode, object, stage, trackedPath] = match;
    entries.push({
      path: trackedPath,
      stage: Number(stage),
      mode,
      object,
      assumeUnchanged: tag !== "?" && tag === tag.toLowerCase(),
      skipWorktree: tag.toUpperCase() === "S",
      intentToAdd: visibleIntentPaths.has(trackedPath) && !ordinaryStagedPaths.has(trackedPath),
    });
  }
  return entries;
}

export function gitIndexChanged(before, after) {
  return !isDeepStrictEqual(before, after);
}
