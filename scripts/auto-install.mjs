#!/usr/bin/env node
// Git hook entry for .githooks/post-checkout, post-merge, and post-rewrite: reinstalls this checkout's skills when the
// default branch moves, so agents load what was pulled. Off until `git config skills.autoInstall auto` (agents found on
// PATH) or a runtime list such as `claude-code codex`. Other branches never touch installed skills. Never fails the git
// command: every outcome is one line on stderr and exit 0.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectTargets } from "./install.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Whether this hook invocation moved HEAD in a way that warrants a refresh.
export function hookRuns(hook, args) {
  if (hook === "post-checkout") return args[2] === "1" && args[0] !== args[1]; // branch checkout that changed HEAD
  if (hook === "post-rewrite") return args[0] === "rebase"; // `git pull --rebase`
  return hook === "post-merge"; // `git pull` merge or fast-forward
}

// Install targets for the skills.autoInstall value. `auto` uses the installer's PATH detection, minus its portable
// fallback: a hook with no agent on PATH skips the refresh rather than writing an install nobody asked for.
export function targetsFor(setting, env = process.env) {
  if (setting === "off") return [];
  if (setting === "auto") return detectTargets(env).filter((target) => target !== "portable");
  return setting.split(/[\s,]+/).filter(Boolean);
}

function git(cwd, env, ...args) {
  try {
    return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function refresh(hook, args, { cwd = process.cwd(), env = process.env } = {}) {
  const setting = git(cwd, env, "config", "--get", "skills.autoInstall");
  if (!setting || setting === "off" || !hookRuns(hook, args)) return null;
  const branch = git(cwd, env, "symbolic-ref", "--short", "-q", "HEAD");
  const defaultBranch = git(cwd, env, "symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD").replace(/^origin\//, "") || "main";
  if (branch !== defaultBranch) return null;
  const targets = targetsFor(setting, env);
  if (!targets.length) return "skills: no agent found on PATH; installed skills not refreshed";
  const result = spawnSync(process.execPath, [path.join(here, "install.mjs"), ...targets, "--yes"], { cwd, env, encoding: "utf8" });
  if (result.status === 0) return `skills: refreshed installed skills for ${targets.join(", ")}; start a new agent session to load them`;
  const lastLine = (text) => (text ?? "").trim().split("\n").pop();
  const reason = lastLine(result.stderr) || lastLine(result.stdout) || result.error?.message || `exit ${result.status}`;
  return `skills: skill refresh failed (${reason}); run: node scripts/install.mjs ${targets.join(" ")} --yes`;
}

const invoked = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : null;
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const line = refresh(process.argv[2], process.argv.slice(3));
    if (line) console.error(line);
  } catch (error) {
    console.error(`skills: skill refresh skipped (${error.message})`);
  }
}
