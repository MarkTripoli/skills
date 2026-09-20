import { after, test } from "node:test";
import assert from "node:assert/strict";
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

const temps = [];

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
