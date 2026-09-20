import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("eval runner isolates fixture and OMP Git operations from inherited environment", () => {
  // Given
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-runner-git-environment-"));
  const resultsRoot = path.join(temp, "results");
  const bin = path.join(temp, "bin");
  const external = path.join(temp, "external");
  const ompRoot = path.join(temp, "omp-root");
  const monitorMarker = path.join(temp, "fsmonitor-ran");
  fs.mkdirSync(bin);
  fs.mkdirSync(external);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: external });
  fs.writeFileSync(path.join(external, "README.md"), "external\n");
  execFileSync("git", ["add", "README.md"], { cwd: external });
  const monitor = path.join(temp, "fsmonitor.sh");
  fs.writeFileSync(monitor, `#!/bin/sh\nprintf ran > ${JSON.stringify(monitorMarker)}\nprintf '0\\n'\n`);
  fs.chmodSync(monitor, 0o755);
  const omp = path.join(bin, "omp");
  fs.writeFileSync(omp, `#!/bin/sh\ngit rev-parse --show-toplevel > ${JSON.stringify(ompRoot)}\nprintf 'fake eval output\\n'\n`);
  fs.chmodSync(omp, 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    SKILLS_EVAL_RESULTS_ROOT: resultsRoot,
    GIT_DIR: path.join(external, ".git"),
    GIT_WORK_TREE: external,
    GIT_INDEX_FILE: path.join(external, ".git", "index"),
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: monitor,
  };
  let fixtureRepo = null;

  try {
    // When
    const run = spawnSync(process.execPath, [
      "evals/run.mjs",
      "setup-repository-basic",
      "--keep",
      "--max-time",
      "1",
    ], { cwd: repoRoot, encoding: "utf8", env });

    // Then
    assert.equal(fs.existsSync(path.join(resultsRoot, "latest")), true, run.stderr || run.stdout);
    const runDir = fs.realpathSync(path.join(resultsRoot, "latest"));
    const report = JSON.parse(fs.readFileSync(path.join(runDir, "setup-repository-basic", "report.json"), "utf8"));
    fixtureRepo = report.repo;
    assert.equal(fs.realpathSync(fs.readFileSync(ompRoot, "utf8").trim()), fs.realpathSync(fixtureRepo));
    assert.equal(fs.existsSync(monitorMarker), false);
    assert.equal(spawnSync("git", ["config", "--local", "--get", "user.email"], { cwd: external }).status, 1);
  } finally {
    if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
