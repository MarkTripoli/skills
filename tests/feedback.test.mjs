import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { auditEvalPair, decideFeedback } from "../evals/feedback.mjs";
import { fingerprintDirectory, fingerprintEvalSource, RUNNER_SOURCES } from "../evals/evidence.mjs";
import { metricsForOutput } from "../evals/metrics.mjs";
import { buildRuntime } from "../scripts/lib/build.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenario = "verify-required-arguments";
const model = "provider/model-a";
const answer = "Ran npm run build -- RUNTIME=node; observed built for node. Read package.json, CI, and README.\n";
const proposal = { rule: "prefer model B for task X", rationale: "targeted evidence", targetScenario: scenario, expectedBehavior: "required runtime build succeeds" };
let generatedFixture;
after(() => { if (generatedFixture) fs.rmSync(generatedFixture, { recursive: true, force: true }); });

function generatedSources() {
  if (!generatedFixture) {
    generatedFixture = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-generated-"));
    buildRuntime("oh-my-pi", generatedFixture);
  }
  return generatedFixture;
}

function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function snapshot(dist) {
  const fixtures = path.join(dist, "fixtures");
  fs.mkdirSync(fixtures, { recursive: true });
  fs.writeFileSync(path.join(fixtures, "case.json"), "{\"value\":1}\n");
  save(path.join(fixtures, "delivery-comparison", "acceptance.json"), { id: "required-runtime", acceptance: ["Build succeeds with RUNTIME=node"] });
  for (const fixture of ["repo-cli", scenario]) {
    fs.cpSync(path.join(repoRoot, "evals", "fixtures", fixture), path.join(fixtures, fixture), { recursive: true });
  }
  const generated = generatedSources();
  fs.cpSync(path.join(generated, "agents"), path.join(dist, "agents"), { recursive: true });
  fs.cpSync(path.join(generated, "skills"), path.join(dist, "skills"), { recursive: true });
  fs.mkdirSync(path.join(dist, "shared"), { recursive: true });
  for (const file of ["WRITING.md", "CONVENTIONS.md"]) {
    fs.copyFileSync(path.join(repoRoot, "shared", file), path.join(dist, "shared", file));
  }
  const source = path.join(dist, "eval-sources");
  fs.mkdirSync(path.join(source, "scenarios"), { recursive: true });
  fs.mkdirSync(path.join(source, "runner"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "evals", "scenarios", `${scenario}.mjs`), path.join(source, "scenarios", `${scenario}.mjs`));
  for (const { source: file, snapshot } of RUNNER_SOURCES) {
    const target = path.join(source, "runner", snapshot);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, file), target);
  }
  const fixtureSnapshotRevision = fingerprintDirectory(fixtures);
  return { fixtureSnapshotRevision, sourceRevision: fingerprintEvalSource(dist, scenario, fixtureSnapshotRevision) };
}

function fixtureRepo(root) {
  const repo = path.join(root, "repo");
  fs.mkdirSync(path.join(repo, "dist"), { recursive: true });
  fs.writeFileSync(path.join(repo, "dist", "runtime.txt"), "built for node\n");
  fs.writeFileSync(path.join(repo, "fixture.txt"), "fixture\n");
  const task = path.join(repo, ".agents", "tasks", scenario, "task.md");
  fs.mkdirSync(path.dirname(task), { recursive: true });
  fs.writeFileSync(task, "Verify runtime argument.\n");
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "eval@example.invalid");
  git(repo, "config", "user.name", "Eval fixture");
  git(repo, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", "fixture"], {
    cwd: repo,
    env: { ...process.env, GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" },
  });
  return { repo, revision: git(repo, "rev-parse", "HEAD") };
}

function ompOutput(finalAnswer = answer) {
  return [
    { type: "turn_end", message: { provider: "provider", model: "model-a", usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, cost: { total: 0.03, input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0 } } } },
    { type: "agent_end", isTerminal: true, messages: [{ role: "assistant", content: [{ type: "text", text: finalAnswer }] }] },
  ].map((event) => JSON.stringify(event)).join("\n") + "\n";
}

