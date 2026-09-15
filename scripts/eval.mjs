#!/usr/bin/env node
// Eval harness: runs one workflow phase with a real agent runtime (or the fake simulator) against a
// throwaway fixture, grades the outcome with deterministic rule graders, repeats k times, and
// reports pass@k (at least one of k runs passed) and pass^k (all k runs passed).
//
// Usage:
//   node scripts/eval.mjs --driver <omp|claude|codex|fake> [--case <name>...] [--k 3] [--json] [--keep] [--timeout <seconds>]
//
// Cases live in eval/cases/<name>.json (schema in eval/README.md). Every invocation writes
// eval/results/<ISO timestamp>-<driver>.json; --json also prints that object to stdout.
// Exit 1 when any run failed, 2 on usage errors.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PHASES, createTask, listArtifacts, nextReplyNumber, readTask, replyPath, validateArtifact, validateReply } from "../skills/run-task/scripts/workflow.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const casesDir = path.join(repoRoot, "eval", "cases");
const resultsDir = path.join(repoRoot, "eval", "results");
const workflowScript = path.join(repoRoot, "skills", "run-task", "scripts", "workflow.mjs");
const simulateScript = path.join(repoRoot, "scripts", "simulate.mjs");

const DRIVERS = ["omp", "claude", "codex", "fake"];
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const OUTPUT_CAP = 1024 * 1024;

// Host names the collection bans; spelled out so the collection's own banned-token scan does not match this file.
const HOST_TOKENS = ["r p i", "b b"].map((s) => new RegExp(`\\b${s.replaceAll(" ", "")}\\b`, "i"));

// Arguments ------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { driver: null, cases: [], k: 3, json: false, keep: false, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--driver":
        opts.driver = value();
        break;
      case "--case":
        opts.cases.push(value());
        break;
      case "--k":
        opts.k = Number(value());
        break;
      case "--timeout":
        opts.timeoutMs = Number(value()) * 1000;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--keep":
        opts.keep = true;
        break;
      default:
        throw new Error(`unknown argument ${a}`);
    }
  }
  if (!DRIVERS.includes(opts.driver)) throw new Error(`--driver must be one of ${DRIVERS.join(", ")}`);
  if (!Number.isInteger(opts.k) || opts.k < 1) throw new Error("--k must be a positive integer");
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) throw new Error("--timeout must be a positive number of seconds");
  return opts;
}

function loadCases(names) {
  const available = fs
    .readdirSync(casesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
  const picked = names.length ? names : available;
  return picked.map((name) => {
    if (!available.includes(name)) throw new Error(`no case eval/cases/${name}.json (available: ${available.join(", ")})`);
    const c = JSON.parse(fs.readFileSync(path.join(casesDir, `${name}.json`), "utf8"));
    if (!c.command) throw new Error(`case ${name}: "command" is required`);
    return {
      name,
      workflow: c.workflow ?? "full",
      slug: c.slug ?? "demo",
      request: c.request ?? c.name ?? name,
      fixture: c.fixture ?? { files: {} },
      artifacts: c.artifacts ?? {},
      replies: c.replies ?? {},
      command: c.command,
      arg: c.arg ?? null,
      prompt: c.prompt ?? null,
      expect: {
        artifactType: null,
        nextSkill: null,
        gate: PHASES[c.command]?.gate ?? false,
        replyContains: [],
        allowedWrites: [],
        replyFile: true,
        ...(c.expect ?? {}),
      },
    };
  });
}

// Fixture --------------------------------------------------------------------------------------

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function buildFixture(c) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `skills-eval-${c.name}-`));
  git(root, "init", "-q", "-b", "main");
  for (const [rel, content] of Object.entries(c.fixture.files ?? {})) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  const gitignore = path.join(root, ".gitignore");
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, "");
  const { taskDir } = createTask(root, { request: c.request, workflow: c.workflow, slug: c.slug, title: c.request.split(/\r?\n/)[0].slice(0, 120) });
  for (const [name, content] of Object.entries(c.artifacts)) fs.writeFileSync(path.join(taskDir, name), content);
  if (Object.keys(c.replies).length) {
    fs.mkdirSync(path.join(taskDir, "replies"), { recursive: true });
    for (const [name, content] of Object.entries(c.replies)) fs.writeFileSync(path.join(taskDir, "replies", name), content);
  }
  git(root, "add", "-A");
  git(root, "-c", "user.name=eval", "-c", "user.email=eval@example.invalid", "commit", "-q", "-m", "fixture", "--no-gpg-sign");
  return { root, taskDir };
}

