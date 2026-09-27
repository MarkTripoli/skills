import assert from "node:assert/strict";
import test from "node:test";
import { auditEvalPair, decideFeedback } from "../evals/feedback.mjs";

const run = (overrides = {}) => ({
  fixtureVersion: "counter-v1",
  model: "provider/model-a",
  sourceRevision: "abc123",
  usageCoverage: "all-events",
  sampleCount: 20,
  evidenceRef: "results/run/metrics.json",
  ...overrides,
});
const grading = { status: "passed", evidence: ["results/targeted-grade.json"] };
const approval = { decision: "approved", actor: "reviewer", at: "2026-09-27T12:00:00Z", reversal: "revert feedback record 001" };

test("eval audit rejects mismatched revisions and incomplete usage joins", () => {
  const mismatch = auditEvalPair(run(), run({ sourceRevision: "def456" }));
  assert.equal(mismatch.joinable, false);
  assert.equal(mismatch.claimsAllowed, false);
  assert.ok(mismatch.problems.includes("sourceRevision mismatch"));
  const incomplete = auditEvalPair(run(), run({ usageCoverage: "partial" }));
  assert.ok(incomplete.problems.includes("usageCoverage mismatch"));
});

test("small samples cannot support causal or savings claims", () => {
  const audit = auditEvalPair(run({ sampleCount: 3 }), run());
  assert.equal(audit.joinable, false);
  assert.equal(audit.claimsAllowed, false);
});

test("accepted feedback remains a proposal and records its reversible human decision", () => {
  const audit = auditEvalPair(run(), run());
  const result = decideFeedback({ audit, proposal: { rule: "prefer model B for task X", rationale: "targeted evidence" }, grading, approval });
  assert.equal(result.disposition, "approved");
  assert.equal(result.applied, false);
  assert.equal(result.approval.reversal, approval.reversal);
});

test("rejected feedback is retained without applying a router or skill change", () => {
  const result = decideFeedback({
    audit: auditEvalPair(run(), run()),
    proposal: { rule: "change route", rationale: "reviewed" },
    grading,
    approval: { ...approval, decision: "rejected" },
  });
  assert.equal(result.disposition, "rejected");
  assert.equal(result.applied, false);
});

test("ungraded or unauditable feedback stays held", () => {
  const result = decideFeedback({ audit: auditEvalPair(run(), run({ model: "other" })), proposal: { rule: "r", rationale: "why" }, grading, approval });
  assert.equal(result.disposition, "held");
  assert.equal(result.applied, false);
});
