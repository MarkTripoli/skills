import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

function snapshotSpecialEntry(stats) {
  let type = "other";
  if (stats.isFIFO()) type = "fifo";
  else if (stats.isSocket()) type = "socket";
  else if (stats.isBlockDevice()) type = "block-device";
  else if (stats.isCharacterDevice()) type = "character-device";
  return { kind: "other", type };
}

export function snapshotGitConfig(root) {
  const gitRoot = path.join(root, ".git");
  let gitRootStats;
  try {
    gitRootStats = fs.lstatSync(gitRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!gitRootStats.isDirectory() || gitRootStats.isSymbolicLink()) return null;

  const config = path.join(gitRoot, "config");
  let stats;
  try {
    stats = fs.lstatSync(config);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (stats.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(config);
    return {
      kind: "symlink",
      linkTarget,
      sha256: crypto.createHash("sha256").update(linkTarget).digest("hex"),
    };
  }
  if (stats.isDirectory()) return { kind: "directory" };
  if (!stats.isFile()) return snapshotSpecialEntry(stats);
  return {
    kind: "file",
    sha256: crypto.createHash("sha256").update(fs.readFileSync(config)).digest("hex"),
  };
}

export function gitConfigChanged(before, after) {
  return !isDeepStrictEqual(before, after);
}
