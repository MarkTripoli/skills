import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..");

// Copies the current source directories, including newly imported untracked skills, without owner task history.
function withCopy(fn) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "validate-contracts-"));
  try {
    for (const file of ["scripts", "skills", "shared", "workflows", "docs", "package.json"]) {
      fs.cpSync(path.join(repo, file), path.join(copy, file), { recursive: true });
    }
    const p = (...parts) => path.join(copy, "skills", "delivery", ...parts);
    const run = () => spawnSync("node", [path.join(copy, "scripts", "validate.mjs")], { cwd: copy, encoding: "utf8" }).stderr;
    return fn({ copy, p, run });
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

const setDescription = (file, text) => fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^description:.*$/m, `description: ${text}`));

test("description rule: Use when required, no Run for, no bare imperative", () => {
  withCopy(({ p, run }) => {
    const file = p("iterate-prd", "SKILL.md");
    const mine = (err) => err.split("\n").filter((l) => l.includes("iterate-prd/SKILL.md:3:"));
    setDescription(file, "Refines a PRD from feedback. Use when the user runs /iterate-prd.");
    assert.deepEqual(mine(run()), []);
    setDescription(file, "Refines a PRD from feedback.");
    assert.match(mine(run()).join("\n"), /must contain "Use when"/);
    setDescription(file, "Run for /iterate-prd requests. Use when refining.");
    assert.match(mine(run()).join("\n"), /must not start with "Run for"/);
    setDescription(file, "Refine a PRD. Use when the user runs /iterate-prd.");
    assert.match(mine(run()).join("\n"), /bare imperative "Refine"/);
  });
});

test("duplicate sets: identical passes; drift or a missing member fails naming both paths", () => {
  withCopy(({ p, run }) => {
    const a = p("create-prd", "references", "prd_template.md");
    const b = p("iterate-prd", "references", "prd_template.md");
    fs.copyFileSync(a, b);
    const mine = (err) => err.split("\n").filter((l) => l.includes("prd_template.md"));
    assert.deepEqual(mine(run()), []);
    fs.appendFileSync(b, "drift\n");
    assert.match(mine(run()).join("\n"), /iterate-prd\/references\/prd_template\.md:0: must be byte-identical to .*create-prd\/references\/prd_template\.md/);
    fs.rmSync(b);
    assert.match(mine(run()).join("\n"), /iterate-prd\/references\/prd_template\.md:0: duplicate-set member missing \(must equal .*create-prd\/references\/prd_template\.md\)/);
  });
});

test("reference reachability: a reference SKILL.md never names fails", () => {
  withCopy(({ p, run }) => {
    const skill = path.join(p("describe-pr"), "SKILL.md");
    const extra = path.join(p("describe-pr"), "references", "nested", "orphan_note.md");
    fs.mkdirSync(path.dirname(extra), { recursive: true });
    fs.writeFileSync(extra, "note\n");
    const mine = (err) => err.split("\n").filter((l) => l.includes("orphan_note.md"));
    assert.match(mine(run()).join("\n"), /orphan_note\.md:0: not named in describe-pr\/SKILL\.md/);
    fs.appendFileSync(skill, "\nRead [the note](references/nested/orphan_note.md) when needed.\n");
    assert.deepEqual(mine(run()), []);
  });
});

test("skill names: installed, invoke, backticked slash and fence commands must be skills", () => {
  withCopy(({ p, run }) => {
    const skill = p("describe-pr", "SKILL.md");
    const mine = (err) => err.split("\n").filter((l) => l.includes("describe-pr/SKILL.md") && l.includes("not a skill name"));
    fs.appendFileSync(skill, "\nUse the installed `create-plan` skill, invoke `review-code`, run `/fix-bug`, and `/permissions` is a host command; write to `/tmp`.\n\n```text\n/create-plan @x.md\n```\n");
    assert.deepEqual(mine(run()), []);
    fs.appendFileSync(skill, "\nUse the installed **`ghost-one`** skill, invoke `ghost-two`.\n\nInvoke `ghost-five`, run `/ghost-three`.\n\n```text\n/ghost-four @x.md\n```\n");
    const found = mine(run()).join("\n");
    for (const name of ["ghost-one", "ghost-two", "/ghost-three", "/ghost-four", "ghost-five"]) assert.ok(found.includes(`${name} is not a skill name`), name);
  });
});

test("validation never descends into configured or nested default task history", () => {
  withCopy(({ copy, run }) => {
    fs.writeFileSync(path.join(copy, "AGENTS.md"), "<!-- skills:task-root=delivery/tasks -->\n");
    for (const relative of ["delivery/tasks/old", "nested/.agents/tasks/old"]) {
      const task = path.join(copy, relative);
      fs.mkdirSync(task, { recursive: true });
      fs.writeFileSync(path.join(task, "task.md"), `Historical ${["r", "pi"].join("")} task; not a collection source.\n`);
      fs.writeFileSync(path.join(task, "index.json"), "{ historical malformed index");
    }
    const errors = run();
    assert.doesNotMatch(errors, /delivery\/tasks\/old|nested\/\.agents\/tasks\/old/);
  });
});

test("active source rejects company branding without scanning owner history or results", () => {
  withCopy(({ copy }) => {
    const token = ["AdY", "tOn"].join("");
    fs.writeFileSync(path.join(copy, "AGENTS.md"), "<!-- skills:task-root=delivery/tasks -->\n");
    for (const relative of ["delivery/tasks/old", "nested/.agents/tasks/old", ".omo/recordings", "evals/results/archived"]) {
      const directory = path.join(copy, relative);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "historical.md"), `${token} historical content\n`);
    }
    const validate = () => spawnSync("node", [path.join(copy, "scripts", "validate.mjs")], { cwd: copy, encoding: "utf8" });
    const historical = validate();
    assert.equal(historical.status, 0, historical.stderr);
    const active = path.join(copy, "scripts", "branding-regression.mjs");
    fs.writeFileSync(active, `// ${token} imported branding\n`);
    const rejected = validate();
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.match(rejected.stderr, /scripts\/branding-regression\.mjs:1: banned token/i);
    assert.doesNotMatch(rejected.stderr, /delivery\/tasks\/old|nested\/\.agents\/tasks\/old|\.omo\/recordings|evals\/results\/archived/);
    fs.unlinkSync(active);
    const restored = validate();
    assert.equal(restored.status, 0, restored.stderr);
  });
});
