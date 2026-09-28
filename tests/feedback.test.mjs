import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { auditEvalPair, decideFeedback } from "../evals/feedback.mjs";
import { fingerprintDirectory, fingerprintEvalSource, RUNNER_SOURCES } from "../evals/evidence.mjs";
import { metricsForOutput } from "../evals/metrics.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenario = "verify-required-arguments";
const model = "provider/model-a";
const answer = "Ran npm run build -- RUNTIME=node; observed built for node. Read package.json, CI, and README.\n";
const proposal = { rule: "prefer model B for task X", rationale: "targeted evidence", targetScenario: scenario, expectedBehavior: "required runtime build succeeds" };

function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function snapshot(dist) {
  const fixtures = path.join(dist, "fixtures");
  fs.mkdirSync(fixtures, { recursive: true });
  fs.writeFileSync(path.join(fixtures, "case.json"), "{\"value\":1}\n");
  save(path.join(fixtures, "delivery-comparison", "acceptance.json"), { id: "required-runtime", acceptance: ["Build succeeds with RUNTIME=node"] });
  fs.mkdirSync(path.join(dist, "agents"), { recursive: true });
  fs.mkdirSync(path.join(dist, "shared"), { recursive: true });
  fs.writeFileSync(path.join(dist, "agents", "worker.txt"), "retained worker\n");
  fs.writeFileSync(path.join(dist, "shared", "CONVENTIONS.txt"), "retained guidance\n");
  const source = path.join(dist, "eval-sources");
  fs.mkdirSync(path.join(source, "scenarios"), { recursive: true });
  fs.mkdirSync(path.join(source, "runner"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "evals", "scenarios", `${scenario}.mjs`), path.join(source, "scenarios", `${scenario}.mjs`));
  for (const { source: file, snapshot } of RUNNER_SOURCES) {
    const target = path.join(source, "runner", snapshot);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, file), target);
  }
  const fixtureSnapshotRevision = fingerprintDirectory(fixtures);
  return { fixtureSnapshotRevision, sourceRevision: fingerprintEvalSource(dist, scenario, fixtureSnapshotRevision) };
}

function fixtureRepo(root) {
  const repo = path.join(root, "repo");
  fs.mkdirSync(path.join(repo, "dist"), { recursive: true });
  fs.writeFileSync(path.join(repo, "dist", "runtime.txt"), "built for node\n");
  fs.writeFileSync(path.join(repo, "fixture.txt"), "fixture\n");
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "eval@example.invalid");
  git(repo, "config", "user.name", "Eval fixture");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "fixture");
  return { repo, revision: git(repo, "rev-parse", "HEAD") };
}

function ompOutput() {
  return [
    { type: "turn_end", message: { provider: "provider", model: "model-a", usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, cost: { total: 0.03, input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0 } } } },
    { type: "agent_end", isTerminal: true, messages: [{ role: "assistant", content: [{ type: "text", text: answer }] }] },
  ].map((event) => JSON.stringify(event)).join("\n") + "\n";
}

function writeSolo(dir, source, fixture, passed = true) {
  const phase = "1-solo-verification";
  const phaseDir = path.join(dir, phase);
  const stdout = ompOutput();
  const observed = metricsForOutput(stdout, 1000);
  fs.mkdirSync(path.join(phaseDir, "task"), { recursive: true });
  fs.writeFileSync(path.join(phaseDir, "omp.jsonl"), stdout);
  fs.writeFileSync(path.join(phaseDir, "answer.md"), answer);
  fs.writeFileSync(path.join(phaseDir, "task", "task.md"), "Verify runtime argument.\n");
  fs.writeFileSync(path.join(phaseDir, "runtime.txt"), "built for node\n");
  const problems = passed ? [] : ["omp exited 1"];
  const run = {
    name: scenario, kind: "solo", executionId: crypto.randomUUID(), ok: passed,
    ompExitCode: passed ? 0 : 1, actualModel: model,
    fixtureRevision: fixture.revision, fixtureVersion: source.fixtureSnapshotRevision,
    fixtureSnapshotRevision: source.fixtureSnapshotRevision, sourceRevision: source.sourceRevision,
    model, repo: fixture.repo, rawOutput: dir,
    metrics: observed,
    phases: [{ phase, exitCode: passed ? 0 : 1, wall_ms: 1000, tokens: observed.tokens, cost: observed.cost,
      cost_basis: observed.cost_basis, cost_source: observed.cost_source, coverage: observed.coverage, ok: passed, problems }],
    problems,
  };
  save(path.join(dir, "comparison-run.json"), run);
  return run;
}

