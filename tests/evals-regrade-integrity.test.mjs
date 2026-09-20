import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const basicScenario = "setup-repository-basic";
const blockedScenario = "setup-repository-unresolved";
const readErrorsScenario = "setup-repository-read-errors";

function runEval(scenarios, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["evals/run.mjs", ...scenarios, ...args], {
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

function createHarness(prefix) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const resultsRoot = path.join(temp, "results");
  const bin = path.join(temp, "bin");
  const gate = path.join(temp, "release");
  const blockedStarted = path.join(temp, "blocked-started");
  fs.mkdirSync(bin);
  const omp = path.join(bin, "omp");
  fs.writeFileSync(omp, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "void (async () => {",
    `if (process.cwd().includes(${JSON.stringify(blockedScenario)})) {`,
    "  fs.writeFileSync(process.env.FAKE_BLOCKED_STARTED, 'started\\n');",
    "  if (!fs.existsSync(process.env.FAKE_OMP_GATE)) await new Promise((resolve) => {",
    "    const watcher = fs.watch(path.dirname(process.env.FAKE_OMP_GATE), () => {",
    "      if (!fs.existsSync(process.env.FAKE_OMP_GATE)) return;",
    "      watcher.close();",
    "      resolve();",
    "    });",
    "  });",
    "  console.log('blocked scenario released');",
    "  process.exitCode = Number(process.env.FAKE_OMP_EXIT ?? '0');",
    "  return;",
    "}",
    "const metadata = 'ai-utilities.json';",
    "if (fs.existsSync(metadata)) {",
    "  console.log('Mode: reconcile\\nObserved state: current\\nConflicts: none\\nWritten: none\\nVerification: unchanged bytes match\\nExternal operations: 0');",
    "  process.exitCode = Number(process.env.FAKE_OMP_EXIT ?? '0');",
    "  return;",
    "}",
    "fs.writeFileSync(metadata, `${JSON.stringify({ vcs: { platform: 'github' }, onboarding: { schemaVersion: 1, profile: 'default', appliedRevision: 1, providers: {} } }, null, 2)}\\n`);",
    "console.log('Mode: reconcile\\nUnresolved choices: ticketing.tool\\nWritten: ai-utilities.json\\nVerification: success\\nExternal operations: 0');",
    "process.exitCode = Number(process.env.FAKE_OMP_EXIT ?? '0');",
    "})();",
  ].join("\n"));
  fs.chmodSync(omp, 0o755);
  return {
    temp,
    resultsRoot,
    gate,
    blockedStarted,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      SKILLS_EVAL_RESULTS_ROOT: resultsRoot,
      FAKE_OMP_GATE: gate,
      FAKE_BLOCKED_STARTED: blockedStarted,
    },
  };
}

function removeFixtureRepositories(resultsRoot) {
  if (!fs.existsSync(resultsRoot)) return;
  for (const entry of fs.readdirSync(resultsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const scenario of [basicScenario, blockedScenario]) {
      const report = path.join(resultsRoot, entry.name, scenario, "report.json");
      if (!fs.existsSync(report)) continue;
      const fixtureRepo = JSON.parse(fs.readFileSync(report, "utf8")).repo;
      if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true });
    }
  }
}

test("explicit regrade rejects a completed scenario selected from an active multi-scenario run", async () => {
  // Given
  const harness = createHarness("skills-active-regrade-");
  let livePromise;
  try {
    // When
    livePromise = runEval([basicScenario, blockedScenario], ["--keep", "--max-time", "1"], harness.env);
    await waitForFile(harness.blockedStarted);
    const runDir = fs.readdirSync(harness.resultsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(harness.resultsRoot, entry.name))[0];
    await waitForFile(path.join(runDir, basicScenario, "report.json"));
    assert.equal(fs.existsSync(path.join(runDir, "summary.json")), false);
    const regrade = await runEval([basicScenario], ["--grade", runDir], harness.env);

    // Then
    assert.notEqual(regrade.status, 0);
  } finally {
    fs.writeFileSync(harness.gate, "release\n");
    if (livePromise) await livePromise;
    removeFixtureRepositories(harness.resultsRoot);
    fs.rmSync(harness.temp, { recursive: true, force: true });
  }
});

test("regrade rejects a completed terminal recording with a required manifest removed", async () => {
  // Given
  const harness = createHarness("skills-damaged-regrade-");
  try {
    const live = await runEval([basicScenario], ["--keep", "--max-time", "1"], harness.env);
    assert.equal(live.status, 0, live.stderr || live.stdout);
    const runDir = fs.realpathSync(path.join(harness.resultsRoot, "latest"));
    const manifest = path.join(runDir, basicScenario, "1-setup-repository", "repository-after.json");
    fs.rmSync(manifest);

    // When
    const regrade = await runEval([basicScenario], ["--grade", runDir], harness.env);

    // Then
    assert.notEqual(regrade.status, 0);
    assert.match(regrade.stdout, /incomplete/i);
  } finally {
    removeFixtureRepositories(harness.resultsRoot);
    fs.rmSync(harness.temp, { recursive: true, force: true });
  }
});

