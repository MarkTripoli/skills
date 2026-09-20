import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gitIndexChanged, snapshotGitIndex } from "../evals/git-index.mjs";

const temps = [];

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-git-index-"));
  temps.push(root);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Evals", "-c", "user.email=evals@example.com", "commit", "-q", "-m", "fixture"], { cwd: root });
  return root;
}

after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

test("semantic Git index snapshots detect assume-unchanged flags", () => {
  // Given
  const root = repository();
  const before = snapshotGitIndex(root);

  // When
  execFileSync("git", ["update-index", "--assume-unchanged", "README.md"], { cwd: root });
  const afterSnapshot = snapshotGitIndex(root);

  // Then
  assert.equal(gitIndexChanged(before, afterSnapshot), true);
  assert.equal(afterSnapshot[0].path, "README.md");
  assert.equal(afterSnapshot[0].stage, 0);
  assert.equal(afterSnapshot[0].mode, "100644");
  assert.match(afterSnapshot[0].object, /^[a-f0-9]{40,64}$/);
  assert.equal(afterSnapshot[0].assumeUnchanged, true);
});

test("semantic Git index snapshots retain skip-worktree and intent-to-add flags", () => {
  // Given
  const root = repository();
  fs.writeFileSync(path.join(root, "planned.txt"), "planned\n");

  // When
  execFileSync("git", ["update-index", "--skip-worktree", "README.md"], { cwd: root });
  execFileSync("git", ["add", "--intent-to-add", "planned.txt"], { cwd: root });
  const snapshot = snapshotGitIndex(root);

  // Then
  assert.equal(snapshot.find((entry) => entry.path === "README.md").skipWorktree, true);
  assert.equal(snapshot.find((entry) => entry.path === "planned.txt").intentToAdd, true);
});

test("semantic Git index snapshots ignore read-only Git stat-cache refreshes", () => {
  // Given
  const root = repository();
  const before = snapshotGitIndex(root);

  // When
  execFileSync("git", ["status", "--short"], { cwd: root });
  execFileSync("git", ["diff", "--stat"], { cwd: root });
  const afterSnapshot = snapshotGitIndex(root);

  // Then
  assert.equal(gitIndexChanged(before, afterSnapshot), false);
  assert.deepEqual(afterSnapshot, before);
});

test("semantic Git index snapshots return typed bounded evidence for corrupt regular indexes", () => {
  // Given
  const root = repository();
  const before = snapshotGitIndex(root);
  fs.writeFileSync(path.join(root, ".git", "index"), "credential-shaped-stderr-sentinel\n");

  // When
  const afterSnapshot = snapshotGitIndex(root);

  // Then
  assert.equal(afterSnapshot.kind, "error");
  assert.equal(afterSnapshot.code, "exit-128");
  assert.match(afterSnapshot.indexSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(afterSnapshot).includes("credential-shaped-stderr-sentinel"), false);
  assert.equal(gitIndexChanged(before, afterSnapshot), true);
});

test("semantic Git index snapshots do not invoke Git through unsafe roots", () => {
  // Given
  const root = repository();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "skills-git-index-external-"));
  temps.push(external);
  fs.rmSync(path.join(root, ".git"), { recursive: true });
  fs.symlinkSync(external, path.join(root, ".git"), "dir");

  // When
  const snapshot = snapshotGitIndex(root);

  // Then
  assert.deepEqual(snapshot, { kind: "unavailable", reason: "unsafe-git-root" });
});
