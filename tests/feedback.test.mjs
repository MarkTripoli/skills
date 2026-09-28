import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditEvalPair, decideFeedback } from "../evals/feedback.mjs";
import { fingerprintDirectory, fingerprintEvalSource } from "../evals/evidence.mjs";

const fixtureRevision = "a".repeat(40);
const model = "provider/model-a";
const proposal = { rule: "prefer model B for task X", rationale: "targeted evidence", targetScenario: "counter-evidence", expectedBehavior: "increment reaches 1" };

function writeFixtureSnapshot(root, scenario = "counter-evidence") {
  const dist = path.join(root, ".dist");
  const fixtureDir = path.join(dist, "fixtures");
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, "case.json"), "{\"value\":1}\n");
  const agentsDir = path.join(dist, "agents");
  const sharedDir = path.join(dist, "shared");
  const scenarioDir = path.join(dist, "eval-sources", "scenarios");
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.mkdirSync(scenarioDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, "worker.md"), "synthetic retained worker source\n");
  fs.writeFileSync(path.join(sharedDir, "CONVENTIONS.md"), "synthetic retained shared guidance\n");
  fs.writeFileSync(path.join(scenarioDir, `${scenario}.mjs`), `export default { slug: ${JSON.stringify(scenario)} };\n`);
  return { fixtureSnapshotRevision: fingerprintDirectory(fixtureDir), sourceRevision: fingerprintEvalSource(dist, scenario) };
}

function writeRun(root, side, { name = "counter-evidence", count = 10, passed = count, overrides = {} } = {}) {
  const runRoot = path.join(root, side);
  const rawOutput = path.join(runRoot, name);
  const { fixtureSnapshotRevision, sourceRevision } = writeFixtureSnapshot(runRoot, name);
  fs.mkdirSync(rawOutput, { recursive: true });
  const phases = [];
  const costPerPhase = { total: 0.03, input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0 };
  for (let index = 0; index < count; index++) {
    const phase = `${index + 1}-sample`;
    const phaseDir = path.join(rawOutput, phase);
    fs.mkdirSync(path.join(phaseDir, "task"), { recursive: true });
    fs.writeFileSync(path.join(phaseDir, "answer.md"), `Sample ${index + 1} evaluated.\n`);
    fs.writeFileSync(path.join(phaseDir, "task", "task.md"), `Sample ${index + 1} task.\n`);
    const ok = index < passed;
    phases.push({
      phase,
      ok,
      problems: ok ? [] : [`sample ${index + 1} failed its retained grade`],
      coverage: { complete: true, turns: 1, usage_events: 1, cost_events: 1, models: [model] },
      cost: costPerPhase,
      cost_basis: "model_rate_estimate_usd",
      cost_source: "omp.turn_end.message.usage.cost (local model rate table)",
    });
  }
  const run = {
    name,
    ok: passed === count,
    model,
    fixtureRevision,
    fixtureVersion: fixtureSnapshotRevision,
    sourceRevision,
    fixtureSnapshotRevision,
    rawOutput,
    sampleCount: 9000,
    phases,
    metrics: {
      cost: { total: count * costPerPhase.total },
      cost_basis: "caller-claimed provider_billed_usd",
      coverage: { complete: true, turns: count, usage_events: count, cost_events: count, models: [model] },
    },
    ...overrides,
  };
  fs.writeFileSync(path.join(rawOutput, "comparison-run.json"), `${JSON.stringify(run, null, 2)}\n`);
  return JSON.parse(JSON.stringify(run));
}

function retainedGrade(root, overrides = {}) {
  const gradeRoot = path.join(root, "grade");
  const output = path.join(gradeRoot, proposal.targetScenario);
  const { fixtureSnapshotRevision, sourceRevision } = writeFixtureSnapshot(gradeRoot, proposal.targetScenario);
  const phase = "1-targeted-grade";
  const phaseDir = path.join(output, phase);
  fs.mkdirSync(path.join(phaseDir, "task"), { recursive: true });
  fs.writeFileSync(path.join(phaseDir, "answer.md"), "Observed increment reached 1.\n");
  fs.writeFileSync(path.join(phaseDir, "task", "task.md"), "Verify the proposal outcome.\n");
  const coverage = { complete: true, turns: 1, usage_events: 1, cost_events: 1, models: [model] };
  const run = {
    name: proposal.targetScenario,
    ok: true,
    model,
    fixtureRevision,
    fixtureVersion: fixtureSnapshotRevision,
    sourceRevision,
    fixtureSnapshotRevision,
    rawOutput: output,
    phases: [{ phase, ok: true, problems: [], coverage, cost: { total: 0.03, input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0 },
      cost_basis: "model_rate_estimate_usd", cost_source: "omp.turn_end.message.usage.cost (local model rate table)" }],
    metrics: { cost: { total: 0.03 }, coverage: { complete: true, turns: 1, usage_events: 1, cost_events: 1, models: [model] } },
    ...overrides,
  };
  const file = path.join(output, "comparison-run.json");
  fs.writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  return { status: "passed", targetScenario: proposal.targetScenario, expectedBehavior: proposal.expectedBehavior, evidence: [file] };
}

