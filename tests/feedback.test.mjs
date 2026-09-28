import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditEvalPair, decideFeedback } from "../evals/feedback.mjs";

const manifest = (overrides = {}) => ({
  ok: true,
  model: "provider/model-a",
  fixtureRevision: "fixture-abc",
  sourceRevision: "source-123",
  rawOutput: "unused",
  sampleCount: 20,
  metrics: {
    cost: { total: 0.42, input: 0.1, output: 0.2, cacheRead: 0.05, cacheWrite: 0.07 },
    cost_basis: "provider_billed_usd",
    cost_source: "caller-provided provider label",
    tokens: { input: 100, output: 200, cacheRead: 50, cacheWrite: 70 },
    coverage: { complete: true, turns: 20, usage_events: 20, cost_events: 20, models: ["provider/model-a"] },
  },
  ...overrides,
});
const proposal = { rule: "prefer model B for task X", rationale: "targeted evidence", targetScenario: "counter-evidence", expectedBehavior: "increment reaches 1" };
const metadataOnlyGrade = { status: "passed", targetScenario: proposal.targetScenario, expectedBehavior: proposal.expectedBehavior, evidence: [] };

function withRetainedPair(beforeOverrides, afterOverrides, action, { samePath = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-manifests-"));
  const make = (name, overrides = {}) => {
    const rawOutput = samePath ? path.join(root, "same") : path.join(root, name);
    const value = manifest({ rawOutput, ...overrides });
    fs.mkdirSync(rawOutput, { recursive: true });
    fs.writeFileSync(path.join(rawOutput, "comparison-run.json"), `${JSON.stringify(value, null, 2)}\n`);
    return JSON.parse(JSON.stringify(value));
  };
  try {
    return action(make("before", beforeOverrides), make("after", afterOverrides), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function retainedGrade(root, overrides = {}) {
  const output = path.join(root, "grade");
  const phase = "1-counter-evidence";
  fs.mkdirSync(path.join(root, ".dist", "fixtures"), { recursive: true });
  fs.writeFileSync(path.join(root, ".dist", "fixtures", "case.json"), "{}\n");
  fs.mkdirSync(path.join(output, phase), { recursive: true });
  fs.writeFileSync(path.join(output, phase, "answer.md"), "Observed increment reached 1.\n");
  const run = {
    name: proposal.targetScenario,
    ok: true,
    fixtureRevision: "fixture-abc",
    sourceRevision: "source-123",
    phases: [{ phase, ok: true, problems: [] }],
    ...overrides,
  };
  const file = path.join(output, "comparison-run.json");
  fs.writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  return { status: "passed", targetScenario: proposal.targetScenario, expectedBehavior: proposal.expectedBehavior, evidence: [file] };
}

const auditPair = (before = {}, after = {}, options) =>
  withRetainedPair(before, after, (b, a) => auditEvalPair(b, a, options));
const decidePair = (before = {}, after = {}, options = {}) =>
  withRetainedPair(before, after, (b, a, root) => decideFeedback({ before: b, after: a, proposal, grading: retainedGrade(root), ...options }));

test("same retained manifest cannot serve as both comparison runs despite caller run IDs", () => {
  withRetainedPair({}, {}, (before, after) => {
    before.runId = "caller-before";
    after.runId = "caller-after";
    const audit = auditEvalPair(before, after);
    assert.equal(audit.matched, null);
    assert.equal(audit.claimsAllowed, false);
  }, { samePath: true });
});

test("missing manifests and caller metadata that differs from retained bytes fail closed", () => {
  withRetainedPair({}, {}, (before, after) => {
    fs.rmSync(path.join(before.rawOutput, "comparison-run.json"));
    assert.equal(auditEvalPair(before, after).matched, null);
  });
  withRetainedPair({}, {}, (before, after) => {
    const audit = auditEvalPair({ ...before, sourceRevision: "forged-source" }, after);
    assert.equal(audit.matched, null);
    assert.ok(audit.problems.includes("before: caller evidence differs from retained manifest"));
  });
});

test("fixture revisions and observed model identities must match", () => {
  assert.ok(auditPair({}, { fixtureRevision: "fixture-def" }).problems.includes("fixtureVersion mismatch"));
  assert.ok(auditPair({}, { model: "provider/other" }).problems.includes("model mismatch"));
  assert.ok(auditPair({}, { actualModel: "provider/model-a", metrics: { ...manifest().metrics, coverage: { ...manifest().metrics.coverage, models: ["provider/model-a", "provider/model-b"] } } }).problems.includes("after: observed model conflicts with coverage"));
});

test("scalar sample counts cannot establish independent evaluated samples", () => {
  const audit = auditPair();
  assert.equal(audit.qualityClaimsAllowed, false);
  assert.equal(audit.claimsAllowed, false);
  assert.ok(audit.problems.includes("the eval runner does not retain independently evaluated sample outcome rows"));
});

test("caller cost labels and totals cannot authorize savings without provider billing records", () => {
  const audit = auditPair();
  assert.equal(audit.savingsClaimsAllowed, false);
  assert.equal(audit.costEvidence, null);
  const forged = auditPair({}, { metrics: { ...manifest().metrics, cost: { total: 0.01 }, cost_basis: "provider_billed_usd" } });
  assert.equal(forged.savingsClaimsAllowed, false);
});

test("metadata-only grading claims do not count as an executed outcome", () => {
  withRetainedPair({}, {}, (before, after) => {
    const result = decideFeedback({ before, after, proposal, grading: metadataOnlyGrade });
    assert.equal(result.disposition, "held");
    assert.ok(result.problems.includes("executed grading run, retained fixture snapshot, and phase outcomes required"));
  });
});

test("executed grading outcomes are inspected but unsupported samples still hold feedback", () => {
  const result = decidePair();
  assert.equal(result.disposition, "held");
  assert.equal(result.approvalStatus, "pending-human-review");
  assert.ok(!result.problems.includes("executed grading run, retained fixture snapshot, and phase outcomes required"));
});

test("caller-supplied approval fields cannot authenticate a decision", () => {
  const result = decidePair({}, {}, { approval: { decision: "approved", actor: "reviewer", at: "2026-09-27T12:00:00Z", reversal: "undo" } });
  assert.equal(result.disposition, "held");
  assert.equal(result.approvalStatus, "pending-human-review");
  assert.equal(result.applied, false);
});