function writeSolo(dir, source, fixture, passed = true) {
  const phase = "1-solo-verification";
  const phaseDir = path.join(dir, phase);
  fs.cpSync(path.join(path.dirname(dir), ".dist"), path.join(dir, ".dist"), { recursive: true });
  const stdout = ompOutput();
  const observed = metricsForOutput(stdout, 1000);
  fs.mkdirSync(path.join(phaseDir, "task"), { recursive: true });
  fs.writeFileSync(path.join(phaseDir, "omp.jsonl"), stdout);
  fs.writeFileSync(path.join(phaseDir, "answer.md"), answer);
  fs.writeFileSync(path.join(phaseDir, "task", "task.md"), "Verify runtime argument.\n");
  fs.writeFileSync(path.join(phaseDir, "runtime.txt"), "built for node\n");
  const problems = passed ? [] : ["omp exited 1"];
  const run = {
    name: scenario, kind: "solo", executionId: crypto.randomUUID(), ok: passed,
    ompExitCode: passed ? 0 : 1, actualModel: model,
    fixtureRevision: fixture.revision, fixtureVersion: source.fixtureSnapshotRevision,
    fixtureSnapshotRevision: source.fixtureSnapshotRevision, sourceRevision: source.sourceRevision,
    model, repo: fixture.repo, rawOutput: dir,
    metrics: observed,
    phases: [{ phase, exitCode: passed ? 0 : 1, wall_ms: 1000, tokens: observed.tokens, cost: observed.cost,
      cost_basis: observed.cost_basis, cost_source: observed.cost_source, coverage: observed.coverage, ok: passed, problems }],
    problems,
  };
  save(path.join(dir, "comparison-run.json"), run);
  return run;
}

function writeDelivery(dir, source, fixture, passed = true) {
  const phase = "1-verify-implementation";
  const phaseDir = path.join(dir, phase);
  const deliveryAnswer = "Verified the build.\n```text\n/review-code\n```\n";
  const stdout = ompOutput(deliveryAnswer);
  const observed = metricsForOutput(stdout, 1000);
  const task = path.join(fixture.repo, ".agents", "tasks", scenario);
  fs.mkdirSync(path.join(phaseDir, "task"), { recursive: true });
  fs.writeFileSync(path.join(phaseDir, "omp.jsonl"), stdout);
  fs.writeFileSync(path.join(phaseDir, "answer.md"), deliveryAnswer);
  fs.copyFileSync(path.join(task, "task.md"), path.join(phaseDir, "task", "task.md"));
  fs.copyFileSync(path.join(task, "01-verification.md"), path.join(phaseDir, "task", "01-verification.md"));
  fs.writeFileSync(path.join(phaseDir, "runtime.txt"), "built for node\n");
  const problems = passed ? [] : ["omp exited 1"];
  const run = {
    name: scenario, kind: "delivery", executionId: crypto.randomUUID(), ok: passed,
    actualModel: model, fixtureRevision: fixture.revision, fixtureVersion: source.fixtureSnapshotRevision,
    fixtureSnapshotRevision: source.fixtureSnapshotRevision, sourceRevision: source.sourceRevision,
    model, repo: fixture.repo, rawOutput: dir, metrics: observed,
    phases: [{ phase, exitCode: passed ? 0 : 1, wall_ms: 1000, tokens: observed.tokens, cost: observed.cost,
      cost_basis: observed.cost_basis, cost_source: observed.cost_source, coverage: observed.coverage, ok: passed,
      problems, gitProblems: [] }],
  };
  save(path.join(dir, "comparison-run.json"), run);
  return run;
}

function writeCohort(root, side, passed = 10) {
  const dir = path.join(root, side);
  const source = snapshot(path.join(dir, ".dist"));
  const fixture = fixtureRepo(path.join(dir, "fixture"));
  const sampleRuns = Array.from({ length: 10 }, (_, index) => {
    const name = `sample-${String(index + 1).padStart(2, "0")}`;
    if (side !== "before" && index === 0) {
      const artifact = path.join(fixture.repo, ".agents", "tasks", scenario, "01-verification.md");
      fs.writeFileSync(artifact, "---\ntype: verification\nstatus: passed\nsummary: Build verified\n---\n## Run\nChecked package.json, CI, and README. npm run build -- RUNTIME=node emitted built for node.\n");
      git(fixture.repo, "add", path.relative(fixture.repo, artifact));
      git(fixture.repo, "commit", "-q", "-m", "docs(task): verify runtime build");
    }
    if (side === "before") writeSolo(path.join(dir, name), source, fixture, index < passed);
    else {
      const sampleRoot = path.join(dir, name);
      fs.cpSync(path.join(dir, ".dist"), path.join(sampleRoot, ".dist"), { recursive: true });
      writeDelivery(path.join(sampleRoot, scenario), source, fixture, index < passed);
    }
    return side === "before" ? name : path.join(name, scenario);
  });
  const cohort = { name: scenario, kind: side === "before" ? "solo" : "delivery", rawOutput: dir, sampleRuns, sampleCount: sampleRuns.length,
    ok: passed === 10, model, actualModel: model, fixtureRevision: fixture.revision,
    fixtureVersion: source.fixtureSnapshotRevision, fixtureSnapshotRevision: source.fixtureSnapshotRevision, sourceRevision: source.sourceRevision };
  save(path.join(dir, "comparison-run.json"), cohort);
  return cohort;
}

