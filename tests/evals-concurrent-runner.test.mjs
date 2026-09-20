import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenario = "setup-repository-basic";

function runEval(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["evals/run.mjs", scenario, ...args], {
      cwd: repoRoot,
      env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function waitForFile(file) {
  if (fs.existsSync(file)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.close();
      reject(new Error(`timed out waiting for ${file}`));
    }, 5_000);
    const watcher = fs.watch(path.dirname(file), () => {
      if (!fs.existsSync(file)) return;
      clearTimeout(timeout);
      watcher.close();
      resolve();
    });
  });
}

test("concurrent evals reserve independent runs under one results root", async () => {
  // Given
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-concurrent-runner-"));
  const resultsRoot = path.join(temp, "results");
  const bin = path.join(temp, "bin");
  fs.mkdirSync(bin);
  const omp = path.join(bin, "omp");
  fs.writeFileSync(omp, "#!/bin/sh\nprintf 'fake eval output\\n'\n");
  fs.chmodSync(omp, 0o755);
  const fixedDate = path.join(temp, "fixed-date.cjs");
  fs.writeFileSync(fixedDate, [
    "const NativeDate = Date;",
    "global.Date = class extends NativeDate {",
    "  constructor(...args) { super(...(args.length ? args : ['2026-09-20T15:12:34.000Z'])); }",
    "  static now() { return NativeDate.now(); }",
    "};",
  ].join("\n"));
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${fixedDate}`.trim(),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    SKILLS_EVAL_RESULTS_ROOT: resultsRoot,
  };
  const fixtureRepos = [];

  try {
    // When
    const liveRuns = await Promise.all([
      runEval(["--keep", "--max-time", "1"], env),
      runEval(["--keep", "--max-time", "1"], env),
    ]);
    const runDirs = fs.readdirSync(resultsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => fs.realpathSync(path.join(resultsRoot, entry.name)))
      .sort();

    // Then
    assert.deepEqual(liveRuns.map(({ status }) => status), [1, 1]);
    assert.equal(runDirs.length, 2);
    assert.notEqual(runDirs[0], runDirs[1]);
    assert.match(path.basename(runDirs[0]), /^20260920-151234(?:-\d+)?$/);
    assert.match(path.basename(runDirs[1]), /^20260920-151234(?:-\d+)?$/);
    assert.notEqual(fs.statSync(path.join(runDirs[0], ".dist")).ino, fs.statSync(path.join(runDirs[1], ".dist")).ino);

    for (const runDir of runDirs) {
      const reportPath = path.join(runDir, scenario, "report.json");
      const summaryPath = path.join(runDir, "summary.json");
      const phaseDir = path.join(runDir, scenario, "1-setup-repository");
      assert.equal(fs.existsSync(path.join(runDir, ".dist", "skills", "setup-repository", "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(phaseDir, "answer.md")), true);
      assert.equal(fs.existsSync(reportPath), true);
      assert.equal(fs.existsSync(summaryPath), true);
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      fixtureRepos.push(report.repo);
      assert.equal(report.ok, false);
      assert.equal(summary.length, 1);
      assert.equal(summary[0].ok, false);

      const regrade = await runEval(["--grade", runDir], env);
      assert.equal(regrade.status, 1);
      assert.doesNotMatch(`${regrade.stdout}\n${regrade.stderr}`, /EEXIST|ENOTEMPTY|no run at/);
    }

    const latest = path.join(resultsRoot, "latest");
    assert.equal(fs.lstatSync(latest).isSymbolicLink(), true);
    const latestRun = fs.realpathSync(latest);
    assert.equal(runDirs.includes(latestRun), true);
    assert.equal(fs.existsSync(path.join(latestRun, "summary.json")), true);
    assert.equal(fs.existsSync(path.join(latestRun, scenario, "report.json")), true);
    for (const live of liveRuns) assert.doesNotMatch(`${live.stdout}\n${live.stderr}`, /EEXIST|ENOTEMPTY/);
  } finally {
    if (fs.existsSync(resultsRoot)) {
      for (const entry of fs.readdirSync(resultsRoot, { withFileTypes: true })) {
        const reportPath = path.join(resultsRoot, entry.name, scenario, "report.json");
        if (entry.isDirectory() && fs.existsSync(reportPath)) {
          fixtureRepos.push(JSON.parse(fs.readFileSync(reportPath, "utf8")).repo);
        }
      }
    }
    for (const fixtureRepo of new Set(fixtureRepos)) {
      if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true });
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("latest excludes active runs and explicit incomplete grading fails", async () => {
  // Given
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-active-runner-"));
  const resultsRoot = path.join(temp, "results");
  const bin = path.join(temp, "bin");
  const gate = path.join(temp, "release");
  const started = path.join(temp, "started");
  fs.mkdirSync(bin);
  fs.writeFileSync(gate, "release\n");
  const omp = path.join(bin, "omp");
  fs.writeFileSync(omp, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "void (async () => {",
    "fs.writeFileSync(process.env.FAKE_OMP_STARTED, `${process.pid}\\n`);",
    "if (!fs.existsSync(process.env.FAKE_OMP_GATE)) await new Promise((resolve) => {",
    "  const watcher = fs.watch(path.dirname(process.env.FAKE_OMP_GATE), () => {",
    "    if (!fs.existsSync(process.env.FAKE_OMP_GATE)) return;",
    "    watcher.close();",
    "    resolve();",
    "  });",
    "});",
    "console.log('fake eval output');",
    "})();",
  ].join("\n"));
  fs.chmodSync(omp, 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    SKILLS_EVAL_RESULTS_ROOT: resultsRoot,
    FAKE_OMP_GATE: gate,
    FAKE_OMP_STARTED: started,
  };
  const fixtureRepos = [];
  let activeRun;
  let activePromise;

  try {
    try {
      const previous = await runEval(["--keep", "--max-time", "1"], env);
      assert.equal(previous.status, 1);
      const previousRun = fs.realpathSync(path.join(resultsRoot, "latest"));
      fs.rmSync(gate);
      fs.rmSync(started);

      // When
      activePromise = runEval(["--keep", "--max-time", "1"], env);
      await waitForFile(started);
      activeRun = fs.readdirSync(resultsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => fs.realpathSync(path.join(resultsRoot, entry.name)))
        .find((runDir) => runDir !== previousRun);
      assert.ok(activeRun);
      const latestGrade = await runEval(["--grade", "latest"], env);
      const activeGrade = await runEval(["--grade", activeRun], env);

      // Then
      assert.equal(latestGrade.status, 1);
      assert.match(latestGrade.stdout, new RegExp(`re-grading ${previousRun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assert.notEqual(activeGrade.status, 0);
    } finally {
      fs.writeFileSync(gate, "release\n");
      if (activePromise) await activePromise;
    }

    const latestRun = fs.realpathSync(path.join(resultsRoot, "latest"));
    assert.equal(latestRun, activeRun);
    assert.equal(fs.existsSync(path.join(latestRun, "summary.json")), true);
    assert.equal(fs.existsSync(path.join(latestRun, scenario, "report.json")), true);
  } finally {
    if (fs.existsSync(resultsRoot)) {
      for (const entry of fs.readdirSync(resultsRoot, { withFileTypes: true })) {
        const reportPath = path.join(resultsRoot, entry.name, scenario, "report.json");
        if (entry.isDirectory() && fs.existsSync(reportPath)) {
          fixtureRepos.push(JSON.parse(fs.readFileSync(reportPath, "utf8")).repo);
        }
      }
    }
    for (const fixtureRepo of new Set(fixtureRepos)) {
      if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true });
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
