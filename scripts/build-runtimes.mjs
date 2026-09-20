#!/usr/bin/env node
// Emits a runtime-specific install tree from the canonical skills.
// Usage: node scripts/build-runtimes.mjs --runtime <claude-code|codex|oh-my-pi|pi|portable> [--dest <dir>]
// The layout of the output is described in scripts/lib/build.mjs.

import path from "node:path";
import { RUNTIMES, buildPortable, buildRuntime, repoRoot } from "./lib/build.mjs";

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const runtime = option("--runtime");
const buildTargets = [...RUNTIMES, "portable"];
if (!runtime || !buildTargets.includes(runtime)) {
  console.error(`usage: node scripts/build-runtimes.mjs --runtime <${buildTargets.join("|")}> [--dest <dir>]`);
  process.exit(1);
}
const dest = path.resolve(option("--dest") ?? path.join(repoRoot, "dist", runtime));

try {
  const result = runtime === "portable" ? buildPortable(dest) : buildRuntime(runtime, dest);
  console.log(`built ${runtime}: ${result.skills.length} skills, ${result.workers} workers -> ${dest}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
