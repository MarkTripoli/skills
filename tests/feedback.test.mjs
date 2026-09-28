import assert from "node:assert/strict";
import test from "node:test";
import { auditEvalPair, decideFeedback } from "../evals/feedback.mjs";

const manifest = (overrides = {}) => ({
  ok: true,
  model: "provider/model-a",
  fixtureRevision: "fixture-abc",
  sourceRevision: "source-123",
  rawOutput: "evals/results/run/solo",
  sampleCount: 20,
  metrics: {
    cost: { total: 0.42 },
    cost_basis: "provider_billed_usd",
    cost_source: "provider usage record",
    coverage: { complete: true, turns: 20, usage_events: 20, cost_events: 20, models: ["provider/model-a"] },
  },
  ...overrides,
});
const pair = (before = {}, after = {}) => [
  manifest({ rawOutput: "evals/results/run/before", ...before }),
  manifest({ rawOutput: "evals/results/run/after", ...after }),
];
const proposal = { rule: "prefer model B for task X", rationale: "targeted evidence", targetScenario: "counter-evidence", expectedBehavior: "increment reaches 1" };
const grading = { status: "passed", targetScenario: "counter-evidence", expectedBehavior: "increment reaches 1", evidence: ["evals/results/targeted-grade.json"] };
const approval = { decision: "approved", actor: "reviewer", at: "2026-09-27T12:00:00Z", reversal: "revert feedback record 001" };

const auditPair = (before = {}, after = {}, options) => auditEvalPair(...pair(before, after), options);

test("same retained manifest cannot serve as both comparison runs", () => {
  const one = manifest({ rawOutput: "evals/results/run/same" });
  const audit = auditEvalPair(one, one);
  assert.equal(audit.matched, null);
  assert.equal(audit.claimsAllowed, false);
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

test("monetary savings require billed events for every measured turn", () => {
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
  const result = decideFeedback({ audit: auditPair(), proposal, grading: { ...grading, evidence: ["passed"] }, approval });
  assert.equal(result.disposition, "held");
  assert.ok(result.problems.includes("targeted grading evidence reference required"));
});

test("grading must target the proposed scenario and expected behavior", () => {
  const result = decideFeedback({ audit: auditPair(), proposal, grading: { ...grading, targetScenario: "unrelated" }, approval });
  assert.equal(result.disposition, "held");
  assert.ok(result.problems.includes("grading target does not match proposal"));
});

test("human-approved feedback remains unapplied and reversible", () => {
  const result = decideFeedback({ audit: auditPair(), proposal, grading, approval });
  assert.equal(result.disposition, "approved");
  assert.equal(result.applied, false);
  assert.equal(result.grading.targetScenario, proposal.targetScenario);
  assert.equal(result.approval.reversal, approval.reversal);
});

test("human rejection is retained without changing routing", () => {
  const result = decideFeedback({ audit: auditPair(), proposal, grading, approval: { ...approval, decision: "rejected" } });
  assert.equal(result.disposition, "rejected");
  assert.equal(result.applied, false);
});
