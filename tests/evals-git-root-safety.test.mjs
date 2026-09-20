import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  diffRepositorySnapshots,
  snapshotGitConfig,
  snapshotNamedRoot,
} from "../evals/lib.mjs";

const temps = [];
const fifoTest = process.platform === "win32" ? test.skip : test;
const gitSnapshotOptions = {
  exclude: [".git/config"],
  omitFileContents: [".git/index"],
};

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-git-root-eval-"));
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
  for (const entry of temps) fs.rmSync(entry, { recursive: true, force: true });
});

test("Git config capture returns no payload when the Git directory becomes absent", () => {
  // Given
  const root = repository();
  put(root, ".git/config", "fixture config\n");
  const beforeConfig = snapshotGitConfig(root);
  const beforeRoot = snapshotGitRoot(root);

  // When
  fs.rmSync(path.join(root, ".git"), { recursive: true });
  const afterConfig = snapshotGitConfig(root);
  const afterRoot = snapshotGitRoot(root);

  // Then
  assert.equal(beforeConfig.kind, "file");
  assert.equal(afterConfig, null);
  assert.deepEqual(diffRepositorySnapshots(beforeRoot, afterRoot).changedPaths, [".git"]);
});

test("Git config capture returns no payload when the Git root is a regular file", () => {
  // Given
  const root = repository();
  fs.writeFileSync(path.join(root, ".git"), "not a directory\n");

  // When
  const config = snapshotGitConfig(root);

  // Then
  assert.equal(config, null);
  assert.deepEqual(snapshotGitRoot(root)[".git"].kind, "file");
});

fifoTest("Git config capture returns no payload when the Git root is a FIFO", () => {
  // Given
  const root = repository();
  execFileSync("mkfifo", [path.join(root, ".git")]);

  // When
  const config = snapshotGitConfig(root);

  // Then
  assert.equal(config, null);
  assert.deepEqual(snapshotGitRoot(root)[".git"], { kind: "other", type: "fifo" });
});

test("Git config capture returns no payload for valid and dangling Git-root symlinks", () => {
  // Given
  const root = repository();
  fs.mkdirSync(path.join(root, "git-target"));
  fs.symlinkSync("git-target", path.join(root, ".git"), "dir");

  // When
  const validConfig = snapshotGitConfig(root);
  fs.rmSync(path.join(root, ".git"));
  fs.symlinkSync("missing-target", path.join(root, ".git"), "dir");
  const danglingConfig = snapshotGitConfig(root);

  // Then
  assert.equal(validConfig, null);
  assert.equal(danglingConfig, null);
  assert.equal(snapshotGitRoot(root)[".git"].linkTarget, "missing-target");
});

test("Git config capture never retains bytes through an external directory symlink", () => {
  // Given
  const root = repository();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "skills-git-root-external-"));
  temps.push(external);
  put(external, "config", "host-private-config\n");
  fs.symlinkSync(external, path.join(root, ".git"), "dir");

  // When
  const config = snapshotGitConfig(root);
  const rootSnapshot = snapshotGitRoot(root);

  // Then
  assert.equal(config, null);
  assert.equal(rootSnapshot[".git"].kind, "symlink");
  assert.equal("bytes" in rootSnapshot[".git"], false);
  assert.equal(JSON.stringify({ config, rootSnapshot }).includes("host-private-config"), false);
});
