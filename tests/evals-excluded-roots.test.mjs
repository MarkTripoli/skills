import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  diffExcludedRootSnapshots,
  diffRepositorySnapshots,
  snapshotNamedRoot,
  snapshotRepository,
} from "../evals/lib.mjs";

const temps = [];
const fifoTest = process.platform === "win32" ? test.skip : test;
const gitSnapshotOptions = {
  exclude: [".git/config"],
  omitFileContents: [".git/index"],
};

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-excluded-root-eval-"));
  temps.push(root);
  return root;
}

function put(root, file, contents) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function snapshotGitRoot(root) {
  return snapshotNamedRoot(root, ".git", gitSnapshotOptions);
}

after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

test("named excluded-root snapshots detect tracked, untracked, ignored, and deleted entries", () => {
  const root = repository();
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "evals@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Skills Evals"], { cwd: root });
  put(root, ".gitignore", ".agents/ignored.txt\n.omp/ignored.txt\n");
  put(root, ".agents/tracked.txt", "tracked\n");
  put(root, ".omp/tracked.txt", "tracked\n");
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
  const beforeRepository = snapshotRepository(root);
  const beforeExcluded = {
    ".agents": snapshotNamedRoot(root, ".agents"),
    ".omp": snapshotNamedRoot(root, ".omp"),
  };

  fs.rmSync(path.join(root, ".agents/tracked.txt"));
  put(root, ".agents/ignored.txt", "ignored\n");
  put(root, ".omp/untracked.txt", "untracked\n");
  put(root, ".omp/ignored.txt", "ignored\n");
  const afterRepository = snapshotRepository(root);
  const afterExcluded = {
    ".agents": snapshotNamedRoot(root, ".agents"),
    ".omp": snapshotNamedRoot(root, ".omp"),
  };

  assert.deepEqual(diffRepositorySnapshots(beforeRepository, afterRepository).changedPaths, []);
  assert.deepEqual(diffExcludedRootSnapshots(beforeExcluded, afterExcluded), {
    ".agents": [".agents/ignored.txt", ".agents/tracked.txt"],
    ".omp": [".omp/ignored.txt", ".omp/untracked.txt"],
  });
});

test("named excluded-root snapshots detect permission-only changes", () => {
  // Given
  const root = repository();
  put(root, ".agents/private.txt", "same\n");
  fs.chmodSync(path.join(root, ".agents"), 0o700);
  fs.chmodSync(path.join(root, ".agents/private.txt"), 0o600);
  const before = snapshotNamedRoot(root, ".agents");

  // When
  fs.chmodSync(path.join(root, ".agents"), 0o755);
  fs.chmodSync(path.join(root, ".agents/private.txt"), 0o644);
  const afterSnapshot = snapshotNamedRoot(root, ".agents");

  // Then
  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).modified, [
    ".agents",
    ".agents/private.txt",
  ]);
});

fifoTest("named excluded-root snapshots retain types without dereferencing payloads", () => {
  const root = repository();
  put(root, ".agents/file-to-directory", "before\n");
  fs.mkdirSync(path.join(root, ".agents/link-target"));
  fs.mkdirSync(path.join(root, ".agents/directory-to-symlink"));
  fs.mkdirSync(path.join(root, ".omp"));
  fs.symlinkSync("missing-target", path.join(root, ".omp/symlink-to-file"));
  put(root, ".git/hooks/file-to-fifo", "before\n");
  const before = {
    ".agents": snapshotNamedRoot(root, ".agents"),
    ".omp": snapshotNamedRoot(root, ".omp"),
    ".git": snapshotGitRoot(root),
  };

  fs.rmSync(path.join(root, ".agents/file-to-directory"));
  fs.mkdirSync(path.join(root, ".agents/file-to-directory"));
  fs.rmdirSync(path.join(root, ".agents/directory-to-symlink"));
  fs.symlinkSync("link-target", path.join(root, ".agents/directory-to-symlink"), "dir");
  fs.rmSync(path.join(root, ".omp/symlink-to-file"));
  put(root, ".omp/symlink-to-file", "missing-target");
  fs.rmSync(path.join(root, ".git/hooks/file-to-fifo"));
  execFileSync("mkfifo", [path.join(root, ".git/hooks/file-to-fifo")]);
  const afterSnapshot = {
    ".agents": snapshotNamedRoot(root, ".agents"),
    ".omp": snapshotNamedRoot(root, ".omp"),
    ".git": snapshotGitRoot(root),
  };

  assert.deepEqual(diffExcludedRootSnapshots(before, afterSnapshot), {
    ".agents": [".agents/directory-to-symlink", ".agents/file-to-directory"],
    ".git": [".git/hooks/file-to-fifo"],
    ".omp": [".omp/symlink-to-file"],
  });
  assert.equal(before[".agents"][".agents/directory-to-symlink"].kind, "directory");
  assert.equal(afterSnapshot[".agents"][".agents/directory-to-symlink"].kind, "symlink");
  assert.equal("bytes" in afterSnapshot[".agents"][".agents/directory-to-symlink"], false);
  assert.equal(before[".omp"][".omp/symlink-to-file"].kind, "symlink");
  assert.equal(afterSnapshot[".omp"][".omp/symlink-to-file"].kind, "file");
  assert.deepEqual(afterSnapshot[".git"][".git/hooks/file-to-fifo"], { kind: "other", type: "fifo" });
});

