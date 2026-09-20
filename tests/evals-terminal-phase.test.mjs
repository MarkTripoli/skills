import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as evalLib from "../evals/lib.mjs";
import {
  diffRepositorySnapshots,
  handoff,
  snapshotRepository,
  unexpectedRepositoryChanges,
} from "../evals/lib.mjs";
import setupRepositoryBasic from "../evals/scenarios/setup-repository-basic.mjs";
import setupRepositorySafety from "../evals/scenarios/setup-repository-safety.mjs";

const temps = [];
const fifoTest = process.platform === "win32" ? test.skip : test;

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-terminal-eval-"));
  temps.push(root);
  return root;
}

function put(root, file, contents) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

test("repository snapshots report sorted creates, modifications, and deletions", () => {
  const root = repository();
  put(root, "keep.txt", "same\n");
  put(root, "modify.txt", "before\n");
  put(root, "remove.txt", "remove\n");
  const before = snapshotRepository(root);

  put(root, "modify.txt", "after\n");
  fs.rmSync(path.join(root, "remove.txt"));
  put(root, "created.txt", "created\n");
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot), {
    created: ["created.txt"],
    modified: ["modify.txt"],
    deleted: ["remove.txt"],
    changedPaths: ["created.txt", "modify.txt", "remove.txt"],
  });
  assert.equal(afterSnapshot["created.txt"].bytes, Buffer.from("created\n").toString("base64"));
  assert.match(afterSnapshot["created.txt"].sha256, /^[a-f0-9]{64}$/);
});

test("repository snapshots preserve a byte-stable no-op and exclude harness paths", () => {
  const root = repository();
  put(root, "README.md", "fixture\n");
  put(root, ".git/config", "ignored\n");
  put(root, ".agents/tasks/example/task.md", "ignored\n");
  put(root, ".omp/agents/worker.md", "ignored\n");

  const before = snapshotRepository(root);
  put(root, ".git/config", "changed\n");
  put(root, ".agents/tasks/example/task.md", "changed\n");
  put(root, ".omp/agents/worker.md", "changed\n");
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(Object.keys(before), ["README.md"]);
  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot), {
    created: [],
    modified: [],
    deleted: [],
    changedPaths: [],
  });
});

test("repository snapshots include nested directories named after harness paths", () => {
  const root = repository();
  const before = snapshotRepository(root);

  put(root, "nested/.agents/hidden.txt", "agents\n");
  put(root, "nested/.omp/hidden.txt", "omp\n");
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).changedPaths, [
    "nested/.agents/hidden.txt",
    "nested/.omp/hidden.txt",
  ]);
});

test("repository snapshots detect an empty directory created from absence", () => {
  const root = repository();
  const before = snapshotRepository(root);

  fs.mkdirSync(path.join(root, "empty"));
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).created, ["empty"]);
  assert.deepEqual(afterSnapshot.empty, { kind: "directory" });
});

test("repository snapshots detect an empty directory deleted to absence", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, "empty"));
  const before = snapshotRepository(root);

  fs.rmdirSync(path.join(root, "empty"));
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).deleted, ["empty"]);
  assert.deepEqual(before.empty, { kind: "directory" });
});

test("repository snapshots report non-empty directory creation through its contents once", () => {
  const root = repository();
  const before = snapshotRepository(root);

  put(root, "created/file.txt", "created\n");
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).changedPaths, ["created/file.txt"]);
  assert.deepEqual(afterSnapshot.created, { kind: "directory" });
});

test("repository snapshots report non-empty directory deletion through its contents once", () => {
  const root = repository();
  put(root, "removed/file.txt", "removed\n");
  const before = snapshotRepository(root);

  fs.rmSync(path.join(root, "removed"), { recursive: true });
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).changedPaths, ["removed/file.txt"]);
  assert.deepEqual(before.removed, { kind: "directory" });
});

fifoTest("repository snapshots detect a FIFO created from absence without reading it", () => {
  const root = repository();
  const before = snapshotRepository(root);

  execFileSync("mkfifo", [path.join(root, "entry")]);
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).created, ["entry"]);
  assert.deepEqual(afterSnapshot.entry, { kind: "other", type: "fifo" });
  assert.equal("bytes" in afterSnapshot.entry, false);
  assert.equal("linkTarget" in afterSnapshot.entry, false);
});

fifoTest("repository snapshots detect a FIFO deleted to absence", () => {
  const root = repository();
  execFileSync("mkfifo", [path.join(root, "entry")]);
  const before = snapshotRepository(root);

  fs.rmSync(path.join(root, "entry"));
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).deleted, ["entry"]);
  assert.deepEqual(before.entry, { kind: "other", type: "fifo" });
});

fifoTest("repository snapshot diffs report a directory replaced by a FIFO", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, "entry"));
  const before = snapshotRepository(root);

  fs.rmdirSync(path.join(root, "entry"));
  execFileSync("mkfifo", [path.join(root, "entry")]);
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).modified, ["entry"]);
  assert.deepEqual(before.entry, { kind: "directory" });
  assert.deepEqual(afterSnapshot.entry, { kind: "other", type: "fifo" });
});

