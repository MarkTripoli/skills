import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPlan } from "../skills/project-init/scripts/bootstrap.mjs";

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-init-"));
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("bootstrap planning detects a locked Node stack and is idempotent", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"existing"}\n');
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  const before = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const first = createPlan(root);
  const second = createPlan(root);
  assert.equal(first.mode, "supported");
  assert.deepEqual(first.detected, [{ stack: "node", manager: "pnpm", manifest: "package.json" }]);
  assert.deepEqual(second, first);
  assert.deepEqual(first.actions, []);
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), before);
  assert.deepEqual(fs.readdirSync(root).sort(), ["package.json", "pnpm-lock.yaml"]);
}));

test("unsupported project is explicitly reported without mutation", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "custom.conf"), "keep\n");
  const first = createPlan(root);
  assert.equal(first.mode, "unsupported");
  assert.deepEqual(first.detected, []);
  assert.deepEqual(createPlan(root), first);
  assert.deepEqual(fs.readdirSync(root), ["custom.conf"]);
}));

test("Python project with unknown package tool remains supported but unresolved", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname='keep'\n");
  const plan = createPlan(root);
  assert.equal(plan.mode, "supported");
  assert.equal(plan.detected[0].manager, "unknown");
}));
