import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { action, due, list, publish, record, sync, verdict } from "../skills/quality/retrospect/scripts/ledger.mjs";
import scenario from "../evals/scenarios/retrospect.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const script = path.join(here, "..", "skills", "quality", "retrospect", "scripts", "ledger.mjs");
const temps = [];
after(() => temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "retro-test-"));
  temps.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  git(dir, "commit", "-q", "--allow-empty", "-m", "chore: init");
  const lesson = path.join(dir, "lesson.md");
  fs.writeFileSync(lesson, "## What happened\n\nx\n\n## Cause\n\ny\n\n## Rule\n\nRun the failing test before claiming done.\n");
  return { dir, lesson };
}
const NEW = (lesson, extra = {}) => ({ slug: "claim-done", title: "Done without the failing test", target: "skill:verify-implementation", lessonFile: lesson, evidence: "first", ...extra });
const DAY = new Date("2026-11-01T12:00:00Z");
const later = (n) => new Date(DAY.getTime() + n * 86_400_000);

test("a watching lesson is promoted on its second occurrence", () => {
  const { dir, lesson } = repo();
  assert.equal(record(dir, NEW(lesson)).status, "watching");
  const second = record(dir, { slug: "claim-done", evidence: "second" });
  assert.equal(second.status, "proposed");
  assert.equal(second.promoted, true);
  assert.equal(list(dir)[0].rule, "Run the failing test before claiming done.");
});

test("a new lesson needs title, target and lesson file", () => {
  const { dir } = repo();
  assert.throws(() => record(dir, { slug: "x", evidence: "e" }), /--title, --target and --lesson-file/);
  assert.throws(() => record(dir, { slug: "Bad Slug" }), /--slug/);
});

test("sync moves a lesson through merge, actions and quiet verification", () => {
  const { dir, lesson } = repo();
  const pr = "https://github.com/me/skills/pull/7";
  record(dir, NEW(lesson, { status: "proposed", product: pr, now: DAY }));
  action(dir, { slug: "claim-done", id: "a1", kind: "pr", title: "follow-up" });
  sync(dir, { stateOf: () => "merged", now: DAY });
  assert.equal(list(dir)[0].status, "acting");
  assert.deepEqual(due(list(dir)).map((d) => d.why).flat(), ["start planned actions"]);
  action(dir, { slug: "claim-done", id: "a1", status: "open", ref: "https://github.com/me/skills/pull/8" });
  sync(dir, { stateOf: () => "merged", now: DAY });
  assert.equal(list(dir)[0].status, "verifying");
  sync(dir, { stateOf: () => "merged", now: later(15) });
  assert.equal(list(dir)[0].status, "held");
});

test("an occurrence after acceptance marks the lesson not-held", () => {
  const { dir, lesson } = repo();
  record(dir, NEW(lesson, { status: "proposed", product: "https://github.com/me/skills/pull/7", now: DAY }));
  sync(dir, { stateOf: () => "merged", now: DAY });
  record(dir, { slug: "claim-done", evidence: "again", now: later(3) });
  sync(dir, { stateOf: () => "merged", now: later(3) });
  assert.equal(list(dir)[0].status, "not-held");
  assert.ok(due(list(dir))[0].why.includes("make a stronger product"));
});

test("a closed product is rejected and an unreadable PR is reported, not fatal", () => {
  const { dir, lesson } = repo();
  record(dir, NEW(lesson, { status: "proposed", product: "https://github.com/me/skills/pull/7" }));
  const blind = sync(dir, { stateOf: () => null });
  assert.equal(blind.unknown.length, 1);
  assert.equal(list(dir)[0].status, "proposed");
  sync(dir, { stateOf: () => "closed" });
  assert.equal(list(dir)[0].status, "rejected");
});

test("verdict records a verification", () => {
  const { dir, lesson } = repo();
  record(dir, NEW(lesson, { status: "verifying" }));
  assert.throws(() => verdict(dir, { slug: "claim-done", held: "maybe", evidence: "x" }), /yes or no/);
  assert.equal(verdict(dir, { slug: "claim-done", held: "yes", evidence: "0 corrections in 14 days" }).verifications, 1);
});

test("publish commits locally and explains when there is no remote", () => {
  const { dir, lesson } = repo();
  record(dir, NEW(lesson));
  const r = publish(dir, { message: "docs(lessons): record claim-done" });
  assert.equal(r.committed, true);
  assert.equal(r.pr, null);
  assert.match(r.note, /no origin remote/);
  assert.match(git(dir, "log", "-1", "--format=%s"), /record claim-done/);
  assert.equal(publish(dir, { message: "docs(lessons): again" }).committed, false);
});

test("the CLI exits 2 on usage and 1 outside a repository", () => {
  assert.equal(spawnSync("node", [script, "nope"]).status, 2);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "retro-bare-"));
  temps.push(bare);
  const r = spawnSync("node", [script, "list", "--repo", bare], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SKILLS_LESSONS_DIR/);
});

test("the eval scenario grades the clean case", () => {
  const check = scenario.phases[0].check;
  const { dir } = repo();
  assert.deepEqual(check({ live: true, repo: dir, answer: "Nothing to learn: the run was clean.", stubCalls: [] }), []);
  assert.ok(check({ live: true, repo: dir, answer: "Recorded a lesson.", stubCalls: ["gh pr create --draft"] }).length >= 2);
});
