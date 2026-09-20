import assert from "node:assert/strict";
import { test } from "node:test";
import {
  excludedRootsManifestProblem,
  gitIndexManifestProblem,
  repositoryManifestProblem,
} from "../evals/manifest.mjs";

const digest = "0".repeat(64);

test("repository manifests reject paths outside repository ownership", () => {
  // Given
  const invalidPaths = [
    "../outside",
    "nested/../outside",
    ".git/config",
    ".agents/task.md",
    ".omp/agent.md",
    "/absolute",
    "C:\\absolute",
    "./relative",
    "nested//file",
    "bad\0name",
  ];

  // When / Then
  for (const entryPath of invalidPaths) {
    assert.match(
      repositoryManifestProblem({ [entryPath]: { kind: "directory", mode: "0755" } }),
      /invalid path|reserved root/,
      entryPath,
    );
  }
  assert.equal(
    repositoryManifestProblem({ "odd name #? [x]..txt": { kind: "directory", mode: "0755" } }),
    null,
  );
});

test("excluded-root manifests reject paths assigned to the wrong bucket", () => {
  // Given
  const manifest = {
    ".agents": { "README.md": { kind: "directory", mode: "0755" } },
    ".git": {},
    ".omp": {},
  };

  // When
  const problem = excludedRootsManifestProblem(manifest);

  // Then
  assert.match(problem, /\.agents.*outside bucket/);
  assert.match(
    excludedRootsManifestProblem({
      ".agents": { ".agents/bad\0name": { kind: "directory", mode: "0755" } },
      ".git": {},
      ".omp": {},
    }),
    /invalid path/,
  );
});

test("manifests verify file and symlink payload digests", () => {
  // Given
  const file = {
    "odd name #?.txt": {
      kind: "file",
      mode: "0644",
      bytes: Buffer.from("retained bytes\n").toString("base64"),
      sha256: digest,
    },
  };
  const symlink = {
    "link name": {
      kind: "symlink",
      linkTarget: "target with spaces",
      sha256: digest,
    },
  };

  // When / Then
  assert.match(repositoryManifestProblem(file), /digest mismatch/);
  assert.match(repositoryManifestProblem(symlink), /digest mismatch/);
});

test("manifests accept bounded file read errors and reject raw error fields", () => {
  // Given
  const bounded = {
    "unreadable.txt": {
      kind: "file-error",
      mode: "0000",
      operation: "read-file",
      errorClass: "permission-denied",
      sha256: null,
    },
  };
  const leaking = {
    "unreadable.txt": {
      ...bounded["unreadable.txt"],
      message: "private raw failure",
    },
  };

  // When / Then
  assert.equal(repositoryManifestProblem(bounded), null);
  assert.match(repositoryManifestProblem(leaking), /malformed/);
});

test("manifests require normalized permission bits for regular files and directories", () => {
  // Given / When / Then
  assert.match(
    repositoryManifestProblem({ directory: { kind: "directory" } }),
    /directory record is malformed/,
  );
  assert.match(
    repositoryManifestProblem({
      file: {
        kind: "file",
        mode: "644",
        bytes: "",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    }),
    /file record is malformed/,
  );
});

test("Git index manifests reject impossible entry identities", () => {
  // Given
  const entry = {
    assumeUnchanged: false,
    intentToAdd: false,
    mode: "100644",
    object: "0".repeat(40),
    path: "tracked.txt",
    skipWorktree: false,
    stage: 0,
  };

  // When / Then
  for (const invalidPath of ["../outside", "/absolute", "C:\\absolute", "nested/../outside", ".git/config", "bad\0name"]) {
    assert.match(gitIndexManifestProblem([{ ...entry, path: invalidPath }]), /invalid path/, invalidPath);
  }
  for (const invalidLength of [39, 41, 63, 65]) {
    assert.match(
      gitIndexManifestProblem([{ ...entry, object: "0".repeat(invalidLength) }]),
      /object id is malformed/,
      String(invalidLength),
    );
  }
  for (const invalidMode of ["000000", "100600", "777777"]) {
    assert.match(gitIndexManifestProblem([{ ...entry, mode: invalidMode }]), /mode is malformed/, invalidMode);
  }
  assert.match(gitIndexManifestProblem([entry, { ...entry }]), /duplicate entry identity/);
  assert.match(
    gitIndexManifestProblem([entry, { ...entry, object: "0".repeat(64), path: "other.txt" }]),
    /object id widths differ/,
  );
  assert.equal(gitIndexManifestProblem([entry, { ...entry, stage: 1 }]), null);
  assert.equal(gitIndexManifestProblem([{ ...entry, object: "0".repeat(64) }]), null);
  for (const validMode of ["040000", "100644", "100755", "120000", "160000"]) {
    assert.equal(gitIndexManifestProblem([{ ...entry, mode: validMode }]), null, validMode);
  }
});
