#!/usr/bin/env node
// Runs the skills against a live model, one fresh `omp -p` session per phase, and grades what each
// phase left behind: the artifact, its frontmatter, the facts that had to travel from the sources,
// the commit, and the handoff fence naming the next skill. Nothing here is mocked; a run costs
// model time and needs `omp` on PATH with a configured provider, so it is `npm run evals`, not `npm test`.
//
// Usage: node evals/run.mjs [scenario ...] [--keep] [--model <model>] [--max-time <minutes>]
//        node evals/run.mjs [scenario ...] --grade <run dir>
//   scenario   names under evals/scenarios/ (default: all)
//   --keep     keep every scenario's temporary repository (failed ones are kept regardless)
//   --model    pass an explicit model selector through to each spawned `omp` session
//   --grade    no model: re-grade the recordings of an earlier run (`evals/results/<stamp>` or `latest`)
//              with the current checks; live repository-only checks are skipped, retained evidence runs.
//   SKILLS_EVAL_RESULTS_ROOT overrides `evals/results` for test isolation; relative paths resolve
//              from the repository root. Leave unset for normal eval runs.
//
// Output: evals/results/<stamp>/<scenario>/<n>-<skill>/{prompt.md,answer.md,stderr.log,exit-status.json,task/},
// evals/results/<stamp>/<scenario>/report.json (written as each scenario ends),
// evals/results/<stamp>/summary.json, and `evals/results/latest` pointing at the newest run.
// Recordings are never deleted by a later run. Exit 1 when any phase fails.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { buildRuntime } from "../scripts/lib/build.mjs";
import { subjectProblems } from "../scripts/check-commits.mjs";
import { CliArgumentError, parseEvalArgs } from "./cli.mjs";
import { gitIndexChanged, snapshotGitIndex } from "./git-index.mjs";
import {
  excludedRootsManifestProblem,
  gitConfigManifestProblem,
  gitIndexManifestProblem,
  phaseStatusProblem,
  repositoryManifestProblem,
} from "./manifest.mjs";
import {
  artifacts,
  diffExcludedRootSnapshots,
  diffRepositorySnapshots,
  failures,
  handoff,
  gitConfigChanged,
  newest,
  placeholders,
  snapshotGitConfig,
  snapshotNamedRoot,
  snapshotRepository,
  unexpectedRepositoryChanges,
} from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const configuredResultsRoot = process.env.SKILLS_EVAL_RESULTS_ROOT;
if (configuredResultsRoot !== undefined && configuredResultsRoot.trim() === "") {
  console.error("SKILLS_EVAL_RESULTS_ROOT needs a non-empty path");
  process.exit(2);
}
const resultsRoot = configuredResultsRoot === undefined
  ? path.join(here, "results")
  : path.resolve(repoRoot, configuredResultsRoot);
const scenariosDir = path.join(here, "scenarios");
const fixturesDir = path.join(here, "fixtures");
const guidanceFiles = ["WRITING.md", "CONVENTIONS.md"];
const excludedRootSpecs = [
  { root: ".agents", exclude: [] },
  { root: ".git", exclude: [".git/config"], omitFileContents: [".git/index"] },
  { root: ".omp", exclude: [] },
];