test("local Git configuration snapshots detect byte changes outside repository manifests", () => {
  const root = repository();
  put(root, ".git/config", "[core]\n\trepositoryformatversion = 0\n");
  const beforeRepository = snapshotRepository(root);
  const beforeConfig = evalLib.snapshotGitConfig(root);

  put(root, ".git/config", "[core]\n\trepositoryformatversion = 0\n[review]\n\tmutation = detected\n");
  const afterRepository = snapshotRepository(root);
  const afterConfig = evalLib.snapshotGitConfig(root);

  assert.deepEqual(diffRepositorySnapshots(beforeRepository, afterRepository).changedPaths, []);
  assert.equal(evalLib.gitConfigChanged(beforeConfig, afterConfig), true);
});

test("local Git configuration detects a directory created from absence", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  const before = evalLib.snapshotGitConfig(root);

  fs.mkdirSync(path.join(root, ".git/config"));
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.equal(before, null);
  assert.deepEqual(afterSnapshot, { kind: "directory" });
});

test("local Git configuration detects a directory deleted to absence", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git/config"), { recursive: true });
  const before = evalLib.snapshotGitConfig(root);

  fs.rmdirSync(path.join(root, ".git/config"));
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.deepEqual(before, { kind: "directory" });
  assert.equal(afterSnapshot, null);
});

fifoTest("local Git configuration detects a FIFO created from absence without reading it", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  const before = evalLib.snapshotGitConfig(root);

  execFileSync("mkfifo", [path.join(root, ".git/config")]);
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.equal(before, null);
  assert.deepEqual(afterSnapshot, { kind: "other", type: "fifo" });
  assert.equal("bytes" in afterSnapshot, false);
  assert.equal("linkTarget" in afterSnapshot, false);
});

fifoTest("local Git configuration detects a FIFO deleted to absence", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  execFileSync("mkfifo", [path.join(root, ".git/config")]);
  const before = evalLib.snapshotGitConfig(root);

  fs.rmSync(path.join(root, ".git/config"));
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.deepEqual(before, { kind: "other", type: "fifo" });
  assert.equal(afterSnapshot, null);
});

fifoTest("local Git configuration detects a directory replaced by a FIFO", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git/config"), { recursive: true });
  const before = evalLib.snapshotGitConfig(root);

  fs.rmdirSync(path.join(root, ".git/config"));
  execFileSync("mkfifo", [path.join(root, ".git/config")]);
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.deepEqual(before, { kind: "directory" });
  assert.deepEqual(afterSnapshot, { kind: "other", type: "fifo" });
});

test("local Git configuration detects a dangling symlink created from absence", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  const before = evalLib.snapshotGitConfig(root);

  fs.symlinkSync("missing-target", path.join(root, ".git/config"));
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.equal(before, null);
  assert.deepEqual(afterSnapshot, {
    kind: "symlink",
    linkTarget: "missing-target",
    sha256: "b8abc156514f90734512db29fc73063a442613dc9aae4dce9a39470905fb6fc6",
  });
  assert.equal("bytes" in afterSnapshot, false);
});

test("local Git configuration detects a dangling symlink deleted to absence", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  fs.symlinkSync("missing-target", path.join(root, ".git/config"));
  const before = evalLib.snapshotGitConfig(root);

  fs.rmSync(path.join(root, ".git/config"));
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.deepEqual(before, {
    kind: "symlink",
    linkTarget: "missing-target",
    sha256: "b8abc156514f90734512db29fc73063a442613dc9aae4dce9a39470905fb6fc6",
  });
  assert.equal("bytes" in before, false);
  assert.equal(afterSnapshot, null);
});

test("repository snapshots retain file-link targets without copying target bytes", () => {
  const root = repository();
  const hostFile = path.join(path.dirname(root), `${path.basename(root)}-host-secret.txt`);
  temps.push(hostFile);
  fs.writeFileSync(hostFile, "host-only-secret\n");
  fs.symlinkSync(`../${path.basename(hostFile)}`, path.join(root, "linked-secret"));

  const manifest = snapshotRepository(root);

  assert.equal(manifest["linked-secret"].linkTarget, `../${path.basename(hostFile)}`);
  assert.equal("bytes" in manifest["linked-secret"], false);
  assert.match(manifest["linked-secret"].sha256, /^[a-f0-9]{64}$/);
});

test("repository snapshots retain directory-link targets without traversing them", () => {
  const root = repository();
  const hostDirectory = path.join(path.dirname(root), `${path.basename(root)}-host-directory`);
  temps.push(hostDirectory);
  put(hostDirectory, "host-secret.txt", "host-only-secret\n");
  fs.symlinkSync(`../${path.basename(hostDirectory)}`, path.join(root, "linked-directory"), "dir");

  const manifest = snapshotRepository(root);

  assert.deepEqual(Object.keys(manifest), ["linked-directory"]);
  assert.equal(manifest["linked-directory"].linkTarget, `../${path.basename(hostDirectory)}`);
  assert.equal("bytes" in manifest["linked-directory"], false);
});

