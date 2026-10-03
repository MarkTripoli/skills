import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..");

// The copy carries its own scripts/validate.mjs: the word caps apply only to the source tree, and the EARS check reads the copy's guide.
function copyRepo() {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "validate-caps-"));
  for (const file of ["scripts", "skills", "shared", "workflows", "docs", "package.json"]) {
    fs.cpSync(path.join(repo, file), path.join(copy, file), { recursive: true });
  }
  const run = () => spawnSync("node", [path.join(copy, "scripts", "validate.mjs")], { cwd: copy, encoding: "utf8" });
  return { copy, run };
}

test("validate fails naming the cap when an instruction file grows", () => {
  const { copy, run } = copyRepo();
  try {
    assert.equal(run().status, 0, run().stderr);
    for (const file of ["shared/WRITING.md", "skills/delivery/deliver/references/task_setup.md"]) {
      fs.appendFileSync(path.join(copy, file), " grown\n");
      const result = run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`${file.replace(/[./]/g, "\\$&")}:0: \\d+ words exceeds its cap of \\d+`));
    }
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test("validate fails naming the skill and shape when an EARS shape goes missing", () => {
  const { copy, run } = copyRepo();
  try {
    assert.equal(run().status, 0, run().stderr);
    const skill = path.join(copy, "skills", "delivery", "iterate-prd", "SKILL.md");
    const where = "  - Optional feature: `WHERE <feature is enabled>, the <system> shall <response>.`\n";
    assert.ok(fs.readFileSync(skill, "utf8").includes(where));
    fs.writeFileSync(skill, fs.readFileSync(skill, "utf8").replace(where, ""));
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /iterate-prd\/SKILL\.md:0: names EARS or shall but lacks "WHERE <feature is enabled>, the <system> shall <response>\."/);
    const other = path.join(copy, "skills", "show-me", "SKILL.md");
    fs.appendFileSync(other, "\nUsers SHALL see this.\n");
    assert.match(run().stderr, /show-me\/SKILL\.md:0: names EARS or shall but lacks/);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test("validate reads the EARS shapes from the guide, not from a list in the script", () => {
  const { copy, run } = copyRepo();
  try {
    const guide = path.join(copy, "shared", "SLICING.md");
    fs.writeFileSync(guide, fs.readFileSync(guide, "utf8").replace("WHILE `<state>`, the", "WHILE `<state>` holds, the"));
    const result = run();
    assert.equal(result.status, 1);
    for (const skill of ["create-prd", "iterate-prd", "create-epic-plan"]) assert.match(result.stderr, new RegExp(`${skill}/SKILL\\.md:0: names EARS or shall but lacks "WHILE <state> holds, the`));
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test("validate fails when the guide yields fewer than five EARS shapes", () => {
  const { copy, run } = copyRepo();
  try {
    const guide = path.join(copy, "shared", "SLICING.md");
    fs.writeFileSync(guide, fs.readFileSync(guide, "utf8").replace("## Acceptance criteria", "## Criteria"));
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /shared\/SLICING\.md:0: parsed 0 EARS shapes from the Acceptance criteria table; expected 5/);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

// The files that hold the Execution DAG instruction: the design-discussion and TDD references.
const TEMPLATES = [
  "skills/delivery/create-design-discussion/references/execution_dag.md",
  "skills/delivery/iterate-design-discussion/references/execution_dag.md",
  "skills/delivery/create-tdd/references/execution_dag.md",
  "skills/delivery/iterate-tdd/references/execution_dag.md",
];

// Applies `mutate` to a file of the copy, runs validate, restores the file, and checks the failure.
function edit({ copy, run }, file, mutate, expected, what, times) {
  const full = path.join(copy, file);
  const text = fs.readFileSync(full, "utf8");
  const mutated = mutate(text);
  assert.notEqual(mutated, text, `${what} did not change ${file}`);
  fs.writeFileSync(full, mutated);
  const result = run();
  fs.writeFileSync(full, text);
  assert.equal(result.status, 1, what);
  assert.match(result.stderr, expected, what);
  if (times) assert.equal(result.stderr.split("\n").filter((line) => expected.test(line)).length, times, what);
}

test("validate fails when an Execution DAG template drops its workflow chain", () => {
  const repoCopy = copyRepo();
  try {
    assert.equal(repoCopy.run().status, 0, repoCopy.run().stderr);
    const mutations = {
      "a dropped phase": (text) => text.replace("create-research → ", "").replace("create-research-questions → create-research → ", "create-research-questions → ").replace("start-epic-delivery → ", ""),
      "an appended phase": (text) => text.replace("describe-pr", "describe-pr → extra").replace("publication).", "publication) → extra."),
      "a longer last phase": (text) => text.replace("describe-pr.", "describe-pr-later.").replace("publication).", "publication)-later."),
      "prose between label and chain": (text) => text.replace(/(`(?:full|prd)`(?::| chain is:)) /, "$1 roughly "),
      "a gate rule without the legacy values": (text) => text.replace("`all` reads as `plan`", "the default applies"),
      "a dropped Mermaid form sentence": (text) => text.replace("Use only this Mermaid form:", "Use this Mermaid form:"),
      "a deleted gate rule": (text) => text.replace("Gate rule:", "Rule:"),
      "a swapped label": (text) => text.replace("`program`:", "`prd`:").replace("`full` chain", "`prd` chain"),
    };
    for (const file of TEMPLATES) {
      for (const [what, mutate] of Object.entries(mutations)) edit(repoCopy, file, mutate, new RegExp(`${file.replace(/[./]/g, "\\$&")}:0: Execution DAG must state the `), `${file}: ${what}`);
    }
    assert.equal(repoCopy.run().status, 0, repoCopy.run().stderr);
  } finally {
    fs.rmSync(repoCopy.copy, { recursive: true, force: true });
  }
});

test("validate pins the gate default and legacy reading", () => {
  const repoCopy = copyRepo();
  try {
    assert.equal(repoCopy.run().status, 0, repoCopy.run().stderr);
    edit(repoCopy, "workflows/delivery.md", (t) => t.replace("`plan` (default) and `none`; older `all` reads as `plan`", "`none` (default) and `plan`; older `all` reads as `none`"), /Gate rule:" default as `none`/, "none made the default");
    edit(repoCopy, "workflows/delivery.md", (t) => t.replace("`plan` (default) and", "`plan` and"), /## Gates must state/, "gates line without (default)", 1);
    edit(repoCopy, "workflows/delivery.md", (t) => t.replace("older `all` reads as `plan`", "older `all` reads as `none`"), /legacy reading/, "workflow legacy target changed alone");
    for (const file of TEMPLATES) {
      edit(repoCopy, file, (t) => t.replace(" (the default, also when the key is absent)", ""), /Gate rule:" default as `plan`/, `${file}: default clause removed`);
      edit(repoCopy, file, (t) => t.replace("`all` reads as `plan`", "`all` reads as `none`"), /legacy reading/, `${file}: legacy target changed`);
      edit(repoCopy, file, (t) => t.replace("`none` pauses nowhere; ", ""), /naming the `none` gates value/, `${file}: none gate value removed`);
    }
    assert.equal(repoCopy.run().status, 0, repoCopy.run().stderr);
  } finally {
    fs.rmSync(repoCopy.copy, { recursive: true, force: true });
  }
});

test("validate fails when a design or TDD template drops its pointer to the Execution DAG instruction", () => {
  const repoCopy = copyRepo();
  try {
    assert.equal(repoCopy.run().status, 0, repoCopy.run().stderr);
    for (const [skill, template] of [["create-tdd", "tdd_template.md"], ["iterate-tdd", "tdd_template.md"], ["create-design-discussion", "design_discussion_template.md"], ["iterate-design-discussion", "design_discussion_template.md"]]) {
      edit(repoCopy, `skills/delivery/${skill}/references/${template}`, (t) => t.replace("per references/execution_dag.md", "per the plan"), /Execution DAG must point to references\/execution_dag\.md/, `${skill} pointer dropped`);
    }
    assert.equal(repoCopy.run().status, 0, repoCopy.run().stderr);
  } finally {
    fs.rmSync(repoCopy.copy, { recursive: true, force: true });
  }
});

test("validate fails when an iterate Execution DAG differs from its create copy", () => {
  const repoCopy = copyRepo();
  try {
    assert.equal(repoCopy.run().status, 0, repoCopy.run().stderr);
    // Only the iterate copy changes, outside the chain and gate rule, so only the pair check can notice.
    for (const [create, iterate] of [[TEMPLATES[0], TEMPLATES[1]], [TEMPLATES[2], TEMPLATES[3]]]) {
      edit(repoCopy, iterate, (t) => t.replace("Label each node with its phase name", "Label each node"), new RegExp(`Execution DAG must equal the one in ${create.replace("skills/delivery/", "").replace(/[./]/g, "\\$&")}`), `${iterate} edited alone`);
    }
    assert.equal(repoCopy.run().status, 0, repoCopy.run().stderr);
  } finally {
    fs.rmSync(repoCopy.copy, { recursive: true, force: true });
  }
});

test("validate passes on a generated tree, which carries no workflows/", async () => {
  const { buildRuntime } = await import("../scripts/lib/build.mjs");
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), "validate-generated-"));
  try {
    buildRuntime("claude-code", tree);
    assert.ok(!fs.existsSync(path.join(tree, "workflows", "delivery.md")));
    const result = spawnSync("node", [path.join(repo, "scripts", "validate.mjs"), "--root", tree], { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(tree, { recursive: true, force: true });
  }
});

test("build copy skips Python bytecode", async () => {
  const { copy } = copyRepo();
  fs.cpSync(path.join(repo, "runtimes"), path.join(copy, "runtimes"), { recursive: true });
  const { buildRuntime } = await import(path.join(copy, "scripts/lib/build.mjs"));
  const cache = path.join(copy, "skills", "delivery", "record-evidence", "scripts", "__pycache__");
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), "build-pyc-"));
  try {
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(path.join(cache, "x.cpython-314.pyc"), "x");
    fs.writeFileSync(path.join(copy, "skills", "delivery", "record-evidence", "scripts", "stray.pyc"), "x");
    buildRuntime("claude-code", tree, { skillNames: ["record-evidence"] });
    const out = path.join(tree, "skills", "record-evidence", "scripts");
    assert.ok(fs.existsSync(out));
    assert.deepEqual(fs.readdirSync(out).filter((n) => n === "__pycache__" || n.endsWith(".pyc")), []);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
    fs.rmSync(tree, { recursive: true, force: true });
  }
});

