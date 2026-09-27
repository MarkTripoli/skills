const JOIN_FIELDS = ["fixtureVersion", "model", "actualModel", "sourceRevision", "usageCoverage"];

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function recordedRunEvidence(run, side) {
  if (!run || typeof run !== "object") return { problems: [`${side}: evidence missing`] };
  const problems = [];
  if (run.ok !== true) problems.push(`${side}: recorded eval did not pass`);
  const coverage = run.metrics?.coverage;
  const actualModel = run.actualModel ?? (coverage?.models?.length === 1 ? coverage.models[0] : null);
  const normalized = {
    fixtureVersion: run.fixtureVersion ?? run.fixtureRevision,
    model: run.model,
    actualModel,
    sourceRevision: run.sourceRevision ?? run.fixtureRevision,
    usageCoverage: coverage?.complete === true ? "complete" : coverage?.complete === false ? "incomplete" : run.usageCoverage,
    sampleCount: run.sampleCount,
    evidenceRef: run.evidenceRef ?? (typeof run.rawOutput === "string" ? `${run.rawOutput}/comparison-run.json` : null),
    cost: Number.isFinite(run.metrics?.cost?.total) ? { amount: run.metrics.cost.total, currency: "USD", basis: run.metrics.cost_basis, source: run.metrics.cost_source } : null,
    costEvents: coverage?.cost_events,
  };
  for (const field of JOIN_FIELDS) {
    if (typeof normalized[field] !== "string" || !normalized[field].trim()) problems.push(`${side}: ${field} missing`);
  }
  if (normalized.usageCoverage !== "complete") problems.push(`${side}: usage coverage is not complete`);
  if (!positiveInteger(normalized.sampleCount)) problems.push(`${side}: sampleCount must be a positive integer`);
  if (typeof normalized.evidenceRef !== "string" || !normalized.evidenceRef.trim()) problems.push(`${side}: evidenceRef missing`);
  return { normalized, problems };
}

export function auditEvalPair(beforeInput, afterInput, { minimumSamples = 10 } = {}) {
  if (!Number.isSafeInteger(minimumSamples) || minimumSamples < 2) throw new TypeError("minimumSamples must be an integer of at least 2");
  const beforeResult = recordedRunEvidence(beforeInput, "before");
  const afterResult = recordedRunEvidence(afterInput, "after");
  const problems = [...beforeResult.problems, ...afterResult.problems];
  const before = beforeResult.normalized;
  const after = afterResult.normalized;
  if (before && after && problems.length === 0) {
    for (const field of JOIN_FIELDS) {
      if (before[field] !== after[field]) problems.push(`${field} mismatch`);
    }
    if (before.sampleCount < minimumSamples || after.sampleCount < minimumSamples) problems.push(`sample count below minimum ${minimumSamples}`);
  }
  const comparable = problems.length === 0;
  const qualityClaimsAllowed = Boolean(comparable && before?.sampleCount >= minimumSamples && after?.sampleCount >= minimumSamples);
  const costEvidenceValid = (run) => run?.cost && Number.isFinite(run.cost.amount) && run.cost.amount >= 0 &&
    run.cost.currency === "USD" && positiveInteger(run.costEvents) && run.cost.basis === "provider_billed_usd" && typeof run.cost.source === "string" && run.cost.source.trim();
  const savingsClaimsAllowed = Boolean(qualityClaimsAllowed && costEvidenceValid(before) && costEvidenceValid(after) &&
    before.cost.currency === after.cost.currency && before.cost.basis === after.cost.basis);
  return {
    qualityClaimsAllowed,
    claimsAllowed: qualityClaimsAllowed,
    savingsClaimsAllowed,
    problems,
    matched: comparable ? Object.fromEntries([...JOIN_FIELDS.map((field) => [field, before[field]]), ["beforeEvidenceRef", before.evidenceRef], ["afterEvidenceRef", after.evidenceRef]]) : null,
    costEvidence: savingsClaimsAllowed ? { before: before.cost, after: after.cost } : null,
  };
}

export function decideFeedback({ audit, proposal, grading, approval }) {
  const problems = [];
  if (!audit?.qualityClaimsAllowed) problems.push("comparable evidence required");
  if (!proposal || typeof proposal.rule !== "string" || !proposal.rule.trim() || typeof proposal.rationale !== "string" || !proposal.rationale.trim()) problems.push("rule and rationale required");
  if (!proposal || typeof proposal.targetScenario !== "string" || !proposal.targetScenario.trim() || typeof proposal.expectedBehavior !== "string" || !proposal.expectedBehavior.trim()) problems.push("target scenario and expected behavior required");
  if (!grading || grading.status !== "passed" || !Array.isArray(grading.evidence) || grading.evidence.length === 0) problems.push("targeted grading evidence required");
  if (grading && proposal && (grading.targetScenario !== proposal.targetScenario || grading.expectedBehavior !== proposal.expectedBehavior)) problems.push("grading target does not match proposal");
  if (!approval || !["approved", "rejected"].includes(approval.decision) || typeof approval.actor !== "string" || !approval.actor.trim() || !Number.isFinite(Date.parse(approval.at)) || typeof approval.reversal !== "string" || !approval.reversal.trim()) problems.push("human decision, timestamp, actor, and reversal path required");
  if (problems.length) return { disposition: "held", problems, applied: false };
  return {
    disposition: approval.decision,
    applied: false,
    proposal: { rule: proposal.rule, rationale: proposal.rationale, targetScenario: proposal.targetScenario, expectedBehavior: proposal.expectedBehavior },
    grading: { status: grading.status, targetScenario: grading.targetScenario, expectedBehavior: grading.expectedBehavior, evidence: [...grading.evidence] },
    approval: { decision: approval.decision, actor: approval.actor, at: approval.at, reversal: approval.reversal },
  };
}