function composePrompt(c, taskDir) {
  const skill = c.command;
  const argText = c.arg ? ` ${c.arg.startsWith("@") || c.arg.startsWith("-") ? c.arg : `@${c.arg}`}` : "";
  const nn = String(nextReplyNumber(taskDir)).padStart(2, "0");
  const replyFile = replyPath(taskDir, nn, skill);
  if (c.prompt) {
    const prompt = c.prompt.replaceAll("{repo}", repoRoot).replaceAll("{taskDir}", taskDir).replaceAll("{skill}", skill).replaceAll("{replyFile}", replyFile);
    return { prompt, replyFile };
  }
  const prompt = `Read and follow ${repoRoot}/skills/${skill}/SKILL.md, the installed skill for /${skill}${argText}, for task directory ${taskDir}. When finished, also write your complete final reply verbatim to ${replyFile}.`;
  return { prompt, replyFile };
}

// Process runner ------------------------------------------------------------------------------

function runProcess(cmd, args, { cwd, timeoutMs, env = process.env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    } catch (error) {
      resolve({ exitCode: null, stdout, stderr: error.message, durationMs: 0, timedOut, spawnError: error.message });
      return;
    }
    const cap = (buf, chunk) => (buf.length < OUTPUT_CAP ? buf + chunk : buf);
    child.stdout.on("data", (d) => (stdout = cap(stdout, d.toString())));
    child.stderr.on("data", (d) => (stderr = cap(stderr, d.toString())));
    const killTree = (signal) => {
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // already gone
        }
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree("SIGTERM");
      setTimeout(() => killTree("SIGKILL"), 5000).unref();
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: `${stderr}${error.message}`, durationMs: Date.now() - started, timedOut, spawnError: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, durationMs: Date.now() - started, timedOut });
    });
  });
}

// Drivers ------------------------------------------------------------------------------------

function jsonLines(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // not a JSON line
    }
  }
  return out;
}

function parseWholeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const lines = jsonLines(text);
    return lines.length ? lines.at(-1) : null;
  }
}

function* walk(value) {
  if (Array.isArray(value)) for (const v of value) yield* walk(v);
  else if (value && typeof value === "object") {
    yield value;
    for (const v of Object.values(value)) yield* walk(v);
  }
}

const TOKEN_KEYS = [
  ["input", "output"],
  ["inputTokens", "outputTokens"],
  ["input_tokens", "output_tokens"],
];

function tokenPair(obj) {
  for (const [i, o] of TOKEN_KEYS) {
    if (typeof obj[i] === "number" && typeof obj[o] === "number") return { input: obj[i], output: obj[o] };
  }
  return null;
}

function sumTokens(objects) {
  let found = false;
  const total = { input: 0, output: 0 };
  for (const obj of objects) {
    const pair = tokenPair(obj);
    if (!pair) continue;
    found = true;
    total.input += pair.input;
    total.output += pair.output;
  }
  return found ? total : null;
}

function assistantText(message) {
  if (!message || message.role !== "assistant") return null;
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return null;
  const text = message.content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  return text || null;
}

