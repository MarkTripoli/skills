import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkChildren, parseChildren } from "../skills/delivery/create-epic-plan/scripts/check-children.mjs";

const script = "skills/delivery/create-epic-plan/scripts/check-children.mjs";
const child = (over = {}) => ({
  name: "Export a report",
  workflow: "oneshot",
  slice: "vertical",
  depends_on: [],
  acceptance: ["WHEN the user requests an export, the system shall return a CSV file."],
  prompt: "Add the export endpoint in src/export.ts.",
  ...over,
});
const planWith = (children) => `# Epic\n\n## Children\n\n\`\`\`json\n${JSON.stringify(children)}\n\`\`\`\n\n## Slice Check\n`;

test("a valid plan has no violations and the CLI exits 0", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "children-")), "plan.md");
  fs.writeFileSync(file, planWith([child(), child({ name: "Export schema", slice: "enabler" }), child({ name: "Download it", depends_on: ["Export schema"] })]));
  const r = spawnSync("node", [script, file], { encoding: "utf8" });
  assert.equal(r.stdout, "");
  assert.equal(r.status, 0);
});

test("each rule reports `child: rule` and the CLI exits 1", () => {
  const bad = {
    "name must be 1 to 120": child({ name: "x".repeat(121) }),
    "workflow must be": child({ workflow: "huge" }),
    "slice must be": child({ slice: "layer" }),
    "prompt must be 1 to 10000": child({ prompt: "" }),
    "acceptance must hold 1 to 5": child({ acceptance: [] }),
    "not an EARS sentence": child({ acceptance: ["It works."] }),
    'uses "fast"': child({ acceptance: ["The system shall respond fast."] }),
    "more than one obligation": child({ acceptance: ["The system shall save and the system shall log."] }),
    "names no sibling": child({ depends_on: ["Ghost"] }),
    "no consuming sibling": child({ slice: "enabler" }),
  };
  for (const [rule, c] of Object.entries(bad)) {
    const out = checkChildren([c]);
    assert.ok(out.some((line) => line.includes(rule)), `${rule}: ${out.join(" | ")}`);
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "children-")), "plan.md");
  fs.writeFileSync(file, planWith([child({ workflow: "huge" })]));
  const r = spawnSync("node", [script, file], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Export a report: workflow must be/m);
});

test("a dependency cycle and a repeated name are reported", () => {
  const cycle = checkChildren([child({ name: "A", depends_on: ["B"] }), child({ name: "B", depends_on: ["A"] })]);
  assert.ok(cycle.some((l) => l.includes("cycle")));
  const twice = checkChildren([child({ name: "B" }), child({ name: "B" })]);
  assert.ok(twice.some((l) => l.includes("repeats a sibling")));
});

test("a plan without a children fence throws a clear error", () => {
  assert.throws(() => parseChildren("# Epic\n"), /no `## Children` section/);
});

test("the copies and the slicing guide cannot drift", () => {
  const same = (a, b) => assert.equal(fs.readFileSync(a, "utf8"), fs.readFileSync(b, "utf8"), `${a} differs from ${b}`);
  same(script, "skills/delivery/start-epic-delivery/scripts/check-children.mjs");
  same("shared/SLICING.md", "skills/delivery/create-epic-plan/references/slicing.md");
});

test("vague words match whole words only", () => {
  const ok = child({ acceptance: ["The Fastify route shall set the Secure attribute on the session cookie."] });
  assert.deepEqual(checkChildren([ok]), []);
});

test("the CLI works through a symlinked script", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "children-"));
  const link = path.join(dir, "check.mjs");
  fs.symlinkSync(path.resolve(script), link);
  const file = path.join(dir, "plan.md");
  fs.writeFileSync(file, planWith([]));
  const r = spawnSync("node", [link, file], { encoding: "utf8" });
  assert.match(r.stdout, /no children/);
  assert.equal(r.status, 1);
});