function withPair(action, beforePassed = 10, afterPassed = 10) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "feedback-retained-")));
  try { return action(writeCohort(root, "before", beforePassed), writeCohort(root, "after", afterPassed), root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function independentGrade(root, after) {
  const gradeRoot = path.join(root, "grade");
  const source = { fixtureSnapshotRevision: after.fixtureSnapshotRevision, sourceRevision: after.sourceRevision };
  fs.cpSync(path.join(after.rawOutput, ".dist"), path.join(gradeRoot, ".dist"), { recursive: true });
  const fixture = fixtureRepo(path.join(root, "grade-fixture"));
  const artifact = path.join(fixture.repo, ".agents", "tasks", scenario, "01-verification.md");
  fs.copyFileSync(path.join(after.rawOutput, "fixture", "repo", ".agents", "tasks", scenario, "01-verification.md"), artifact);
  git(fixture.repo, "add", path.relative(fixture.repo, artifact));
  git(fixture.repo, "commit", "-q", "-m", "docs(task): verify runtime build");
  return path.join(writeDelivery(path.join(gradeRoot, scenario), source, fixture).rawOutput, "comparison-run.json");
}


function sample(cohort, index = 0) {
  return path.join(cohort.rawOutput, cohort.sampleRuns[index], "comparison-run.json");
}
function cohortDistRoots(cohort) {
  return [...new Set([path.join(cohort.rawOutput, ".dist"),
    ...cohort.sampleRuns.map((_, index) => path.join(path.dirname(path.dirname(sample(cohort, index))), ".dist"))])];
}


function editSample(cohort, action, index = 0) {
  const file = sample(cohort, index);
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  action(run);
  save(file, run);
}

function advanceFixture(cohort) {
  const repo = path.join(cohort.rawOutput, "fixture", "repo");
  fs.writeFileSync(path.join(repo, "revised-fixture.txt"), "revised\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "revise fixture");
  const revision = git(repo, "rev-parse", "HEAD");
  for (let index = 0; index < cohort.sampleRuns.length; index++) {
    editSample(cohort, (run) => { run.fixtureRevision = revision; }, index);
  }
  cohort.fixtureRevision = revision;
  save(path.join(cohort.rawOutput, "comparison-run.json"), cohort);
}

test("matched independent retained outcomes support descriptive quality, never billed savings", () => {
  withPair((before, after) => {
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, true, audit.problems.join("; "));
    assert.equal(audit.qualityEvidence.sampleCount, 10);
    assert.equal(audit.qualityEvidence.before.rate, 0.4);
    assert.equal(audit.qualityEvidence.after.rate, 0.8);
    assert.equal(audit.qualityEvidence.rateDelta, 0.4);
    assert.equal(audit.estimatedCostEvidence.basis, "model_rate_estimate_usd");
    assert.equal(audit.savingsClaimsAllowed, false);
    const command = [path.join(repoRoot, "evals", "run.mjs"), "--compare", before.rawOutput, after.rawOutput];
    const compared = spawnSync(process.execPath, command, { cwd: repoRoot, encoding: "utf8" });
    assert.equal(compared.status, 0, compared.stderr);
    const report = JSON.parse(compared.stdout);
    assert.equal(report.solo.acceptance, "failed");
    assert.equal(report.delivery.acceptance, "failed");
    after.ok = true;
    save(path.join(after.rawOutput, "comparison-run.json"), after);
    const forged = JSON.parse(spawnSync(process.execPath, command, { cwd: repoRoot, encoding: "utf8" }).stdout);
    assert.equal(forged.delivery.acceptance, "incomplete");
    assert.equal(forged.qualityClaimsAllowed, false);
    assert.equal(audit.costEvidence, null);
  }, 4, 8);
});
test("comparison and recorder require retained solo-before and delivery-after identities", () => {
  withPair((before, after) => {
    assert.equal(auditEvalPair(before, after).qualityClaimsAllowed, true);
    editSample(after, (run) => { run.kind = "solo"; });
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("retained delivery kind and phase")));
  });
  withPair((before, after) => {
    editSample(after, (run) => { run.phases[0].phase = "1-solo-verification"; });
    assert.equal(auditEvalPair(before, after).qualityClaimsAllowed, false);
  });
  withPair((before, after) => {
    editSample(before, (run) => { run.kind = "delivery"; });
    assert.equal(auditEvalPair(before, after).qualityClaimsAllowed, false);
  });
  withPair((before, after) => {
    after.kind = "solo";
    save(path.join(after.rawOutput, "comparison-run.json"), after);
    assert.equal(auditEvalPair(before, after).qualityClaimsAllowed, false);
  });
});


