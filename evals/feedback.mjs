import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { fingerprintDirectory, fingerprintEvalSource, RUNNER_SOURCES } from "./evidence.mjs";
import { metricsForOutput } from "./metrics.mjs";

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
function regradeRun(run, manifestPath, side, problems) {
  if (run.kind === "solo") {
    try {
      const outputDir = path.dirname(manifestPath);
      const phase = run.phases?.[0];
      const phaseDir = path.join(outputDir, "1-solo-verification");
      const answer = fs.readFileSync(path.join(phaseDir, "answer.md"), "utf8");
      const stdout = fs.readFileSync(path.join(phaseDir, "omp.jsonl"), "utf8");
      const runtime = fs.readFileSync(path.join(phaseDir, "runtime.txt"), "utf8").trim();
      const repoRuntime = fs.readFileSync(path.join(run.repo, "dist", "runtime.txt"), "utf8").trim();
      const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: run.repo, encoding: "utf8" }).trim();
      const changed = execFileSync("git", ["diff", "--name-only", run.fixtureRevision], { cwd: run.repo, encoding: "utf8" }).trim();
      const observed = metricsForOutput(stdout, phase?.wall_ms ?? null);
      const gradeProblems = [
        ...(run.ompExitCode === 0 ? [] : [`omp exited ${run.ompExitCode}`]),
        ...(answer.trim() ? [] : ["solo answer was empty"]),
        ...(/npm run build -- RUNTIME=node/.test(answer) ? [] : ["answer omitted the required npm run build -- RUNTIME=node command"]),
        ...(/built for node/.test(answer) ? [] : ["answer omitted observed built for node output"]),
        ...(!/npm run build[^\n`]*usage[^\n]*\|\s*fail/i.test(answer) ? [] : ["answer treated a bare build usage error as a product failure"]),
        ...(runtime === "built for node" && runtime === repoRuntime ? [] : [`build output was ${JSON.stringify(runtime)}`]),
        ...(head === run.fixtureRevision && !changed ? [] : ["solo run changed tracked source or committed a new revision"]),
      ];
      if (observed.answer !== answer || !phase || phase.phase !== "1-solo-verification" ||
          !isDeepStrictEqual(phase.problems, gradeProblems) || !isDeepStrictEqual(run.problems, gradeProblems)) {
        problems.push(`${side}: solo result differs from independent retained-output grading`);
      }
      const graded = { ok: gradeProblems.length === 0, phases: [{ phase: "1-solo-verification", ok: gradeProblems.length === 0, problems: gradeProblems }] };
      if (run.ok !== graded.ok) problems.push(`${side}: run.ok differs from independent regrading`);
      return graded;
    } catch {
      problems.push(`${side}: retained solo build and answer evidence could not be regraded`);
      return null;
    }
  }
  const outputDir = path.dirname(manifestPath);
  const runRoot = path.dirname(outputDir);
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, "evals", "run.mjs"), "--grade-json", "--grade", runRoot, run.name,
  ], { cwd: repoRoot, encoding: "utf8" });
  if (result.error || !result.stdout) {
    problems.push(`${side}: retained outputs could not be regraded by the pinned scenario`);
    return null;
  }
  try {
    const graded = JSON.parse(result.stdout).find((candidate) => candidate.name === run.name);
    if (!graded || graded.skipped || !Array.isArray(graded.phases)) {
      problems.push(`${side}: retained outputs could not be regraded by the pinned scenario`);
      return null;
    }
    if (!Array.isArray(run.phases) || run.phases.length !== graded.phases.length ||
        run.phases.some((phase, index) => phase.phase !== graded.phases[index]?.phase)) {
      problems.push(`${side}: retained phase identifiers differ from pinned scenario regrading`);
    }
    return graded;
  } catch {
    problems.push(`${side}: retained outputs produced an invalid regrade result`);
    return null;
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
        run.fixtureVersion === run.fixtureSnapshotRevision;
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
  if (!sourceRevision || sourceRevision !== run.sourceRevision) problems.push(`${side}: pinned source fingerprint missing or does not match its recorded revision`);
  if (fixtureSnapshot && sourceRevision && typeof run.name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(run.name)) {
    try {
      const sourceRoot = path.dirname(fixtureSnapshot);
      const pinnedScenario = path.join(sourceRoot, "eval-sources", "scenarios", `${run.name}.mjs`);
      const currentScenario = path.join(repoRoot, "evals", "scenarios", `${run.name}.mjs`);
      if (!fs.readFileSync(pinnedScenario).equals(fs.readFileSync(currentScenario))) problems.push(`${side}: pinned scenario source differs from current grader source`);
      for (const { source, snapshot } of RUNNER_SOURCES) {
        const pinned = path.join(sourceRoot, "eval-sources", "runner", snapshot);
        const current = path.join(repoRoot, source);
        if (!fs.readFileSync(pinned).equals(fs.readFileSync(current))) problems.push(`${side}: pinned runner source ${source} differs from current grader source`);
      }
    } catch { problems.push(`${side}: pinned evaluator source is unavailable to the grader`); }
  }
  if (typeof run.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(run.name)) {
    problems.push(`${side}: scenario name missing or invalid`);
    return { rows: [], problems, fixtureSnapshotRevision, sourceRevision };
  }
  if (!fixtureSnapshot || !sourceRevision || sourceRevision !== run.sourceRevision ||
      problems.some((problem) => problem.includes("pinned evaluator source") || problem.includes("pinned scenario source") || problem.includes("pinned runner source"))) {
    return { rows: [], problems, fixtureSnapshotRevision, sourceRevision };
  }
  if (!Array.isArray(run.phases) || run.phases.length === 0) {
    return { rows: [], problems: [...problems, `${side}: retained phase outcome rows missing`], fixtureSnapshotRevision, sourceRevision };
  }
  const graded = regradeRun(run, manifestPath, side, problems);
  const rows = [];
  const seen = new Set();
  for (const [index, phase] of run.phases.entries()) {
    const label = phase?.phase;
    if (typeof label !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(label) || seen.has(label)) {
      problems.push(`${side}: invalid or duplicate phase outcome identifier`);
      continue;
    }
    seen.add(label);
    const phaseDir = path.join(outputDir, label);
    let observed;
    try {
      const stdout = fs.readFileSync(path.join(phaseDir, "omp.jsonl"), "utf8");
      observed = metricsForOutput(stdout, phase.wall_ms ?? null);
      if (!observed.answer || observed.answer !== fs.readFileSync(path.join(phaseDir, "answer.md"), "utf8")) throw new Error("answer/output mismatch");
      if (!fs.readFileSync(path.join(phaseDir, "task", "task.md"), "utf8").trim()) throw new Error("task snapshot empty");
    } catch {
      problems.push(`${side}: retained answer, task, and raw OMP output required for ${label}`);
    }
    if (!observed || !isDeepStrictEqual(phase.coverage, observed.coverage) ||
        !isDeepStrictEqual(phase.tokens, observed.tokens) || !isDeepStrictEqual(phase.cost, observed.cost) ||
        phase.cost_basis !== observed.cost_basis || phase.cost_source !== observed.cost_source) {
      problems.push(`${side}: recorded usage or cost differs from raw OMP output for ${label}`);
    }
    const gradedPhase = graded?.phases[index];
    const phasePassed = phase.exitCode === 0 && gradedPhase?.ok === true;
    if (phase.ok !== phasePassed ||
        (phase.ok && (!Array.isArray(phase.problems) || phase.problems.length !== 0)) ||
        (!phase.ok && (!Array.isArray(phase.problems) || phase.problems.length === 0))) {
      problems.push(`${side}: phase ${label} outcome differs from independent regrading and process status`);
    }
    const coverage = observed?.coverage ?? null;
    if (coverage?.complete !== true || !positiveInteger(coverage.turns) || coverage.usage_events !== coverage.turns ||
        coverage.cost_events !== coverage.turns || !Array.isArray(coverage.models) || coverage.models.length !== 1 ||
        typeof coverage.models[0] !== "string" || !coverage.models[0].trim() || coverage.models[0].startsWith("unknown/")) {
      problems.push(`${side}: incomplete usage coverage for ${label}`);
    }
    rows.push({
      id: `${run.name}/${label}`,
      phase: label,
      passed: phasePassed,
      coverage,
      cost: observed?.cost ?? null,
      costBasis: observed?.cost_basis ?? null,
      costSource: observed?.cost_source ?? null,
    });
  }
  if (run.ok !== (rows.length === run.phases.length && rows.every((row) => row.passed))) {
    problems.push(`${side}: run.ok differs from independent phase outcomes`);
  }
  return { rows, problems, fixtureSnapshotRevision, sourceRevision };
}

function singleRunEvidence(run, manifestPath, side) {
  const problems = [];
  if (typeof run.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(run.name)) problems.push(`${side}: scenario name missing or invalid`);
  if (typeof run.model !== "string" || !run.model.trim()) problems.push(`${side}: configured model missing`);
  if (!/^[a-f0-9]{40}$/i.test(run.fixtureRevision ?? "")) problems.push(`${side}: fixture revision missing or invalid`);
  if (!/^[a-f0-9]{64}$/i.test(run.sourceRevision ?? "")) problems.push(`${side}: source revision missing or invalid`);
  if (typeof run.executionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(run.executionId)) {
    problems.push(`${side}: runner execution identity missing or invalid`);
  }
  const retained = retainedOutcomeRows(run, manifestPath, side);
  problems.push(...retained.problems);
  const models = [...new Set(retained.rows.flatMap((row) => Array.isArray(row.coverage?.models) ? row.coverage.models : []))].sort();
  const actualModel = models.length === 1 ? models[0] : null;
  if (!actualModel || run.actualModel !== actualModel) problems.push(`${side}: observed actual model missing or mismatched`);
  const phaseTurns = retained.rows.reduce((sum, row) => sum + (Number.isSafeInteger(row.coverage?.turns) ? row.coverage.turns : 0), 0);
  const phaseUsageEvents = retained.rows.reduce((sum, row) => sum + (Number.isSafeInteger(row.coverage?.usage_events) ? row.coverage.usage_events : 0), 0);
  const phaseCostEvents = retained.rows.reduce((sum, row) => sum + (Number.isSafeInteger(row.coverage?.cost_events) ? row.coverage.cost_events : 0), 0);
  const aggregate = run.metrics?.coverage;
  if (aggregate?.complete !== true || aggregate.turns !== phaseTurns || aggregate.usage_events !== phaseUsageEvents ||
      aggregate.cost_events !== phaseCostEvents || !Array.isArray(aggregate.models) ||
      !isDeepStrictEqual([...aggregate.models].sort(), models)) {
    problems.push(`${side}: aggregate usage coverage does not reconcile with retained phase rows`);
  }
  const costRows = retained.rows;
  const costTotal = costRows.every((row) => row.costBasis === "model_rate_estimate_usd" && row.costSource === ESTIMATED_COST_SOURCE &&
      Number.isFinite(row.cost?.total) && row.cost.total >= 0)
    ? costRows.reduce((sum, row) => sum + row.cost.total, 0)
    : null;
  if (costTotal === null || !Number.isFinite(run.metrics?.cost?.total) ||
      Math.abs(costTotal - run.metrics.cost.total) > Math.max(1e-9, costTotal * 1e-9)) {
    problems.push(`${side}: aggregate estimated cost does not reconcile with raw phase usage`);
  }
  const normalized = {
    runId: manifestPath,
    manifestPath,
    fixtureVersion: run.fixtureVersion,
    fixtureSnapshotRevision: retained.fixtureSnapshotRevision,
    model: run.model,
    actualModel,
    sourceRevision: retained.sourceRevision,
    usageCoverage: aggregate?.complete === true ? "complete" : "incomplete",
    rows: [{
      id: run.executionId,
      passed: run.ok === true,
      coverage: aggregate,
      cost: costTotal === null ? null : { total: costTotal },
      costBasis: costTotal === null ? null : "model_rate_estimate_usd",
      costSource: costTotal === null ? null : ESTIMATED_COST_SOURCE,
    }],
  };
  return { normalized, run, problems };
}

function recordedRunEvidence(input, side) {
  const loaded = loadRetainedManifest(input, side);
  if (!loaded.run) return { normalized: null, problems: loaded.problems };
  const root = loaded.run;
  if (!Array.isArray(root.sampleRuns)) {
    const single = singleRunEvidence(root, loaded.manifestPath, side);
    single.problems.unshift(...loaded.problems);
    return single;
  }
  const problems = [...loaded.problems];
  const cohortDir = path.dirname(loaded.manifestPath);
  let realRoot;
  try { realRoot = fs.realpathSync(cohortDir); }
  catch { return { normalized: null, problems: [...problems, `${side}: sample cohort directory missing`] }; }
  if (path.resolve(repoRoot, root.rawOutput) !== realRoot || root.sampleRuns.length === 0) {
    problems.push(`${side}: sample cohort root or sample list invalid`);
  }
  const samples = [];
  const executionIds = new Set();
  const manifestPaths = new Set();
  let firstSampleEvidence = null;
  for (const [index, reference] of root.sampleRuns.entries()) {
    if (typeof reference !== "string" || !reference.trim() || path.isAbsolute(reference)) {
      problems.push(`${side}: sample reference invalid`);
      continue;
    }
    const sampleDir = path.resolve(cohortDir, reference);
    if (!sampleDir.startsWith(`${cohortDir}${path.sep}`)) {
      problems.push(`${side}: sample reference escapes cohort directory`);
      continue;
    }
    try {
      const realSampleDir = fs.realpathSync(sampleDir);
      if (!realSampleDir.startsWith(`${realRoot}${path.sep}`) || manifestPaths.has(realSampleDir)) {
        problems.push(`${side}: duplicate or external sample run`);
        continue;
      }
      const manifestPath = path.join(realSampleDir, "comparison-run.json");
      const child = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (typeof child.rawOutput !== "string" || path.resolve(repoRoot, child.rawOutput) !== realSampleDir ||
          Array.isArray(child.sampleRuns)) {
        problems.push(`${side}: nested or misbound sample run`);
        continue;
      }
      const evidence = singleRunEvidence(child, manifestPath, side);
      problems.push(...evidence.problems);
      if (executionIds.has(child.executionId)) problems.push(`${side}: repeated runner execution identity`);
      executionIds.add(child.executionId);
      manifestPaths.add(realSampleDir);
      if (!evidence.normalized || evidence.normalized.rows.length !== 1) continue;
      if (firstSampleEvidence) {
        for (const field of JOIN_FIELDS) {
          if (evidence.normalized[field] !== firstSampleEvidence.normalized[field]) problems.push(`${side}: sample ${field} mismatch`);
        }
        if (child.name !== firstSampleEvidence.run.name) problems.push(`${side}: sample scenario mismatch`);
      } else {
        firstSampleEvidence = evidence;
      }
      samples.push({
        ...evidence.normalized.rows[0],
        id: `sample-${String(index + 1).padStart(2, "0")}`,
      });
    } catch {
      problems.push(`${side}: sample run manifest missing or invalid`);
    }
  }
  if (firstSampleEvidence && root.name !== firstSampleEvidence.run.name) problems.push(`${side}: cohort scenario does not match its retained samples`);
  const normalized = firstSampleEvidence ? {
    runId: loaded.manifestPath,
    manifestPath: loaded.manifestPath,
    fixtureVersion: firstSampleEvidence.normalized.fixtureVersion,
    fixtureSnapshotRevision: firstSampleEvidence.normalized.fixtureSnapshotRevision,
    model: firstSampleEvidence.normalized.model,
    actualModel: firstSampleEvidence.normalized.actualModel,
    sourceRevision: firstSampleEvidence.normalized.sourceRevision,
    usageCoverage: samples.every((sample) => sample.coverage?.complete === true) ? "complete" : "incomplete",
    rows: samples,
  } : null;
  return { normalized, run: root, problems };
}

function estimatedCost(evidence) {
  const rows = evidence?.rows;
  if (!Array.isArray(rows) || rows.length === 0 ||
      rows.some((row) => row.costBasis !== "model_rate_estimate_usd" || row.costSource !== ESTIMATED_COST_SOURCE ||
        !Number.isFinite(row.cost?.total) || row.cost.total < 0)) return null;
  return rows.reduce((sum, row) => sum + row.cost.total, 0);
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
      if (!isDeepStrictEqual(beforeIds, afterIds)) problems.push("retained execution sample identifiers mismatch");
      if (beforeIds.length < minimumSamples || afterIds.length < minimumSamples) problems.push(`sample count below minimum ${minimumSamples} separately executed outcomes`);
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
    interpretation: "descriptive matched execution pass rates; not a causal estimate",
    sampleCount: sampleOutcomes.length,
    before: { passed: beforePassed, total: sampleOutcomes.length, rate: beforePassed / sampleOutcomes.length },
    after: { passed: afterPassed, total: sampleOutcomes.length, rate: afterPassed / sampleOutcomes.length },
    rateDelta: (afterPassed - beforePassed) / sampleOutcomes.length,
    sampleOutcomes,
  } : null;
  const beforeEstimatedUsd = estimatedCost(before);
  const afterEstimatedUsd = estimatedCost(after);
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
          Array.isArray(run.sampleRuns) || run.ok !== true || !rows.every((row) => row.passed) ||
          run.name !== grading.targetScenario || run.fixtureVersion !== audit.matched?.fixtureVersion ||
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