function withPair(action, beforeOptions, afterOptions) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-retained-rows-"));
  try {
    return action(writeRun(root, "before", beforeOptions), writeRun(root, "after", afterOptions), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("fixture, model, and source revisions must bind both retained runs", () => {
  withPair((before, after, root) => {
    const snapshot = path.join(root, "after", ".dist", "fixtures");
    fs.writeFileSync(path.join(snapshot, "case.json"), "{\"value\":2}\n");
    const changedSnapshot = fingerprintDirectory(snapshot);
    const dist = path.join(root, "after", ".dist");
    const changed = { ...after, fixtureVersion: changedSnapshot, fixtureSnapshotRevision: changedSnapshot, sourceRevision: fingerprintEvalSource(dist, after.name) };
    fs.writeFileSync(path.join(changed.rawOutput, "comparison-run.json"), `${JSON.stringify(changed, null, 2)}\n`);
    assert.ok(auditEvalPair(before, changed).problems.includes("fixtureVersion mismatch"));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
  withPair((before, after) => {
    const changedModel = "provider/model-b";
    const changed = {
      ...after,
      model: changedModel,
      phases: after.phases.map((phase) => ({ ...phase, coverage: { ...phase.coverage, models: [changedModel] } })),
      metrics: { ...after.metrics, coverage: { ...after.metrics.coverage, models: [changedModel] } },
    };
    fs.writeFileSync(path.join(changed.rawOutput, "comparison-run.json"), `${JSON.stringify(changed, null, 2)}\n`);
    assert.ok(auditEvalPair(before, changed).problems.includes("model mismatch"));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
});

test("a metadata-only manifest cannot use a caller count as outcome rows", () => {
  withPair((before, after) => {
    const metadataOnly = { ...after, phases: [], sampleCount: 9000 };
    fs.writeFileSync(path.join(metadataOnly.rawOutput, "comparison-run.json"), `${JSON.stringify(metadataOnly, null, 2)}\n`);
    const audit = auditEvalPair(before, metadataOnly);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.includes("after: retained phase outcome rows missing"));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
});

test("a changed fixture snapshot is detected despite an unchanged manifest", () => {
  withPair((before, after, root) => {
    fs.writeFileSync(path.join(root, "after", ".dist", "fixtures", "case.json"), "{\"value\":2}\n");
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.includes("after: pinned fixture snapshot missing or does not match its recorded revision"));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
});

test("quality is recomputed from matching retained phase outcomes, not sampleCount", () => {
  withPair((before, after) => {
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, true);
    assert.equal(audit.qualityEvidence.sampleCount, 10);
    assert.equal(audit.qualityEvidence.before.rate, 0.4);
    assert.equal(audit.qualityEvidence.after.rate, 0.8);
    assert.equal(audit.qualityEvidence.rateDelta, 0.4);
    assert.equal(audit.estimatedCostEvidence.basis, "model_rate_estimate_usd");
    assert.equal(audit.savingsClaimsAllowed, false);
    assert.equal(audit.costEvidence, null);
  }, { count: 10, passed: 4 }, { count: 10, passed: 8 });
});

test("caller counts without ten retained phase artifacts remain held", () => {
  withPair((before, after) => {
    const underSampled = { ...after, phases: after.phases.slice(0, 9), metrics: { ...after.metrics, coverage: { ...after.metrics.coverage, turns: 9, usage_events: 9, cost_events: 9 } } };
    fs.writeFileSync(path.join(underSampled.rawOutput, "comparison-run.json"), `${JSON.stringify(underSampled, null, 2)}\n`);
    const audit = auditEvalPair(before, underSampled);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.includes("sample count below minimum 10"));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
});

test("missing phase outputs and fabricated aggregate coverage fail closed", () => {
  withPair((before, after) => {
    fs.rmSync(path.join(before.rawOutput, before.phases[0].phase, "answer.md"));
    const missingOutput = auditEvalPair(before, after);
    assert.equal(missingOutput.qualityClaimsAllowed, false);
    assert.ok(missingOutput.problems.some((problem) => problem.includes("retained answer and task snapshot required")));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
  withPair((before, after) => {
    const forged = { ...after, metrics: { ...after.metrics, coverage: { ...after.metrics.coverage, turns: 9000 } } };
    fs.writeFileSync(path.join(forged.rawOutput, "comparison-run.json"), `${JSON.stringify(forged, null, 2)}\n`);
    const audit = auditEvalPair(before, forged);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("aggregate usage coverage does not reconcile")));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
});

test("fixture, source, model, and sample identity mismatches block comparison", () => {
  withPair((before, after, root) => {
    const scenarioFile = path.join(root, "after", ".dist", "eval-sources", "scenarios", `${after.name}.mjs`);
    fs.writeFileSync(scenarioFile, "export default { slug: 'changed' };\n");
    const changed = { ...after, sourceRevision: fingerprintEvalSource(path.join(root, "after", ".dist"), after.name) };
    fs.writeFileSync(path.join(changed.rawOutput, "comparison-run.json"), `${JSON.stringify(changed, null, 2)}\n`);
    assert.ok(auditEvalPair(before, changed).problems.includes("sourceRevision mismatch"));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
  withPair((before, after) => {
    const last = after.phases[9];
    const changed = { ...after, phases: after.phases.map((row, index) => index === 9 ? { ...row, phase: "different-sample" } : row) };
    fs.renameSync(path.join(after.rawOutput, last.phase), path.join(after.rawOutput, "different-sample"));
    fs.writeFileSync(path.join(changed.rawOutput, "comparison-run.json"), `${JSON.stringify(changed, null, 2)}\n`);
    assert.ok(auditEvalPair(before, changed).problems.includes("retained phase outcome sample identifiers mismatch"));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
});

test("caller totals and provider-billed labels cannot create billed savings", () => {
  withPair((before, after) => {
    const changed = { ...after, metrics: { ...after.metrics, cost: { total: 0.01 }, cost_basis: "provider_billed_usd" } };
    fs.writeFileSync(path.join(changed.rawOutput, "comparison-run.json"), `${JSON.stringify(changed, null, 2)}\n`);
    const audit = auditEvalPair(before, changed);
    assert.equal(audit.savingsClaimsAllowed, false);
    assert.equal(audit.estimatedCostEvidence, null);
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
});

test("executed grade plus sufficient retained rows yields pending human review only", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-pending-review-"));
  try {
    const before = writeRun(root, "before", { count: 10, passed: 8 });
    const after = writeRun(root, "after", { count: 10, passed: 10 });
    const result = decideFeedback({ before, after, proposal, grading: retainedGrade(root), approval: { decision: "approved", actor: "caller" } });
    assert.equal(result.disposition, "pending-human-review");
    assert.equal(result.approvalStatus, "pending-human-review");
    assert.equal(result.applied, false);
    assert.equal(result.audit.qualityEvidence.rateDelta, 0.2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("metadata-only grades and caller-supplied approval cannot bypass the gate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-forged-grade-"));
  try {
    const before = writeRun(root, "before", { count: 10, passed: 10 });
    const after = writeRun(root, "after", { count: 10, passed: 10 });
    const result = decideFeedback({
      before,
      after,
      proposal,
      grading: { status: "passed", targetScenario: proposal.targetScenario, expectedBehavior: proposal.expectedBehavior, evidence: [] },
      approval: { decision: "approved", actor: "reviewer", at: "2026-09-27T12:00:00Z" },
    });
    assert.equal(result.disposition, "held");
    assert.equal(result.approvalStatus, "pending-human-review");
    assert.equal(result.applied, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("caller-edited manifests and shared run paths cannot impersonate a comparison", () => {
  withPair((before, after) => {
    const forged = { ...before, sourceRevision: "c".repeat(64) };
    assert.ok(auditEvalPair(forged, after).problems.includes("before: caller evidence differs from retained manifest"));
    assert.ok(auditEvalPair(before, before).problems.includes("before and after resolve to the same retained manifest"));
  }, { count: 10, passed: 10 }, { count: 10, passed: 10 });
});