test("live and retained grading preserve a nonzero OMP exit", async () => {
  // Given
  const harness = createHarness("skills-exit-status-regrade-");
  const env = { ...harness.env, FAKE_OMP_EXIT: "7" };
  try {
    // When
    const live = await runEval([basicScenario], ["--keep", "--max-time", "1"], env);
    const runDir = fs.realpathSync(path.join(harness.resultsRoot, "latest"));
    const regrade = await runEval([basicScenario], ["--grade", runDir], env);

    // Then
    assert.equal(live.status, 1);
    assert.match(live.stdout, /omp exited 7/);
    assert.equal(regrade.status, 1);
    assert.match(regrade.stdout, /omp exited 7/);
  } finally {
    removeFixtureRepositories(harness.resultsRoot);
    fs.rmSync(harness.temp, { recursive: true, force: true });
  }
});

test("live and retained grading complete with unreadable regular-file evidence", async () => {
  // Given
  const harness = createHarness("skills-read-errors-regrade-");
  try {
    // When
    const live = await runEval([readErrorsScenario], ["--keep", "--max-time", "1"], harness.env);
    assert.equal(live.status, 0, live.stderr || live.stdout);
    const runDir = fs.realpathSync(path.join(harness.resultsRoot, "latest"));
    const regrade = await runEval([readErrorsScenario], ["--grade", runDir], harness.env);

    // Then
    assert.equal(regrade.status, 0, regrade.stderr || regrade.stdout);
    assert.equal(fs.existsSync(path.join(runDir, "summary.json")), true);
    for (const phase of ["1-setup-repository", "2-setup-repository"]) {
      assert.equal(fs.existsSync(path.join(runDir, readErrorsScenario, phase, "answer.md")), true);
      assert.equal(fs.existsSync(path.join(runDir, readErrorsScenario, phase, "exit-status.json")), true);
    }
    assert.equal(fs.existsSync(path.join(runDir, readErrorsScenario, "report.json")), true);
  } finally {
    removeFixtureRepositories(harness.resultsRoot);
    fs.rmSync(harness.temp, { recursive: true, force: true });
  }
});

test("regrade rejects every malformed retained manifest shape even when before and after match", async (t) => {
  // Given
  const harness = createHarness("skills-manifest-schema-regrade-");
  try {
    const live = await runEval([basicScenario], ["--keep", "--max-time", "1"], harness.env);
    assert.equal(live.status, 0, live.stderr || live.stdout);
    const runDir = fs.realpathSync(path.join(harness.resultsRoot, "latest"));
    const phaseDir = path.join(runDir, basicScenario, "1-setup-repository");
    const cases = [
      {
        name: "repository path ownership",
        files: ["repository-before.json", "repository-after.json"],
        mutate(value) {
          return { ...value, "../outside": { kind: "directory", mode: "0755" } };
        },
      },
      {
        name: "excluded-root bucket ownership",
        files: ["excluded-roots-before.json", "excluded-roots-after.json"],
        mutate(value) {
          return {
            ...value,
            ".agents": { ...value[".agents"], "README.md": { kind: "directory", mode: "0755" } },
          };
        },
      },
      {
        name: "repository payload digest",
        files: ["repository-before.json", "repository-after.json"],
        mutate(value) {
          const [file, entry] = Object.entries(value).find(([, record]) => record.kind === "file");
          return { ...value, [file]: { ...entry, sha256: "0".repeat(64) } };
        },
      },
      {
        name: "repository raw read error",
        files: ["repository-before.json", "repository-after.json"],
        mutate(value) {
          return {
            ...value,
            "unreadable.txt": {
              kind: "file-error",
              mode: "0000",
              operation: "read-file",
              errorClass: "permission-denied",
              sha256: null,
              message: "private raw failure",
            },
          };
        },
      },
      {
        name: "repository",
        files: ["repository-before.json", "repository-after.json"],
        mutate(value) {
          return { ...value, "malformed-record": { kind: "unknown" } };
        },
      },
      {
        name: "excluded roots",
        files: ["excluded-roots-before.json", "excluded-roots-after.json"],
        mutate(value) {
          return {
            ...value,
            ".agents": { ...value[".agents"], ".agents/malformed": { kind: "unknown" } },
          };
        },
      },
      {
        name: "Git config",
        files: ["git-config-before.json", "git-config-after.json"],
        mutate() {
          return { kind: "file", sha256: "0".repeat(64), bytes: "c2VjcmV0" };
        },
      },
      {
        name: "Git index",
        files: ["git-index-before.json", "git-index-after.json"],
        mutate() {
          return {};
        },
      },
    ];

    for (const manifestCase of cases) {
      await t.test(manifestCase.name, async () => {
        const originals = manifestCase.files.map((file) => fs.readFileSync(path.join(phaseDir, file), "utf8"));
        try {
          for (const [index, file] of manifestCase.files.entries()) {
            const parsed = JSON.parse(originals[index]);
            fs.writeFileSync(path.join(phaseDir, file), `${JSON.stringify(manifestCase.mutate(parsed), null, 2)}\n`);
          }

          // When
          const regrade = await runEval([basicScenario], ["--grade", runDir], harness.env);

          // Then
          assert.equal(regrade.status, 1);
          assert.match(regrade.stdout, /manifest|recording/i);
        } finally {
          for (const [index, file] of manifestCase.files.entries()) {
            fs.writeFileSync(path.join(phaseDir, file), originals[index]);
          }
        }
      });
    }
  } finally {
    removeFixtureRepositories(harness.resultsRoot);
    fs.rmSync(harness.temp, { recursive: true, force: true });
  }
});
