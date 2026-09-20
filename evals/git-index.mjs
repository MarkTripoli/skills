import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

function nulSeparated(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

export function snapshotGitIndex(root) {
  const visibleIntentPaths = new Set(nulSeparated(execFileSync("git", [
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--ita-visible-in-index",
  ], { cwd: root })));
  const ordinaryStagedPaths = new Set(nulSeparated(execFileSync("git", [
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--ita-invisible-in-index",
  ], { cwd: root })));
  const staged = nulSeparated(execFileSync("git", ["ls-files", "--stage", "-v", "-z"], { cwd: root }));
  return staged.map((record) => {
    const match = /^([A-Za-z?]) ([0-7]{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error(`unexpected git ls-files record: ${JSON.stringify(record)}`);
    const [, tag, mode, object, stage, trackedPath] = match;
    return {
      path: trackedPath,
      stage: Number(stage),
      mode,
      object,
      assumeUnchanged: tag !== "?" && tag === tag.toLowerCase(),
      skipWorktree: tag.toUpperCase() === "S",
      intentToAdd: visibleIntentPaths.has(trackedPath) && !ordinaryStagedPaths.has(trackedPath),
    };
  });
}

export function gitIndexChanged(before, after) {
  return !isDeepStrictEqual(before, after);
}
