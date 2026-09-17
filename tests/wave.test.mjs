import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { NATIVE_DIR } from "../scripts/build-packs.mjs";

// The delivery-wave block's bash bodies, run directly against a temp git repository the way Archon runs
// them: on the epic branch, with the block's inputs as INPUTS_* environment variables and the `ready`
// node's output substituted shell-quoted into the launch twins.

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "T",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "T",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...GIT_ENV } }).trim();
const commit = (cwd, message) => git(cwd, "-c", "commit.gpgsign=false", "commit", "-q", "-m", message);

const WAVE = fs.readFileSync(path.join(NATIVE_DIR, "wave", "delivery-wave.yaml"), "utf8");
function nodeBody(id) {
  return new RegExp(`id: ${id}\\n[\\s\\S]*?bash: \\|\\n((?: {6}.*\\n|\\n)+?) {4}output_format:`).exec(WAVE)[1].replace(/^ {6}/gm, "");
}
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function bash(body, { cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", body], { cwd, env: { PATH: process.env.PATH, ...GIT_ENV, ...env } });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    child.stdin.end();
  });
}

// The include-time `$INPUTS.x` values the expander would have substituted (shell-quoted, like Archon); the
// env variables of a real run take precedence in the bodies, so a test may set either.
const INCLUDE_INPUTS = { epic_dir: ".agents/tasks/x", skills_dir: "~/.agents/skills", max_parallel: "3", flavor: "" };
const withInputs = (body) => Object.entries(INCLUDE_INPUTS).reduce((text, [name, value]) => text.replaceAll(`$INPUTS.${name}`, quote(value)), body);
const runReady = (cwd, env = {}) => bash(withInputs(nodeBody("ready")), { cwd, env });
// A launch twin with `ready`'s output substituted the way Archon does (shell-quoted).
function runLaunch(id, cwd, ready, env) {
  const body = withInputs(nodeBody(id)).replaceAll("$ready.output.ready", quote(JSON.stringify(ready.ready))).replaceAll("$ready.output.branch", quote(ready.branch));
  return bash(body, { cwd, env });
}

// The epic `x` on branch `epic-x` with three children: `a` (no dependencies), `b` (depends on `a`, block
// list), `c` (depends on `b`, flow list), plus a task directory of another epic that must be ignored.
function epicRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-wave-test-"));
  git(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  git(dir, "add", ".");
  commit(dir, "init");
  git(dir, "switch", "-q", "-c", "epic-x");
  const task = (slug, frontmatter, body) => {
    fs.mkdirSync(path.join(dir, ".agents", "tasks", slug), { recursive: true });
    fs.writeFileSync(path.join(dir, ".agents", "tasks", slug, "task.md"), `---\nslug: ${slug}\n${frontmatter}created: 2026-09-17\n---\n${body}`);
  };
  task("x", 'title: "Epic"\nworkflow: epic\n', "Build it\n");
  task("a", 'title: "A"\nworkflow: lean\nparent: x\nbase: epic-x\ndepends_on: []\n', "Do A, it's first.\n\n---\n\nSecond part.\n");
  task("b", 'title: "B"\nworkflow: oneshot\nparent: x\nbase: epic-x\ndepends_on:\n  - a\n', "Do B\n");
  task("c", 'title: "C"\nworkflow: full\nparent: x\nbase: epic-x\ndepends_on: [b]\n', "Do C\n");
  task("other", 'title: "Other"\nworkflow: lean\nparent: y\nbase: epic-y\ndepends_on: []\n', "Not ours\n");
  git(dir, "add", ".");
  commit(dir, "docs(task): open epic children");
  return dir;
}