test("excluded-root snapshots survive retained JSON round trips and legacy records", () => {
  const before = {
    ".agents": {
      ".agents": { kind: "directory" },
      ".agents/legacy.txt": { bytes: Buffer.from("same\n").toString("base64") },
    },
    ".git": {},
    ".omp": {},
  };
  const retainedBefore = JSON.parse(JSON.stringify(before));
  const retainedAfter = JSON.parse(JSON.stringify(before));

  assert.deepEqual(diffExcludedRootSnapshots(retainedBefore, retainedAfter), {
    ".agents": [],
    ".git": [],
    ".omp": [],
  });
});

test("Git excluded-root snapshots omit only config and ordinary index contents", () => {
  const root = repository();
  put(root, ".git/config", "config\n");
  put(root, ".git/index", "volatile\n");
  put(root, ".git/hooks/outside-config", "before\n");
  const before = snapshotGitRoot(root);

  put(root, ".git/config", "changed\n");
  put(root, ".git/index", "changed\n");
  put(root, ".git/hooks/outside-config", "after\n");
  const afterSnapshot = snapshotGitRoot(root);

  assert.equal(".git/config" in afterSnapshot, false);
  assert.deepEqual(before[".git/index"], { kind: "file", mode: "0644" });
  assert.deepEqual(afterSnapshot[".git/index"], { kind: "file", mode: "0644" });
  assert.deepEqual(diffRepositorySnapshots(before, afterSnapshot).changedPaths, [".git/hooks/outside-config"]);
});

test("Git excluded-root snapshots detect index file deletion and creation", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  put(root, ".git/index", "before\n");
  const fileSnapshot = snapshotGitRoot(root);

  fs.rmSync(path.join(root, ".git/index"));
  const absentSnapshot = snapshotGitRoot(root);

  assert.deepEqual(diffRepositorySnapshots(fileSnapshot, absentSnapshot).changedPaths, [".git/index"]);
  assert.deepEqual(diffRepositorySnapshots(absentSnapshot, fileSnapshot).changedPaths, [".git/index"]);
});

test("Git excluded-root snapshots detect index directories and descendants", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  put(root, ".git/index", "before\n");
  const fileSnapshot = snapshotGitRoot(root);

  fs.rmSync(path.join(root, ".git/index"));
  put(root, ".git/index/payload", "retained\n");
  const directorySnapshot = snapshotGitRoot(root);

  assert.deepEqual(directorySnapshot[".git/index"], { kind: "directory", mode: "0755" });
  assert.equal(directorySnapshot[".git/index/payload"].kind, "file");
  assert.deepEqual(diffRepositorySnapshots(fileSnapshot, directorySnapshot).changedPaths, [
    ".git/index",
    ".git/index/payload",
  ]);
  assert.deepEqual(diffRepositorySnapshots(directorySnapshot, fileSnapshot).changedPaths, [
    ".git/index",
    ".git/index/payload",
  ]);
});

test("Git excluded-root snapshots detect valid and dangling index symlinks without following them", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  put(root, ".git/index-target", "private target bytes\n");
  put(root, ".git/index", "before\n");
  const fileSnapshot = snapshotGitRoot(root);

  fs.rmSync(path.join(root, ".git/index"));
  fs.symlinkSync("index-target", path.join(root, ".git/index"));
  const validLinkSnapshot = snapshotGitRoot(root);
  fs.rmSync(path.join(root, ".git/index"));
  fs.symlinkSync("missing-target", path.join(root, ".git/index"));
  const danglingLinkSnapshot = snapshotGitRoot(root);

  assert.deepEqual(validLinkSnapshot[".git/index"], {
    kind: "symlink",
    linkTarget: "index-target",
    sha256: "d679b9311d3065475ed2d49db173f2e6c062894f841be6b05dd2d73fe606ddce",
  });
  assert.equal("bytes" in validLinkSnapshot[".git/index"], false);
  assert.equal(danglingLinkSnapshot[".git/index"].linkTarget, "missing-target");
  assert.deepEqual(diffRepositorySnapshots(fileSnapshot, validLinkSnapshot).changedPaths, [".git/index"]);
  assert.deepEqual(diffRepositorySnapshots(validLinkSnapshot, fileSnapshot).changedPaths, [".git/index"]);
  assert.deepEqual(diffRepositorySnapshots(fileSnapshot, danglingLinkSnapshot).changedPaths, [".git/index"]);
  assert.deepEqual(diffRepositorySnapshots(danglingLinkSnapshot, fileSnapshot).changedPaths, [".git/index"]);
});

fifoTest("Git excluded-root snapshots detect index FIFOs without reading payloads", () => {
  const root = repository();
  fs.mkdirSync(path.join(root, ".git"));
  put(root, ".git/index", "before\n");
  const fileSnapshot = snapshotGitRoot(root);

  fs.rmSync(path.join(root, ".git/index"));
  execFileSync("mkfifo", [path.join(root, ".git/index")]);
  const fifoSnapshot = snapshotGitRoot(root);

  assert.deepEqual(fifoSnapshot[".git/index"], { kind: "other", type: "fifo" });
  assert.deepEqual(diffRepositorySnapshots(fileSnapshot, fifoSnapshot).changedPaths, [".git/index"]);
  assert.deepEqual(diffRepositorySnapshots(fifoSnapshot, fileSnapshot).changedPaths, [".git/index"]);
});