test("caller metadata, missing samples, and reused execution identities cannot mint cohorts", () => {
  withPair((before, after) => {
    const fakeCount = { ...after, sampleCount: 9000, sampleRuns: after.sampleRuns.slice(0, 9) };
    save(path.join(after.rawOutput, "comparison-run.json"), fakeCount);
    assert.equal(auditEvalPair(before, fakeCount).qualityClaimsAllowed, false);
  });
  withPair((before, after) => {
    fs.rmSync(sample(after, 0));
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("sample run manifest missing")));
  });
  withPair((before, after) => {
    const first = JSON.parse(fs.readFileSync(sample(after), "utf8"));
    editSample(after, (run) => { run.executionId = first.executionId; }, 1);
    assert.ok(auditEvalPair(before, after).problems.some((problem) => problem.includes("repeated runner execution identity")));
  });
  withPair((before, after) => {
    const first = JSON.parse(fs.readFileSync(sample(before), "utf8"));
    editSample(after, (run) => { run.executionId = first.executionId; });
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("before and after reuse a runner execution identity")));
  });
  withPair((before, after) => {
    before.fixtureRevision = after.fixtureRevision = "0".repeat(40);
    save(path.join(before.rawOutput, "comparison-run.json"), before);
    save(path.join(after.rawOutput, "comparison-run.json"), after);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("cohort fixture or source pins differ")));
    const grading = { status: "passed", targetScenario: scenario, expectedBehavior: proposal.expectedBehavior, evidence: [sample(after)] };
    assert.equal(decideFeedback({ before, after, proposal, grading }).disposition, "held");
  });
});

test("fixture, scenario, runner, and transitive grader source must remain pinned", () => {
  for (const relative of ["fixtures/case.json", `eval-sources/scenarios/${scenario}.mjs`,
    "eval-sources/runner/acme-chain.mjs", "eval-sources/runner/scripts/check-commits.mjs",
    "skills/verify-implementation/SKILL.md", "agents/agent-implementer.md", "shared/WRITING.md"]) {
    withPair((before, after) => {
      for (const dist of cohortDistRoots(after)) fs.appendFileSync(path.join(dist, relative), "tampered\n");
      const audit = auditEvalPair(before, after);
      assert.equal(audit.qualityClaimsAllowed, false, relative);
      assert.ok(audit.problems.some((problem) => problem.includes("pinned") || problem.includes("fingerprint")), relative);
    });
  }
});

test("solo source pin is checked at the snapshot consumed by its retained execution", () => {
  withPair((before, after) => {
    fs.appendFileSync(path.join(path.dirname(sample(before)), ".dist", "fixtures", "case.json"), "tampered\n");
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("before: pinned fixture snapshot missing")));
  });
});

test("pinned skills, agents, and guidance must match current generated sources", () => {
  for (const [relative, message] of [
    ["skills/verify-implementation/SKILL.md", "pinned skills source differs"],
    ["skills/verify-implementation/references/verification_template.md", "pinned skills source differs"],
    ["agents/agent-implementer.md", "pinned agents source differs"],
    ["shared/WRITING.md", "pinned shared guidance differs"],
    ["shared/CONVENTIONS.md", "pinned shared guidance differs"],
  ]) {
    withPair((before, after) => {
      const dist = path.join(after.rawOutput, ".dist");
      const initialRevision = after.sourceRevision;
      for (const root of cohortDistRoots(after)) fs.appendFileSync(path.join(root, relative), "\n// previous version\n");
      const revision = fingerprintEvalSource(dist, scenario, after.fixtureSnapshotRevision);
      assert.notEqual(revision, initialRevision, relative);
      for (let index = 0; index < after.sampleRuns.length; index++) {
        editSample(after, (run) => { run.sourceRevision = revision; }, index);
      }
      after.sourceRevision = revision;
      save(path.join(after.rawOutput, "comparison-run.json"), after);
      const audit = auditEvalPair(before, after);
      assert.equal(audit.qualityClaimsAllowed, false, relative);
      assert.ok(audit.problems.some((problem) => problem.includes(message)), `${relative}: ${audit.problems.join("; ")}`);
    });
  }
});

