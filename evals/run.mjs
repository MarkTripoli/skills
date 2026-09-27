
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { subjectProblems } from "../scripts/check-commits.mjs";
import { gradeEvidenceScenario, isEvidenceScenario, snapshotEvidenceSources } from "./iterate-evidence.mjs";
import { metricsForOutput } from "./metrics.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(here, "..");
const resultsRoot = path.join(here, "results");
const scenariosDir = path.join(here, "scenarios");
const fixturesDir = path.join(here, "fixtures");
const guidanceFiles = ["WRITING.md", "CONVENTIONS.md"];

const args = process.argv.slice(2);
if (args[0] === "--compare") {
  if (args.length !== 3) {
    console.error("usage: node evals/run.mjs --compare <solo-run> <delivery-run>");
    process.exit(2);
  }
  const read = (value) => {
    const dir = path.resolve(value === "latest" ? path.join(resultsRoot, value) : value);
    try {
      return {
        ...JSON.parse(fs.readFileSync(path.join(dir, "comparison-run.json"), "utf8")),
        rawOutput: path.relative(repoRoot, dir),
      };
    } catch {
      return null;
    }
  };
  const fields = (run) => ({
    acceptance: run?.ok === true ? "passed" : run?.ok === false ? "failed" : "incomplete",
    model: run?.model ?? "unknown",
    actualModel: run?.metrics?.coverage?.models?.length === 1 ? run.metrics.coverage.models[0] : "unknown",
    wallTimeSeconds: Number.isFinite(run?.wallTimeSeconds) ? run.wallTimeSeconds : "unknown",
    spend: Number.isFinite(run?.metrics?.cost?.total) && run.metrics.cost_basis === "provider_reported_usd" &&
      run.metrics.coverage?.complete === true
      ? { amount: run.metrics.cost.total, currency: "USD", basis: run.metrics.cost_basis, source: run.metrics.cost_source }
      : "unknown",
    fixtureRevision: run?.fixtureRevision ?? "unknown",
    rawOutput: run?.rawOutput ?? "unknown",
  });
  const solo = fields(read(args[1]));
  const delivery = fields(read(args[2]));
  const fixtureMatched = solo.fixtureRevision !== "unknown" && solo.fixtureRevision === delivery.fixtureRevision;
  const modelMatched = solo.model !== "unknown" && solo.model === delivery.model &&
    solo.actualModel !== "unknown" && solo.actualModel === delivery.actualModel;
  const spendComparable = fixtureMatched && modelMatched && solo.acceptance === "passed" && delivery.acceptance === "passed" &&
    solo.spend !== "unknown" && delivery.spend !== "unknown" &&
    solo.spend.currency === delivery.spend.currency && solo.spend.basis === delivery.spend.basis;
  console.log(JSON.stringify({
    solo, delivery, fixtureMatched, modelMatched, spendComparable,
    spendAdvantage: spendComparable
      ? solo.spend.amount < delivery.spend.amount ? "solo" : delivery.spend.amount < solo.spend.amount ? "delivery" : "tie"
      : "unknown",
  }, null, 2));
  process.exit(0);
}
if (args[0] === "--grade-security") {
  if (args.length !== 2 || !args[1] || args[1].startsWith("--")) {
    console.error("usage: node evals/run.mjs --grade-security <normalized-assessment.json>");
    process.exit(2);
  }
  try {
    const fixture = path.join(fixturesDir, "security-check", "ground-truth.json");
    const {dir, grade} = recordSecurityAssessment(args[1], fixture, resultsRoot);
    console.log(JSON.stringify({...grade, result_dir: dir}, null, 2));
    process.exit(grade.status === "passed" ? 0 : 1);
  } catch {
    console.error("security assessment or fixture is invalid");
    process.exit(2);
  }
}
const keep = args.includes("--keep");
const flagValue = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : (args[i + 1] ?? "");
};
const modelIndex = args.indexOf("--model");
if (modelIndex !== -1 && (!args[modelIndex + 1] || args[modelIndex + 1].startsWith("--"))) {
  console.error("--model needs a value");
  process.exit(2);
}
const model = modelIndex === -1 ? null : args[modelIndex + 1];
const maxMinutes = flagValue("--max-time") === null ? 25 : Number(flagValue("--max-time"));
if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) {
  console.error("--max-time needs a positive number of minutes");
  process.exit(2);
}
const gradeDir = flagValue("--grade");
const names = args.filter((a, i) => !a.startsWith("--") && !["--max-time", "--grade", "--model"].includes(args[i - 1]));