function writeCohort(root, side, passed = 10) {
  const dir = path.join(root, side);
  const source = snapshot(path.join(dir, ".dist"));
  const fixture = fixtureRepo(path.join(dir, "fixture"));
  const sampleRuns = Array.from({ length: 10 }, (_, index) => {
    const name = `sample-${String(index + 1).padStart(2, "0")}`;
    writeSolo(path.join(dir, name), source, fixture, index < passed);
    return name;
  });
  const cohort = { name: scenario, rawOutput: dir, sampleRuns, sampleCount: sampleRuns.length,
    ok: passed === 10, model, actualModel: model, fixtureRevision: fixture.revision,
    fixtureVersion: source.fixtureSnapshotRevision, fixtureSnapshotRevision: source.fixtureSnapshotRevision, sourceRevision: source.sourceRevision };
  save(path.join(dir, "comparison-run.json"), cohort);
  return cohort;
}

function withPair(action, beforePassed = 10, afterPassed = 10) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "feedback-retained-")));
  try { return action(writeCohort(root, "before", beforePassed), writeCohort(root, "after", afterPassed), root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function sample(cohort, index = 0) {
  return path.join(cohort.rawOutput, cohort.sampleRuns[index], "comparison-run.json");
}

function editSample(cohort, action, index = 0) {
  const file = sample(cohort, index);
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  action(run);
  save(file, run);
}

test("matched independent retained outcomes support descriptive quality, never billed savings", () => {
  withPair((before, after) => {
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, true, audit.problems.join("; "));
    assert.equal(audit.qualityEvidence.sampleCount, 10);
    assert.equal(audit.qualityEvidence.before.rate, 0.4);
    assert.equal(audit.qualityEvidence.after.rate, 0.8);
    assert.equal(audit.qualityEvidence.rateDelta, 0.4);
    assert.equal(audit.estimatedCostEvidence.basis, "model_rate_estimate_usd");
    assert.equal(audit.savingsClaimsAllowed, false);
    assert.equal(audit.costEvidence, null);
  }, 4, 8);
});

test("caller metadata, missing samples, and reused execution identities cannot mint cohorts", () => {
  withPair((before, after) => {
    const fakeCount = { ...after, sampleCount: 9000, sampleRuns: after.sampleRuns.slice(0, 9) };
    save(path.join(after.rawOutput, "comparison-run.json"), fakeCount);
    assert.equal(auditEvalPair(before, fakeCount).qualityClaimsAllowed, false);
  });
  withPair((before, after) => {
    fs.rmSync(sample(after, 0));
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("sample run manifest missing")));
  });
  withPair((before, after) => {
    const first = JSON.parse(fs.readFileSync(sample(after), "utf8"));
    editSample(after, (run) => { run.executionId = first.executionId; }, 1);
    assert.ok(auditEvalPair(before, after).problems.some((problem) => problem.includes("repeated runner execution identity")));
  });
});

test("fixture, scenario, runner, and transitive grader source must remain pinned", () => {
  for (const relative of ["fixtures/case.json", `eval-sources/scenarios/${scenario}.mjs`,
    "eval-sources/runner/acme-chain.mjs", "eval-sources/runner/scripts/check-commits.mjs"]) {
    withPair((before, after) => {
      fs.appendFileSync(path.join(after.rawOutput, ".dist", relative), "tampered\n");
      const audit = auditEvalPair(before, after);
      assert.equal(audit.qualityClaimsAllowed, false, relative);
      assert.ok(audit.problems.some((problem) => problem.includes("pinned") || problem.includes("fingerprint")), relative);
    });
  }
});


