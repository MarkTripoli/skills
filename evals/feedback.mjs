import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const JOIN_FIELDS = ["fixtureVersion", "model", "actualModel", "sourceRevision", "usageCoverage"];
const MINIMUM_SAMPLES = 10;

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function resolveManifestPath(run) {
  return typeof run?.rawOutput === "string" && run.rawOutput.trim()
    ? path.resolve(run.rawOutput, "comparison-run.json")
    : null;
}

function loadRetainedManifest(input, side) {
  const manifestPath = resolveManifestPath(input);
  if (!manifestPath) return { problems: [`${side}: retained manifest path missing`] };
  try {
    const run = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const callerSnapshot = JSON.parse(JSON.stringify(input));
    if (!isDeepStrictEqual(run, callerSnapshot) || resolveManifestPath(run) !== manifestPath) {
      return { problems: [`${side}: caller evidence differs from retained manifest`] };
    }
    return { run, manifestPath, problems: [] };
  } catch {
    return { problems: [`${side}: retained comparison manifest missing or invalid`] };
  }
}

function recordedRunEvidence(input, side) {
  const loaded = loadRetainedManifest(input, side);
  if (!loaded.run) return { normalized: null, problems: loaded.problems };
  const run = loaded.run;
  const problems = [...loaded.problems];
  if (run.ok !== true) problems.push(`${side}: recorded eval did not pass`);
  const coverage = run.metrics?.coverage;
  const models = coverage?.models;
  const actualModel = run.actualModel ?? (Array.isArray(models) && models.length === 1 ? models[0] : null);
  if (run.actualModel !== undefined && (!Array.isArray(models) || models.length !== 1 || models[0] !== run.actualModel)) {
    problems.push(`${side}: observed model conflicts with coverage`);
  }
  const manifestPath = loaded.manifestPath;
  const evidenceRef = typeof run.evidenceRef === "string" ? path.resolve(run.evidenceRef) : manifestPath;
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
  };
  for (const field of JOIN_FIELDS) {
    if (typeof normalized[field] !== "string" || !normalized[field].trim()) problems.push(`${side}: ${field} missing`);
  }
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
  const qualityClaimsAllowed = false;
  const savingsClaimsAllowed = false;
  const limits = [
    "the eval runner does not retain independently evaluated sample outcome rows",
    "the eval runner records model-rate estimates, not provider billing records",
  ];
  return {
    qualityClaimsAllowed,
    claimsAllowed: qualityClaimsAllowed,
    savingsClaimsAllowed,
    problems: [...problems, ...limits],
    matched: comparable ? Object.fromEntries([...JOIN_FIELDS.map((field) => [field, before[field]]), ["beforeRunId", before.runId], ["afterRunId", after.runId], ["beforeEvidenceRef", before.evidenceRef], ["afterEvidenceRef", after.evidenceRef]]) : null,
    costEvidence: null,
  };
}

function retainedPhaseAnswer(outputDir, phase) {
  if (typeof phase?.phase !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(phase.phase)) return false;
  const answer = path.resolve(outputDir, phase.phase, "answer.md");
  if (!answer.startsWith(`${outputDir}${path.sep}`)) return false;
  try { return fs.statSync(answer).size > 0; } catch { return false; }
}
function retainedGradingOutcome(grading, audit, proposal) {
  if (!Array.isArray(grading?.evidence)) return [];
  return grading.evidence.flatMap((reference) => {
    if (typeof reference !== "string" || !reference.trim() || /^https?:\/\//i.test(reference)) return [];
    const file = path.resolve(reference);
    try {
      const run = JSON.parse(fs.readFileSync(file, "utf8"));
      const outputDir = path.dirname(file);
      const fixtureSnapshot = path.resolve(outputDir, "..", ".dist", "fixtures");
      const phasesAreGraded = Array.isArray(run.phases) && run.phases.length > 0 && run.phases.every((phase) =>
        phase?.ok === true && Array.isArray(phase.problems) && phase.problems.length === 0 &&
        retainedPhaseAnswer(outputDir, phase));
      if (path.basename(file) !== "comparison-run.json" || !fs.existsSync(fixtureSnapshot) || fs.readdirSync(fixtureSnapshot).length === 0 ||
          run.ok !== true || run.name !== grading.targetScenario ||
          run.fixtureRevision !== audit.matched?.fixtureVersion || run.sourceRevision !== audit.matched?.sourceRevision ||
          !phasesAreGraded || grading.targetScenario !== proposal.targetScenario ||
          grading.expectedBehavior !== proposal.expectedBehavior) return [];
      return [file];
    } catch {
      return [];
    }
  });
}

export function decideFeedback({ before, after, minimumSamples, proposal, grading }) {
  const audit = auditEvalPair(before, after, { minimumSamples });
  const problems = [];
  if (!audit.qualityClaimsAllowed || !audit.matched) problems.push("comparable evidence required");
  if (!proposal || typeof proposal.rule !== "string" || !proposal.rule.trim() || typeof proposal.rationale !== "string" || !proposal.rationale.trim()) problems.push("rule and rationale required");
  if (!proposal || typeof proposal.targetScenario !== "string" || !proposal.targetScenario.trim() || typeof proposal.expectedBehavior !== "string" || !proposal.expectedBehavior.trim()) problems.push("target scenario and expected behavior required");
  if (grading && proposal && (grading.targetScenario !== proposal.targetScenario || grading.expectedBehavior !== proposal.expectedBehavior)) problems.push("grading target does not match proposal");
  const gradingEvidence = retainedGradingOutcome(grading, audit, proposal ?? {});
  if (!grading || grading.status !== "passed" || gradingEvidence.length === 0) problems.push("executed grading run, retained fixture snapshot, and phase outcomes required");
  if (problems.length) return { disposition: "held", approvalStatus: "pending-human-review", applied: false, problems, audit };
  return {
    disposition: "pending-human-review",
    approvalStatus: "pending-human-review",
    applied: false,
    proposal: { rule: proposal.rule, rationale: proposal.rationale, targetScenario: proposal.targetScenario, expectedBehavior: proposal.expectedBehavior },
    grading: { status: grading.status, targetScenario: grading.targetScenario, expectedBehavior: grading.expectedBehavior, evidence: gradingEvidence },
    audit,
  };
}
