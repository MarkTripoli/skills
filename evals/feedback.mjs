import fs from "node:fs";
import path from "node:path";

const JOIN_FIELDS = ["fixtureVersion", "model", "actualModel", "sourceRevision", "usageCoverage"];
const MINIMUM_SAMPLES = 10;
const COST_COMPONENTS = ["input", "output", "cacheRead", "cacheWrite"];

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function resolveManifestPath(run) {
  return typeof run?.rawOutput === "string" && run.rawOutput.trim()
    ? path.resolve(run.rawOutput, "comparison-run.json")
    : null;
}

function completeCost(run) {
  const phases = Array.isArray(run.phases) && run.phases.length ? run.phases.map((phase) => phase.cost) : null;
  const source = COST_COMPONENTS.every((field) => finiteNonNegative(run.metrics?.cost?.[field]))
    ? run.metrics.cost
    : phases?.every((cost) => cost && COST_COMPONENTS.every((field) => finiteNonNegative(cost[field])))
      ? Object.fromEntries(COST_COMPONENTS.map((field) => [field, phases.reduce((sum, cost) => sum + cost[field], 0)]))
      : null;
  return source && finiteNonNegative(run.metrics?.cost?.total)
    ? { total: run.metrics.cost.total, ...Object.fromEntries(COST_COMPONENTS.map((field) => [field, source[field]])) }
    : null;
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
  const manifestPath = resolveManifestPath(run);
  const evidenceRef = typeof run.evidenceRef === "string" ? path.resolve(run.evidenceRef) : manifestPath;
  const cost = completeCost(run);
  const normalized = {
    runId: manifestPath,
    manifestPath,
    fixtureVersion: run.fixtureVersion ?? run.fixtureRevision,
    model: run.model,
    actualModel,
    sourceRevision: run.sourceRevision,
    usageCoverage: coverage?.complete === true ? "complete" : coverage?.complete === false ? "incomplete" : run.usageCoverage,
    sampleCount: run.sampleCount,
    evidenceRef,
    cost: cost ? { ...cost, currency: "USD", basis: run.metrics?.cost_basis, source: run.metrics?.cost_source } : null,
    usageEvents: coverage?.usage_events,
    costEvents: coverage?.cost_events,
    measuredEvents: coverage?.turns,
    tokens: run.metrics?.tokens,
  };
  for (const field of JOIN_FIELDS) {
    if (typeof normalized[field] !== "string" || !normalized[field].trim()) problems.push(`${side}: ${field} missing`);
  }
  if (!manifestPath) problems.push(`${side}: retained manifest path missing`);
  if (normalized.evidenceRef !== manifestPath) problems.push(`${side}: evidence reference does not identify its recorded manifest`);
  if (normalized.usageCoverage !== "complete") problems.push(`${side}: usage coverage is not complete`);
  if (!positiveInteger(normalized.sampleCount)) problems.push(`${side}: sampleCount must be a positive integer`);
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
    if (before.manifestPath === after.manifestPath) problems.push("before and after resolve to the same retained manifest");
    if (problems.length === 0) {
      for (const field of JOIN_FIELDS) {
        if (before[field] !== after[field]) problems.push(`${field} mismatch`);
      }
      if (before.sampleCount < minimumSamples || after.sampleCount < minimumSamples) problems.push(`sample count below minimum ${minimumSamples}`);
    }
  }
  const comparable = problems.length === 0;
  const qualityClaimsAllowed = Boolean(comparable && before?.sampleCount >= minimumSamples && after?.sampleCount >= minimumSamples);
  const usageComplete = (run) => COST_COMPONENTS.every((field) => finiteNonNegative(run?.tokens?.[field]));
  const costEvidenceValid = (run) => run?.cost && finiteNonNegative(run.cost.total) &&
    COST_COMPONENTS.every((field) => finiteNonNegative(run.cost[field])) && usageComplete(run) &&
    positiveInteger(run.measuredEvents) && run.usageEvents === run.measuredEvents && run.costEvents === run.measuredEvents &&
    run.cost.currency === "USD" && run.cost.basis === "provider_billed_usd" && typeof run.cost.source === "string" && run.cost.source.trim();
  const savingsClaimsAllowed = Boolean(qualityClaimsAllowed && costEvidenceValid(before) && costEvidenceValid(after) &&
    before.cost.currency === after.cost.currency && before.cost.basis === after.cost.basis &&
    before.cost.source === after.cost.source);
  return {
    qualityClaimsAllowed,
    claimsAllowed: qualityClaimsAllowed,
    savingsClaimsAllowed,
    problems,
    matched: comparable ? Object.fromEntries([...JOIN_FIELDS.map((field) => [field, before[field]]), ["beforeRunId", before.runId], ["afterRunId", after.runId], ["beforeEvidenceRef", before.evidenceRef], ["afterEvidenceRef", after.evidenceRef]]) : null,
    costEvidence: savingsClaimsAllowed ? { before: before.cost, after: after.cost } : null,
  };
}

function retainedGradingEvidence(grading, audit, proposal) {
  if (!Array.isArray(grading?.evidence)) return [];
  return grading.evidence.flatMap((reference) => {
    if (typeof reference !== "string" || !reference.trim() || /^https?:\/\//i.test(reference)) return [];
    const file = path.resolve(reference);
    try {
      const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
      if (artifact.status !== "passed" || artifact.targetScenario !== proposal.targetScenario ||
          artifact.expectedBehavior !== proposal.expectedBehavior || artifact.fixtureRevision !== audit.matched?.fixtureVersion) return [];
      return [file];
    } catch {
      return [];
    }
  });
}

export function decideFeedback({ audit, proposal, grading, approval }) {
  const problems = [];
  if (!audit?.qualityClaimsAllowed || !audit.matched) problems.push("comparable evidence required");
  if (!proposal || typeof proposal.rule !== "string" || !proposal.rule.trim() || typeof proposal.rationale !== "string" || !proposal.rationale.trim()) problems.push("rule and rationale required");
  if (!proposal || typeof proposal.targetScenario !== "string" || !proposal.targetScenario.trim() || typeof proposal.expectedBehavior !== "string" || !proposal.expectedBehavior.trim()) problems.push("target scenario and expected behavior required");
  if (grading && proposal && (grading.targetScenario !== proposal.targetScenario || grading.expectedBehavior !== proposal.expectedBehavior)) problems.push("grading target does not match proposal");
  const gradingEvidence = retainedGradingEvidence(grading, audit ?? {}, proposal ?? {});
  if (!grading || grading.status !== "passed" || gradingEvidence.length === 0) problems.push("targeted grading artifact must exist and match fixture, scenario, and expected behavior");
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
