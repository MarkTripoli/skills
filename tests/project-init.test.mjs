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

test("packageManager identifies an existing manager without a lockfile", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"existing","packageManager":"yarn@4.5.1"}\n');
  const plan = createPlan(root);
  assert.equal(plan.mode, "supported");
  assert.deepEqual(plan.detected, [{ stack: "node", manager: "yarn", manifest: "package.json" }]);
  assert.deepEqual(plan.actions, []);
}));

test("packageManager conflicting with a lockfile does not claim a supported toolchain", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "package.json"), '{"packageManager":"pnpm@9.0.0"}\n');
  fs.writeFileSync(path.join(root, "yarn.lock"), "# yarn lock\n");
  const plan = createPlan(root);
  assert.equal(plan.mode, "unsupported");
  assert.deepEqual(plan.detected, []);
  assert.deepEqual(plan.actions, []);
  assert.match(plan.explanation, /conflicts/);
}));

test("non-object JSON manifests never imply a supported Node project", () => fixture((root) => {
  for (const value of [[], null, "package", 42, true]) {
    fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(value)}\n`);
    const plan = createPlan(root);
    assert.equal(plan.mode, "unsupported", JSON.stringify(value));
    assert.deepEqual(plan.detected, []);
    assert.deepEqual(plan.actions, []);
  }
}));

test("invalid package-manager versions fail closed even with a matching lockfile", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  for (const version of ["not-a-version", "latest", "9", "9.0", "09.0.0", "9.0.0-01", "9.0.0+sha224.invalid", "9007199254740992.0.0"]) {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: `pnpm@${version}` }));
    const plan = createPlan(root);
    assert.equal(plan.mode, "unsupported", version);
    assert.deepEqual(plan.detected, []);
    assert.deepEqual(plan.actions, []);
  }
}));

test("Corepack pinned versions with a SHA-224 hash remain supported", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    packageManager: `yarn@4.5.1-rc.1+sha224.${"a".repeat(56)}`,
  }));
  assert.deepEqual(createPlan(root).detected, [{ stack: "node", manager: "yarn", manifest: "package.json" }]);
}));

test("devEngines.packageManager selects a validated Corepack fallback", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    devEngines: { packageManager: { name: "pnpm", version: `9.0.0+sha224.${"b".repeat(56)}` } },
  }));
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  const plan = createPlan(root);
  assert.equal(plan.mode, "supported");
  assert.deepEqual(plan.detected, [{ stack: "node", manager: "pnpm", manifest: "package.json" }]);
  assert.deepEqual(plan.actions, []);
}));

test("single-object devEngines.packageManager array selects a pinned Corepack fallback", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    devEngines: { packageManager: [{ name: "pnpm", version: "9.0.0" }] },
  }));
  const plan = createPlan(root);
  assert.equal(plan.mode, "supported");
  assert.deepEqual(plan.detected, [{ stack: "node", manager: "pnpm", manifest: "package.json" }]);
  assert.deepEqual(plan.actions, []);
}));

test("matching Corepack pins may carry integrity metadata on only one declaration", () => fixture((root) => {
  const hash = "a".repeat(56);
  for (const [declared, fallback] of [
    [`pnpm@9.0.0+sha224.${hash}`, "9.0.0"],
    ["pnpm@9.0.0", `9.0.0+sha224.${hash}`],
    [`pnpm@9.0.0+sha224.${hash.toUpperCase()}`, `9.0.0+sha224.${hash}`],
  ]) {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
      packageManager: declared, devEngines: { packageManager: { name: "pnpm", version: fallback } },
    }));
    assert.deepEqual(createPlan(root).detected, [{ stack: "node", manager: "pnpm", manifest: "package.json" }]);
  }
}));

test("malformed or conflicting Corepack fallback never claims a supported toolchain", () => fixture((root) => {
  const manifest = path.join(root, "package.json");
  const cases = [
    { devEngines: { packageManager: { name: "pnpm", version: "not-a-version" } } },
    { devEngines: { packageManager: { name: "pnpm" } } },
    { devEngines: { packageManager: { name: "pnpm", version: "9.0.0" } }, packageManager: "yarn@4.5.1" },
    { devEngines: { packageManager: { name: "pnpm", version: "9.0.1" } }, packageManager: "pnpm@9.0.0" },
    { devEngines: { packageManager: { name: "yarn", version: "4.5.1", onFail: "warn" } } },
    { devEngines: { packageManager: ["pnpm", "9.0.0"] } },
    { devEngines: { packageManager: { name: ["pnpm"], version: "9.0.0" } } },
    { devEngines: { packageManager: { name: "pnpm", version: ["9.0.0"] } } },
    { devEngines: { packageManager: [] } },
    { devEngines: { packageManager: [{ name: "pnpm", version: "9.0.0" }, { name: "pnpm", version: "9.0.0" }] } },
    { devEngines: { packageManager: [{ name: "pnpm", version: "9.0.0" }, { name: "yarn", version: "4.5.1" }] } },
    { devEngines: { packageManager: [{ name: "pnpm", version: "latest" }] } },
    { devEngines: { packageManager: [{ name: ["pnpm"], version: "9.0.0" }] } },
    { devEngines: { packageManager: [{ name: "pnpm", version: ["9.0.0"] }] } },
    { devEngines: { packageManager: [{ name: "pnpm", version: "9.0.1" }] }, packageManager: "pnpm@9.0.0" },
    { devEngines: { packageManager: { name: "pnpm", version: `9.0.0+sha224.${"a".repeat(56)}` } },
      packageManager: `pnpm@9.0.0+sha224.${"b".repeat(56)}` },
  ];
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  for (const contents of cases) {
    fs.writeFileSync(manifest, JSON.stringify(contents));
    const plan = createPlan(root);
    assert.equal(plan.mode, "unsupported", JSON.stringify(contents));
    assert.deepEqual(plan.detected, []);
    assert.deepEqual(plan.actions, []);
  }
}));

test("a directory named package.json is not a Node manifest", () => fixture((root) => {
  const manifest = path.join(root, "package.json");
  fs.mkdirSync(manifest);
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  assert.equal(plan.mode, "unsupported");
  assert.deepEqual(plan.detected, []);
  assert.deepEqual(plan.actions, []);
  assert.match(plan.explanation, /regular file/);
  const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
  const applied = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve", plan.planId], { encoding: "utf8" });
  assert.equal(applied.status, 2);
  assert.equal(JSON.parse(applied.stdout).mode, "unsupported");
  assert.equal(fs.statSync(manifest).isDirectory(), true);
}));

test("non-file version markers and lockfiles never imply an initialized Node project", () => fixture((root) => {
  for (const marker of [".nvmrc", ".node-version"]) {
    const location = path.join(root, marker);
    fs.mkdirSync(location);
    const plan = createPlan(root);
    assert.equal(plan.mode, "unsupported");
    assert.deepEqual(plan.detected, []);
    assert.deepEqual(plan.actions, []);
    assert.match(plan.explanation, /regular files/);
    fs.rmdirSync(location);
  }
  const dangling = path.join(root, ".nvmrc");
  fs.symlinkSync("missing-version", dangling);
  assert.equal(createPlan(root).mode, "unsupported");
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"existing"}\n');
  const withManifest = createPlan(root);
  assert.equal(withManifest.mode, "unsupported");
  assert.match(withManifest.explanation, /regular files/);
  fs.unlinkSync(dangling);
  fs.mkdirSync(path.join(root, "pnpm-lock.yaml"));
  const plan = createPlan(root);
  assert.equal(plan.mode, "unsupported");
  assert.deepEqual(plan.detected, []);
  assert.match(plan.explanation, /regular files/);
}));

test("empty supported Node target plans without mutation and creates only with approval", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const first = createPlan(root);
  assert.deepEqual(first.detected, []);
  assert.equal(first.mode, "supported");
  assert.deepEqual(first.actions.map(({ path: file }) => file), ["package.json"]);
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
  assert.deepEqual(createPlan(root), first);
  const applied = applyPlan(root, first);
  assert.equal(applied.outcome, "applied");
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), '{\n  "private": true\n}\n');
  assert.deepEqual(createPlan(root).actions, []);
}));

test("version-only targets with other files do not claim a manifest or npm manager", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  fs.writeFileSync(path.join(root, "notes.txt"), "keep\n");
  const plan = createPlan(root);
  assert.equal(plan.mode, "supported");
  assert.deepEqual(plan.detected, []);
  assert.deepEqual(plan.actions, []);
  assert.match(plan.explanation, /version marker/);
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

test("an interrupted stage outside the target does not block a retry", () => fixture((root) => {
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
  const plan = createPlan(project);
  const preload = path.join(root, "interrupt.cjs");
  fs.writeFileSync(preload, [
    'const fs = require("node:fs");',
    "const write = fs.writeFileSync;",
    "fs.writeFileSync = (file, contents, options) => {",
    "  if (typeof file === 'number') { write(file, contents.slice(0, 3), options); process.exit(79); }",
    "  return write(file, contents, options);",
    "};",
  ].join("\n"));
  const interrupted = spawnSync(process.execPath, ["--require", preload, script, "--target", project, "--apply", "--approve", plan.planId], { encoding: "utf8" });
  assert.equal(interrupted.status, 79, interrupted.stderr);
  assert.deepEqual(fs.readdirSync(project), [".nvmrc"]);
  const oldStage = fs.readdirSync(root).find((name) => name.startsWith(".package-staging-"));
  assert.ok(oldStage);
  const retry = createPlan(project);
  assert.deepEqual(retry.detected, []);
  assert.deepEqual(retry.actions, plan.actions);
  assert.equal(applyPlan(project, retry).outcome, "applied");
  assert.equal(fs.readFileSync(path.join(project, "package.json"), "utf8"), plan.actions[0].contents);
  assert.equal(fs.existsSync(path.join(root, oldStage)), true);
}));


test("foreign staging-like entries are still treated as project content", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const foreign = path.join(root, ".package-staging-abc123");
  fs.mkdirSync(foreign, { mode: 0o700 });
  fs.writeFileSync(path.join(foreign, "package.json"), '{"private":');
  const plan = createPlan(root);
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.detected, []);
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
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
    assert.equal(fs.lstatSync(staged).isSymbolicLink(), kind === "symlink");
    fs.rmSync(path.dirname(staged), { recursive: true, force: true });
  }));
}

test("a replaceable staging directory is rejected before attacker bytes can publish", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  fs.chmodSync(root, 0o777);
  const link = fs.linkSync;
  let publicationAttempted = false;
  fs.linkSync = (from, to) => {
    publicationAttempted = true;
    const removed = `${path.dirname(from)}-renamed`;
    fs.renameSync(path.dirname(from), removed);
    fs.mkdirSync(path.dirname(from), { mode: 0o700 });
    fs.writeFileSync(from, "attacker manifest\n");
    return link(from, to);
  };
  try {
    assert.throws(() => applyPlan(root, plan), /permits replacement/);
  } finally {
    fs.linkSync = link;
  }
  assert.equal(publicationAttempted, false);
  assert.deepEqual(fs.readdirSync(root), [".nvmrc"]);
}));

test("a target owned by another user cannot publish an attacker-controlled stage", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const plan = createPlan(root);
  const stat = fs.statSync;
  const link = fs.linkSync;
  let publicationAttempted = false;
  fs.statSync = (file, ...args) => {
    const result = stat(file, ...args);
    return file === "." ? Object.assign(Object.create(Object.getPrototypeOf(result)), result, { uid: process.geteuid() + 1 }) : result;
  };
  fs.linkSync = (...args) => {
    publicationAttempted = true;
    return link(...args);
  };
  try {
    assert.throws(() => applyPlan(root, plan), /permits replacement/);
  } finally {
    fs.statSync = stat;
    fs.linkSync = link;
  }
  assert.equal(publicationAttempted, false);
  assert.deepEqual(fs.readdirSync(root), [".nvmrc"]);
}));

test("a replaceable ancestor of the staging parent is rejected before staging", () => fixture((root) => {
  const ancestor = path.join(root, "replaceable");
  const stagingParent = path.join(ancestor, "parent");
  const project = path.join(stagingParent, "project");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const plan = createPlan(project);
  fs.chmodSync(ancestor, 0o777);
  const mkdtemp = fs.mkdtempSync;
  let stagingAttempted = false;
  fs.mkdtempSync = (...args) => {
    stagingAttempted = true;
    return mkdtemp(...args);
  };
  try {
    assert.throws(() => applyPlan(project, plan), /protected same-device staging directory/);
  } finally {
    fs.mkdtempSync = mkdtemp;
  }
  assert.equal(stagingAttempted, false);
  assert.deepEqual(fs.readdirSync(stagingParent), ["project"]);
  assert.deepEqual(fs.readdirSync(project), [".nvmrc"]);
}));

test("Darwin ACL-writable staging parent is rejected before publication", { skip: process.platform !== "darwin" }, () => fixture((root) => {
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const plan = createPlan(project);
  assert.equal(fs.statSync(root).mode & 0o022, 0);
  const acl = spawnSync("/bin/chmod", ["+a", "everyone allow add_file,add_subdirectory,delete_child", root], { encoding: "utf8" });
  assert.equal(acl.status, 0, acl.stderr);
  const listing = spawnSync("/bin/ls", ["-lde", root], { encoding: "utf8" });
  assert.match(listing.stdout, /^\s*0:\s.*allow add_file/m);
  const link = fs.linkSync;
  let publicationAttempted = false;
  fs.linkSync = (...args) => {
    publicationAttempted = true;
    return link(...args);
  };
  try {
    assert.throws(() => applyPlan(project, plan), /staging directory ACL/);
  } finally {
    fs.linkSync = link;
  }
  assert.equal(publicationAttempted, false);
  assert.deepEqual(fs.readdirSync(root), ["project"]);
  assert.deepEqual(fs.readdirSync(project), [".nvmrc"]);
}));

test("Darwin ACL-writable bootstrap target is rejected before publication", { skip: process.platform !== "darwin" }, () => fixture((root) => {
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const plan = createPlan(project);
  const acl = spawnSync("/bin/chmod", ["+a", "everyone allow search,add_file,delete_child", project], { encoding: "utf8" });
  assert.equal(acl.status, 0, acl.stderr);
  const listing = spawnSync("/bin/ls", ["-lde", project], { encoding: "utf8" });
  assert.match(listing.stdout, /^\s*0:\s.*allow .*search/m);
  const link = fs.linkSync;
  let publicationAttempted = false;
  fs.linkSync = (...args) => {
    publicationAttempted = true;
    return link(...args);
  };
  try {
    assert.throws(() => applyPlan(project, plan), /staging directory ACL/);
  } finally {
    fs.linkSync = link;
  }
  assert.equal(publicationAttempted, false);
  assert.deepEqual(fs.readdirSync(project), [".nvmrc"]);
}));

test("Darwin ACL-writable staging ancestor is rejected before staging", { skip: process.platform !== "darwin" }, () => fixture((root) => {
  const ancestor = path.join(root, "ancestor");
  const stagingParent = path.join(ancestor, "parent");
  const project = path.join(stagingParent, "project");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const plan = createPlan(project);
  const acl = spawnSync("/bin/chmod", ["+a", "everyone allow add_subdirectory,delete_child", ancestor], { encoding: "utf8" });
  assert.equal(acl.status, 0, acl.stderr);
  const mkdtemp = fs.mkdtempSync;
  let stagingAttempted = false;
  fs.mkdtempSync = (...args) => {
    stagingAttempted = true;
    return mkdtemp(...args);
  };
  try {
    assert.throws(() => applyPlan(project, plan), /staging directory ACL/);
  } finally {
    fs.mkdtempSync = mkdtemp;
  }
  assert.equal(stagingAttempted, false);
  assert.deepEqual(fs.readdirSync(stagingParent), ["project"]);
  assert.deepEqual(fs.readdirSync(project), [".nvmrc"]);
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
  assert.equal(fs.readFileSync(staged, "utf8"), "foreign staged data\n");
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), '{\n  "private": true\n}\n');
  fs.rmSync(path.dirname(staged), { recursive: true, force: true });
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
  const lstat = fs.lstatSync;
  let swapped = false;
  fs.lstatSync = (file, options) => {
    if (!swapped && file === ".nvmrc") {
      swapped = true;
      fs.renameSync(parent, moved);
      fs.symlinkSync(outside, parent, "dir");
    }
    return lstat(file, options);
  };
  try {
    assert.equal(applyPlan(project, plan).outcome, "applied");
  } finally {
    fs.lstatSync = lstat;
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

test("CLI requires the dry-run planId for an approved write", () => fixture((root) => {
  fs.writeFileSync(path.join(root, ".nvmrc"), "22\n");
  const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
  const dryRun = spawnSync(process.execPath, [script, "--target", root], { encoding: "utf8" });
  assert.equal(dryRun.status, 0);
  const plan = JSON.parse(dryRun.stdout);
  assert.equal(plan.outcome, "planned");
  assert.match(plan.planId, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
  const missing = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve"], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  const wrong = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve", "incorrect"], { encoding: "utf8" });
  assert.equal(wrong.status, 1);
  assert.equal(fs.existsSync(path.join(root, "package.json")), false);
  const applied = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve", plan.planId], { encoding: "utf8" });
  assert.equal(applied.status, 0);
  assert.equal(JSON.parse(applied.stdout).outcome, "applied");
  assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), '{\n  "private": true\n}\n');
}));

test("CLI reports success when its target cwd is renamed during publication", () => fixture((root) => {
  const project = path.join(root, "project");
  const moved = path.join(root, "moved");
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
  const dryRun = spawnSync(process.execPath, [script], { cwd: project, encoding: "utf8" });
  assert.equal(dryRun.status, 0);
  const { planId } = JSON.parse(dryRun.stdout);
  const preload = path.join(root, "rename-at-publication.cjs");
  fs.writeFileSync(preload, [
    'const fs = require("node:fs");',
    "const link = fs.linkSync;",
    "fs.linkSync = (from, to) => {",
    "  fs.renameSync(process.env.BOOTSTRAP_PROJECT, process.env.BOOTSTRAP_MOVED);",
    "  return link(from, to);",
    "};",
  ].join("\n"));
  const applied = spawnSync(process.execPath, ["--require", preload, script, "--apply", "--approve", planId], {
    cwd: project,
    encoding: "utf8",
    env: { ...process.env, BOOTSTRAP_PROJECT: project, BOOTSTRAP_MOVED: moved },
  });
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(applied.stderr, "");
  assert.equal(JSON.parse(applied.stdout).outcome, "applied");
  assert.equal(fs.existsSync(project), false);
  assert.equal(fs.readFileSync(path.join(moved, "package.json"), "utf8"), '{\n  "private": true\n}\n');
}));

test("CLI approval cannot write after the dry-run target inode is replaced", () => fixture((root) => {
  const project = path.join(root, "project");
  const moved = path.join(root, "moved");
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const script = fileURLToPath(new URL("../skills/project-init/scripts/bootstrap.mjs", import.meta.url));
  const dryRun = spawnSync(process.execPath, [script, "--target", project], { encoding: "utf8" });
  assert.equal(dryRun.status, 0);
  const { planId } = JSON.parse(dryRun.stdout);
  fs.renameSync(project, moved);
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, ".nvmrc"), "22\n");
  const applied = spawnSync(process.execPath, [script, "--target", project, "--apply", "--approve", planId], { encoding: "utf8" });
  assert.equal(applied.status, 1);
  assert.match(applied.stderr, /plan changed/);
  assert.deepEqual(fs.readdirSync(project), [".nvmrc"]);
  assert.deepEqual(fs.readdirSync(moved), [".nvmrc"]);
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
  const apply = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve", plan.planId], { encoding: "utf8" });
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
  const apply = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve", plan.planId], { encoding: "utf8" });
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
    const apply = spawnSync(process.execPath, [script, "--target", root, "--apply", "--approve", plan.planId], { encoding: "utf8" });
    assert.equal(apply.status, 0);
    assert.equal(JSON.parse(apply.stdout).outcome, "unchanged");
    assert.equal(fs.existsSync(path.join(root, "package.json")), false);
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), contents);
  }));
}
