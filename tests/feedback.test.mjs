import assert from "node:assert/strict";
import test from "node:test";
import { auditEvalPair, decideFeedback } from "../evals/feedback.mjs";

const manifest = (overrides = {}) => ({
  ok: true,
  model: "provider/model-a",
  actualModel: "provider/model-a",
  fixtureRevision: "abc123",
  sampleCount: 20,
  metrics: {
    cost: { total: 0.42 },
    cost_basis: "provider_billed_usd",
    cost_source: "provider usage record",
    coverage: { complete: true, usage_events: 20, cost_events: 20, models: ["provider/model-a"] },
  },
  ...overrides,
});
const proposal = { rule: "prefer model B for task X", rationale: "targeted evidence", targetScenario: "counter-evidence", expectedBehavior: "increment reaches 1" };
const grading = { status: "passed", targetScenario: "counter-evidence", expectedBehavior: "increment reaches 1", evidence: ["evals/results/targeted-grade.json"] };
const approval = { decision: "approved", actor: "reviewer", at: "2026-09-27T12:00:00Z", reversal: "revert feedback record 001" };

test("recorded comparison manifests reject fixture revision and model mismatch", () => {
  assert.ok(auditEvalPair(manifest(), manifest({ fixtureRevision: "def456" })).problems.includes("fixtureVersion mismatch"));
  assert.ok(auditEvalPair(manifest(), manifest({ model: "provider/other" })).problems.includes("model mismatch"));
  assert.ok(auditEvalPair(manifest(), manifest({ actualModel: "provider/other" })).problems.includes("actualModel mismatch"));
});
test("failed recorded runs cannot support feedback claims", () => {
  const audit = auditEvalPair(manifest({ ok: false }), manifest());
  assert.equal(audit.joinable, false);
  assert.ok(audit.problems.includes("before: recorded eval did not pass"));
});

test("partial and unknown usage coverage cannot join", () => {
  for (const coverage of [{ complete: false, usage_events: 20, models: ["provider/model-a"] }, { usage_events: 20, models: ["provider/model-a"] }]) {
    const audit = auditEvalPair(manifest(), manifest({ metrics: { ...manifest().metrics, coverage } }));
    assert.equal(audit.joinable, false);
    assert.equal(audit.qualityClaimsAllowed, false);
  }
});

test("missing independent samples and tiny sample counts block quality and savings claims", () => {
  const tiny = manifest({ sampleCount: 3 });
  const missing = manifest({ sampleCount: undefined });
  for (const audit of [auditEvalPair(tiny, manifest()), auditEvalPair(missing, manifest())]) {
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.equal(audit.savingsClaimsAllowed, false);
  }
});

test("quality comparison does not imply monetary savings eligibility", () => {
  const before = manifest({ metrics: { ...manifest().metrics, cost_basis: "model_rate_estimate_usd" } });
  const audit = auditEvalPair(before, manifest());
  assert.equal(audit.qualityClaimsAllowed, true);
  assert.equal(audit.savingsClaimsAllowed, false);
});

test("matched provider-billed manifests provide savings eligibility only with provenance", () => {
  const audit = auditEvalPair(manifest(), manifest({ metrics: { ...manifest().metrics, cost: { total: 0.3 } } }));
  assert.equal(audit.savingsClaimsAllowed, true);
  assert.equal(audit.costEvidence.before.source, "provider usage record");
});

test("accepted feedback binds passing grade to proposed target and expected behavior", () => {
  const audit = auditEvalPair(manifest(), manifest());
  const result = decideFeedback({ audit, proposal, grading, approval });
  assert.equal(result.disposition, "approved");
  assert.equal(result.applied, false);
  assert.equal(audit.matched.beforeEvidenceRef, "evals/results/run/solo/comparison-run.json");
  assert.equal(result.grading.targetScenario, proposal.targetScenario);
  assert.equal(result.approval.reversal, approval.reversal);
});

test("unrelated passing grade cannot authorize a proposal", () => {
  const result = decideFeedback({ audit: auditEvalPair(manifest(), manifest()), proposal, grading: { ...grading, targetScenario: "unrelated" }, approval });
  assert.equal(result.disposition, "held");
  assert.ok(result.problems.includes("grading target does not match proposal"));
});

test("rejected feedback is retained without applying a router or skill change", () => {
  const result = decideFeedback({ audit: auditEvalPair(manifest(), manifest()), proposal, grading, approval: { ...approval, decision: "rejected" } });
  assert.equal(result.disposition, "rejected");
  assert.equal(result.applied, false);
});