test("a self-consistent old grader snapshot cannot be regraded with changed current code", () => {
  withPair((before, after) => {
    const dist = path.join(after.rawOutput, ".dist");
    fs.appendFileSync(path.join(dist, "eval-sources", "runner", "scripts", "check-commits.mjs"), "\n// prior grading rule\n");
    const revision = fingerprintEvalSource(dist, scenario, after.fixtureSnapshotRevision);
    for (let index = 0; index < after.sampleRuns.length; index++) {
      editSample(after, (run) => { run.sourceRevision = revision; }, index);
    }
    after.sourceRevision = revision;
    save(path.join(after.rawOutput, "comparison-run.json"), after);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("pinned runner source scripts/check-commits.mjs differs")));
  });
});
test("raw OMP usage, independently regraded outcome, and runtime proof bind each sample", () => {
  withPair((before, after) => {
    editSample(after, (run) => { run.metrics.coverage.turns = 9000; });
    assert.ok(auditEvalPair(before, after).problems.some((problem) => problem.includes("aggregate usage coverage")));
  });
  withPair((before, after) => {
    editSample(after, (run) => { run.ok = false; run.phases[0].ok = false; run.problems = ["forged failure"]; run.phases[0].problems = ["forged failure"]; });
    assert.ok(auditEvalPair(before, after).problems.some((problem) => problem.includes("independent retained-output grading")));
  });
  withPair((before, after) => {
    fs.rmSync(path.join(path.dirname(sample(after)), "1-solo-verification", "omp.jsonl"));
    assert.ok(auditEvalPair(before, after).problems.some((problem) => problem.includes("raw OMP output")));
  });
});

test("feedback is pending human review only with an independently retained passing grade", () => {
  withPair((before, after) => {
    const grading = { status: "passed", targetScenario: scenario, expectedBehavior: proposal.expectedBehavior, evidence: [sample(after)] };
    const result = decideFeedback({ before, after, proposal, grading, approval: { decision: "approved", actor: "caller" } });
    assert.equal(result.disposition, "pending-human-review", result.problems?.join("; "));
    assert.equal(result.applied, false);
    const held = decideFeedback({ before, after, proposal, grading: { ...grading, evidence: [] } });
    assert.equal(held.disposition, "held");
  });
});

test("unsupported evidence cohorts reject before creating results or launching paid OMP", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-no-paid-cohort-"));
  try {
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const marker = path.join(root, "omp-invoked");
    const omp = path.join(bin, "omp");
    fs.writeFileSync(omp, `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(marker)}, "invoked");\nprocess.exit(1);\n`);
    fs.chmodSync(omp, 0o755);
    const result = spawnSync(process.execPath, [path.join(repoRoot, "evals", "run.mjs"), "--samples", "2", "iterate-evidence-zero-limit"],
      { cwd: repoRoot, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, SKILLS_EVAL_RESULTS_ROOT: path.join(root, "results") }, encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /not supported for evidence scenarios/);
    assert.equal(fs.existsSync(path.join(root, "results")), false);
    assert.equal(fs.existsSync(marker), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("solo recorder retains the initial HEAD, final HEAD proof, and fixture snapshot without a paid run", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-solo-recorder-"));
  try {
    const deliveryRoot = path.join(root, "delivery");
    const output = path.join(deliveryRoot, scenario);
    const source = snapshot(path.join(deliveryRoot, ".dist"));
    const fixture = fixtureRepo(path.join(root, "fixture"));
    const delivery = {
      name: scenario, repo: fixture.repo, rawOutput: output, model, fixtureRevision: fixture.revision,
      fixtureVersion: source.fixtureSnapshotRevision, fixtureSnapshotRevision: source.fixtureSnapshotRevision,
      sourceRevision: source.sourceRevision,
    };
    save(path.join(output, "comparison-run.json"), delivery);
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const omp = path.join(bin, "omp");
    fs.writeFileSync(omp, `#!/usr/bin/env node
const fs = require("node:fs");
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/runtime.txt", "built for node\\n");
process.stdout.write(${JSON.stringify(ompOutput())});
`);
    fs.chmodSync(omp, 0o755);
    const soloDir = path.join(root, "solo");
    const result = spawnSync(process.execPath, [path.join(repoRoot, "evals", "record-solo.mjs"), "--delivery", output, "--out", soloDir, "--model", model],
      { cwd: repoRoot, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const solo = JSON.parse(fs.readFileSync(path.join(soloDir, "comparison-run.json"), "utf8"));
    assert.equal(solo.ok, true, solo.problems?.join("; "));
    assert.equal(solo.fixtureRevision, fixture.revision);
    assert.equal(solo.fixtureSnapshotRevision, source.fixtureSnapshotRevision);
    assert.equal(git(solo.repo, "rev-parse", "HEAD"), fixture.revision);
    assert.equal(git(solo.repo, "diff", "--name-only", fixture.revision), "");
    assert.ok(fs.existsSync(path.join(soloDir, "1-solo-verification", "omp.jsonl")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
