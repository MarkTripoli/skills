const JOIN_FIELDS = ["fixtureVersion", "model", "sourceRevision", "usageCoverage"];

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function auditEvalPair(before, after, { minimumSamples = 10 } = {}) {
  const problems = [];
  if (!Number.isSafeInteger(minimumSamples) || minimumSamples < 2) throw new TypeError("minimumSamples must be an integer of at least 2");
  for (const side of ["before", "after"]) {
    const run = side === "before" ? before : after;
    if (!run || typeof run !== "object") {
      problems.push(`${side}: evidence missing`);
      continue;
    }
    for (const field of JOIN_FIELDS) {
      if (typeof run[field] !== "string" || !run[field].trim()) problems.push(`${side}: ${field} missing`);
    }
    if (typeof run.evidenceRef !== "string" || !run.evidenceRef.trim()) problems.push(`${side}: evidenceRef missing`);
    if (!positiveInteger(run.sampleCount)) problems.push(`${side}: sampleCount must be a positive integer`);
  }
  if (problems.length === 0) {
    for (const field of JOIN_FIELDS) {
      if (before[field] !== after[field]) problems.push(`${field} mismatch`);
    }
    if (before.sampleCount < minimumSamples || after.sampleCount < minimumSamples) problems.push(`sample count below minimum ${minimumSamples}`);
  }
  const joinable = problems.length === 0;
  const claimsAllowed = joinable && before.sampleCount >= minimumSamples && after.sampleCount >= minimumSamples;
  return {
    joinable,
    claimsAllowed,
    problems,
    matched: joinable ? Object.fromEntries([...JOIN_FIELDS.map((field) => [field, before[field]]), ["beforeEvidenceRef", before.evidenceRef], ["afterEvidenceRef", after.evidenceRef]]) : null,
  };
}
export function decideFeedback({ audit, proposal, grading, approval }) {
  const problems = [];
  if (!audit?.claimsAllowed) problems.push("comparable evidence required");
  if (!proposal || typeof proposal.rule !== "string" || !proposal.rule.trim() || typeof proposal.rationale !== "string" || !proposal.rationale.trim()) problems.push("rule and rationale required");
  if (!grading || grading.status !== "passed" || !Array.isArray(grading.evidence) || grading.evidence.length === 0) problems.push("targeted grading evidence required");
  if (!approval || !["approved", "rejected"].includes(approval.decision) || typeof approval.actor !== "string" || !approval.actor.trim() || !Number.isFinite(Date.parse(approval.at)) || typeof approval.reversal !== "string" || !approval.reversal.trim()) problems.push("human decision, timestamp, actor, and reversal path required");
  if (problems.length) return { disposition: "held", problems, applied: false };
  return {
    disposition: approval.decision,
    applied: false,
    proposal: { rule: proposal.rule, rationale: proposal.rationale },
    grading: { status: grading.status, evidence: [...grading.evidence] },
    approval: { decision: approval.decision, actor: approval.actor, at: approval.at, reversal: approval.reversal },
  };
}
