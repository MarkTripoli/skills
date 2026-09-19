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
//              with the current checks; git-state checks are skipped, everything else runs.
//
// Output: evals/results/<stamp>/<scenario>/<n>-<skill>/{prompt.md,answer.md,stderr.log,task/},
// evals/results/<stamp>/<scenario>/report.json (written as each scenario ends),
// evals/results/<stamp>/summary.json, and `evals/results/latest` pointing at the newest run.
// Recordings are never deleted by a later run. Exit 1 when any phase fails.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildRuntime } from "../scripts/lib/build.mjs";
import { artifacts, failures, handoff, newest, placeholders } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const resultsRoot = path.join(here, "results");
const scenariosDir = path.join(here, "scenarios");
const fixturesDir = path.join(here, "fixtures");

const args = process.argv.slice(2);
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

// The fixture codebase plus the scenario's own fixtures, copied into `dest`.
function copyFixtures(scenario, dest) {
  fs.cpSync(path.join(fixturesDir, "repo-cli"), dest, { recursive: true });
  for (const fixture of scenario.fixtures ?? []) fs.cpSync(path.join(fixturesDir, fixture), dest, { recursive: true });
}

// A throwaway git repository holding the fixture codebase, the worker definitions, and the task directory.
function prepareRepo(scenario, dist) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `skills-eval-${scenario.name}-`));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "evals@example.com");
  git(repo, "config", "user.name", "Skills Evals");
  copyFixtures(scenario, repo);
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
  return [`Read and follow ${path.join(skillsDir, phase.skill, "SKILL.md")}, the installed \`${phase.skill}\` skill, for task directory ${taskRel}.`, "", phase.request ?? "", "", "Print the skill's final answer."]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
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
    const preamble = ctx.answer.slice(0, h.index).trimEnd();
    const sentence = /Next action:\nOpen a new session in (.+), then run:$/.exec(preamble);
    if (!sentence || sentence[1].trim() === "") out.push("reply: the fence must directly follow `Next action:` and `Open a new session in <run location>, then run:` with a non-empty location");
  }
  if (!ctx.artifact) out.push(`artifact: no artifact of type ${phase.artifactType} in ${path.basename(ctx.taskDir)} (found: ${ctx.artifacts.map((a) => `${a.file}[${a.fm.type ?? "?"}]`).join(", ") || "none"})`);
  else {
    if (!ctx.artifact.fm.summary) out.push(`${ctx.artifact.file}: frontmatter summary missing`);
    const left = placeholders(ctx.artifact.text, ctx.template);
    if (left.length) out.push(`${ctx.artifact.file}: template placeholder left: ${left.slice(0, 3).join(" | ")}`);
    if (phase.handoffNamesArtifact && h && h.file !== ctx.artifact.file) out.push(`reply: fence names ${h.file ?? "no file"}, expected @${ctx.artifact.file}`);
    if (ctx.before.some((a) => a.file === ctx.artifact.file)) out.push(`${ctx.artifact.file}: the phase reused an existing artifact instead of taking the next number`);
  }
  for (const a of ctx.before) {
    const now = a.file === "task.md" ? fs.readFileSync(path.join(ctx.taskDir, "task.md"), "utf8") : ctx.artifacts.find((b) => b.file === a.file)?.text;
    if (now === undefined) out.push(`${a.file}: an earlier file was removed by this phase`);
    else if (now !== a.text) out.push(`${a.file}: an earlier file was modified by this phase`);
  }
  if (!ctx.live) return out;
  if (ctx.artifact && phase.commit) {
    const subjects = git(ctx.repo, "log", "--format=%s", "--", path.relative(ctx.repo, ctx.artifact.path)).split("\n");
    if (!subjects.includes(phase.commit)) out.push(`git: ${ctx.artifact.file} is not in a commit "${phase.commit}" (its commits: ${subjects.join(" | ") || "none"})`);
  }
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
    const prompt = phasePrompt(skillsDir, phase, taskRel);
    fs.writeFileSync(path.join(out, "prompt.md"), prompt);
    const before = snapshot(taskDir);
    const template = templateFor(skillsDir, phase);
    const started = Date.now();
    console.log(`[${scenario.name}] ${label}: started`);
    const { code, stdout, stderr } = await runOmp(prompt, repo);
    const seconds = Math.round((Date.now() - started) / 1000);
    fs.writeFileSync(path.join(out, "answer.md"), stdout);
    fs.writeFileSync(path.join(out, "stderr.log"), stderr);
    if (fs.existsSync(taskDir)) fs.cpSync(taskDir, path.join(out, "task"), { recursive: true });

    const ctx = {
      live: true,
      repo,
      codeRoot: repo,
      taskDir,
      fixtureSha,
      before,
      template,
      answer: stdout,
      artifact: newest(taskDir, phase.artifactType),
      artifacts: artifacts(taskDir),
    };
    const problems = grade(phase, ctx, code);
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
    console.log(`[${scenario.name}] no recording under ${path.relative(repoRoot, runDir)}; skipped`);
    return { ...result, skipped: true };
  }
  const codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `skills-eval-grade-${scenario.name}-`));
  copyFixtures(scenario, codeRoot);
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
        template: fs.existsSync(path.join(repoRoot, "skills", "delivery", phase.skill, "references", phase.template ?? "")) ? fs.readFileSync(path.join(repoRoot, "skills", "delivery", phase.skill, "references", phase.template), "utf8") : "",
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
  const runDir = path.resolve(resultsRoot, gradeDir || "latest");
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
  // The built tree is private to this run (a concurrent run must not rebuild the skills a running
  // session is reading) and stays with its recordings so a saved prompt can be replayed.
  const dist = path.join(runDir, ".dist");
  buildRuntime("oh-my-pi", dist);
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
