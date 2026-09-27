import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyPlan, createPlan } from "../skills/project-init/scripts/bootstrap.mjs";

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-init-"));
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("existing Node setup is detected and preserved across repeated plans", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"existing"}\n');
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  const before = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const first = createPlan(root);
  assert.equal(first.mode, "supported");
  assert.deepEqual(first.detected, [{ stack: "node", manager: "pnpm", manifest: "package.json" }]);
  assert.deepEqual(createPlan(root), first);
  assert.deepEqual(first.actions, []);
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), before);
}));

test("empty supported Node target plans without mutation and creates only with approval", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const first = createPlan(root);
  assert.deepEqual(first.actions.map(({ path: file }) => file), ["package.json"]);
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
  assert.deepEqual(createPlan(root), first);
  applyPlan(root, first);
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), '{\n  "private": true\n}\n');
  assert.deepEqual(createPlan(root).actions, []);
}));

test("creation refuses a file appearing after plan generation", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".node-version"), "22\n");
  const plan = createPlan(root);
  fs.writeFileSync(path.join(root, "package.json"), "operator data\n");
  assert.throws(() => applyPlan(root, plan), { code: "EEXIST" });
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), "operator data\n");
}));

test("Python and mixed Node/Python signals are unsupported", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname='keep'\n");
  assert.equal(createPlan(root).mode, "unsupported");
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const mixed = createPlan(root);
  assert.equal(mixed.mode, "unsupported");
  assert.deepEqual(mixed.actions, []);
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
}));