const git = (cwd, ...argv) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function loadScenarios() {
  const files = fs
    .readdirSync(scenariosDir)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => f.slice(0, -4))
    .filter((f) => names.length === 0 || names.includes(f));
  const missing = names.filter((n) => !files.includes(n));
  if (missing.length) throw new Error(`unknown scenario${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
  return Promise.all(files.map(async (f) => ({ name: f, ...(await import(pathToFileURL(path.join(scenariosDir, `${f}.mjs`)))).default })));
}

function copyFixtures(scenario, dest, sourceRoot) {
  fs.cpSync(path.join(sourceRoot, "repo-cli"), dest, { recursive: true });
  for (const fixture of scenario.fixtures ?? []) fs.cpSync(path.join(sourceRoot, fixture), dest, { recursive: true });
  const shared = path.join(sourceRoot, "shared");
  if (fs.existsSync(shared)) fs.cpSync(shared, path.join(dest, "shared"), { recursive: true });
}

// Snapshot all mutable inputs before any phase starts; later copies come only from this run tree.
function snapshotSources(dist) {
  const shared = path.join(dist, "shared");
  fs.mkdirSync(shared, { recursive: true });
  for (const file of guidanceFiles) fs.cpSync(path.join(repoRoot, "shared", file), path.join(shared, file));
  fs.cpSync(fixturesDir, path.join(dist, "fixtures"), { recursive: true });
  fs.cpSync(shared, path.join(dist, "fixtures", "shared"), { recursive: true });
}
// A throwaway git repository holding the fixture codebase, the worker definitions, and the task directory.
function prepareRepo(scenario, dist) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `skills-eval-${scenario.name}-`));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "evals@example.com");
  git(repo, "config", "user.name", "Skills Evals");
  copyFixtures(scenario, repo, path.join(dist, "fixtures"));
  fs.cpSync(path.join(dist, "agents"), path.join(repo, ".omp", "agents"), { recursive: true });
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chore: fixture codebase and worker definitions");

  const taskDir = path.join(repo, ".agents", "tasks", scenario.slug);
  fs.mkdirSync(taskDir, { recursive: true });
  const created = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(taskDir, "task.md"),
    `---\nslug: ${scenario.slug}\ntitle: ${scenario.title}\nworkflow: ${scenario.workflow}\ncreated: ${created}\n---\n${scenario.request}\n`,
  );
  git(repo, "add", path.relative(repo, path.join(taskDir, "task.md")));
  git(repo, "commit", "-q", "-m", `docs(task): open ${scenario.slug}`);
  return { repo, taskDir };
}

// The shape of a delivery-stage prompt (read the skill, name the task directory, print the final answer),
// minus the sentence that tells the skill the controller runs the next phase: the handoff fence is part of
// what a phase is graded on. Nothing else is added. Whether a phase runs an interview or converts in
// one pass has to come from the skill reading `task.md`; a phase that asks a question fails the
// handoff check, which is the right signal.
function phasePrompt(skillsDir, phase, taskRel) {
  return [
    `Read and follow ${path.join(skillsDir, phase.skill, "SKILL.md")}, the installed \`${phase.skill}\` skill, for task directory ${taskRel}.`,
    "",
    "Before drafting or replying, read the pinned current guidance in this task repository: `shared/WRITING.md` and `shared/CONVENTIONS.md`. Do not fetch published copies or read the harness checkout.",
    "Use only facts from this task repository (its task, artifacts, fixture source, and local source documents) in artifacts and citations; never cite host-repository code.",
    "",
    phase.request ?? "",
    "",
    "Print the skill's final answer.",
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

function runOmp(prompt, cwd) {
  return new Promise((resolve) => {
    const ompArgs = ["-p", "--auto-approve", "--no-session", "--mode", "json", `--max-time=${maxMinutes}m`];
    if (model !== null) ompArgs.push("--model", model);
    ompArgs.push(prompt);
    const child = spawn("omp", ompArgs, {
      cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env, detached: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }, (maxMinutes + 1) * 60 * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

// What a phase may not change: every earlier artifact and `task.md`, byte for byte.
function snapshot(taskDir) {
  const files = artifacts(taskDir).map((a) => ({ file: a.file, text: a.text }));
  const task = path.join(taskDir, "task.md");
  if (fs.existsSync(task)) files.push({ file: "task.md", text: fs.readFileSync(task, "utf8") });
  return files;
}

// Checks every phase must pass before its own: one handoff fence naming the next skill directly after
// the handoff sentences, the artifact with its type and summary, no template placeholder left anywhere
// in it (frontmatter included), its commit carrying that file, a repository that is otherwise untouched
// (no code, config, or stray file written or committed by a phase that only writes an artifact), and
// earlier artifacts and `task.md` unchanged. Git-state checks need the live repository and are skipped
// when re-grading a recording.
function headArtifactCommitProblems(ctx) {
  const relative = path.relative(ctx.repo, ctx.artifact.path);
  const subject = git(ctx.repo, "log", "-1", "--format=%s");
  const problems = subjectProblems(subject).map((problem) => `git: HEAD subject ${JSON.stringify(subject)}: ${problem}`);
  if (!subject.startsWith("docs(task): ")) problems.push(`git: HEAD subject ${JSON.stringify(subject)} is not a focused docs(task) commit`);
  const changed = git(ctx.repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n").filter(Boolean);
  if (!changed.includes(relative)) problems.push(`git: HEAD does not commit produced artifact ${relative} (changed: ${changed.join(", ") || "none"})`);
  else if (changed.length !== 1) problems.push(`git: HEAD commit is not focused on ${relative} (changed: ${changed.join(", ")})`);
  return problems;
}

// Checks every phase must pass before its own: one text handoff fence naming the next skill,
// included), its commit carrying that file, a repository that is otherwise untouched (no code,
// config, or stray file written or committed by a phase that only writes an artifact), and earlier
// artifacts and `task.md` unchanged. Git-state checks need the live repository and are skipped when
// re-grading a recording.
function commonChecks(phase, ctx) {
  const h = handoff(ctx.answer);
  const out = [];
  if (!h) out.push("reply: no `/<skill>` command fence");
  else {
    if (h.fences !== 1) out.push(`reply: ${h.fences} fenced blocks, expected exactly one`);
    if (h.lang !== "text") out.push(`reply: fence language "${h.lang}", expected text`);
    // `next` is a skill name, or a function of the phase context when the artifact's state decides
    // (a gated phase hands off to its iterate skill while it has open decisions).
    const next = typeof phase.next === "function" ? phase.next(ctx) : phase.next;
    if (h.skill !== next) out.push(`reply: hands off to /${h.skill}, expected /${next}`);
    // Keep the handoff check operational: fence count, language, and expected next skill are
    // validated above; incidental prose and whitespace are intentionally not pinned.
  }
  if (!ctx.artifact) out.push(`artifact: no artifact of type ${phase.artifactType} in ${path.basename(ctx.taskDir)} (found: ${ctx.artifacts.map((a) => `${a.file}[${a.fm.type ?? "?"}]`).join(", ") || "none"})`);
  else {
    if (!ctx.artifact.fm.summary) out.push(`${ctx.artifact.file}: frontmatter summary missing`);
    const left = placeholders(ctx.artifact.text, ctx.template);
    if (left.length) out.push(`${ctx.artifact.file}: template placeholder left: ${left.slice(0, 3).join(" | ")}`);
    if (phase.handoffNamesArtifact && h && h.file !== ctx.artifact.file) out.push(`reply: fence names ${h.file ?? "no file"}, expected @${ctx.artifact.file}`);
    if (ctx.artifact.text.includes(`${repoRoot}${path.sep}`)) out.push(`${ctx.artifact.file}: cites the harness checkout instead of the fixture repository`);
    if (ctx.before.some((a) => a.file === ctx.artifact.file)) out.push(`${ctx.artifact.file}: the phase reused an existing artifact instead of taking the next number`);
  }
  for (const a of ctx.before) {
    const now = a.file === "task.md" ? fs.readFileSync(path.join(ctx.taskDir, "task.md"), "utf8") : ctx.artifacts.find((b) => b.file === a.file)?.text;
    if (now === undefined) out.push(`${a.file}: an earlier file was removed by this phase`);
    else if (now !== a.text) out.push(`${a.file}: an earlier file was modified by this phase`);
  }
  if (!ctx.live) return out;
  if (ctx.artifact) out.push(...headArtifactCommitProblems(ctx));
  const dirty = git(ctx.repo, "status", "--porcelain");
  if (dirty) out.push(`git: repository left dirty:\n${dirty}`);
  const touched = git(ctx.repo, "diff", "--name-only", ctx.fixtureSha, "HEAD", "--", ".", ":!.agents").split("\n").filter(Boolean);
  if (touched.length) out.push(`git: files outside .agents/ changed since the fixture: ${touched.join(", ")}`);
  return out;
}

function grade(phase, ctx, exitCode) {
  return failures(exitCode === 0 ? null : `omp exited ${exitCode}`, commonChecks(phase, ctx), phase.check ? phase.check(ctx) : []);
}

function report(scenario, label, seconds, problems) {
  console.log(`[${scenario}] ${label}: ${problems.length === 0 ? "ok" : "FAIL"}${seconds === null ? "" : ` (${seconds}s)`}`);
  for (const p of problems) console.log(`    - ${p.split("\n").join("\n      ")}`);
}

function templateFor(skillsDir, phase) {
  if (!phase.template) return "";
  const file = path.join(skillsDir, phase.skill, "references", phase.template);
  if (!fs.existsSync(file)) throw new Error(`${phase.skill}: template ${phase.template} not found under references/`);
  return fs.readFileSync(file, "utf8");
}

async function runScenario(scenario, runDir, dist) {
  if (isEvidenceScenario(scenario)) {
    const pinned = path.join(dist, "evidence-source");
    const { runEvidenceScenario } = await import(pathToFileURL(path.join(pinned, "evals", "iterate-evidence.mjs")));
    const effectiveMinutes = Math.max(maxMinutes, scenario.minMinutes ?? 0);
    return runEvidenceScenario(scenario, runDir, pinned, { model, maxMinutes: effectiveMinutes });
  }
  const skillsDir = path.join(dist, "skills");
  const { repo, taskDir } = prepareRepo(scenario, dist);
  const taskRel = path.relative(repo, taskDir);
  // The commit before any phase ran: everything a phase changes outside `.agents/` is measured from here.
  const fixtureSha = git(repo, "rev-parse", "HEAD");
  const resultDir = path.join(runDir, scenario.name);
  const result = { name: scenario.name, repo, phases: [], ok: true, model: model ?? "omp-default", fixtureRevision: fixtureSha, wallTimeSeconds: 0, metrics: { wall_ms: 0, tokens: {}, cost: null, cost_basis: null, cost_source: null, coverage: { complete: true, usage_events: 0, cost_events: 0, models: [] } } };

  for (const [index, phase] of scenario.phases.entries()) {
    const label = `${index + 1}-${phase.skill}`;
    const out = path.join(resultDir, label);
    fs.mkdirSync(out, { recursive: true });
    const prompt = phasePrompt(skillsDir, phase, taskRel);
    fs.writeFileSync(path.join(out, "prompt.md"), prompt);
    const before = snapshot(taskDir);
    const template = templateFor(skillsDir, phase);
    const started = Date.now();
    console.log(`[${scenario.name}] ${label}: started`);
    const { code, stdout, stderr } = await runOmp(prompt, repo);
    const wallMs = Date.now() - started;
    const metrics = metricsForOutput(stdout, wallMs);
    const answer = metrics.answer ?? "";
    fs.writeFileSync(path.join(out, "answer.md"), answer);
    fs.writeFileSync(path.join(out, "stderr.log"), stderr);
    if (fs.existsSync(taskDir)) fs.cpSync(taskDir, path.join(out, "task"), { recursive: true });
    const ctx = { live: true, repo, codeRoot: repo, taskDir, fixtureSha, before, template, answer, artifact: newest(taskDir, phase.artifactType), artifacts: artifacts(taskDir) };
    const problems = grade(phase, ctx, code);
    result.wallTimeSeconds += Math.round(wallMs / 1000);
    const aggregate = result.metrics;
    aggregate.wall_ms += wallMs;
    for (const key of ["input", "output", "cacheRead", "cacheWrite"]) if (metrics.tokens?.[key] !== null && metrics.tokens?.[key] !== undefined) aggregate.tokens[key] = (aggregate.tokens[key] ?? 0) + metrics.tokens[key];
    if (metrics.cost) { aggregate.cost ??= { total: 0 }; aggregate.cost.total += metrics.cost.total; }
    aggregate.cost_basis = metrics.cost_basis;
    aggregate.cost_source = metrics.cost_source;
    aggregate.coverage.complete &&= metrics.coverage.complete;
    aggregate.coverage.usage_events += metrics.coverage.usage_events;
    aggregate.coverage.cost_events += metrics.coverage.cost_events;
    aggregate.coverage.models = [...new Set([...aggregate.coverage.models, ...metrics.coverage.models])];
    result.phases.push({ phase: label, wall_ms: wallMs, tokens: metrics.tokens, cost: metrics.cost, coverage: metrics.coverage, ok: problems.length === 0, problems });
    report(scenario.name, label, Math.round(wallMs / 1000), problems);
    if (problems.length) { result.ok = false; break; }
  }
  if (result.ok && !keep) {
    fs.rmSync(repo, { recursive: true, force: true });
    result.repo = null;
  } else console.log(`[${scenario.name}] repository kept at ${repo}`);
  result.rawOutput = path.relative(repoRoot, resultDir);
  fs.writeFileSync(path.join(resultDir, "comparison-run.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(resultDir, "report.json"), JSON.stringify(result, null, 2));
  return result;
}

// Re-grade a recorded run with the current checks: the artifact comes from the phase's `task/` copy,
// the previous phase's copy is the "before" snapshot, and `path:line` pointers resolve against a fresh
// copy of the fixtures. No model, no git.
async function gradeScenario(scenario, runDir) {
  if (isEvidenceScenario(scenario)) return gradeEvidenceScenario(scenario, runDir);
  const resultDir = path.join(runDir, scenario.name);
  const result = { name: scenario.name, repo: null, phases: [], ok: true, graded: true };
  if (!fs.existsSync(resultDir)) {
    console.log(`[${scenario.name}] no recording under ${path.relative(repoRoot, runDir)}; skipped`);
    return { ...result, skipped: true };
  }
  const pinnedDist = path.join(runDir, ".dist");
  const sourceRoot = path.join(pinnedDist, "fixtures");
  if (!fs.existsSync(sourceRoot)) {
    console.log(`[${scenario.name}] source snapshot missing under ${path.relative(repoRoot, pinnedDist)}; skipped`);
    return { ...result, skipped: true };
  }
  const codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `skills-eval-grade-${scenario.name}-`));
  copyFixtures(scenario, codeRoot, sourceRoot);
  try {
    for (const [index, phase] of scenario.phases.entries()) {
      const label = `${index + 1}-${phase.skill}`;
      const out = path.join(resultDir, label);
      const taskDir = path.join(out, "task");
      if (!fs.existsSync(path.join(out, "answer.md"))) {
        console.log(`[${scenario.name}] ${label}: not recorded`);
        break;
      }
      const previous = index === 0 ? null : path.join(resultDir, `${index}-${scenario.phases[index - 1].skill}`, "task");
      const ctx = {
        live: false,
        repo: null,
        codeRoot,
        taskDir,
        fixtureSha: null,
        before: previous && fs.existsSync(previous) ? snapshot(previous) : fs.existsSync(taskDir) ? [{ file: "task.md", text: fs.readFileSync(path.join(taskDir, "task.md"), "utf8") }] : [],
        template: fs.existsSync(pinnedDist) ? templateFor(path.join(pinnedDist, "skills"), phase) : "",
        answer: fs.readFileSync(path.join(out, "answer.md"), "utf8"),
        artifact: newest(taskDir, phase.artifactType),
        artifacts: artifacts(taskDir),
      };
      const problems = grade(phase, ctx, 0);
      result.phases.push({ phase: label, seconds: null, ok: problems.length === 0, problems });
      report(scenario.name, label, null, problems);
      if (problems.length) result.ok = false;
    }
  } finally {
    fs.rmSync(codeRoot, { recursive: true, force: true });
  }
  return result;
}

const scenarios = await loadScenarios();
fs.mkdirSync(resultsRoot, { recursive: true });

let results;
if (gradeDir !== null) {
  const requested = gradeDir || "latest";
  const runDir = fs.existsSync(path.resolve(requested)) ? path.resolve(requested) : path.resolve(resultsRoot, requested);
  if (!fs.existsSync(runDir)) {
    console.error(`no run at ${runDir}`);
    process.exit(2);
  }
  console.log(`re-grading ${fs.realpathSync(runDir)} with the current checks`);
  results = [];
  for (const s of scenarios) results.push(await gradeScenario(s, runDir));
} else {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const runDir = path.join(resultsRoot, stamp);
  fs.mkdirSync(runDir, { recursive: true });
  // The built tree and source snapshots are private to this run (a concurrent run must not rebuild
  // the skills or change the guidance a running session is reading) and stay with its recordings.
  const dist = path.join(runDir, ".dist");
  if (scenarios.some((scenario) => !isEvidenceScenario(scenario))) {
    const { buildRuntime } = await import("../scripts/lib/build.mjs");
    buildRuntime("oh-my-pi", dist);
  }
  if (scenarios.some(isEvidenceScenario)) snapshotEvidenceSources(repoRoot, dist);
  snapshotSources(dist);
  const latest = path.join(resultsRoot, "latest");
  fs.rmSync(latest, { force: true });
  fs.symlinkSync(stamp, latest);
  console.log(`skills built at ${path.relative(repoRoot, dist)}; running ${scenarios.map((s) => s.name).join(", ")} with ${maxMinutes} minutes per phase; recordings in ${path.relative(repoRoot, runDir)}`);
  results = await Promise.all(scenarios.map((s) => runScenario(s, runDir, dist)));
  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(results, null, 2));
}

const graded = results.filter((r) => !r.skipped);
const failed = graded.filter((r) => !r.ok);
console.log(`\n${graded.length - failed.length}/${graded.length} scenarios passed${results.length > graded.length ? ` (${results.length - graded.length} not recorded)` : ""}`);
process.exit(failed.length ? 1 : 0);
