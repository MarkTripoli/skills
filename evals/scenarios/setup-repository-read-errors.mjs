import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

function unreadableRecord(mode) {
  return {
    kind: "file-error",
    mode,
    operation: "read-file",
    errorClass: "permission-denied",
    sha256: null,
  };
}

function sameRecord(label, before, after, mode) {
  const expected = unreadableRecord(mode);
  return JSON.stringify(before) === JSON.stringify(expected)
    && JSON.stringify(after) === JSON.stringify(expected)
    ? null
    : `${label}: expected bounded unreadable-file evidence`;
}

export default {
  slug: "setup-repository-read-errors",
  title: "Retain setup evidence when regular files cannot be read",
  workflow: "oneshot",
  fixtures: ["setup-repository-basic"],
  request: "Run repository setup while regular repository and Git-config files are unreadable.",
  phases: [
    {
      phaseType: "terminal",
      skill: "setup-repository",
      readFailurePaths: ["unreadable-evidence.txt"],
      prepareFixture(root) {
        fs.writeFileSync(path.join(root, "unreadable-evidence.txt"), "private repository payload\n");
        fs.chmodSync(path.join(root, "unreadable-evidence.txt"), 0o000);
      },
      cleanupFixture(root) {
        fs.chmodSync(path.join(root, "unreadable-evidence.txt"), 0o600);
        fs.rmSync(path.join(root, "unreadable-evidence.txt"));
      },
      request: "Run `/setup-repository` in exact `reconcile` mode while an unrelated regular repository file is unreadable.",
      allowedChangedPaths: ["ai-utilities.json"],
      check: ({ answer, beforeRepository, afterRepository }) => failures(
        sameRecord(
          "repository",
          beforeRepository["unreadable-evidence.txt"],
          afterRepository["unreadable-evidence.txt"],
          "0000",
        ),
        expect.matches("receipt: no external operations", answer, /External operations:\s*0/i),
      ),
    },
    {
      phaseType: "terminal",
      skill: "setup-repository",
      readFailurePaths: [".git/config"],
      request: "Run `/setup-repository` in exact `reconcile` mode while the regular local Git config is unreadable.",
      allowedChangedPaths: [],
      check: ({ answer, beforeGitConfig, afterGitConfig }) => failures(
        sameRecord("Git config", beforeGitConfig, afterGitConfig, "0644"),
        expect.matches("receipt: no external operations", answer, /External operations:\s*0/i),
      ),
    },
  ],
};