test("a self-consistent old grader snapshot cannot be regraded with changed current code", () => {
  withPair((before, after) => {
    const dist = path.join(after.rawOutput, ".dist");
    for (const root of cohortDistRoots(after)) fs.appendFileSync(path.join(root, "eval-sources", "runner", "scripts", "check-commits.mjs"), "\n// prior grading rule\n");
    const revision = fingerprintEvalSource(dist, scenario, after.fixtureSnapshotRevision);
    for (let index = 0; index < after.sampleRuns.length; index++) {
      editSample(after, (run) => { run.sourceRevision = revision; }, index);
    }
    after.sourceRevision = revision;
    save(path.join(after.rawOutput, "comparison-run.json"), after);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("pinned runner source scripts/check-commits.mjs differs")));
  });
});
test("raw OMP usage, independently regraded outcome, and runtime proof bind each sample", () => {
  withPair((before, after) => {
    editSample(after, (run) => { run.metrics.coverage.turns = 9000; });
    assert.ok(auditEvalPair(before, after).problems.some((problem) => problem.includes("aggregate usage coverage")));
  });
  withPair((before, after) => {
    editSample(after, (run) => { run.ok = false; run.phases[0].ok = false; run.phases[0].problems = ["forged failure"]; });
    assert.ok(auditEvalPair(before, after).problems.some((problem) => problem.includes("offline grading and retained live proof")));
  });
  withPair((before, after) => {
    fs.rmSync(path.join(path.dirname(sample(after)), "1-verify-implementation", "omp.jsonl"));
    assert.ok(auditEvalPair(before, after).problems.some((problem) => problem.includes("raw OMP output")));
  });
});
test("a missing solo build output counts as a failed retained execution", () => {
  withPair((before, after) => {
    fs.rmSync(path.join(before.rawOutput, "fixture", "repo", "dist", "runtime.txt"));
    const gradeProblems = ["build output was null", "solo run changed tracked source or committed a new revision"];
    for (let index = 0; index < before.sampleRuns.length; index++) {
      const phaseDir = path.join(path.dirname(sample(before, index)), "1-solo-verification");
      fs.rmSync(path.join(phaseDir, "runtime.txt"));
      editSample(before, (run) => {
        run.ok = false;
        run.problems = gradeProblems;
        run.phases[0].ok = false;
        run.phases[0].problems = gradeProblems;
      }, index);
    }
    before.ok = false;
    save(path.join(before.rawOutput, "comparison-run.json"), before);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, true, audit.problems.join("; "));
    assert.equal(audit.qualityEvidence.before.passed, 0);
    assert.equal(audit.beforeAcceptance, "failed");
  });
});


test("feedback requires an independent executed delivery grade, not either comparison leg", () => {
  withPair((before, after, root) => {
    const grading = { status: "passed", targetScenario: scenario, expectedBehavior: proposal.expectedBehavior, evidence: [sample(after)] };
    assert.equal(before.fixtureRevision, after.fixtureRevision);
    assert.equal(decideFeedback({ before, after, proposal, grading }).disposition, "held");
    assert.equal(decideFeedback({ before, after, proposal, grading: { ...grading, evidence: [sample(before)] } }).disposition, "held");
    grading.evidence = [independentGrade(root, after)];
    const result = decideFeedback({ before, after, proposal, grading, approval: { decision: "approved", actor: "caller" } });
    assert.equal(result.disposition, "pending-human-review", result.problems?.join("; "));
    assert.equal(result.applied, false);
    assert.equal(decideFeedback({ before, after, proposal, grading: { ...grading, evidence: [] } }).disposition, "held");
    const gradeFile = grading.evidence[0];
    const forgedGrade = JSON.parse(fs.readFileSync(gradeFile, "utf8"));
    forgedGrade.kind = "solo";
    save(gradeFile, forgedGrade);
    assert.equal(decideFeedback({ before, after, proposal, grading }).disposition, "held");
  });
});

