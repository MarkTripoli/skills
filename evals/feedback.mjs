import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { fingerprintDirectory, fingerprintEvalSource } from "./evidence.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const JOIN_FIELDS = ["fixtureVersion", "fixtureSnapshotRevision", "model", "actualModel", "sourceRevision", "usageCoverage"];
const MINIMUM_SAMPLES = 10;
const USAGE_KEYS = ["input", "output", "cacheRead", "cacheWrite"];
const ESTIMATED_COST_SOURCE = "omp.turn_end.message.usage.cost (local model rate table)";

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function resolveManifestPath(run) {
  return typeof run?.rawOutput === "string" && run.rawOutput.trim()
    ? path.resolve(repoRoot, run.rawOutput, "comparison-run.json")
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

function retainedOutcomeRows(run, manifestPath, side) {
  const problems = [];
  const outputDir = path.dirname(manifestPath);
  const fixtureSnapshots = [path.join(path.dirname(outputDir), ".dist", "fixtures"), path.join(outputDir, ".dist", "fixtures")];
  const fixtureSnapshot = fixtureSnapshots.find((candidate) => {
    try {
      return fs.statSync(candidate).isDirectory() && fs.readdirSync(candidate).length > 0 &&
        fingerprintDirectory(candidate) === run.fixtureSnapshotRevision &&
        (run.fixtureVersion === undefined || run.fixtureVersion === run.fixtureSnapshotRevision);
    } catch {
      return false;
    }
  });
  const fixtureSnapshotRevision = fixtureSnapshot ? run.fixtureSnapshotRevision : null;
  let sourceRevision = null;
  if (fixtureSnapshot && typeof run.name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(run.name)) {
    try { sourceRevision = fingerprintEvalSource(path.dirname(fixtureSnapshot), run.name, fixtureSnapshotRevision); } catch { /* Missing pinned source input is reported below. */ }
  }
  if (!fixtureSnapshot) problems.push(`${side}: pinned fixture snapshot missing or does not match its recorded revision`);
  if (!Array.isArray(run.phases) || run.phases.length === 0) {
    return { rows: [], problems: [...problems, `${side}: retained phase outcome rows missing`] };
  }
  const seen = new Set();
  const rows = [];
  for (const phase of run.phases) {
    const label = phase?.phase;
    if (typeof label !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(label) || seen.has(label)) {
      problems.push(`${side}: invalid or duplicate phase outcome identifier`);
      continue;
    }
    seen.add(label);
    const answer = path.join(outputDir, label, "answer.md");
    const task = path.join(outputDir, label, "task", "task.md");
    try {
      if (fs.statSync(answer).size === 0 || fs.statSync(task).size === 0) throw new Error("empty outcome artifact");
    } catch {
      problems.push(`${side}: retained answer and task snapshot required for ${label}`);
    }
    if (typeof phase.ok !== "boolean" || !Array.isArray(phase.problems) || (phase.ok && phase.problems.length !== 0) || (!phase.ok && phase.problems.length === 0)) {
      problems.push(`${side}: inconsistent retained grading outcome for ${label}`);
    }
    const coverage = phase.coverage;
    const models = coverage?.models;
    if (coverage?.complete !== true || !positiveInteger(coverage.turns) || coverage.usage_events !== coverage.turns ||
        coverage.cost_events !== coverage.turns || !Array.isArray(models) || models.length !== 1 ||
        typeof models[0] !== "string" || !models[0].trim() || models[0].startsWith("unknown/")) {
      problems.push(`${side}: incomplete usage coverage for ${label}`);
    }
    rows.push({
      id: `${run.name}/${label}`,
      phase: label,
      passed: phase.ok === true,
      coverage,
      cost: phase.cost,
      costBasis: phase.cost_basis,
      costSource: phase.cost_source,
    });
  }
  if (typeof run.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(run.name)) problems.push(`${side}: scenario name missing or invalid`);
  return { rows, problems, fixtureSnapshotRevision };
}

function recordedRunEvidence(input, side) {
  const loaded = loadRetainedManifest(input, side);
  if (!loaded.run) return { normalized: null, problems: loaded.problems };
  const run = loaded.run;
  const problems = [...loaded.problems];
  if (typeof run.name !== "string" || !run.name.trim()) problems.push(`${side}: scenario name missing`);
  if (typeof run.model !== "string" || !run.model.trim()) problems.push(`${side}: configured model missing`);
  if (!/^[a-f0-9]{40}$/i.test(run.fixtureRevision ?? "")) problems.push(`${side}: fixture revision missing or invalid`);
  if (!/^[a-f0-9]{64}$/i.test(run.sourceRevision ?? "")) problems.push(`${side}: source revision missing or invalid`);
  const retained = retainedOutcomeRows(run, loaded.manifestPath, side);
  problems.push(...retained.problems);
  const models = [...new Set(retained.rows.flatMap((row) => Array.isArray(row.coverage?.models) ? row.coverage.models : []))].sort();
  if (models.length !== 1) problems.push(`${side}: phases do not have one consistent observed model`);
  const phaseTurns = retained.rows.reduce((sum, row) => sum + (Number.isSafeInteger(row.coverage?.turns) ? row.coverage.turns : 0), 0);
  const phaseUsageEvents = retained.rows.reduce((sum, row) => sum + (Number.isSafeInteger(row.coverage?.usage_events) ? row.coverage.usage_events : 0), 0);
  const phaseCostEvents = retained.rows.reduce((sum, row) => sum + (Number.isSafeInteger(row.coverage?.cost_events) ? row.coverage.cost_events : 0), 0);
  const aggregate = run.metrics?.coverage;
  if (aggregate?.complete !== true || aggregate.turns !== phaseTurns || aggregate.usage_events !== phaseUsageEvents ||
      aggregate.cost_events !== phaseCostEvents || !Array.isArray(aggregate.models) ||
      !isDeepStrictEqual([...aggregate.models].sort(), models)) {
    problems.push(`${side}: aggregate usage coverage does not reconcile with retained phase rows`);
  }
  return {
    normalized: {
      runId: loaded.manifestPath,
      manifestPath: loaded.manifestPath,
      fixtureVersion: run.fixtureVersion ?? run.fixtureSnapshotRevision ?? run.fixtureRevision,
      fixtureSnapshotRevision: retained.fixtureSnapshotRevision,
      model: run.model,
      sourceRevision: run.sourceRevision,
      usageCoverage: retained.rows.length > 0 && retained.rows.every((row) => row.coverage?.complete === true) ? "complete" : "incomplete",
      rows: retained.rows,
    },
    run,
    problems,
  };
}

function estimatedCost(run) {
  const phases = run.phases;
  if (!Array.isArray(phases) || phases.length === 0 ||
      phases.some((phase) => phase.cost_basis !== "model_rate_estimate_usd" || phase.cost_source !== ESTIMATED_COST_SOURCE ||
        !Number.isFinite(phase.cost?.total) || phase.cost.total < 0)) return null;
  const total = phases.reduce((sum, phase) => sum + phase.cost.total, 0);
  if (!Number.isFinite(run.metrics?.cost?.total) || Math.abs(total - run.metrics.cost.total) > Math.max(1e-9, total * 1e-9)) return null;
  return total;
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
      const beforeIds = before.rows.map((row) => row.id).sort();
      const afterIds = after.rows.map((row) => row.id).sort();
      if (!isDeepStrictEqual(beforeIds, afterIds)) problems.push("retained phase outcome sample identifiers mismatch");
      if (beforeIds.length < minimumSamples || afterIds.length < minimumSamples) problems.push(`sample count below minimum ${minimumSamples}`);
    }
  }
  const comparable = problems.length === 0;
  const afterRows = new Map(after?.rows.map((row) => [row.id, row]) ?? []);
  const sampleOutcomes = comparable ? before.rows.map((row) => ({
    id: row.id,
    beforePassed: row.passed,
    afterPassed: afterRows.get(row.id).passed,
  })) : [];
  const beforePassed = sampleOutcomes.filter((row) => row.beforePassed).length;
  const afterPassed = sampleOutcomes.filter((row) => row.afterPassed).length;
  const qualityEvidence = comparable ? {
    interpretation: "descriptive matched-phase pass rates; not a causal estimate",
    sampleCount: sampleOutcomes.length,
    before: { passed: beforePassed, total: sampleOutcomes.length, rate: beforePassed / sampleOutcomes.length },
    after: { passed: afterPassed, total: sampleOutcomes.length, rate: afterPassed / sampleOutcomes.length },
    rateDelta: (afterPassed - beforePassed) / sampleOutcomes.length,
    sampleOutcomes,
  } : null;
  const beforeEstimatedUsd = beforeResult.run ? estimatedCost(beforeResult.run) : null;
  const afterEstimatedUsd = afterResult.run ? estimatedCost(afterResult.run) : null;
  const estimatedCostEvidence = beforeEstimatedUsd !== null && afterEstimatedUsd !== null && comparable
    ? { beforeUsd: beforeEstimatedUsd, afterUsd: afterEstimatedUsd, differenceUsd: afterEstimatedUsd - beforeEstimatedUsd, basis: "model_rate_estimate_usd" }
    : null;
  return {
    qualityClaimsAllowed: comparable,
    claimsAllowed: comparable,
    causalClaimsAllowed: false,
    savingsClaimsAllowed: false,
    problems,
    matched: comparable ? Object.fromEntries([...JOIN_FIELDS.map((field) => [field, before[field]]), ["beforeRunId", before.runId], ["afterRunId", after.runId], ["beforeEvidenceRef", before.manifestPath], ["afterEvidenceRef", after.manifestPath]]) : null,
    qualityEvidence,
    estimatedCostEvidence,
    costEvidence: null,
    savingsLimit: "provider billing receipts are not retained by the eval runner",
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
      const recorded = recordedRunEvidence(run, "grading");
      const rows = recorded.normalized?.rows ?? [];
      if (path.basename(file) !== "comparison-run.json" || recorded.problems.length > 0 || rows.length === 0 ||
          !rows.every((row) => row.passed) || run.name !== grading.targetScenario ||
          (run.fixtureVersion ?? run.fixtureSnapshotRevision) !== audit.matched?.fixtureVersion ||
          run.sourceRevision !== audit.matched?.sourceRevision ||
          grading.targetScenario !== proposal.targetScenario || grading.expectedBehavior !== proposal.expectedBehavior) return [];
      return [file];
    } catch {
      return [];
    }
  });
}

export function decideFeedback({ before, after, minimumSamples, proposal, grading }) {
  const audit = auditEvalPair(before, after, { minimumSamples });
  const problems = [];
  if (!audit.qualityClaimsAllowed || !audit.matched) problems.push("comparable retained phase outcomes required");
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
