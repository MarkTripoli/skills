import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scaffold } from "../skills/author-skill/scripts/scaffold.mjs";
import { checkSkillPractices } from "../scripts/check-skill-practices.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const script = path.join(here, "..", "skills", "author-skill", "scripts", "scaffold.mjs");
const temps = [];
after(() => temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const collection = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-"));
  temps.push(root);
  fs.mkdirSync(path.join(root, "skills", "delivery", "old"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills", "delivery", "old", "SKILL.md"), "---\nname: old\ndescription: Old. Use when asked.\n---\n");
  return root;
};


test("the description placeholder fails the description check until replaced", async () => {
  const root = collection();
  const file = scaffold(root, "make-things");
  const failing = (await checkSkillPractices(root)).failures.filter((f) => f.rule === "description");
  assert.equal(failing.length, 1);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^description: .*$/m, "description: Makes things. Use when the user runs /make-things; not for old."));
  assert.deepEqual((await checkSkillPractices(root)).failures.filter((f) => f.rule === "description"), []);
});

test("refuses an existing directory, an existing name in another group, and bad names", () => {
  const root = collection();
  scaffold(root, "make-things");
  assert.throws(() => scaffold(root, "make-things"), /already exists/);
  assert.throws(() => scaffold(root, "old"), /already exists at skills\/delivery\/old/);
  for (const bad of ["Bad_Name", "x".repeat(65), "claude-tool", "-a", undefined]) assert.throws(() => scaffold(root, bad), /name/);
});

test("CLI creates a skill and refuses an existing target", () => {
  const root = collection();
  const ok = spawnSync(process.execPath, [script, "make-things"], { cwd: root, encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(fs.readFileSync(path.join(root, "skills", "make-things", "SKILL.md"), "utf8"), /^name: make-things$/m);
  const again = spawnSync(process.execPath, [script, "make-things"], { cwd: root, encoding: "utf8" });
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already exists/);
});

test("CLI invoked through a symlink creates the requested skill instead of silently succeeding", () => {
  const root = collection();
  const alias = path.join(root, "scaffold.mjs");
  fs.symlinkSync(script, alias);
  const result = spawnSync(process.execPath, [alias, "linked-skill", "--delivery"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const file = path.join(root, "skills", "delivery", "linked-skill", "SKILL.md");
  assert.match(fs.readFileSync(file, "utf8"), /^name: linked-skill$/m);
});
