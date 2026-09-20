import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("terminal grading retains and rejects semantic Git index mutations", () => {
  // Given
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-git-index-runner-"));
  const resultsRoot = path.join(temp, "results");
  const bin = path.join(temp, "bin");
  fs.mkdirSync(bin);
  const omp = path.join(bin, "omp");
  fs.writeFileSync(omp, [
    "#!/bin/sh",
    "git update-index --assume-unchanged README.md",
    "printf 'semantic index mutation attempted\\n'",
  ].join("\n"));
  fs.chmodSync(omp, 0o755);
  let fixtureRepo = null;
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    SKILLS_EVAL_RESULTS_ROOT: resultsRoot,
  };

  try {
    // When
    const live = spawnSync(process.execPath, [
      "evals/run.mjs",
      "setup-repository-basic",
      "--keep",
      "--max-time",
      "1",
    ], { cwd: repoRoot, encoding: "utf8", env });
    const runDir = fs.realpathSync(path.join(resultsRoot, "latest"));
    const phaseDir = path.join(runDir, "setup-repository-basic", "1-setup-repository");
    const report = JSON.parse(fs.readFileSync(path.join(runDir, "setup-repository-basic", "report.json"), "utf8"));
    fixtureRepo = report.repo;
    const before = JSON.parse(fs.readFileSync(path.join(phaseDir, "git-index-before.json"), "utf8"));
    const afterSnapshot = JSON.parse(fs.readFileSync(path.join(phaseDir, "git-index-after.json"), "utf8"));
    const regrade = spawnSync(process.execPath, [
      "evals/run.mjs",
      "setup-repository-basic",
      "--grade",
      runDir,
    ], { cwd: repoRoot, encoding: "utf8", env });

    // Then
    assert.equal(live.status, 1);
    assert.match(live.stdout, /repository: semantic Git index changed/);
    assert.equal(before.find((entry) => entry.path === "README.md").assumeUnchanged, false);
    assert.equal(afterSnapshot.find((entry) => entry.path === "README.md").assumeUnchanged, true);
    assert.equal(regrade.status, 1);
    assert.match(regrade.stdout, /repository: semantic Git index changed/);
  } finally {
    if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("terminal grading retains bounded corrupt-index evidence live and during regrade", () => {
  // Given
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-corrupt-git-index-runner-"));
  const resultsRoot = path.join(temp, "results");
  const bin = path.join(temp, "bin");
  fs.mkdirSync(bin);
  const omp = path.join(bin, "omp");
  fs.writeFileSync(omp, [
    "#!/bin/sh",
    "printf 'credential-shaped-stderr-sentinel\\n' > .git/index",
    "printf 'corrupt index mutation attempted\\n'",
  ].join("\n"));
  fs.chmodSync(omp, 0o755);
  let fixtureRepo = null;
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    SKILLS_EVAL_RESULTS_ROOT: resultsRoot,
  };

  try {
    // When
    const live = spawnSync(process.execPath, [
      "evals/run.mjs",
      "setup-repository-basic",
      "--keep",
      "--max-time",
      "1",
    ], { cwd: repoRoot, encoding: "utf8", env });
    const runDir = fs.realpathSync(path.join(resultsRoot, "latest"));
    const phaseDir = path.join(runDir, "setup-repository-basic", "1-setup-repository");
    const report = JSON.parse(fs.readFileSync(path.join(runDir, "setup-repository-basic", "report.json"), "utf8"));
    fixtureRepo = report.repo;
    const afterSnapshot = JSON.parse(fs.readFileSync(path.join(phaseDir, "git-index-after.json"), "utf8"));
    const retained = fs.readFileSync(path.join(phaseDir, "git-index-after.json"), "utf8");
    const regrade = spawnSync(process.execPath, [
      "evals/run.mjs",
      "setup-repository-basic",
      "--grade",
      runDir,
    ], { cwd: repoRoot, encoding: "utf8", env });

    // Then
    assert.equal(live.status, 1);
    assert.match(live.stdout, /repository: semantic Git index changed/);
    assert.equal(afterSnapshot.kind, "error");
    assert.equal(afterSnapshot.code, "exit-128");
    assert.equal(retained.includes("credential-shaped-stderr-sentinel"), false);
    assert.equal(regrade.status, 1);
    assert.match(regrade.stdout, /repository: semantic Git index changed/);
  } finally {
    if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
