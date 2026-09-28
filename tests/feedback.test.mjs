import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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
    cost_source: "provider usage record",
    tokens: { input: 100, output: 200, cacheRead: 50, cacheWrite: 70 },
    coverage: { complete: true, turns: 20, usage_events: 20, cost_events: 20, models: ["provider/model-a"] },
  },
  ...overrides,
});
const proposal = { rule: "prefer model B for task X", rationale: "targeted evidence", targetScenario: "counter-evidence", expectedBehavior: "increment reaches 1" };
const gradeArtifact = fileURLToPath(new URL("./fixtures/feedback-grade.json", import.meta.url));
const grading = { status: "passed", targetScenario: "counter-evidence", expectedBehavior: "increment reaches 1", evidence: [gradeArtifact] };
const wrongGradeArtifact = fileURLToPath(new URL("./fixtures/feedback-grade-other-target.json", import.meta.url));
const missingGradeArtifact = fileURLToPath(new URL("./fixtures/missing-grade.json", import.meta.url));
const approval = { decision: "approved", actor: "reviewer", at: "2026-09-27T12:00:00Z", reversal: "revert feedback record 001" };

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
    const before = make("before", beforeOverrides);
    const after = make("after", afterOverrides);
    return action(before, after);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const auditPair = (before = {}, after = {}, options) =>
  withRetainedPair(before, after, (b, a) => auditEvalPair(b, a, options));
const decidePair = ({ before = {}, after = {}, decision = approval, grade = grading, proposed = proposal } = {}) =>
  withRetainedPair(before, after, (b, a) => decideFeedback({ before: b, after: a, proposal: proposed, grading: grade, approval: decision }));

test("same retained manifest cannot serve as both comparison runs despite caller run IDs", () => {
  withRetainedPair({}, {}, (before, after) => {
    assert.equal(auditEvalPair(before, after).matched, null);
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
    const forged = { ...before, sourceRevision: "forged-source" };
    const audit = auditEvalPair(forged, after);
    assert.equal(audit.matched, null);
    assert.ok(audit.problems.includes("before: caller evidence differs from retained manifest"));
  });
});

test("fixture revisions and observed model identities must match", () => {
  assert.ok(auditPair({}, { fixtureRevision: "fixture-def" }).problems.includes("fixtureVersion mismatch"));
  assert.ok(auditPair({}, { model: "provider/other" }).problems.includes("model mismatch"));
  assert.ok(auditPair({}, { actualModel: "provider/model-a", metrics: { ...manifest().metrics, coverage: { ...manifest().metrics.coverage, models: ["provider/model-a", "provider/model-b"] } } }).problems.includes("after: observed model conflicts with coverage"));
});

test("source revision must be independently recorded", () => {
  const audit = auditPair({ sourceRevision: undefined });
  assert.equal(audit.matched, null);
  assert.ok(audit.problems.includes("before: sourceRevision missing"));
});

test("sample floor cannot be lowered below ten", () => {
  assert.throws(() => auditPair({}, {}, { minimumSamples: 2 }), /cannot be lower than 10/);
  const tiny = auditPair({ sampleCount: 9 });
  assert.equal(tiny.claimsAllowed, false);
});

test("failed or incomplete-coverage runs cannot join or claim", () => {
  const failed = auditPair({ ok: false });
  assert.equal(failed.matched, null);
  assert.equal(failed.claimsAllowed, false);
  for (const coverage of [{ complete: false, turns: 20, usage_events: 20, cost_events: 20, models: ["provider/model-a"] }, { turns: 20, usage_events: 20, cost_events: 20, models: ["provider/model-a"] }]) {
    const audit = auditPair({}, { metrics: { ...manifest().metrics, coverage } });
    assert.equal(audit.matched, null);
    assert.equal(audit.claimsAllowed, false);
    assert.equal(typeof audit.savingsClaimsAllowed, "boolean");
  }
});

test("monetary savings require complete billed components for every measured turn", () => {
  const totalsOnly = auditPair({}, { metrics: { ...manifest().metrics, cost: { total: 0.42 } } });
  assert.equal(totalsOnly.qualityClaimsAllowed, true);
  assert.equal(totalsOnly.savingsClaimsAllowed, false);
  const partial = auditPair({}, { metrics: { ...manifest().metrics, coverage: { ...manifest().metrics.coverage, cost_events: 1 } } });
  assert.equal(partial.qualityClaimsAllowed, true);
  assert.equal(partial.savingsClaimsAllowed, false);
  const complete = auditPair();
  assert.equal(complete.savingsClaimsAllowed, true);
  assert.equal(complete.costEvidence.before.source, "provider usage record");
});

test("estimated costs cannot support monetary savings claims", () => {
  const audit = auditPair({ metrics: { ...manifest().metrics, cost_basis: "model_rate_estimate_usd" } });
  assert.equal(audit.qualityClaimsAllowed, true);
  assert.equal(audit.savingsClaimsAllowed, false);
});

test("passing feedback requires a retained grading artifact reference", () => {
  const result = decidePair({ grade: { ...grading, evidence: [missingGradeArtifact] } });
  assert.equal(result.disposition, "held");
  assert.ok(result.problems.includes("targeted grading artifact must exist and match fixture, scenario, and expected behavior"));
});

test("retained grading artifact must match proposal fixture and result", () => {
  const result = decidePair({ grade: { ...grading, evidence: [wrongGradeArtifact] } });
  assert.equal(result.disposition, "held");
  assert.ok(result.problems.includes("targeted grading artifact must exist and match fixture, scenario, and expected behavior"));
});

test("grading must target the proposed scenario and expected behavior", () => {
  const result = decidePair({ grade: { ...grading, targetScenario: "unrelated" } });
  assert.equal(result.disposition, "held");
  assert.ok(result.problems.includes("grading target does not match proposal"));
});

test("forged caller audit flags cannot approve without retained run sources", () => {
  const result = decideFeedback({ audit: { qualityClaimsAllowed: true, matched: { fixtureVersion: "fixture-abc" } }, proposal, grading, approval });
  assert.equal(result.disposition, "held");
  assert.equal(result.audit.claimsAllowed, false);
});

test("human-approved feedback derives audit from retained runs and remains reversible", () => {
  const result = decidePair();
  assert.equal(result.disposition, "approved");
  assert.equal(result.applied, false);
  assert.equal(result.audit.claimsAllowed, true);
  assert.equal(result.grading.targetScenario, proposal.targetScenario);
  assert.equal(result.approval.reversal, approval.reversal);
});

test("human rejection is retained without changing routing", () => {
  const result = decidePair({ decision: { ...approval, decision: "rejected" } });
  assert.equal(result.disposition, "rejected");
  assert.equal(result.applied, false);
});
