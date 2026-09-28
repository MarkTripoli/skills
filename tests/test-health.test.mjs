import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildReport, classifyChangedFiles, classifyMutationOutcome, coverage, parseLcov, readLcov } from "../skills/delivery/test-health/scripts/test-health.mjs";

const fixture = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./fixtures/test-health.json", import.meta.url)), "utf8"));

test("LCOV reports uncovered changed branches and resolves absolute in-root source paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-health-root-"));
  try {
    const report = parseLcov(`SF:${path.join(root, "src/changed.py")}\nDA:10,1\nDA:11,0\nBRDA:11,0,1,0\nBRDA:12,0,0,-\nend_of_record\n`, root);
    const result = coverage(report, ["src/changed.py"]);
    assert.equal(result.percent, 50);
    assert.deepEqual(result.uncoveredBranches, [{ file: "src/changed.py", branch: "11:0:1" }, { file: "src/changed.py", branch: "12:0:0" }]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("malformed counters and out-of-root paths cannot produce available coverage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-health-root-"));
  try {
    const malformed = parseLcov("SF:src/changed.py\nDA:10,garbage\nBRDA:11,0,1,wat\nend_of_record\n", root);
    assert.equal(coverage(malformed, ["src/changed.py"]).status, "incomplete");
    const outside = parseLcov("SF:../outside.py\nDA:1,1\nend_of_record\n", root);
    assert.equal(coverage(outside, ["src/changed.py"]).status, "incomplete");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("LCOV requires decimal nonempty counters and a terminating record marker", () => {
  for (const input of Object.values(fixture.invalid_lcov)) {
    const parsed = parseLcov(input);
    assert.equal(coverage(parsed, ["src/changed.py"]).status, "incomplete");
    assert.ok(parsed.invalid.length > 0);
  }
});

test("duplicate source records invalidate coverage rather than replacing prior counters", () => {
  const parsed = parseLcov("SF:src/changed.py\nDA:1,0\nend_of_record\nSF:src/changed.py\nDA:2,1\nend_of_record\n");
  assert.equal(coverage(parsed, ["src/changed.py"]).status, "incomplete");
});

test("duplicate DA and BRDA identities fail closed despite matching LCOV summaries", () => {
  const parsed = parseLcov("SF:src/changed.py\nDA:1,0\nDA:1,1\nLF:1\nLH:1\nBRDA:1,0,0,0\nBRDA:1,0,0,1\nBRF:1\nBRH:1\nend_of_record\n");
  const result = coverage(parsed, ["src/changed.py"]);
  assert.equal(result.status, "incomplete");
  assert.equal(result.percent, null);
  assert.deepEqual(parsed.invalid.map(({ reason }) => reason), ["duplicate DA counter", "duplicate BRDA counter", "LCOV summary counters disagree with detailed counters"]);
  const duplicate = parseLcov("SF:src/changed.py\nDA:1,0\nDA:1,0\nBRDA:1,0,0,-\nBRDA:1,0,0,-\nLF:1\nLH:0\nBRF:1\nBRH:0\nend_of_record\n");
  assert.equal(coverage(duplicate, ["src/changed.py"]).status, "incomplete");
  assert.deepEqual(duplicate.invalid.map(({ reason }) => reason), ["duplicate DA counter", "duplicate BRDA counter"]);
});

test("renamed paths map baseline coverage from old path to new path", () => {
  const changed = classifyChangedFiles("R100\told.py\tnew.py\n");
  assert.deepEqual(changed, { files: ["new.py"], deleted: [], renamed: [{ from: "old.py", to: "new.py" }] });
  const baseline = coverage(parseLcov("SF:old.py\nDA:1,1\nend_of_record\n"), changed.files, new Map(changed.renamed.map(({ from, to }) => [to, from])));
  const current = coverage(parseLcov("SF:new.py\nDA:1,0\nend_of_record\n"), changed.files);
  assert.equal(baseline.percent, 100);
  assert.equal(current.percent, 0);
});

test("absent coverage and missing changed files cannot become green percentages", () => {
  assert.deepEqual(coverage(null, ["src/changed.py"]), { ...fixture.coverage_unknown, uncoveredBranches: [] });
  const present = parseLcov("SF:src/other.py\nDA:1,1\nend_of_record\n");
  const missing = coverage(present, ["src/changed.py"]);
  assert.equal(missing.status, fixture.coverage_false_green.status);
  assert.equal(missing.percent, null);
});

test("mutation no-tests, timeout, and killed runs are not survivors", () => {
  assert.deepEqual(classifyMutationOutcome({ exitCode: 0, stdout: fixture.mutation_outcomes.no_tests }), { status: "incomplete", outcome: "no-tests", survivors: [] });
  assert.equal(classifyMutationOutcome({ timedOut: true }).outcome, fixture.mutation_outcomes.timeout);
  assert.equal(classifyMutationOutcome({ signal: "SIGKILL" }).outcome, fixture.mutation_outcomes.killed);
  assert.deepEqual(classifyMutationOutcome({ exitCode: 0 }).survivors, []);
});

test("deleted paths are not current coverage or mutation candidates", () => {
  const changed = classifyChangedFiles("M\tsrc/current.py\nD\tsrc/deleted.py\n");
  assert.deepEqual(changed, { files: ["src/current.py"], deleted: ["src/deleted.py"], renamed: [] });
  const measured = coverage(parseLcov("SF:src/current.py\nDA:1,1\nend_of_record\n"), changed.files);
  assert.equal(measured.status, "available");
  assert.equal(changed.files.includes("src/deleted.py"), false);
});

test("invalid base with valid LCOV yields incomplete report rather than rename-map error", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-health-invalid-base-"));
  try {
    const coveragePath = path.join(root, "coverage.info");
    fs.writeFileSync(coveragePath, "SF:src/changed.py\nDA:1,1\nend_of_record\n");
    const report = buildReport({ root, base: "missing-base", coveragePath });
    assert.equal(report.coverage.status, "incomplete");
    assert.equal(report.coverage.reason, "could not read changed-file list");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("coverage directories return incomplete evidence, including with an invalid base", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-health-directory-"));
  try {
    const directory = path.join(root, "coverage");
    fs.mkdirSync(directory);
    assert.equal(coverage(readLcov(directory, root), ["src/changed.py"]).status, "incomplete");
    const report = buildReport({ root, base: "missing-base", coveragePath: directory, baselineCoveragePath: directory });
    assert.equal(report.coverage.status, "incomplete");
    assert.equal(report.coverage.current.status, "incomplete");
    assert.equal(report.coverage.baseline.status, "incomplete");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("only fresh independent executions on pinned source revisions yield measured deltas", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-health-lineage-"));
  const baselineRoot = fs.mkdtempSync(path.join(os.tmpdir(), "test-health-baseline-"));
  const runGit = (cwd, ...args) => {
    const result = spawnSync("git", args, {
      cwd, encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.org", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.org" }
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const lcovCommand = (source, hits) => [process.execPath, "-e",
    `require("node:fs").writeFileSync(process.env.TEST_HEALTH_LCOV_PATH, "SF:${source}\\nDA:1,${hits}\\nend_of_record\\n")`];
  try {
    runGit(root, "init", "-q");
    fs.writeFileSync(path.join(root, "old.py"), "def example():\n    return 1\n\nprint(example())\n");
    runGit(root, "add", "old.py");
    runGit(root, "commit", "-qm", "baseline");
    const base = runGit(root, "rev-parse", "HEAD");
    runGit(root, "mv", "old.py", "new.py");
    runGit(root, "commit", "-qm", "rename");
    runGit(root, "worktree", "add", "--detach", baselineRoot, base);
    const coveragePath = path.join(root, "current.info");
    const baselineCoveragePath = path.join(baselineRoot, "baseline.info");
    const unverified = buildReport({ root, base, coveragePath, baselineCoveragePath });
    assert.equal(unverified.coverage.current.percent, null);
    assert.equal(unverified.coverage.delta_percentage_points, null);
    fs.writeFileSync(coveragePath, "SF:new.py\nDA:1,1\nend_of_record\n");
    fs.writeFileSync(baselineCoveragePath, "SF:old.py\nDA:1,1\nend_of_record\n");
    const stale = buildReport({ root, base, coveragePath, baselineCoveragePath });
    assert.equal(stale.coverage.current.status, "unknown");
    assert.equal(stale.coverage.baseline.status, "unknown");
    assert.equal(stale.coverage.delta_percentage_points, null);
    const reused = buildReport({ root, base, coveragePath, baselineCoveragePath: coveragePath });
    assert.equal(reused.coverage.delta_percentage_points, null);
    const refused = buildReport({ root, base, coveragePath, currentCommand: lcovCommand("new.py", 0) });
    assert.equal(refused.coverage.current.status, "incomplete");
    fs.rmSync(coveragePath);
    fs.rmSync(baselineCoveragePath);
    const report = buildReport({
      root, base, baselineRoot, coveragePath, baselineCoveragePath,
      currentCommand: lcovCommand("new.py", 0), baselineCommand: lcovCommand("old.py", 1)
    });
    assert.deepEqual(report.renamed_files, [{ from: "old.py", to: "new.py" }]);
    assert.equal(report.coverage.current.percent, 0);
    assert.equal(report.coverage.baseline.percent, 100);
    assert.equal(report.coverage.delta_percentage_points, -100);
    assert.equal(report.coverage.provenance.current_run.revision, report.revision);
    assert.equal(report.coverage.provenance.baseline_run.revision, base);
    const mismatch = buildReport({
      root, base, baselineRoot: root, coveragePath: path.join(root, "again.info"),
      baselineCoveragePath: path.join(root, "other.info"), baselineCommand: lcovCommand("old.py", 1)
    });
    assert.equal(mismatch.coverage.baseline.status, "incomplete");
    assert.equal(mismatch.coverage.delta_percentage_points, null);
  } finally {
    runGit(root, "worktree", "remove", "--force", baselineRoot);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(baselineRoot, { recursive: true, force: true });
  }
});