test("repository snapshot diffs report changed link targets", () => {
  const root = repository();
  fs.symlinkSync("first-target", path.join(root, "linked-file"));
  const before = snapshotRepository(root);

  fs.rmSync(path.join(root, "linked-file"));
  fs.symlinkSync("second-target", path.join(root, "linked-file"));
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).modified, ["linked-file"]);
  assert.equal(afterSnapshot["linked-file"].linkTarget, "second-target");
});

test("repository snapshot diffs report a regular file replaced by an equal-digest symlink", () => {
  const root = repository();
  put(root, "entry", "target");
  const before = snapshotRepository(root);

  fs.rmSync(path.join(root, "entry"));
  fs.symlinkSync("target", path.join(root, "entry"));
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).modified, ["entry"]);
  assert.equal(before.entry.kind, "file");
  assert.equal(afterSnapshot.entry.kind, "symlink");
  assert.equal(before.entry.sha256, afterSnapshot.entry.sha256);
});

test("repository snapshot diffs report a symlink replaced by an equal-digest regular file", () => {
  const root = repository();
  fs.symlinkSync("target", path.join(root, "entry"));
  const before = snapshotRepository(root);

  fs.rmSync(path.join(root, "entry"));
  put(root, "entry", "target");
  const afterSnapshot = snapshotRepository(root);

  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).modified, ["entry"]);
  assert.equal(before.entry.kind, "symlink");
  assert.equal(afterSnapshot.entry.kind, "file");
  assert.equal(before.entry.sha256, afterSnapshot.entry.sha256);
});

test("local Git configuration detects a regular file replaced by an equal-digest symlink", () => {
  const root = repository();
  put(root, ".git/target", "destination");
  put(root, ".git/config", "target");
  const before = evalLib.snapshotGitConfig(root);

  fs.rmSync(path.join(root, ".git/config"));
  fs.symlinkSync("target", path.join(root, ".git/config"));
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.equal(before.kind, "file");
  assert.equal(afterSnapshot.kind, "symlink");
  assert.equal(before.sha256, afterSnapshot.sha256);
});

test("local Git configuration detects a symlink replaced by an equal-digest regular file", () => {
  const root = repository();
  put(root, ".git/target", "destination");
  fs.symlinkSync("target", path.join(root, ".git/config"));
  const before = evalLib.snapshotGitConfig(root);

  fs.rmSync(path.join(root, ".git/config"));
  put(root, ".git/config", "target");
  const afterSnapshot = evalLib.snapshotGitConfig(root);

  assert.equal(evalLib.gitConfigChanged(before, afterSnapshot), true);
  assert.equal(before.kind, "symlink");
  assert.equal(afterSnapshot.kind, "file");
  assert.equal(before.sha256, afterSnapshot.sha256);
});

test("terminal allowlists return only undeclared repository changes", () => {
  assert.deepEqual(
    unexpectedRepositoryChanges(["README.md", "ai-utilities.json"], ["ai-utilities.json"]),
    ["README.md"],
  );
  assert.deepEqual(unexpectedRepositoryChanges([], []), []);
});

test("terminal answers contain no next-skill command fence", () => {
  const answer = [
    "Mode: reconcile",
    "Changed paths: ai-utilities.json",
    "External operations: 0",
  ].join("\n");

  assert.equal(handoff(answer), null);
});

test("basic rerun rejects a false conflict for valid current metadata", () => {
  const metadata = Buffer.from(`${JSON.stringify({
    vcs: { platform: "github" },
    onboarding: {
      schemaVersion: 1,
      profile: "default",
      appliedRevision: 1,
      providers: {},
    },
  }, null, 2)}\n`);
  const manifest = {
    "ai-utilities.json": { bytes: metadata.toString("base64") },
  };
  const answer = [
    "Mode: reconcile",
    "Observed state: conflict",
    "Written: none",
    "Conflicts: `ai-utilities.json` at `$`: observed null; expected a top-level JSON object.",
    "Verification: unchanged bytes match observation.",
    "External operations: 0",
  ].join("\n");

  const problems = setupRepositoryBasic.phases[1].check({
    answer,
    beforeRepository: manifest,
    afterRepository: manifest,
    changedPaths: [],
  });

  assert.equal(problems.length, 2);
  assert.match(problems[0], /^receipt: current observed state:/);
  assert.match(problems[1], /^receipt: no conflicts:/);
});

test("invalid JSON phase rejects leaked source sentinel", () => {
  // Given
  const invalidJson = Buffer.from('{"onboarding":"phase-three-secret-value"');
  const manifest = {
    "ai-utilities.json": { bytes: invalidJson.toString("base64") },
  };
  const answer = [
    "Conflicts: invalid JSON parse failure",
    "Written: none",
    "Verification bytes: unchanged and preserved",
    "External operations: 0",
    "Leaked source: phase-three-secret-value",
  ].join("\n");

  // When
  const problems = setupRepositorySafety.phases[0].check({
    answer,
    beforeRepository: manifest,
    afterRepository: manifest,
    changedPaths: [],
  });

  // Then
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^receipt: source bytes redacted:/);
});
