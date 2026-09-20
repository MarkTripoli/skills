import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("terminal capture diagnoses a symlinked Git root live and during retained regrade", () => {
  // Given
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-git-root-runner-"));
  const resultsRoot = path.join(temp, "results");
  const bin = path.join(temp, "bin");
  const external = path.join(temp, "external-git");
  fs.mkdirSync(bin);
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "config"), "host-private-config\n");
  const omp = path.join(bin, "omp");
  fs.writeFileSync(omp, [
    "#!/bin/sh",
    "rm -rf .git",
    'ln -s "$CR008_EXTERNAL_GIT" .git',
    'printf "unsafe mutation attempted\\n"',
  ].join("\n"));
  fs.chmodSync(omp, 0o755);
  let runDir = null;
  let fixtureRepo = null;
  const env = {
    ...process.env,
    CR008_EXTERNAL_GIT: external,
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
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      env,
    });
    const runMatch = /recordings in ([^;\n]+)/.exec(live.stdout);
    assert.ok(runMatch, live.stderr || live.stdout);
    runDir = path.resolve(repoRoot, runMatch[1].trim());
    assert.equal(path.dirname(runDir), resultsRoot);
    const phaseDir = path.join(runDir, "setup-repository-basic", "1-setup-repository");
    const report = JSON.parse(fs.readFileSync(path.join(runDir, "setup-repository-basic", "report.json"), "utf8"));
    fixtureRepo = report.repo;
    const retainedConfig = JSON.parse(fs.readFileSync(path.join(phaseDir, "git-config-after.json"), "utf8"));
    const retainedRoots = JSON.parse(fs.readFileSync(path.join(phaseDir, "excluded-roots-after.json"), "utf8"));
    const retainedText = [
      live.stdout,
      live.stderr,
      fs.readFileSync(path.join(phaseDir, "repository-after.json"), "utf8"),
      fs.readFileSync(path.join(phaseDir, "excluded-roots-after.json"), "utf8"),
      fs.readFileSync(path.join(phaseDir, "git-config-after.json"), "utf8"),
    ].join("\n");
    const regrade = spawnSync(process.execPath, [
      "evals/run.mjs",
      "setup-repository-basic",
      "--grade",
      runDir,
    ], { cwd: repoRoot, encoding: "utf8", env });

    // Then
    assert.equal(live.status, 1);
    assert.match(live.stdout, /repository: excluded root \.git changed paths: \.git/);
    assert.equal(retainedConfig, null);
    assert.equal(retainedRoots[".git"][".git"].kind, "symlink");
    assert.equal("bytes" in retainedRoots[".git"][".git"], false);
    assert.equal(retainedText.includes("host-private-config"), false);
    assert.equal(regrade.status, 1);
    assert.match(regrade.stdout, /repository: excluded root \.git changed paths: \.git/);
    assert.doesNotMatch(`${live.stderr}\n${regrade.stderr}`, /ENOTDIR|not a directory/);
  } finally {
    if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("terminal capture retains only a digest for regular Git config files", () => {
  // Given
  const sentinel = "https://user:credential-sentinel@example.invalid/repository.git";
  const encodedSentinel = Buffer.from(sentinel).toString("base64");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-git-config-digest-runner-"));
  const resultsRoot = path.join(temp, "results");
  const bin = path.join(temp, "bin");
  fs.mkdirSync(bin);
  const omp = path.join(bin, "omp");
  fs.writeFileSync(omp, [
    "#!/bin/sh",
    `git config remote.origin.url ${JSON.stringify(sentinel)}`,
    'printf "Git config mutation attempted\\n"',
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
    const before = JSON.parse(fs.readFileSync(path.join(phaseDir, "git-config-before.json"), "utf8"));
    const afterSnapshot = JSON.parse(fs.readFileSync(path.join(phaseDir, "git-config-after.json"), "utf8"));
    const retained = [
      fs.readFileSync(path.join(phaseDir, "git-config-before.json"), "utf8"),
      fs.readFileSync(path.join(phaseDir, "git-config-after.json"), "utf8"),
    ].join("\n");
    const report = JSON.parse(fs.readFileSync(path.join(runDir, "setup-repository-basic", "report.json"), "utf8"));
    fixtureRepo = report.repo;
    const regrade = spawnSync(process.execPath, [
      "evals/run.mjs",
      "setup-repository-basic",
      "--grade",
      runDir,
    ], { cwd: repoRoot, encoding: "utf8", env });

    // Then
    assert.equal(live.status, 1);
    assert.match(live.stdout, /repository: local Git configuration changed/);
    assert.deepEqual(Object.keys(before).sort(), ["kind", "mode", "sha256"]);
    assert.deepEqual(Object.keys(afterSnapshot).sort(), ["kind", "mode", "sha256"]);
    assert.notEqual(before.sha256, afterSnapshot.sha256);
    assert.equal(retained.includes(sentinel), false);
    assert.equal(retained.includes(encodedSentinel), false);
    assert.equal(regrade.status, 1);
    assert.match(regrade.stdout, /repository: local Git configuration changed/);
  } finally {
    if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
