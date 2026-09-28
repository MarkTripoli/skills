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

test("a partial staging write never publishes a manifest", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, contents, options) => {
    if (typeof file !== "number") return write(file, contents, options);
    write(file, contents.slice(0, 3), options);
    throw new Error("injected write failure");
  };
  try {
    assert.throws(() => applyPlan(root, plan), /injected write failure/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepEqual(fs.readdirSync(root), [".nvmrc"]);
}));

test("a concurrent manifest replacement survives a failed write", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".node-version"), "22\n");
  const plan = createPlan(root);
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, contents, options) => {
    if (typeof file !== "number") return write(file, contents, options);
    write(file, contents.slice(0, 3), options);
    write(path.join(root, "package.json"), "concurrent manifest\n");
    throw new Error("injected write failure");
  };
  try {
    assert.throws(() => applyPlan(root, plan), /injected write failure/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), "concurrent manifest\n");
  assert.deepEqual(fs.readdirSync(root).sort(), [".node-version", "package.json"]);
}));

test("a manifest created at publication wins the exclusive link", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  const link = fs.linkSync;
  fs.linkSync = (from, to) => {
    fs.writeFileSync(path.join(root, "package.json"), "concurrent manifest\n");
    return link(from, to);
  };
  try {
    assert.throws(() => applyPlan(root, plan), { code: "EEXIST" });
  } finally {
    fs.linkSync = link;
  }
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), "concurrent manifest\n");
  assert.deepEqual(fs.readdirSync(root).sort(), [".nvmrc", "package.json"]);
}));

test("a replacement published after the link fails closed without deleting it", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  const link = fs.linkSync;
  fs.linkSync = (from, to) => {
    link(from, to);
    fs.unlinkSync("package.json");
    fs.writeFileSync("package.json", "replacement manifest\n");
  };
  try {
    assert.throws(() => applyPlan(root, plan), /publication changed/);
  } finally {
    fs.linkSync = link;
  }
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), "replacement manifest\n");
}));

for (const kind of ["file", "symlink"]) {
  test(`a staged ${kind} swapped at publication cannot report success`, () => fixture((root) => {
    fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
    const plan = createPlan(root);
    const foreign = path.join(root, "foreign");
    const link = fs.linkSync;
    let staged;
    fs.linkSync = (from, to) => {
      staged = from;
      fs.writeFileSync(foreign, "foreign data\n");
      fs.unlinkSync(from);
      if (kind === "symlink") fs.symlinkSync(foreign, from);
      else fs.writeFileSync(from, "foreign manifest\n");
      return link(from, to);
    };
    try {
      assert.throws(() => applyPlan(root, plan), /(?:publication|staging file) changed/);
    } finally {
      fs.linkSync = link;
    }
    assert.equal(fs.readFileSync(foreign, "utf8"), "foreign data\n");
    assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"),
      kind === "symlink" ? "foreign data\n" : "foreign manifest\n");
    assert.equal(fs.lstatSync(path.join(root, staged)).isSymbolicLink(), kind === "symlink");
  }));
}

test("a shared target cannot replace the protected stage at cleanup", () => fixture((root) => {
  fs.chmodSync(root, 0o777);
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  const unlink = fs.unlinkSync;
  let cleanupReached = false;
  let replaced = false;
  fs.unlinkSync = (file) => {
    cleanupReached = true;
    // An actor without ownership can replace a public stage just before
    // unlink, but cannot enter a mode-0700 staging directory.
    if (fs.statSync(path.dirname(file)).mode & 0o002) {
      unlink(file);
      fs.writeFileSync(file, "foreign staged data\n");
      replaced = true;
    }
    return unlink(file);
  };
  try {
    assert.equal(applyPlan(root, plan).outcome, "applied");
  } finally {
    fs.unlinkSync = unlink;
  }
  assert.equal(cleanupReached, true);
  assert.equal(replaced, false);
  assert.deepEqual(fs.readdirSync(root).sort(), [".nvmrc", "package.json"]);
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), '{\n  "private": true\n}\n');
}));

test("a foreign staged inode at cleanup is left intact", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  const link = fs.linkSync;
  const lstat = fs.lstatSync;
  let staged;
  let replaced = false;
  fs.linkSync = (from, to) => {
    staged = from;
    return link(from, to);
  };
  fs.lstatSync = (file, options) => {
    if (file === staged && fs.existsSync("package.json") && !replaced) {
      fs.unlinkSync(staged);
      fs.writeFileSync(staged, "foreign staged data\n");
      replaced = true;
    }
    return lstat(file, options);
  };
  try {
    assert.throws(() => applyPlan(root, plan), /staging file changed/);
  } finally {
    fs.linkSync = link;
    fs.lstatSync = lstat;
  }
  assert.equal(replaced, true);
  assert.equal(fs.readFileSync(path.join(root, staged), "utf8"), "foreign staged data\n");
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), '{\n  "private": true\n}\n');
}));