test("recorded live-only git failures are audited against the retained delivery repository", () => {
  const recordFailure = (after, gitProblems) => {
    for (let index = 0; index < after.sampleRuns.length; index++) {
      editSample(after, (run) => {
        run.ok = false;
        run.phases[0].ok = false;
        run.phases[0].gitProblems = gitProblems;
        run.phases[0].problems = gitProblems;
      }, index);
    }
    after.ok = false;
    save(path.join(after.rawOutput, "comparison-run.json"), after);
  };
  withPair((before, after) => {
    fs.writeFileSync(path.join(after.rawOutput, "fixture", "repo", "dirty.txt"), "untracked\n");
    recordFailure(after, ["git: repository left dirty:\n?? dirty.txt"]);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, true, audit.problems.join("; "));
    assert.equal(audit.afterAcceptance, "failed");
    assert.equal(audit.qualityEvidence.after.passed, 0);
  });
  withPair((before, after) => {
    const repo = path.join(after.rawOutput, "fixture", "repo");
    const extra = path.join(repo, ".agents", "tasks", scenario, "extra.md");
    fs.writeFileSync(extra, "Unrelated commit\n");
    git(repo, "add", path.relative(repo, extra));
    git(repo, "commit", "-q", "-m", "docs(task): unrelated changes");
    recordFailure(after, [`git: HEAD does not commit produced artifact .agents/tasks/${scenario}/01-verification.md (changed: .agents/tasks/${scenario}/extra.md)`]);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, true, audit.problems.join("; "));
    assert.equal(audit.afterAcceptance, "failed");
  });
  withPair((before, after) => {
    recordFailure(after, ["git: repository left dirty:\n?? forged.txt"]);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("recorded live git proof differs")));
  });
});

test("cleaned delivery Git bundles prove success; forged repo-null success cannot erase a failed run", () => {
  withPair((before, after) => {
    for (let index = 0; index < after.sampleRuns.length; index++) {
      const output = path.dirname(sample(after, index));
      git(path.join(after.rawOutput, "fixture", "repo"), "bundle", "create", path.join(output, "git-proof.bundle"), "HEAD");
      editSample(after, (run) => { run.repo = null; }, index);
    }
    fs.rmSync(path.join(after.rawOutput, "fixture", "repo"), { recursive: true, force: true });
    const accepted = auditEvalPair(before, after);
    assert.equal(accepted.qualityClaimsAllowed, true, accepted.problems.join("; "));
    assert.equal(accepted.afterAcceptance, "passed");
    fs.rmSync(path.join(path.dirname(sample(after)), "git-proof.bundle"));
    const missing = auditEvalPair(before, after);
    assert.equal(missing.qualityClaimsAllowed, false);
    assert.ok(missing.problems.some((problem) => problem.includes("Git proof missing or invalid")));
  });
  withPair((before, after) => {
    fs.writeFileSync(path.join(after.rawOutput, "fixture", "repo", "dirty.txt"), "untracked\n");
    editSample(after, (run) => {
      run.repo = null;
      run.ok = true;
      run.phases[0].ok = true;
      run.phases[0].problems = [];
      run.phases[0].gitProblems = [];
    });
    const forged = auditEvalPair(before, after);
    assert.equal(forged.qualityClaimsAllowed, false);
    assert.ok(forged.problems.some((problem) => problem.includes("Git proof missing or invalid")));
  });
});

test("the audited source root is exactly the source root consumed by regrading", () => {
  withPair((before, after) => {
    const output = path.dirname(sample(after));
    const source = path.join(path.dirname(output), ".dist");
    fs.cpSync(source, path.join(output, ".dist"), { recursive: true });
    fs.appendFileSync(path.join(source, "fixtures", "case.json"), "tampered\n");
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    assert.ok(audit.problems.some((problem) => problem.includes("pinned fixture snapshot missing")));
  });
});

test("the fixture commit reconstructs a genuine first-phase task mutation, not a forged failure", () => {
  const baselineProblem = "task.md: an earlier file was modified by this phase";
  withPair((before, after) => {
    const repo = path.join(after.rawOutput, "fixture", "repo");
    const relative = `.agents/tasks/${scenario}/task.md`;
    fs.appendFileSync(path.join(repo, relative), "changed by phase\n");
    const gitProblem = `git: repository left dirty:\n${git(repo, "status", "--porcelain")}`;
    for (let index = 0; index < after.sampleRuns.length; index++) {
      const output = path.dirname(sample(after, index));
      fs.appendFileSync(path.join(output, "1-verify-implementation", "task", "task.md"), "changed by phase\n");
      editSample(after, (run) => {
        run.ok = false;
        run.phases[0].ok = false;
        run.phases[0].gitProblems = [gitProblem];
        run.phases[0].problems = [baselineProblem, gitProblem];
      }, index);
    }
    after.ok = false;
    save(path.join(after.rawOutput, "comparison-run.json"), after);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, true, audit.problems.join("; "));
    assert.equal(audit.afterAcceptance, "failed");
    assert.equal(audit.qualityEvidence.after.passed, 0);
  });
  withPair((before, after) => {
    editSample(after, (run) => {
      run.ok = false;
      run.phases[0].ok = false;
      run.phases[0].problems = [baselineProblem];
    });
    after.ok = false;
    save(path.join(after.rawOutput, "comparison-run.json"), after);
    const forged = auditEvalPair(before, after);
    assert.equal(forged.qualityClaimsAllowed, false);
    assert.ok(forged.problems.some((problem) => problem.includes("offline grading and retained live proof")));
  });
});

