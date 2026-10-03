import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { hookRuns, targetsFor, refresh } from "../scripts/auto-install.mjs";

const hooks = path.resolve(import.meta.dirname, "../.githooks");

const temps = [];
function tmpdir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

// A fresh home per case: the installer writes under HOME, and git reads no user or system config.
function homeEnv() {
  const home = tmpdir("skills-auto-home-");
  return { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.com" };
}
function git(cwd, env, ...args) {
  return execFileSync("git", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}
const installed = (env) => fs.existsSync(path.join(env.HOME, ".claude/skills/babysit/SKILL.md"));

// An upstream with one commit on main and a clone of it using this repository's hooks.
function clone(env, setting) {
  const upstream = tmpdir("skills-auto-upstream-");
  git(upstream, env, "init", "-q", "-b", "main");
  git(upstream, env, "commit", "-q", "--allow-empty", "-m", "chore: init");
  const work = tmpdir("skills-auto-clone-");
  git(work, env, "clone", "-q", upstream, ".");
  git(work, env, "config", "core.hooksPath", hooks);
  if (setting) git(work, env, "config", "skills.autoInstall", setting);
  return { upstream, work };
}

test("only HEAD-moving hook calls refresh", () => {
  assert.equal(hookRuns("post-merge", ["0"]), true);
  assert.equal(hookRuns("post-rewrite", ["rebase"]), true);
  assert.equal(hookRuns("post-rewrite", ["amend"]), false);
  assert.equal(hookRuns("post-checkout", ["a", "b", "1"]), true);
  assert.equal(hookRuns("post-checkout", ["a", "a", "1"]), false, "same HEAD");
  assert.equal(hookRuns("post-checkout", ["a", "b", "0"]), false, "file checkout");
});

test("auto uses agents on PATH and never falls back to portable", () => {
  const bin = tmpdir("skills-auto-bin-");
  assert.deepEqual(targetsFor("auto", { PATH: bin }), []);
  fs.writeFileSync(path.join(bin, "claude"), "");
  fs.writeFileSync(path.join(bin, "codex"), "");
  assert.deepEqual(targetsFor("auto", { PATH: bin }), ["claude-code", "codex"]);
  assert.deepEqual(targetsFor("claude-code, pi", { PATH: bin }), ["claude-code", "pi"]);
});

test("auto with no agent on PATH reports and installs nothing", () => {
  const env = { ...homeEnv(), PATH: path.dirname(process.execPath) + path.delimiter + "/usr/bin:/bin" };
  const { work } = clone(env, "auto");
  if (targetsFor("auto", env).length) return; // an agent binary lives beside node or git on this machine
  assert.match(refresh("post-merge", ["0"], { cwd: work, env }), /no agent found on PATH/);
  assert.equal(fs.existsSync(path.join(env.HOME, ".claude")), false);
});

test("a pull on main reinstalls through the tracked hook", () => {
  const env = homeEnv();
  const { upstream, work } = clone(env, "claude-code");
  git(upstream, env, "commit", "-q", "--allow-empty", "-m", "feat: more");
  const out = execFileSync("git", ["pull", "-q", "--ff-only"], { cwd: work, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(out, "");
  assert.ok(installed(env), "pull on main installs skills");
});

test("a pull --rebase on main reinstalls", () => {
  const env = homeEnv();
  const { upstream, work } = clone(env, "claude-code");
  git(work, env, "commit", "-q", "--allow-empty", "-m", "chore: local");
  git(upstream, env, "commit", "-q", "--allow-empty", "-m", "feat: more");
  git(work, env, "pull", "-q", "--rebase");
  assert.ok(installed(env));
});

test("other branches and an unset setting leave installed skills alone", () => {
  const env = homeEnv();
  const { work } = clone(env, "claude-code");
  git(work, env, "checkout", "-q", "-b", "feature");
  assert.equal(refresh("post-merge", ["0"], { cwd: work, env }), null);
  assert.equal(installed(env), false, "feature branch checkout");

  const off = homeEnv();
  const { upstream, work: plain } = clone(off, null);
  git(upstream, off, "commit", "-q", "--allow-empty", "-m", "feat: more");
  git(plain, off, "pull", "-q", "--ff-only");
  assert.equal(installed(off), false, "setting unset");
});

test("the explicit off setting leaves installed skills byte-identical", () => {
  const env = homeEnv();
  const { work } = clone(env, "off");
  const sentinel = path.join(env.HOME, ".claude/skills/owned/SKILL.md");
  fs.mkdirSync(path.dirname(sentinel), { recursive: true });
  fs.writeFileSync(sentinel, "Owner-installed skill.\n");
  assert.deepEqual(targetsFor("off", env), []);
  assert.equal(refresh("post-merge", ["0"], { cwd: work, env }), null);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "Owner-installed skill.\n");
  assert.equal(installed(env), false);
});

test("switching back to main reinstalls; a failed install never fails git", () => {
  const env = homeEnv();
  const { work } = clone(env, "claude-code");
  git(work, env, "checkout", "-q", "-b", "feature");
  git(work, env, "commit", "-q", "--allow-empty", "-m", "feat: branch");
  assert.equal(installed(env), false, "feature commit");
  git(work, env, "checkout", "-q", "main");
  assert.ok(installed(env), "checkout of main installs skills");

  git(work, env, "config", "skills.autoInstall", "not-a-runtime");
  git(work, env, "checkout", "-q", "feature");
  const switched = execFileSync("git", ["checkout", "main"], { cwd: work, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(typeof switched, "string", "git checkout exited 0");
  assert.match(refresh("post-checkout", ["a", "b", "1"], { cwd: work, env }), /skill refresh failed \(.+\); run: node scripts\/install\.mjs not-a-runtime --yes/);
});