let options;
try {
  options = parseEvalArgs(process.argv.slice(2));
} catch (error) {
  if (error instanceof CliArgumentError) {
    console.error(error.message);
    process.exit(2);
  }
  throw error;
}
const { gradeDir, keep, maxMinutes, model, names } = options;

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
  for (const remote of scenario.gitRemotes ?? []) git(repo, "remote", "add", remote.name, remote.url);
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
  if (phase.phaseType === "terminal") {
    return [
      `Read and follow ${path.join(skillsDir, phase.skill, "SKILL.md")}, the installed \`${phase.skill}\` skill. Run it in the current repository and print its terminal answer.`,
      "",
      "Before acting or replying, read the pinned current guidance in this task repository: `shared/WRITING.md` and `shared/CONVENTIONS.md`. Do not fetch published copies or read the harness checkout.",
      "Use only facts from this repository. Do not create or modify a task artifact and do not print a next-skill handoff fence.",
      "",
      phase.request ?? "",
      "",
      "Print the skill's terminal answer.",
    ].join("\n").replace(/\n{3,}/g, "\n\n");
  }
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
    // Its own process group, so a kill on timeout reaches the child workers omp spawned.
    const ompArgs = ["-p", "--auto-approve", "--no-session", `--max-time=${maxMinutes}m`];
    if (model !== null) ompArgs.push("--model", model);
    ompArgs.push(prompt);
    const child = spawn("omp", ompArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, (maxMinutes + 1) * 60 * 1000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const status = code === null
        ? { kind: "signal", signal: signal ?? "SIGUNKNOWN" }
        : { kind: "exit", code };
      resolve({ status, stdout, stderr });
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

function snapshotExcludedRoots(root) {
  return Object.fromEntries(excludedRootSpecs.map(({ root: relativeRoot, ...options }) => [
    relativeRoot,
    snapshotNamedRoot(root, relativeRoot, options),
  ]));
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
// the artifact with its type and summary, no template placeholder left anywhere in it (frontmatter
// included), its commit carrying that file, a repository that is otherwise untouched (no code,
// config, or stray file written or committed by a phase that only writes an artifact), and earlier
// artifacts and `task.md` unchanged. Git-state checks need the live repository and are skipped when
// re-grading a recording.
function commonChecks(phase, ctx) {
  if (phase.phaseType === "terminal") {
    const out = [];
    const h = handoff(ctx.answer);
    if (h) out.push(`reply: terminal phase includes a /${h.skill} command fence`);
    const currentArtifacts = artifacts(ctx.taskDir);
    const beforeByFile = new Map(ctx.before.map((file) => [file.file, file.text]));
    for (const artifact of currentArtifacts) {
      if (!beforeByFile.has(artifact.file)) out.push(`${artifact.file}: terminal phase created a task artifact`);
    }
    for (const file of ctx.before) {
      const full = path.join(ctx.taskDir, file.file);
      if (!fs.existsSync(full)) out.push(`${file.file}: terminal phase removed task state`);
      else if (fs.readFileSync(full, "utf8") !== file.text) out.push(`${file.file}: terminal phase modified task state`);
    }
    const unexpected = unexpectedRepositoryChanges(ctx.changedPaths ?? [], phase.allowedChangedPaths ?? []);
    if (unexpected.length) out.push(`repository: unexpected changed paths: ${unexpected.join(", ")}`);
    for (const [root, changedPaths] of Object.entries(ctx.excludedRootChanges ?? {})) {
      if (changedPaths.length) out.push(`repository: excluded root ${root} changed paths: ${changedPaths.join(", ")}`);
    }
    if (gitConfigChanged(ctx.beforeGitConfig, ctx.afterGitConfig)) out.push("repository: local Git configuration changed");
    if (gitIndexChanged(ctx.beforeGitIndex, ctx.afterGitIndex)) out.push("repository: semantic Git index changed");
    if (!ctx.live) return out;
    if (ctx.excludedRootChanges?.[".git"]?.length) return out;
    const head = git(ctx.repo, "rev-parse", "HEAD");
    if (head !== ctx.beforeHead) out.push(`git: HEAD changed from ${ctx.beforeHead} to ${head}`);
    return out;
  }
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

function statusFailure(status) {
  if (status.kind === "exit") return status.code === 0 ? null : `omp exited ${status.code}`;
  return `omp terminated by ${status.signal}`;
}

function grade(phase, ctx, status) {
  return failures(statusFailure(status), commonChecks(phase, ctx), phase.check ? phase.check(ctx) : []);
}

function report(scenario, label, seconds, problems) {
  console.log(`[${scenario}] ${label}: ${problems.length === 0 ? "ok" : "FAIL"}${seconds === null ? "" : ` (${seconds}s)`}`);
  for (const p of problems) console.log(`    - ${p.split("\n").join("\n      ")}`);
}

function readJson(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (error) {
    return { ok: false, problem: `recording: ${path.basename(file)} is unreadable or invalid JSON (${error.message})` };
  }
}

function readValidatedJson(file, validator) {
  const parsed = readJson(file);
  if (!parsed.ok) return parsed;
  const problem = validator(parsed.value);
  return problem
    ? { ok: false, problem: `recording: ${path.basename(file)} manifest ${problem}` }
    : parsed;
}

function completedRunProblems(runDir, selectedScenarios) {
  const summaryFile = path.join(runDir, "summary.json");
  if (!fs.existsSync(summaryFile)) return ["recording: run is incomplete (summary.json missing)"];
  const parsed = readJson(summaryFile);
  if (!parsed.ok) return [parsed.problem];
  if (!Array.isArray(parsed.value) || parsed.value.length === 0) {
    return ["recording: summary.json must contain at least one completed scenario"];
  }
  const problems = [];
  const names = new Set();
  for (const result of parsed.value) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      problems.push("recording: summary.json contains a non-object scenario result");
      continue;
    }
    if (typeof result.name !== "string" || result.name === "") {
      problems.push("recording: summary.json contains a scenario without a name");
      continue;
    }
    if (names.has(result.name)) problems.push(`recording: summary.json repeats scenario ${result.name}`);
    names.add(result.name);
    if (typeof result.ok !== "boolean" || !Array.isArray(result.phases) || result.phases.length === 0) {
      problems.push(`recording: summary.json has incomplete result metadata for ${result.name}`);
      continue;
    }
    const reportFile = path.join(runDir, result.name, "report.json");
    if (!fs.existsSync(reportFile)) {
      problems.push(`recording: completed scenario ${result.name} is missing report.json`);
      continue;
    }
    const recorded = readJson(reportFile);
    if (!recorded.ok) problems.push(recorded.problem);
    else if (!isDeepStrictEqual(recorded.value, result)) {
      problems.push(`recording: summary.json disagrees with ${result.name}/report.json`);
    }
  }
  for (const scenario of selectedScenarios) {
    if (!names.has(scenario.name)) problems.push(`recording: selected scenario ${scenario.name} is absent from summary.json`);
  }
  return problems;
}

function templateFor(skillsDir, phase) {
  if (!phase.template) return "";
  const file = path.join(skillsDir, phase.skill, "references", phase.template);
  if (!fs.existsSync(file)) throw new Error(`${phase.skill}: template ${phase.template} not found under references/`);
  return fs.readFileSync(file, "utf8");
}

async function runScenario(scenario, runDir, dist) {
  const skillsDir = path.join(dist, "skills");
  const { repo, taskDir } = prepareRepo(scenario, dist);
  const taskRel = path.relative(repo, taskDir);
  // The commit before any phase ran: everything a phase changes outside `.agents/` is measured from here.
  const fixtureSha = git(repo, "rev-parse", "HEAD");
  const resultDir = path.join(runDir, scenario.name);
  const result = { name: scenario.name, repo, phases: [], ok: true };

  for (const [index, phase] of scenario.phases.entries()) {
    const label = `${index + 1}-${phase.skill}`;
    const out = path.join(resultDir, label);
    fs.mkdirSync(out, { recursive: true });
    for (const overlay of [phase.fixtureOverlay ?? []].flat()) {
      fs.cpSync(path.join(dist, "fixtures", overlay), repo, { recursive: true });
    }
    const prompt = phasePrompt(skillsDir, phase, taskRel);
    fs.writeFileSync(path.join(out, "prompt.md"), prompt);
    const before = snapshot(taskDir);
    const beforeHead = git(repo, "rev-parse", "HEAD");
    const beforeRepository = phase.phaseType === "terminal" ? snapshotRepository(repo) : null;
    const beforeExcludedRoots = phase.phaseType === "terminal" ? snapshotExcludedRoots(repo) : null;
    const beforeGitConfig = phase.phaseType === "terminal" ? snapshotGitConfig(repo) : null;
    const beforeGitIndex = phase.phaseType === "terminal" ? snapshotGitIndex(repo) : null;
    if (beforeRepository) fs.writeFileSync(path.join(out, "repository-before.json"), `${JSON.stringify(beforeRepository, null, 2)}\n`);
    if (beforeExcludedRoots) fs.writeFileSync(path.join(out, "excluded-roots-before.json"), `${JSON.stringify(beforeExcludedRoots, null, 2)}\n`);
    if (phase.phaseType === "terminal") fs.writeFileSync(path.join(out, "git-config-before.json"), `${JSON.stringify(beforeGitConfig, null, 2)}\n`);
    if (phase.phaseType === "terminal") fs.writeFileSync(path.join(out, "git-index-before.json"), `${JSON.stringify(beforeGitIndex, null, 2)}\n`);
    const template = templateFor(skillsDir, phase);
    const started = Date.now();
    console.log(`[${scenario.name}] ${label}: started`);
    const { status, stdout, stderr } = await runOmp(prompt, repo);
    const seconds = Math.round((Date.now() - started) / 1000);
    const afterRepository = phase.phaseType === "terminal" ? snapshotRepository(repo) : null;
    if (afterRepository) fs.writeFileSync(path.join(out, "repository-after.json"), `${JSON.stringify(afterRepository, null, 2)}\n`);
    const afterExcludedRoots = phase.phaseType === "terminal" ? snapshotExcludedRoots(repo) : null;
    if (afterExcludedRoots) fs.writeFileSync(path.join(out, "excluded-roots-after.json"), `${JSON.stringify(afterExcludedRoots, null, 2)}\n`);
    const afterGitConfig = phase.phaseType === "terminal" ? snapshotGitConfig(repo) : null;
    const afterGitIndex = phase.phaseType === "terminal" ? snapshotGitIndex(repo) : null;
    if (phase.phaseType === "terminal") fs.writeFileSync(path.join(out, "git-config-after.json"), `${JSON.stringify(afterGitConfig, null, 2)}\n`);
    if (phase.phaseType === "terminal") fs.writeFileSync(path.join(out, "git-index-after.json"), `${JSON.stringify(afterGitIndex, null, 2)}\n`);
    fs.writeFileSync(path.join(out, "exit-status.json"), `${JSON.stringify(status, null, 2)}\n`);
    fs.writeFileSync(path.join(out, "answer.md"), stdout);
    fs.writeFileSync(path.join(out, "stderr.log"), stderr);
    if (fs.existsSync(taskDir)) fs.cpSync(taskDir, path.join(out, "task"), { recursive: true });
    const repositoryDiff = beforeRepository && afterRepository
      ? diffRepositorySnapshots(beforeRepository, afterRepository)
      : { created: [], modified: [], deleted: [], changedPaths: [] };
    const excludedRootChanges = beforeExcludedRoots && afterExcludedRoots
      ? diffExcludedRootSnapshots(beforeExcludedRoots, afterExcludedRoots)
      : {};

    const ctx = {
      live: true,
      repo,
      codeRoot: repo,
      taskDir,
      fixtureSha,
      before,
      beforeHead,
      beforeRepository,
      afterRepository,
      beforeGitConfig,
      afterGitConfig,
      beforeGitIndex,
      afterGitIndex,
      beforeExcludedRoots,
      afterExcludedRoots,
      excludedRootChanges,
      ...repositoryDiff,
      template,
      answer: stdout,
      artifact: phase.artifactType ? newest(taskDir, phase.artifactType) : null,
      artifacts: artifacts(taskDir),
    };
    const problems = grade(phase, ctx, status);
    result.phases.push({ phase: label, seconds, ok: problems.length === 0, problems });
    report(scenario.name, label, seconds, problems);
    if (problems.length) {
      result.ok = false;
      break;
    }
  }
  if (result.ok && !keep) {
    fs.rmSync(repo, { recursive: true, force: true });
    result.repo = null;
  } else console.log(`[${scenario.name}] repository kept at ${repo}`);
  fs.writeFileSync(path.join(resultDir, "report.json"), JSON.stringify(result, null, 2));
  return result;
}

// Re-grade a recorded run with the current checks: the artifact comes from the phase's `task/` copy,
// the previous phase's copy is the "before" snapshot, and `path:line` pointers resolve against a fresh
// copy of the fixtures. No model, no git.
async function gradeScenario(scenario, runDir) {
  const resultDir = path.join(runDir, scenario.name);
  const result = { name: scenario.name, repo: null, phases: [], ok: true, graded: true };
  if (!fs.existsSync(resultDir)) {
    const problems = ["recording: completed run is missing the scenario directory"];
    result.phases.push({ phase: "recording", seconds: null, ok: false, problems });
    result.ok = false;
    report(scenario.name, "recording", null, problems);
    return result;
  }
  const pinnedDist = path.join(runDir, ".dist");
  const sourceRoot = path.join(pinnedDist, "fixtures");
  if (!fs.existsSync(sourceRoot)) {
    const problems = ["recording: completed run is missing its pinned source snapshot"];
    result.phases.push({ phase: "recording", seconds: null, ok: false, problems });
    result.ok = false;
    report(scenario.name, "recording", null, problems);
    return result;
  }
  const codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `skills-eval-grade-${scenario.name}-`));
  copyFixtures(scenario, codeRoot, sourceRoot);
  try {
    for (const [index, phase] of scenario.phases.entries()) {
      const label = `${index + 1}-${phase.skill}`;
      const out = path.join(resultDir, label);
      const taskDir = path.join(out, "task");
      if (!fs.existsSync(path.join(out, "answer.md"))) {
        const problems = ["recording: phase is incomplete (answer.md missing)"];
        result.phases.push({ phase: label, seconds: null, ok: false, problems });
        result.ok = false;
        report(scenario.name, label, null, problems);
        break;
      }
      const statusFile = path.join(out, "exit-status.json");
      if (!fs.existsSync(statusFile)) {
        const problems = ["recording: phase is incomplete (exit-status.json missing)"];
        result.phases.push({ phase: label, seconds: null, ok: false, problems });
        result.ok = false;
        report(scenario.name, label, null, problems);
        break;
      }
      const parsedStatus = readValidatedJson(statusFile, phaseStatusProblem);
      if (!parsedStatus.ok) {
        const problems = [parsedStatus.problem];
        result.phases.push({ phase: label, seconds: null, ok: false, problems });
        result.ok = false;
        report(scenario.name, label, null, problems);
        break;
      }
      const beforeManifest = path.join(out, "repository-before.json");
      const afterManifest = path.join(out, "repository-after.json");
      const beforeGitConfigManifest = path.join(out, "git-config-before.json");
      const afterGitConfigManifest = path.join(out, "git-config-after.json");
      const beforeGitIndexManifest = path.join(out, "git-index-before.json");
      const afterGitIndexManifest = path.join(out, "git-index-after.json");
      const beforeExcludedRootsManifest = path.join(out, "excluded-roots-before.json");
      const afterExcludedRootsManifest = path.join(out, "excluded-roots-after.json");
      const requiredManifests = [
        { file: beforeManifest, validate: repositoryManifestProblem },
        { file: afterManifest, validate: repositoryManifestProblem },
        { file: beforeGitConfigManifest, validate: gitConfigManifestProblem },
        { file: afterGitConfigManifest, validate: gitConfigManifestProblem },
        { file: beforeGitIndexManifest, validate: gitIndexManifestProblem },
        { file: afterGitIndexManifest, validate: gitIndexManifestProblem },
        { file: beforeExcludedRootsManifest, validate: excludedRootsManifestProblem },
        { file: afterExcludedRootsManifest, validate: excludedRootsManifestProblem },
      ];
      if (phase.phaseType === "terminal" && requiredManifests.some(({ file }) => !fs.existsSync(file))) {
        const missing = requiredManifests.filter(({ file }) => !fs.existsSync(file)).map(({ file }) => path.basename(file));
        const problems = [`recording: phase is incomplete (required manifests missing: ${missing.join(", ")})`];
        result.phases.push({ phase: label, seconds: null, ok: false, problems });
        result.ok = false;
        report(scenario.name, label, null, problems);
        break;
      }
      const parsedManifests = phase.phaseType === "terminal"
        ? requiredManifests.map(({ file, validate }) => readValidatedJson(file, validate))
        : [];
      const manifestProblems = parsedManifests.filter((manifest) => !manifest.ok).map((manifest) => manifest.problem);
      if (manifestProblems.length) {
        result.phases.push({ phase: label, seconds: null, ok: false, problems: manifestProblems });
        result.ok = false;
        report(scenario.name, label, null, manifestProblems);
        break;
      }
      const previous = index === 0 ? null : path.join(resultDir, `${index}-${scenario.phases[index - 1].skill}`, "task");
      const [beforeRepository, afterRepository, beforeGitConfig, afterGitConfig, beforeGitIndex, afterGitIndex, beforeExcludedRoots, afterExcludedRoots] = phase.phaseType === "terminal"
        ? parsedManifests.map((manifest) => manifest.value)
        : [null, null, null, null, null, null, null, null];
      const repositoryDiff = beforeRepository && afterRepository
        ? diffRepositorySnapshots(beforeRepository, afterRepository)
        : { created: [], modified: [], deleted: [], changedPaths: [] };
      const excludedRootChanges = beforeExcludedRoots && afterExcludedRoots
        ? diffExcludedRootSnapshots(beforeExcludedRoots, afterExcludedRoots)
        : {};
      const ctx = {
        live: false,
        repo: null,
        codeRoot,
        taskDir,
        fixtureSha: null,
        before: previous && fs.existsSync(previous) ? snapshot(previous) : fs.existsSync(taskDir) ? [{ file: "task.md", text: fs.readFileSync(path.join(taskDir, "task.md"), "utf8") }] : [],
        beforeHead: null,
        beforeRepository,
        afterRepository,
        beforeGitConfig,
        afterGitConfig,
        beforeGitIndex,
        afterGitIndex,
        beforeExcludedRoots,
        afterExcludedRoots,
        excludedRootChanges,
        ...repositoryDiff,
        template: fs.existsSync(pinnedDist) ? templateFor(path.join(pinnedDist, "skills"), phase) : "",
        answer: fs.readFileSync(path.join(out, "answer.md"), "utf8"),
        artifact: phase.artifactType ? newest(taskDir, phase.artifactType) : null,
        artifacts: artifacts(taskDir),
      };
      const problems = grade(phase, ctx, parsedStatus.value);
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
  const runDir = path.resolve(resultsRoot, gradeDir || "latest");
  if (!fs.existsSync(runDir)) {
    console.error(`no run at ${runDir}`);
    process.exit(2);
  }
  console.log(`re-grading ${fs.realpathSync(runDir)} with the current checks`);
  const completionProblems = completedRunProblems(runDir, scenarios);
  if (completionProblems.length) {
    for (const problem of completionProblems) console.error(problem);
    process.exit(1);
  }
  results = [];
  for (const s of scenarios) results.push(await gradeScenario(s, runDir));
} else {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  let suffix = 0;
  let runDir;
  while (runDir === undefined) {
    const candidate = path.join(resultsRoot, suffix === 0 ? stamp : `${stamp}-${suffix}`);
    try {
      fs.mkdirSync(candidate);
      runDir = candidate;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      suffix += 1;
    }
  }
  // The built tree and source snapshots are private to this run (a concurrent run must not rebuild
  // the skills or change the guidance a running session is reading) and stay with its recordings.
  const dist = path.join(runDir, ".dist");
  buildRuntime("oh-my-pi", dist);
  snapshotSources(dist);
  console.log(`skills built at ${path.relative(repoRoot, dist)}; running ${scenarios.map((s) => s.name).join(", ")} with ${maxMinutes} minutes per phase; recordings in ${path.relative(repoRoot, runDir)}`);
  results = await Promise.all(scenarios.map((s) => runScenario(s, runDir, dist)));
  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(results, null, 2));
  const latest = path.join(resultsRoot, "latest");
  const latestTemp = path.join(resultsRoot, `.latest-${process.pid}-${randomUUID()}`);
  try {
    fs.symlinkSync(path.basename(runDir), latestTemp);
    fs.renameSync(latestTemp, latest);
  } finally {
    fs.rmSync(latestTemp, { force: true });
  }
}

const graded = results.filter((r) => !r.skipped);
const failed = graded.filter((r) => !r.ok);
console.log(`\n${graded.length - failed.length}/${graded.length} scenarios passed${results.length > graded.length ? ` (${results.length - graded.length} not recorded)` : ""}`);
process.exit(failed.length ? 1 : 0);