const drivers = {
  async fake({ prompt, taskDir, skill }, { timeoutMs, cwd }) {
    const args = skill === "run-task" ? [workflowScript, "status", taskDir] : [simulateScript, "phase", skill, taskDir];
    const r = await runProcess(process.execPath, args, { cwd, timeoutMs });
    return { ...r, lastMessage: r.stdout.trim() || null, tokens: null, costUsd: null };
  },

  async omp({ prompt }, { timeoutMs, cwd }) {
    const r = await runProcess("omp", ["-p", "--mode", "json", "--no-title", prompt], { cwd, timeoutMs });
    const events = jsonLines(r.stdout);
    // One message_end per assistant API call; other event types repeat the same usage block.
    // `input` counts only uncached tokens, so cache reads and writes are added to match the claude driver.
    const ends = events.filter((e) => e.type === "message_end" && e.message?.role === "assistant");
    const usages = ends.map((e) => e.message.usage).filter(Boolean);
    let tokens = sumTokens(usages.map((u) => (typeof u.input === "number" ? { ...u, input: u.input + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0) } : u)));
    if (!tokens) tokens = sumTokens([...walk(events)]);
    const costs = usages.map((u) => u?.cost?.total).filter((v) => typeof v === "number");
    const costUsd = costs.length ? costs.reduce((a, b) => a + b, 0) : null;
    let lastMessage = null;
    for (const e of ends) lastMessage = assistantText(e.message) ?? lastMessage;
    if (!lastMessage) {
      const agentEnd = events.find((e) => e.type === "agent_end" && Array.isArray(e.messages));
      if (agentEnd) for (const m of agentEnd.messages) lastMessage = assistantText(m) ?? lastMessage;
    }
    return { ...r, lastMessage, tokens, costUsd };
  },

  async claude({ prompt }, { timeoutMs, cwd }) {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "Skill",
      "Bash(git:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(cat:*)",
    ];
    const r = await runProcess("claude", args, { cwd, timeoutMs });
    const result = parseWholeJson(r.stdout);
    const usage = result?.usage;
    const tokens = usage
      ? {
          input: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
          output: usage.output_tokens ?? 0,
        }
      : null;
    const costUsd = typeof result?.total_cost_usd === "number" ? result.total_cost_usd : null;
    const lastMessage = typeof result?.result === "string" ? result.result : null;
    return { ...r, lastMessage, tokens, costUsd };
  },

  async codex({ prompt }, { timeoutMs, cwd }) {
    const lastFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "skills-eval-codex-")), "last-message.md");
    const args = ["exec", "-C", cwd, "-s", "workspace-write", "--skip-git-repo-check", "--json", "-o", lastFile, prompt];
    const r = await runProcess("codex", args, { cwd, timeoutMs });
    const events = jsonLines(r.stdout);
    const turns = events.filter((e) => e.type === "turn.completed" && e.usage);
    let tokens = sumTokens(turns.map((e) => e.usage));
    if (!tokens) tokens = sumTokens([...walk(events)]);
    let lastMessage = null;
    if (fs.existsSync(lastFile)) {
      lastMessage = fs.readFileSync(lastFile, "utf8").trim() || null;
      fs.rmSync(path.dirname(lastFile), { recursive: true, force: true });
    }
    return { ...r, lastMessage, tokens, costUsd: null };
  },
};

// Graders -------------------------------------------------------------------------------------

function listFilesUnder(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesUnder(full));
    else out.push(full);
  }
  return out;
}

// `**/` matches zero or more directories, a bare `**` matches the rest of the path, `*` stays inside one segment.
function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replaceAll("\u0000", "(?:.*/)?")
    .replaceAll("\u0001", ".*");
  return new RegExp(`^${escaped}$`);
}

