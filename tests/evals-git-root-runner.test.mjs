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
