import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  const applied = applyPlan(root, first);
  assert.equal(applied.outcome, "applied");
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), '{\n  "private": true\n}\n');
  assert.deepEqual(createPlan(root).actions, []);
}));

test("creation refuses a file appearing after plan generation", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".node-version"), "22\n");
  const plan = createPlan(root);
  fs.writeFileSync(path.join(root, "package.json"), "operator data\n");
  assert.throws(() => applyPlan(root, plan), /stale/);
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), "operator data\n");
}));

test("Python signals appearing after planning invalidate approval", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname='python'\n");
  assert.throws(() => applyPlan(root, plan), /stale/);
}));

test("intermediate symlink target is rejected", () => fixture((root) => {
  const real = path.join(root, "real");
  const alias = path.join(root, "alias");
  const project = path.join(real, "project");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  fs.symlinkSync(real, alias, "dir");
  assert.throws(() => createPlan(path.join(alias, "project")), /symlink/);
}));

test("CLI distinguishes dry-run from approved write", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
  const dryRun = spawnSync(process.execPath, [script, "--target", root], { encoding: "utf8" });
  assert.equal(dryRun.status, 0);
  assert.equal(JSON.parse(dryRun.stdout).outcome, "planned");
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
  const applied = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve"], { encoding: "utf8" });
  assert.equal(applied.status, 0);
  assert.equal(JSON.parse(applied.stdout).outcome, "applied");
  assert.equal(fs.existsSync(path.join(root, "package.json")), true);
}));

test("lockfile-only and conflicting manager signals are unsupported", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  assert.equal(createPlan(root).mode, "unsupported");
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"existing"}\n');
  fs.writeFileSync(path.join(root, "yarn.lock"), "# yarn lock\n");
  assert.equal(createPlan(root).mode, "unsupported");
  assert.deepEqual(createPlan(root).actions, []);
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

test("Go project with Node version marker is unsupported and never bootstrapped", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "go.mod"), "module example.test/project\n");
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  assert.equal(plan.mode, "unsupported");
  assert.deepEqual(plan.actions, []);
  const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
  const dryRun = spawnSync(process.execPath, [script, "--target", root], { encoding: "utf8" });
  assert.equal(dryRun.status, 2);
  assert.equal(JSON.parse(dryRun.stdout).mode, "unsupported");
  const apply = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve"], { encoding: "utf8" });
  assert.equal(apply.status, 2);
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
}));
