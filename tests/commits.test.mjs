import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { subjectProblems, messageSubject } from "../scripts/check-commits.mjs";

const script = path.resolve(import.meta.dirname, "../scripts/check-commits.mjs");
const hook = path.resolve(import.meta.dirname, "../.githooks/commit-msg");

const temps = [];
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: gitEnv }).toString().trim();
}

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-commits-"));
  temps.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  git(dir, "config", "commit.gpgsign", "false");
  commit(dir, "chore: init");
  return dir;
}

let counter = 0;
function commit(dir, subject) {
  fs.writeFileSync(path.join(dir, `f${(counter += 1)}.txt`), `${subject}\n`);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--no-verify", "-m", subject);
}

const run = (cwd, ...args) => spawnSync("node", [script, ...args], { cwd, encoding: "utf8", env: gitEnv });

describe("subjectProblems", () => {
  test("accepts the conventions' forms, including release-please's release commit", () => {
    for (const subject of [
      "feat(cli): add --verbose flag for command tracing",
      "fix: keep trailing slash in base urls",
      "refactor!: replace callback api with promises",
      "docs(run-task): explain the status report",
      "chore(main): release 0.2.0",
      "revert: drop the verbose flag",
    ]) {
      assert.deepEqual(subjectProblems(subject), [], subject);
    }
  });

  test("rejects unknown types, capitalized or empty descriptions, trailing periods, and bad scopes", () => {
    for (const subject of [
      "Add verbose flag",
      "feature: add verbose flag",
      "feat: Add verbose flag",
      "feat: add verbose flag.",
      "feat:add verbose flag",
      "feat(CLI): add verbose flag",
      "feat(): add verbose flag",
      "feat: ",
      "",
    ]) {
      assert.equal(subjectProblems(subject).length, 1, subject);
    }
  });

  test("reports the length and the pattern separately", () => {
    const long = `feat: ${"a".repeat(80)}.`;
    const problems = subjectProblems(long);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /87 characters; the limit is 72/);
    assert.deepEqual(subjectProblems(`feat: ${"a".repeat(66)}`), []);
    assert.equal(subjectProblems(`feat: ${"a".repeat(67)}`).length, 1);
  });

  test("exempts what git writes itself: merge commits and fixup!/squash!/amend! markers", () => {
    assert.deepEqual(subjectProblems("Merge branch 'feature' into main"), []);
    assert.deepEqual(subjectProblems("Merge pull request #2 from MarkTripoli/evidence-recording"), []);
    assert.deepEqual(subjectProblems("fixup! feat: add verbose flag"), []);
    assert.deepEqual(subjectProblems("squash! whatever"), []);
    assert.equal(subjectProblems('Revert "feat: add verbose flag"').length, 1, "git's default revert message must be rewritten as revert:");
  });
});

describe("messageSubject", () => {
  test("skips git's comment block and leading blank lines", () => {
    assert.equal(messageSubject("\n# Please enter the commit message\n#\nfeat: add flag  \n\nbody\n"), "feat: add flag");
    assert.equal(messageSubject("# only comments\n"), "");
  });
});

describe("cli", () => {
  test("--message-file passes a valid message and fails an invalid one naming the subject", () => {
    const dir = repo();
    const file = path.join(dir, "MSG");
    fs.writeFileSync(file, "feat: add flag\n");
    assert.equal(run(dir, "--message-file", file).status, 0);
    fs.writeFileSync(file, "Added flag\n");
    const result = run(dir, "--message-file", file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /commit message: "Added flag": does not match/);
  });

  test("a range checks every non-merge commit and the optional title", () => {
    const dir = repo();
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "-b", "topic");
    commit(dir, "feat: one");
    commit(dir, "WIP stuff");
    git(dir, "checkout", "-q", "main");
    commit(dir, "docs: readme");
    git(dir, "merge", "-q", "--no-ff", "--no-verify", "-m", "Merge branch 'topic'", "topic");
    const bad = git(dir, "log", "--format=%H", "--grep=WIP", "-1").slice(0, 12);

    const result = run(dir, `${base}..HEAD`);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`commit ${bad}: "WIP stuff"`));
    assert.doesNotMatch(result.stderr, /Merge branch/);
    assert.equal(result.stderr.trim().split("\n").filter((line) => line.startsWith("commit ")).length, 1);

    const titled = run(dir, `${base}..HEAD~1`, "--title", "Feature: one");
    assert.equal(titled.status, 1);
    assert.match(titled.stderr, /pull request title: "Feature: one"/);
    assert.equal(run(dir, `${base}..HEAD~1`, "--title", "feat: one").status, 0);
  });

  test("the committed hook blocks a bad commit through core.hooksPath and lets a good one through", () => {
    const dir = repo();
    const hooks = path.join(dir, ".githooks");
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.mkdirSync(hooks);
    fs.copyFileSync(script, path.join(dir, "scripts", "check-commits.mjs"));
    fs.copyFileSync(hook, path.join(hooks, "commit-msg"));
    fs.chmodSync(path.join(hooks, "commit-msg"), 0o755);
    git(dir, "config", "core.hooksPath", ".githooks");

    fs.writeFileSync(path.join(dir, "x.txt"), "x\n");
    git(dir, "add", "x.txt");
    const blocked = spawnSync("git", ["commit", "-q", "-m", "update stuff"], { cwd: dir, encoding: "utf8", env: gitEnv });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /"update stuff": does not match/);
    assert.equal(git(dir, "log", "--format=%s", "-1"), "chore: init");

    git(dir, "commit", "-q", "-m", "feat: add x");
    assert.equal(git(dir, "log", "--format=%s", "-1"), "feat: add x");
  });
});
