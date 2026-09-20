import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  diffRepositorySnapshots,
  handoff,
  snapshotRepository,
  unexpectedRepositoryChanges,
} from "../evals/lib.mjs";

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
