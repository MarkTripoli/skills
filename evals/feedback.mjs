const JOIN_FIELDS = ["fixtureVersion", "model", "actualModel", "sourceRevision", "usageCoverage"];
const MINIMUM_SAMPLES = 10;

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isRetainedReference(value) {
  return typeof value === "string" && value.trim().length > 0 && /(?:\/|\\|^https?:\/\/)/.test(value.trim()) && !/^passed$/i.test(value.trim());
}

function recordedRunEvidence(run, side) {
  if (!run || typeof run !== "object") return { problems: [`${side}: evidence missing`] };
  const problems = [];
  if (run.ok !== true) problems.push(`${side}: recorded eval did not pass`);
  const coverage = run.metrics?.coverage;
  const models = coverage?.models;
  const actualModel = run.actualModel ?? (Array.isArray(models) && models.length === 1 ? models[0] : null);
  if (run.actualModel !== undefined && (!Array.isArray(models) || models.length !== 1 || models[0] !== run.actualModel)) {
    problems.push(`${side}: observed model conflicts with coverage`);
  }
  const normalized = {
    runId: run.runId ?? run.rawOutput,
    fixtureVersion: run.fixtureVersion ?? run.fixtureRevision,
    model: run.model,
    actualModel,
    sourceRevision: run.sourceRevision,
    usageCoverage: coverage?.complete === true ? "complete" : coverage?.complete === false ? "incomplete" : run.usageCoverage,
    sampleCount: run.sampleCount,
    evidenceRef: run.evidenceRef ?? (typeof run.rawOutput === "string" ? `${run.rawOutput}/comparison-run.json` : null),
    cost: Number.isFinite(run.metrics?.cost?.total) ? { amount: run.metrics.cost.total, currency: "USD", basis: run.metrics.cost_basis, source: run.metrics.cost_source } : null,
    costEvents: coverage?.cost_events,
    usageEvents: coverage?.usage_events,
    measuredEvents: coverage?.turns,
  };
  for (const field of JOIN_FIELDS) {
    if (typeof normalized[field] !== "string" || !normalized[field].trim()) problems.push(`${side}: ${field} missing`);
  }
  if (!isRetainedReference(normalized.runId)) problems.push(`${side}: distinct retained run identity missing`);
  if (normalized.usageCoverage !== "complete") problems.push(`${side}: usage coverage is not complete`);
  if (!positiveInteger(normalized.sampleCount)) problems.push(`${side}: sampleCount must be a positive integer`);
  if (!isRetainedReference(normalized.evidenceRef)) problems.push(`${side}: evidenceRef missing`);
  return { normalized, problems };
}

export function auditEvalPair(beforeInput, afterInput, { minimumSamples = MINIMUM_SAMPLES } = {}) {
  if (!Number.isSafeInteger(minimumSamples) || minimumSamples < MINIMUM_SAMPLES) {
    throw new TypeError(`minimumSamples cannot be lower than ${MINIMUM_SAMPLES}`);
  }
  const beforeResult = recordedRunEvidence(beforeInput, "before");
  const afterResult = recordedRunEvidence(afterInput, "after");
  const problems = [...beforeResult.problems, ...afterResult.problems];
  const before = beforeResult.normalized;
  const after = afterResult.normalized;
  if (before && after) {
    if (before.runId === after.runId) problems.push("before and after must be distinct retained runs");
    if (problems.length === 0) {
      for (const field of JOIN_FIELDS) {
        if (before[field] !== after[field]) problems.push(`${field} mismatch`);
      }
      if (before.sampleCount < minimumSamples || after.sampleCount < minimumSamples) problems.push(`sample count below minimum ${minimumSamples}`);
    }
  }
  const comparable = problems.length === 0;
  const qualityClaimsAllowed = Boolean(comparable && before?.sampleCount >= minimumSamples && after?.sampleCount >= minimumSamples);
  const costEvidenceValid = (run) => run?.cost && Number.isFinite(run.cost.amount) && run.cost.amount >= 0 &&
    positiveInteger(run.measuredEvents) && run.usageEvents === run.measuredEvents && run.costEvents === run.measuredEvents &&
    run.cost.currency === "USD" && run.cost.basis === "provider_billed_usd" && typeof run.cost.source === "string" && run.cost.source.trim();
  const savingsClaimsAllowed = Boolean(qualityClaimsAllowed && costEvidenceValid(before) && costEvidenceValid(after) &&
    before.cost.currency === after.cost.currency && before.cost.basis === after.cost.basis);
  return {
    qualityClaimsAllowed,
    claimsAllowed: qualityClaimsAllowed,
    savingsClaimsAllowed,
    problems,
    matched: comparable ? Object.fromEntries([...JOIN_FIELDS.map((field) => [field, before[field]]), ["beforeRunId", before.runId], ["afterRunId", after.runId], ["beforeEvidenceRef", before.evidenceRef], ["afterEvidenceRef", after.evidenceRef]]) : null,
    costEvidence: savingsClaimsAllowed ? { before: before.cost, after: after.cost } : null,
  };
}

export function decideFeedback({ audit, proposal, grading, approval }) {
  const problems = [];
  if (!audit?.qualityClaimsAllowed) problems.push("comparable evidence required");
  if (!proposal || typeof proposal.rule !== "string" || !proposal.rule.trim() || typeof proposal.rationale !== "string" || !proposal.rationale.trim()) problems.push("rule and rationale required");
  if (!proposal || typeof proposal.targetScenario !== "string" || !proposal.targetScenario.trim() || typeof proposal.expectedBehavior !== "string" || !proposal.expectedBehavior.trim()) problems.push("target scenario and expected behavior required");
  const gradingEvidence = Array.isArray(grading?.evidence) ? grading.evidence.filter(isRetainedReference) : [];
  if (!grading || grading.status !== "passed" || gradingEvidence.length === 0) problems.push("targeted grading evidence reference required");
  if (grading && proposal && (grading.targetScenario !== proposal.targetScenario || grading.expectedBehavior !== proposal.expectedBehavior)) problems.push("grading target does not match proposal");
  if (!approval || !["approved", "rejected"].includes(approval.decision) || typeof approval.actor !== "string" || !approval.actor.trim() || !Number.isFinite(Date.parse(approval.at)) || typeof approval.reversal !== "string" || !approval.reversal.trim()) problems.push("human decision, timestamp, actor, and reversal path required");
  if (problems.length) return { disposition: "held", problems, applied: false };
  return {
    disposition: approval.decision,
    applied: false,
    proposal: { rule: proposal.rule, rationale: proposal.rationale, targetScenario: proposal.targetScenario, expectedBehavior: proposal.expectedBehavior },
    grading: { status: grading.status, targetScenario: grading.targetScenario, expectedBehavior: grading.expectedBehavior, evidence: gradingEvidence },
    approval: { decision: approval.decision, actor: approval.actor, at: approval.at, reversal: approval.reversal },
  };
}