test("ready: children of the epic are sorted into ready, blocked, done (pr-description.md on the branch), and started (a branch named after the child)", async () => {
  const cwd = epicRepo();
  try {
    let result = await runReady(cwd);
    assert.equal(result.code, 0, result.err);
    assert.deepEqual(JSON.parse(result.out), { branch: "epic-x", ready: ["a"], started: [], done: [], blocked: ["b", "c"] });

    // a's pull request merged into the epic branch: its description is on the branch.
    fs.writeFileSync(path.join(cwd, ".agents", "tasks", "a", "pr-description.md"), "pr\n");
    git(cwd, "add", ".");
    commit(cwd, "feat: a (#1)");
    result = await runReady(cwd);
    assert.equal(result.code, 0, result.err);
    assert.deepEqual(JSON.parse(result.out), { branch: "epic-x", ready: ["b"], started: [], done: ["a"], blocked: ["c"] });

    // b is running: a local branch carries its name.
    git(cwd, "branch", "b");
    result = await runReady(cwd);
    assert.equal(result.code, 0, result.err);
    assert.deepEqual(JSON.parse(result.out), { branch: "epic-x", ready: [], started: ["b"], done: ["a"], blocked: ["c"] });

    // b merged too: c becomes ready even though b's branch still exists.
    fs.writeFileSync(path.join(cwd, ".agents", "tasks", "b", "pr-description.md"), "pr\n");
    git(cwd, "add", ".");
    commit(cwd, "feat: b (#2)");
    result = await runReady(cwd);
    assert.deepEqual(JSON.parse(result.out), { branch: "epic-x", ready: ["c"], started: [], done: ["a", "b"], blocked: [] });

    const bogus = await runReady(cwd, { INPUTS_EPIC_DIR: ".agents/tasks/nope" });
    assert.notEqual(bogus.code, 0);
    assert.match(bogus.err, /has no task\.md/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("launch-manual: one start command per ready child, cut from the epic branch, unattended, the prompt in shell single quotes", async () => {
  const cwd = epicRepo();
  try {
    const result = await runLaunch("launch-manual", cwd, { branch: "epic-x", ready: ["a", "b"] }, { INPUTS_SKILLS_DIR: "/home/me/.agents/skills" });
    assert.equal(result.code, 0, result.err);
    const out = JSON.parse(result.out);
    assert.deepEqual({ ...out, commands: out.commands.length }, { launched: [], failed: [], skipped_manual: true, commands: 2 });
    assert.equal(out.commands[0], "archon workflow run delivery-lean --branch a --base epic-x --input task_dir=.agents/tasks/a --input gates=none --input skills_dir=/home/me/.agents/skills --quiet 'Do A, it'\\''s first.\n\n---\n\nSecond part.'");
    assert.equal(out.commands[1], "archon workflow run delivery-oneshot --branch b --base epic-x --input task_dir=.agents/tasks/b --input gates=none --input skills_dir=/home/me/.agents/skills --quiet 'Do B'");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

// A fake `archon`: logs its argv and a start and end marker to FAKE_ARCHON_LOG, holds the slot briefly,
// and exits 1 for delivery-full so one child counts as failed.
const FAKE_ARCHON = `#!/bin/bash
for a in "$@"; do :; done
slug=""; prev=""
for a in "$@"; do [ "$prev" = --branch ] && slug=$a; prev=$a; done
echo "start $slug" >> "$FAKE_ARCHON_LOG"
printf '%s\\n' "$@" > "$FAKE_ARCHON_LOG.$slug"
sleep 0.3
echo "end $slug" >> "$FAKE_ARCHON_LOG"
[ "$3" = delivery-full ] && exit 1
exit 0
`;

test("launch: the epic branch is pushed to origin before any child is cut from it; every ready child is started once with the child's workflow, branch, base, task_dir, gates=none, and prompt; at most max_parallel run at once; a nonzero child is listed under failed", async () => {
  const cwd = epicRepo();
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), "skills-wave-origin-"));
  try {
    git(origin, "init", "-q", "--bare");
    git(cwd, "remote", "add", "origin", origin);
    const bin = path.join(cwd, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "archon"), FAKE_ARCHON, { mode: 0o755 });
    const log = path.join(cwd, "archon.log");
    const result = await runLaunch("launch", cwd, { branch: "epic-x", ready: ["a", "b", "c"] }, {
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_ARCHON_LOG: log,
      INPUTS_SKILLS_DIR: "~/.agents/skills",
      INPUTS_MAX_PARALLEL: "2",
    });
    assert.equal(result.code, 0, result.err);
    assert.deepEqual(JSON.parse(result.out), { launched: ["a", "b"], failed: ["c"], skipped_manual: false });
    assert.equal(git(cwd, "rev-parse", "origin/epic-x"), git(cwd, "rev-parse", "HEAD"), "the epic branch is on origin, where Archon cuts the children from");
    assert.equal(git(cwd, "rev-parse", "--abbrev-ref", "epic-x@{upstream}"), "origin/epic-x", "the push sets the upstream so later joins push too");
    assert.match(result.err, /child c: archon workflow run exited nonzero/);

    const events = fs.readFileSync(log, "utf8").trim().split("\n");
    assert.deepEqual(events.filter((e) => e.startsWith("start ")).sort(), ["start a", "start b", "start c"], "each child started once");
    assert.ok(events.indexOf("start c") > events.indexOf("end a"), `c waited for a slot: ${events.join(", ")}`);

    const argv = (slug) => fs.readFileSync(`${log}.${slug}`, "utf8").replace(/\n$/, "").split("\n");
    assert.deepEqual(argv("a"), ["workflow", "run", "delivery-lean", "--branch", "a", "--base", "epic-x", "--input", "task_dir=.agents/tasks/a", "--input", "gates=none", "--input", "skills_dir=~/.agents/skills", "--quiet", "Do A, it's first.", "", "---", "", "Second part."]);
    assert.equal(argv("b")[2], "delivery-oneshot");
    assert.equal(argv("c")[2], "delivery-full");
    assert.equal(git(cwd, "status", "--porcelain", "--", ".agents"), "", "the launch leaves nothing behind in the task directories");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(origin, { recursive: true, force: true });
  }
});

test("launch: a push that fails ends the node before any child is started", async () => {
  const cwd = epicRepo();
  try {
    git(cwd, "remote", "add", "origin", path.join(cwd, "no-such-remote.git"));
    const bin = path.join(cwd, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "archon"), FAKE_ARCHON, { mode: 0o755 });
    const log = path.join(cwd, "archon.log");
    const result = await runLaunch("launch", cwd, { branch: "epic-x", ready: ["a"] }, { PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_ARCHON_LOG: log });
    assert.equal(result.code, 1);
    assert.match(result.err, /cannot push the epic branch epic-x to origin/);
    assert.ok(!fs.existsSync(log), "no child was started");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