function grade(c, { root, taskDir, replyFile, result }) {
  const graders = [];
  const warnings = [];
  const add = (name, status, message) => graders.push({ name, status, message });

  // reply-file
  let reply = null;
  if (result.timedOut) add("reply-file", "FAIL", "timeout");
  else if (fs.existsSync(replyFile)) {
    reply = fs.readFileSync(replyFile, "utf8");
    add("reply-file", "PASS", path.relative(root, replyFile));
  } else if (!c.expect.replyFile) {
    reply = result.lastMessage;
    add("reply-file", "SKIP", "case grades the driver's last message");
    if (reply === null) add("reply-content", "FAIL", "driver returned no final message");
  } else if (result.lastMessage) {
    reply = result.lastMessage;
    warnings.push(`reply file ${path.relative(root, replyFile)} missing; graded the driver's last message instead`);
    add("reply-file", "FAIL", `${path.relative(root, replyFile)} not written`);
  } else add("reply-file", "FAIL", `${path.relative(root, replyFile)} not written and the driver returned no final message`);

  // reply-shape
  if (!c.expect.nextSkill) add("reply-shape", "SKIP", "case expects no handoff fence");
  else if (reply === null) add("reply-shape", "FAIL", "no reply to check");
  else {
    const issues = validateReply(reply, { expectSkill: c.expect.nextSkill, knownSkills: new Set(Object.keys(PHASES)) });
    add("reply-shape", issues.length ? "FAIL" : "PASS", issues.length ? issues.join("; ") : `fence names /${c.expect.nextSkill}`);
  }

  // artifact
  if (!c.expect.artifactType) add("artifact", "SKIP", "case expects no artifact");
  else {
    const task = readTask(taskDir);
    const seeded = new Set(Object.keys(c.artifacts));
    const candidates = listArtifacts(taskDir, task.slug).filter((a) => a.type === c.expect.artifactType && !seeded.has(a.name));
    if (!candidates.length) add("artifact", "FAIL", `no new artifact of type ${c.expect.artifactType} in the task directory`);
    else {
      const artifact = candidates.at(-1);
      const issues = validateArtifact(artifact.text, { type: c.expect.artifactType, gate: c.expect.gate });
      add("artifact", issues.length ? "FAIL" : "PASS", issues.length ? `${artifact.name}: ${issues.join("; ")}` : artifact.name);
    }
  }

  // scope
  const porcelain = git(root, "status", "--porcelain", "--untracked-files=all")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim().replace(/^"|"$/g, ""));
  const allowed = c.expect.allowedWrites.map(globToRegExp);
  const stray = porcelain.filter((p) => !allowed.some((re) => re.test(p)));
  add("scope", stray.length ? "FAIL" : "PASS", stray.length ? `writes outside the task directory: ${stray.join(", ")}` : "working tree clean outside .agents/tasks/");

  // banned
  const hits = [];
  for (const file of listFilesUnder(taskDir)) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of HOST_TOKENS) if (re.test(text)) hits.push(`${path.relative(taskDir, file)} matches ${re}`);
  }
  add("banned", hits.length ? "FAIL" : "PASS", hits.length ? hits.join("; ") : "no host tokens under the task directory");

  // replyContains
  for (const pattern of c.expect.replyContains) {
    const re = new RegExp(pattern, "m");
    const ok = reply !== null && re.test(reply);
    add(`reply-contains ${pattern}`, ok ? "PASS" : "FAIL", ok ? "matched" : reply === null ? "no reply" : "no match");
  }

  const failed = graders.filter((g) => g.status === "FAIL").map((g) => g.name);
  return { graders, warnings, failed, pass: failed.length === 0, reply };
}

// Runs ------------------------------------------------------------------------------------------

