import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diagnose, diagnoseSkill, parseFrontmatter } from "../skills/authoring/skill-doctor/scripts/doctor.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "authoring", "skill-doctor", "scripts", "doctor.mjs");
const temps = [];
after(() => temps.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function skill(name, frontmatter, body = "# Title\n", files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-doctor-"));
  temps.push(root);
  const dir = path.join(root, name);
  for (const [file, text] of Object.entries({ "SKILL.md": `---\n${frontmatter}\n---\n\n${body}`, ...files })) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}
const rules = (dir) => diagnoseSkill(dir).map((f) => `${f.severity} ${f.rule}`);
const GOOD = "name: tidy-notes\ndescription: Sorts meeting notes into decisions and actions. Use when the user asks to tidy notes.";

test("a well-formed skill has no findings", () => {
  const dir = skill("tidy-notes", GOOD, "See [the format](references/format.md) and run `node scripts/sort.mjs`.\n", { "references/format.md": "# Format\n", "scripts/sort.mjs": "import './lib.mjs';\n", "scripts/lib.mjs": "" });
  assert.deepEqual(diagnoseSkill(dir), []);
});

test("frontmatter: folded description, host-specific and unknown keys", () => {
  const fm = parseFrontmatter('---\nname: a\ndescription: >\n  Sorts notes.\n  Use when asked.\npaths: ["**/*.ts"]\n---\nbody\n');
  assert.equal(fm.keys.get("description").value, "Sorts notes. Use when asked.");
  const dir = skill("tidy-notes", `${GOOD}\ndisable-model-invocation: true\ncolour: blue`);
  assert.deepEqual(rules(dir), ["info frontmatter-portability", "warning frontmatter-unknown"]);
});

test("name and description limits", () => {
  assert.deepEqual(rules(skill("x", "name: Claude_Helper\ndescription: I help you with <things>")), ["error name", "error name", "warning name", "error description", "warning description", "warning description"]);
  assert.deepEqual(rules(skill("tidy-notes", `name: tidy-notes\ndescription: ${"Sorts notes. Use when asked. ".repeat(40)}`)), ["error description"]);
  assert.deepEqual(rules(skill("no-fm", "name: no-fm").replace(/$/, "")).includes("error description"), true);
});

test("files: broken link, unreferenced file, nested reference, long reference without contents", () => {
  const long = Array.from({ length: 120 }, (_, i) => `line ${i}`).join("\n");
  const dir = skill("tidy-notes", GOOD, "Read [a](references/a.md) and [gone](references/gone.md).\n\n```md\n[template]({url})\n```\n", {
    "references/a.md": `See [b](b.md).\n${long}\n`,
    "references/b.md": "# B\n",
    "references/orphan.md": "# Orphan\n",
  });
  assert.deepEqual(rules(dir).sort(), ["error broken-link", "warning nested-reference", "warning reference-toc", "warning unreferenced-file"]);
});

test("wording: shouted rules and dates are flagged outside code and quotes only", () => {
  const dir = skill("tidy-notes", GOOD, 'You MUST sort. The word "NEVER" is quoted. Updated March 2031.\n\n```\nALWAYS in code\n```\n');
  assert.deepEqual(rules(dir).sort(), ["info emphasis", "warning time-sensitive"]);
});

test("a directory reports every skill, duplicate names and listing cost; the CLI sets the exit code", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-doctor-tree-"));
  temps.push(root);
  for (const group of ["a", "b"]) {
    fs.mkdirSync(path.join(root, group, "tidy-notes"), { recursive: true });
    fs.writeFileSync(path.join(root, group, "tidy-notes", "SKILL.md"), `---\n${GOOD}\n---\n`);
  }
  const result = diagnose(root);
  assert.equal(result.totals.skills, 2);
  assert.equal(result.totals.errors, 2);
  assert.ok(result.totals.listingChars > 100);
  const run = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error duplicate-name/);
  assert.match(run.stdout, /skill listing cost: \d+ characters/);
  assert.equal(spawnSync(process.execPath, [script, path.join(root, "missing")], { encoding: "utf8" }).status, 2);
});