test("different fixture commits block quality comparisons and feedback", () => {
  withPair((before, after) => {
    advanceFixture(after);
    assert.notEqual(before.fixtureRevision, after.fixtureRevision);
    const audit = auditEvalPair(before, after);
    assert.equal(audit.qualityClaimsAllowed, false);
    for (const evidence of [sample(before), sample(after)]) {
      const grading = { status: "passed", targetScenario: scenario, expectedBehavior: proposal.expectedBehavior, evidence: [evidence] };
      const result = decideFeedback({ before, after, proposal, grading });
      assert.equal(result.disposition, "held", evidence);
      assert.equal(result.applied, false);
      assert.ok(result.problems.some((problem) => problem.includes("comparable retained phase outcomes")), evidence);
    }
  });
});

test("solo recorder rejects an invalid delivery cohort before output creation or OMP invocation", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "feedback-solo-cohort-")));
  try {
    const delivery = writeCohort(root, "delivery");
    const manifest = path.join(delivery.rawOutput, "comparison-run.json");
    const last = sample(delivery, 9);
    const originalLast = fs.readFileSync(last);
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const marker = path.join(root, "omp-invoked");
    const omp = path.join(bin, "omp");
    fs.writeFileSync(omp, `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(marker)}, "invoked\\n");
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/runtime.txt", "built for node\\n");
process.stdout.write(${JSON.stringify(ompOutput())});
`);
    fs.chmodSync(omp, 0o755);
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    let index = 0;
    const record = (input, samples = 10) => {
      const out = path.join(root, `solo-${++index}`);
      const result = spawnSync(process.execPath, [path.join(repoRoot, "evals", "record-solo.mjs"),
        "--delivery", input, "--out", out, "--model", model, "--samples", String(samples)],
      { cwd: repoRoot, env, encoding: "utf8" });
      return { result, out };
    };
    const reject = (input, samples = 10) => {
      const { result, out } = record(input, samples);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(fs.existsSync(out), false);
      assert.equal(fs.existsSync(marker), false);
    };
    reject(path.dirname(last), 10); // A single delivery cannot be replayed ten times.
    reject(delivery.rawOutput, 9);
    delivery.sampleRuns[9] = delivery.sampleRuns[0];
    save(manifest, delivery);
    reject(delivery.rawOutput);
    delivery.sampleRuns[9] = path.join("sample-10", scenario);
    save(manifest, delivery);
    fs.rmSync(last);
    reject(delivery.rawOutput);
    fs.writeFileSync(last, originalLast);
    const firstRun = JSON.parse(fs.readFileSync(sample(delivery), "utf8"));
    const alterLast = (change) => {
      const run = JSON.parse(originalLast);
      change(run);
      save(last, run);
      reject(delivery.rawOutput);
      fs.writeFileSync(last, originalLast);
    };
    alterLast((run) => { run.executionId = firstRun.executionId; });
    alterLast((run) => { run.model = "provider/other"; });
    alterLast((run) => { run.sourceRevision = "0".repeat(64); });
    alterLast((run) => { run.fixtureRevision = "0".repeat(40); });
    alterLast((run) => { run.repo = path.join(root, "missing-fixture-repo"); });
    alterLast((run) => { run.ok = false; });
    alterLast((run) => { run.kind = "solo"; });
    alterLast((run) => { run.phases[0].phase = "1-solo-verification"; });
    delivery.sourceRevision = "0".repeat(64);
    save(manifest, delivery);
    reject(delivery.rawOutput);
    delivery.sourceRevision = firstRun.sourceRevision;
    save(manifest, delivery);
    const alias = path.join(delivery.rawOutput, "alias");
    fs.symlinkSync(path.dirname(last), alias, "dir");
    delivery.sampleRuns[9] = "alias";
    save(manifest, delivery);
    reject(delivery.rawOutput);
    delivery.sampleRuns[9] = path.join("sample-10", scenario);
    save(manifest, delivery);
    fs.rmSync(alias);
    const { result, out } = record(delivery.rawOutput);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(marker, "utf8").trim().split("\n").length, 10);
    const solo = JSON.parse(fs.readFileSync(path.join(out, "comparison-run.json"), "utf8"));
    assert.equal(solo.sampleRuns.length, 10);
    assert.equal(solo.ok, true);
    assert.equal(fs.existsSync(path.join(out, "sample-01", ".dist", "skills")), true);
    const audit = auditEvalPair(solo, delivery);
    assert.equal(audit.qualityClaimsAllowed, true, audit.problems.join("; "));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("unsupported evidence cohorts reject before creating results or launching paid OMP", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-no-paid-cohort-"));
  try {
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const marker = path.join(root, "omp-invoked");
    const omp = path.join(bin, "omp");
    fs.writeFileSync(omp, `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(marker)}, "invoked");\nprocess.exit(1);\n`);
    fs.chmodSync(omp, 0o755);
    const result = spawnSync(process.execPath, [path.join(repoRoot, "evals", "run.mjs"), "--samples", "2", "iterate-evidence-zero-limit"],
      { cwd: repoRoot, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, SKILLS_EVAL_RESULTS_ROOT: path.join(root, "results") }, encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /not supported for evidence scenarios/);
    assert.equal(fs.existsSync(path.join(root, "results")), false);
    assert.equal(fs.existsSync(marker), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("live multi-sample fixture repositories start at the same commit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-live-samples-"));
  let sampleRepos = [];
  try {
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const omp = path.join(bin, "omp");
    fs.writeFileSync(omp, "#!/usr/bin/env node\nprocess.stdout.write('{}\\n');\n");
    fs.chmodSync(omp, 0o755);
    const resultsRoot = path.join(root, "results");
    const result = spawnSync(process.execPath, [path.join(repoRoot, "evals", "run.mjs"),
      "--samples", "2", scenario], {
      cwd: repoRoot, encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, SKILLS_EVAL_RESULTS_ROOT: resultsRoot },
    });
    assert.equal(result.status, 1, result.stderr); // Fake OMP produces no artifact; fixture setup still completes.
    const cohortDir = path.join(resultsRoot, fs.readlinkSync(path.join(resultsRoot, "latest")), scenario);
    const cohort = JSON.parse(fs.readFileSync(path.join(cohortDir, "comparison-run.json"), "utf8"));
    const samples = cohort.sampleRuns.map((reference) =>
      JSON.parse(fs.readFileSync(path.join(cohortDir, reference, "comparison-run.json"), "utf8")));
    assert.equal(samples.length, 2);
    sampleRepos = samples.map((sample) => sample.repo);
    assert.notEqual(samples[0].executionId, samples[1].executionId);
    assert.equal(samples[0].fixtureRevision, samples[1].fixtureRevision);
    assert.equal(cohort.fixtureRevision, samples[0].fixtureRevision);
    assert.equal(samples[0].sourceRevision, samples[1].sourceRevision);
  } finally {
    for (const repo of sampleRepos) fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("solo recorder retains the initial HEAD, final HEAD proof, and fixture snapshot without a paid run", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-solo-recorder-"));
  try {
    const deliveryRoot = path.join(root, "delivery");
    const output = path.join(deliveryRoot, scenario);
    const source = snapshot(path.join(deliveryRoot, ".dist"));
    const fixture = fixtureRepo(path.join(root, "fixture"));
    const artifact = path.join(fixture.repo, ".agents", "tasks", scenario, "01-verification.md");
    fs.writeFileSync(artifact, "---\ntype: verification\nstatus: passed\nsummary: Build verified\n---\n## Run\nChecked package.json, CI, and README. npm run build -- RUNTIME=node emitted built for node.\n");
    git(fixture.repo, "add", path.relative(fixture.repo, artifact));
    git(fixture.repo, "commit", "-q", "-m", "docs(task): verify runtime build");
    writeDelivery(output, source, fixture);
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const omp = path.join(bin, "omp");
    fs.writeFileSync(omp, `#!/usr/bin/env node
const fs = require("node:fs");
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/runtime.txt", "built for node\\n");
process.stdout.write(${JSON.stringify(ompOutput())});
`);
    fs.chmodSync(omp, 0o755);
    const soloDir = path.join(root, "solo");
    const result = spawnSync(process.execPath, [path.join(repoRoot, "evals", "record-solo.mjs"), "--delivery", output, "--out", soloDir, "--model", model],
      { cwd: repoRoot, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const solo = JSON.parse(fs.readFileSync(path.join(soloDir, "comparison-run.json"), "utf8"));
    assert.equal(solo.ok, true, solo.problems?.join("; "));
    assert.equal(solo.fixtureRevision, fixture.revision);
    assert.equal(solo.fixtureSnapshotRevision, source.fixtureSnapshotRevision);
    assert.equal(git(solo.repo, "rev-parse", "HEAD"), fixture.revision);
    assert.equal(git(solo.repo, "diff", "--name-only", fixture.revision), "");
    assert.ok(fs.existsSync(path.join(soloDir, "1-solo-verification", "omp.jsonl")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
