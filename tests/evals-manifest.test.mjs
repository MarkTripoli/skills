import assert from "node:assert/strict";
import { test } from "node:test";
import {
  excludedRootsManifestProblem,
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