async function runOnce(c, opts, runIndex) {
  const { root, taskDir } = buildFixture(c);
  const { prompt, replyFile } = composePrompt(c, taskDir);
  const driver = drivers[opts.driver];
  const result = await driver({ prompt, taskDir, skill: c.command, root }, { timeoutMs: opts.timeoutMs, cwd: root });
  const graded = grade(c, { root, taskDir, replyFile, result });
  const reason = result.timedOut ? "timeout" : result.spawnError ? `spawn error: ${result.spawnError}` : graded.pass ? "" : graded.failed.join(", ");
  const record = {
    run: runIndex,
    pass: graded.pass && !result.timedOut,
    reason,
    failed: graded.failed,
    graders: graded.graders,
    warnings: graded.warnings,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    tokens: result.tokens,
    costUsd: result.costUsd,
    fixture: opts.keep ? root : null,
    prompt,
    reply: graded.reply,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  if (!opts.keep) fs.rmSync(root, { recursive: true, force: true });
  return record;
}

function summarize(runs) {
  const passes = runs.filter((r) => r.pass).length;
  const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const tokenTotals = runs.filter((r) => r.tokens).map((r) => r.tokens.input + r.tokens.output);
  const costs = runs.filter((r) => typeof r.costUsd === "number").map((r) => r.costUsd);
  return {
    k: runs.length,
    passes,
    passAtK: passes > 0 ? 1 : 0,
    passPowK: passes === runs.length ? 1 : 0,
    meanDurationMs: mean(runs.map((r) => r.durationMs)),
    meanTokens: mean(tokenTotals),
    meanCostUsd: mean(costs),
  };
}

// Report ----------------------------------------------------------------------------------------

const fmtDuration = (ms) => (ms === null || ms === undefined ? "n/a" : ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
const fmtTokens = (t) => (t ? `${t.input} in / ${t.output} out` : "n/a");
const fmtCost = (c) => (typeof c === "number" ? `$${c.toFixed(4)}` : "n/a");

function renderReport(report) {
  const lines = [`# Eval: driver ${report.driver}, k=${report.k}`, ""];
  for (const c of report.cases) {
    lines.push(`## ${c.name} (${c.command}${c.arg ? ` ${c.arg}` : ""}, workflow ${c.workflow})`, "");
    lines.push("| Run | Result | Failed graders | Duration | Tokens | Cost |", "|---|---|---|---|---|---|");
    for (const r of c.runs) {
      lines.push(`| ${r.run} | ${r.pass ? "PASS" : "FAIL"} | ${r.pass ? "-" : r.reason} | ${fmtDuration(r.durationMs)} | ${fmtTokens(r.tokens)} | ${fmtCost(r.costUsd)} |`);
    }
    for (const r of c.runs) {
      for (const g of r.graders.filter((g) => g.status === "FAIL")) lines.push(`- run ${r.run} ${g.name}: ${g.message}`);
      for (const w of r.warnings) lines.push(`- run ${r.run} warning: ${w}`);
    }
    const s = c.summary;
    const tokens = s.meanTokens === null ? "n/a" : Math.round(s.meanTokens);
    lines.push("", `${c.name}: pass@${s.k} = ${s.passAtK}, pass^${s.k} = ${s.passPowK} (${s.passes}/${s.k} passed), mean duration ${fmtDuration(s.meanDurationMs)}, mean tokens ${tokens}${s.meanCostUsd === null ? "" : `, mean cost ${fmtCost(s.meanCostUsd)}`}`, "");
  }
  lines.push(`Results: ${path.relative(repoRoot, report.resultsFile)}`);
  return lines.join("\n");
}

// Main ------------------------------------------------------------------------------------------

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\nusage: node scripts/eval.mjs --driver <${DRIVERS.join("|")}> [--case <name>...] [--k 3] [--json] [--keep] [--timeout <seconds>]\n`);
    return 2;
  }
  const cases = loadCases(opts.cases);
  if (opts.driver === "fake" && !fs.existsSync(simulateScript) && cases.some((c) => c.command !== "run-task")) {
    process.stderr.write(`${path.relative(repoRoot, simulateScript)} is missing; the fake driver needs it for every skill except run-task\n`);
    return 2;
  }
  const startedAt = new Date();
  const report = { driver: opts.driver, k: opts.k, timeoutMs: opts.timeoutMs, startedAt: startedAt.toISOString(), finishedAt: null, cases: [], resultsFile: null };
  for (const c of cases) {
    const runs = [];
    for (let i = 1; i <= opts.k; i++) runs.push(await runOnce(c, opts, i));
    report.cases.push({ name: c.name, command: c.command, arg: c.arg, workflow: c.workflow, expect: c.expect, runs, summary: summarize(runs) });
  }
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(resultsDir, { recursive: true });
  report.resultsFile = path.join(resultsDir, `${startedAt.toISOString().replaceAll(":", "-")}-${opts.driver}.json`);
  fs.writeFileSync(report.resultsFile, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${opts.json ? JSON.stringify(report, null, 2) : renderReport(report)}\n`);
  return report.cases.every((c) => c.summary.passPowK === 1) ? 0 : 1;
}

process.exit(await main(process.argv.slice(2)));