test("a parent swapped before directory open fails closed", () => fixture((root) => {
  const project = path.join(root, "project");
  const moved = path.join(root, "moved");
  const outside = path.join(root, "outside");
  fs.mkdirSync(project);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const plan = createPlan(project);
  const open = fs.openSync;
  fs.openSync = (file, flags, mode) => {
    if (file === plan.project) {
      fs.renameSync(project, moved);
      fs.symlinkSync(outside, project, "dir");
    }
    return open(file, flags, mode);
  };
  try {
    assert.throws(() => applyPlan(project, plan));
  } finally {
    fs.openSync = open;
  }
  assert.equal(fs.existsSync(path.join(outside, "package.json")), false);
  assert.equal(fs.existsSync(path.join(moved, "package.json")), false);
}));

test("a swapped parent path cannot redirect publication outside the approved directory", () => fixture((root) => {
  const project = path.join(root, "project");
  const moved = path.join(root, "moved");
  const outside = path.join(root, "outside");
  fs.mkdirSync(project);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const plan = createPlan(project);
  const link = fs.linkSync;
  fs.linkSync = (from, to) => {
    fs.renameSync(project, moved);
    fs.symlinkSync(outside, project, "dir");
    return link(from, to);
  };
  try {
    assert.equal(applyPlan(project, plan).outcome, "applied");
  } finally {
    fs.linkSync = link;
  }
  assert.equal(fs.existsSync(path.join(outside, "package.json")), false);
  assert.equal(fs.readFileSync(path.join(moved, "package.json"), "utf8"), '{\n  "private": true\n}\n');
}));

test("an approved plan cannot publish into a replacement parent directory", () => fixture((root) => {
  const parent = path.join(root, "parent");
  const moved = path.join(root, "moved");
  const foreignParent = path.join(root, "foreign-parent");
  const project = path.join(parent, "project");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(foreignParent, "project"), { recursive: true });
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  fs.writeFileSync(path.join(foreignParent, "project", ".nvmrc"), "22\n");
  const plan = createPlan(project);
  fs.renameSync(parent, moved);
  fs.renameSync(foreignParent, parent);
  assert.throws(() => applyPlan(project, plan), /target changed/);
  assert.equal(fs.existsSync(path.join(project, "package.json")), false);
  assert.equal(fs.existsSync(path.join(moved, "project", "package.json")), false);
}));

test("a toggled intermediate symlink cannot redirect an approved plan", () => fixture((root) => {
  const parent = path.join(root, "parent");
  const moved = path.join(root, "moved");
  const foreignParent = path.join(root, "foreign-parent");
  const project = path.join(parent, "project");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(foreignParent, "project"), { recursive: true });
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  fs.writeFileSync(path.join(foreignParent, "project", ".nvmrc"), "22\n");
  const plan = createPlan(project);
  const open = fs.openSync;
  fs.openSync = (file, flags, mode) => {
    if (file === plan.project) {
      fs.renameSync(parent, moved);
      fs.symlinkSync(foreignParent, parent, "dir");
    }
    return open(file, flags, mode);
  };
  try {
    assert.throws(() => applyPlan(project, plan), /target changed/);
  } finally {
    fs.openSync = open;
  }
  assert.equal(fs.existsSync(path.join(project, "package.json")), false);
  assert.equal(fs.existsSync(path.join(moved, "project", "package.json")), false);
}));

test("replanning stays on the approved inode when its intermediate parent becomes a symlink", () => fixture((root) => {
  const parent = path.join(root, "parent");
  const moved = path.join(root, "moved");
  const outside = path.join(root, "outside");
  const project = path.join(parent, "project");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(outside, "project"), { recursive: true });
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  fs.writeFileSync(path.join(outside, "project", ".nvmrc"), "22\n");
  const plan = createPlan(project);
  const exists = fs.existsSync;
  let swapped = false;
  fs.existsSync = (file) => {
    if (!swapped && file === ".nvmrc") {
      swapped = true;
      fs.renameSync(parent, moved);
      fs.symlinkSync(outside, parent, "dir");
    }
    return exists(file);
  };
  try {
    assert.equal(applyPlan(project, plan).outcome, "applied");
  } finally {
    fs.existsSync = exists;
  }
  assert.equal(swapped, true);
  assert.equal(fs.existsSync(path.join(outside, "project", "package.json")), false);
  assert.equal(fs.readFileSync(path.join(moved, "project", "package.json"), "utf8"), '{\n  "private": true\n}\n');
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

test("requirements.txt with Node version marker is unsupported and never bootstrapped", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "requirements.txt"), "example==1.0\n");
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  assert.equal(plan.mode, "unsupported");
  assert.deepEqual(plan.actions, []);
  const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
  const apply = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve"], { encoding: "utf8" });
  assert.equal(apply.status, 2);
  assert.equal(JSON.parse(apply.stdout).mode, "unsupported");
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
}));

for (const [name, file, contents] of [
  ["Go workspace", "go.work", "go 1.22\n"],
  ["arbitrary file", "notes.txt", "keep\n"],
]) {
  test(`${name} content blocks empty Node bootstrap`, () => fixture((root) => {
    fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
    fs.writeFileSync(path.join(root, file), contents);
    const plan = createPlan(root);
    assert.equal(plan.mode, "supported");
    assert.deepEqual(plan.actions, []);
    const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
    const apply = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve"], { encoding: "utf8" });
    assert.equal(apply.status, 0);
    assert.equal(JSON.parse(apply.stdout).outcome, "unchanged");
    assert.equal(fs.existsSync(path.join(root, "package.json")), false);
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), contents);
  }));
}
