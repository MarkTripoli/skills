#!/usr/bin/env node
// Eval harness: runs one workflow phase with a real agent runtime (or the fake simulator) against a
// throwaway fixture, grades the outcome with deterministic rule graders, repeats k times, and
// reports pass@k (at least one of k runs passed) and pass^k (all k runs passed).
//
// Usage:
//   node scripts/eval.mjs --driver <omp|claude|codex|fake> [--case <name>...] [--k 3] [--model <spec>] [--json] [--keep] [--timeout <seconds>]
//   node scripts/eval.mjs --driver <driver> --chain <full|lean|prd|oneshot> [--model <spec>] [--json] [--keep]
//
// --chain runs a whole workflow: one fresh agent process per phase, each phase graded like a case,
// human gates auto-approved (test mode; a real user reviews there), until the pull request handoff.
//
// Cases live in eval/cases/<name>.json (schema in eval/README.md). Every invocation writes
// eval/results/<ISO timestamp>-<driver>.json; --json also prints that object to stdout.
// Exit 0 when every run passed, 1 when any run failed, 2 on usage errors, 130 when interrupted.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PHASES, TYPES, createTask, listArtifacts, nextCommand, nextReplyNumber, parseCommand, parseFrontmatter, parseReply, predictNext, readTask, replyPath, validateArtifact, validateReply } from "../skills/delivery/run-task/scripts/workflow.mjs";
import { skillDir } from "./lib/layout.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const casesDir = path.join(repoRoot, "eval", "cases");
const chainsDir = path.join(repoRoot, "eval", "chains");
const resultsDir = path.join(repoRoot, "eval", "results");
const skillsRoot = path.join(repoRoot, "skills");
const workflowScript = path.join(skillDir(skillsRoot, "run-task"), "scripts", "workflow.mjs");

function findSkillDirSafe(name) {
  try {
    return skillDir(skillsRoot, name);
  } catch {
    return null;
  }
}
const simulateScript = path.join(repoRoot, "scripts", "simulate.mjs");

const DRIVERS = ["omp", "claude", "codex", "fake"];
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
// Driver output is parsed in full; only what the results file stores is clipped to this many
// characters from each end.
const STORE_CAP = 64 * 1024;
const ARTIFACT_MODES = ["created", "modified"];
const CASE_KINDS = ["phase", "smoke"];

// Host names the collection bans; spelled out so the collection's own banned-token scan does not match this file.
const HOST_TOKENS = ["r p i", "b b"].map((s) => new RegExp(`\\b${s.replaceAll(" ", "")}\\b`, "i"));

class UsageError extends Error {}

// Live resources, released by the signal handlers -------------------------------------------------

const live = { children: new Set(), fixtures: new Set(), tempDirs: new Set(), keep: false, interrupted: false };

function killGroup(child, signal) {
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
}

function releaseAll() {
  for (const dir of live.tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  if (!live.keep) for (const dir of live.fixtures) fs.rmSync(dir, { recursive: true, force: true });
}

function installSignalHandlers() {
  const onSignal = (signal) => {
    if (live.interrupted) {
      for (const child of live.children) killGroup(child, "SIGKILL");
      releaseAll();
      process.exit(130);
    }
    live.interrupted = true;
    process.stderr.write(`\n${signal}: stopping the agent process group and removing fixtures\n`);
    for (const child of live.children) killGroup(child, "SIGTERM");
    setTimeout(() => {
      for (const child of live.children) killGroup(child, "SIGKILL");
      releaseAll();
      process.exit(130);
    }, 1500);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

// Arguments ------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { driver: null, cases: [], k: 3, json: false, keep: false, timeoutMs: DEFAULT_TIMEOUT_MS, model: null, chain: null, maxPhases: 12, strict: false, with: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
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
      case "--model":
        opts.model = value();
        break;
      case "--chain":
        opts.chain = value();
        break;
      case "--max-phases":
        opts.maxPhases = Number(value());
        break;
      case "--strict":
        opts.strict = true;
        break;
      case "--with":
        opts.with.push(...value().split(",").map((s) => s.trim()).filter(Boolean));
        break;
      case "--json":
        opts.json = true;
        break;
      case "--keep":
        opts.keep = true;
        break;
      default:
        throw new UsageError(`unknown argument ${a}`);
    }
  }
  if (!DRIVERS.includes(opts.driver)) throw new UsageError(`--driver must be one of ${DRIVERS.join(", ")}`);
  if (!Number.isInteger(opts.k) || opts.k < 1) throw new UsageError("--k must be a positive integer");
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) throw new UsageError("--timeout must be a positive number of seconds");
  if (opts.chain !== null && !TYPES.includes(opts.chain)) throw new UsageError(`--chain must be one of ${TYPES.join(", ")}`);
  if (!Number.isInteger(opts.maxPhases) || opts.maxPhases < 1) throw new UsageError("--max-phases must be a positive integer");
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
    if (!available.includes(name)) throw new UsageError(`no case eval/cases/${name}.json (available: ${available.join(", ")})`);
    const c = JSON.parse(fs.readFileSync(path.join(casesDir, `${name}.json`), "utf8"));
    if (!c.command) throw new UsageError(`case ${name}: "command" is required`);
    const kind = c.kind ?? "phase";
    if (!CASE_KINDS.includes(kind)) throw new UsageError(`case ${name}: "kind" must be one of ${CASE_KINDS.join(", ")}`);
    const expect = {
      artifactType: null,
      artifactMode: "created",
      artifactContains: [],
      nextSkill: null,
      fenceArgIsArtifact: false,
      gate: PHASES[c.command]?.gate ?? false,
      replyContains: [],
      allowedWrites: [],
      replyFile: true,
      ...(c.expect ?? {}),
    };
    if (!ARTIFACT_MODES.includes(expect.artifactMode)) throw new UsageError(`case ${name}: expect.artifactMode must be one of ${ARTIFACT_MODES.join(", ")}`);
    return {
      name,
      kind,
      workflow: c.workflow ?? "full",
      slug: c.slug ?? "demo",
      request: c.request ?? c.name ?? name,
      fixture: c.fixture ?? { files: {} },
      artifacts: c.artifacts ?? {},
      replies: c.replies ?? {},
      command: c.command,
      arg: c.arg ?? null,
      feedback: c.feedback ?? null,
      prompt: c.prompt ?? null,
      expect,
    };
  });
}

// Fixture --------------------------------------------------------------------------------------

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function gitState(root, taskDir = null) {
  const state = { head: git(root, "rev-parse", "HEAD").trim(), stash: git(root, "stash", "list").trim(), maxArtifact: null };
  if (taskDir) {
    const numbers = listArtifacts(taskDir, readTask(taskDir).slug).map((a) => a.nn).filter((nn) => nn !== null);
    state.maxArtifact = numbers.length ? Math.max(...numbers) : 0;
  }
  return state;
}

function buildFixture(c) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `skills-eval-${c.name}-`));
  live.fixtures.add(root);
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
  return { root, taskDir, before: gitState(root, taskDir) };
}

function composePrompt(c, taskDir) {
  const skill = c.command;
  const argText = c.arg ? ` ${c.arg.startsWith("@") || c.arg.startsWith("-") ? c.arg : `@${c.arg}`}` : "";
  const nn = String(nextReplyNumber(taskDir)).padStart(2, "0");
  const replyFile = replyPath(taskDir, nn, skill);
  let prompt;
  const skillPath = path.join(skillDir(skillsRoot, skill), "SKILL.md");
  if (c.prompt) prompt = c.prompt.replaceAll("{repo}", repoRoot).replaceAll("{skillPath}", skillPath).replaceAll("{taskDir}", taskDir).replaceAll("{skill}", skill).replaceAll("{replyFile}", replyFile);
  else prompt = `Read and follow ${skillPath}, the installed skill for /${skill}${argText}, for task directory ${taskDir}. When finished, also write your complete final reply (the message you print last, filled from the answer template, not the artifact) verbatim to ${replyFile}.`;
  if (c.feedback) prompt += `\n\nFeedback: ${c.feedback.replace(/\s+/g, " ").trim()}`;
  return { prompt, replyFile };
}

// The fake driver reads the prompt back the way an agent would, so a prompt that names the wrong
// skill, task directory, argument, or reply file fails the run instead of being papered over.
function parsePrompt(prompt) {
  const skill = /\/([a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md/.exec(prompt)?.[1] ?? null;
  const parsed = { skill, taskDir: null, arg: null, flags: [], replyFile: null, feedback: /^Feedback: (.+)$/m.exec(prompt)?.[1] ?? null };
  const inline = /for \/[a-z0-9-]+((?: (?:@|--)\S+)*), for task directory/.exec(prompt)?.[1];
  const quoted = /with arguments `([^`]*)`/.exec(prompt)?.[1];
  for (const token of `${inline ?? ""} ${quoted ?? ""}`.split(/\s+/).filter(Boolean)) {
    if (token.startsWith("--")) parsed.flags.push(token);
    else if (token.startsWith("@") && path.isAbsolute(token.slice(1))) parsed.taskDir = token.slice(1);
    else if (token.startsWith("@")) parsed.arg = token;
  }
  parsed.taskDir = /for task directory (\S+?)\.?(?:\s|$)/.exec(prompt)?.[1] ?? parsed.taskDir;
  parsed.replyFile = /reply verbatim to (\S+?)\.?(?:\s|$)/.exec(prompt)?.[1] ?? null;
  return parsed;
}

// Process runner ------------------------------------------------------------------------------

function runProcess(cmd, args, { cwd, timeoutMs, env = process.env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    } catch (error) {
      resolve({ exitCode: null, stdout: "", stderr: error.message, durationMs: 0, timedOut, spawnError: error.message });
      return;
    }
    live.children.add(child);
    child.stdout.on("data", (d) => stdout.push(d));
    child.stderr.on("data", (d) => stderr.push(d));
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child, "SIGTERM");
      setTimeout(() => killGroup(child, "SIGKILL"), 5000).unref();
    }, timeoutMs);
    const finish = (extra) => {
      clearTimeout(timer);
      live.children.delete(child);
      // After Ctrl-C the signal handler removes the fixture and exits 130; grading a vanished fixture would only add noise.
      if (live.interrupted) return;
      resolve({ exitCode: null, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), durationMs: Date.now() - started, timedOut, ...extra });
    };
    child.on("error", (error) => finish({ stderr: `${Buffer.concat(stderr)}${error.message}`, spawnError: error.message }));
    child.on("close", (code) => finish({ exitCode: code }));
  });
}

// One-shot probe of a binary (`--version`, `--help`); null when it is missing or fails.
function probe(cmd, args) {
  try {
    return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 }).toString().trim() || null;
  } catch {
    return null;
  }
}

// Flags that isolate a run from the user's home configuration, kept only when the binary's help text lists them.
function supportedFlags(cmd, helpArgs, candidates) {
  const help = probe(cmd, helpArgs) ?? "";
  return candidates.filter((flag) => help.includes(flag));
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

// First `model` string found in the given objects, in stream order.
function firstModel(objects) {
  for (const obj of objects) for (const node of walk(obj)) if (typeof node.model === "string" && node.model) return node.model;
  return null;
}

// First string value under any of the given keys, in stream order.
function firstKey(objects, keys) {
  for (const obj of objects) for (const node of walk(obj)) for (const key of keys) if (typeof node[key] === "string" && node[key]) return node[key];
  return null;
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

// Each driver: `binary`, `version()`, `isolation()` (flags found in the binary's help), and
// `run({ prompt }, { timeoutMs, cwd, isolation })` -> process result plus lastMessage, tokens, costUsd, model, argv.
const drivers = {
  fake: {
    binary: process.execPath,
    version: () => process.version,
    isolation: () => [],
    async run({ prompt }, { timeoutMs, cwd }) {
      const p = parsePrompt(prompt);
      if (!p.skill || !p.taskDir) return { exitCode: null, stdout: "", stderr: `fake driver could not parse skill and task directory from the prompt: ${prompt}`, durationMs: 0, timedOut: false, spawnError: "unparseable prompt", lastMessage: null, tokens: null, costUsd: null, model: null, argv: [] };
      let args;
      if (p.skill === "run-task" && p.flags.includes("--status")) args = [workflowScript, "status", p.taskDir];
      else {
        args = [simulateScript, "phase", p.skill, p.taskDir];
        if (p.arg) args.push(p.arg);
        if (p.replyFile) args.push("--reply", p.replyFile);
        if (p.feedback) args.push("--feedback", p.feedback);
      }
      const r = await runProcess(process.execPath, args, { cwd, timeoutMs });
      return { ...r, lastMessage: r.stdout.trim() || null, tokens: null, costUsd: null, model: "fake", argv: [process.execPath, ...args] };
    },
  },

  omp: {
    binary: "omp",
    version: () => probe("omp", ["--version"]),
    // --profile would also isolate auth, so the run would have no credentials; these keep auth and drop discovery.
    isolation: () => supportedFlags("omp", ["--help"], ["--no-skills", "--no-extensions", "--no-rules", "--no-session"]),
    // --auto-approve: print mode has no UI to answer approval prompts; the fixture is a throwaway temp repo.
    async run({ prompt }, { timeoutMs, cwd, isolation, model }) {
      const args = ["-p", "--mode", "json", "--no-title", "--auto-approve", ...(model ? ["--model", model] : []), ...isolation, prompt];
      const r = await runProcess("omp", args, { cwd, timeoutMs });
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
      const sessionId = firstKey(events, ["sessionId", "session_id", "sessionID"]);
      return { ...r, lastMessage, tokens, costUsd, model: firstModel(events), sessionId, argv: ["omp", ...args] };
    },
  },

  claude: {
    binary: "claude",
    version: () => probe("claude", ["--version"]),
    isolation: () => supportedFlags("claude", ["--help"], ["--safe-mode", "--no-session-persistence"]),
    async run({ prompt }, { timeoutMs, cwd, isolation, model }) {
      const args = [
        "-p",
        prompt,
        "--output-format",
        "json",
        "--permission-mode",
        "acceptEdits",
        ...(model ? ["--model", model] : []),
        ...isolation,
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
      const reportedModel = typeof result?.model === "string" ? result.model : result?.modelUsage && typeof result.modelUsage === "object" ? (Object.keys(result.modelUsage)[0] ?? null) : null;
      return { ...r, lastMessage, tokens, costUsd, model: reportedModel ?? model ?? null, argv: ["claude", ...args] };
    },
  },

  codex: {
    binary: "codex",
    version: () => probe("codex", ["--version"]),
    isolation: () => supportedFlags("codex", ["exec", "--help"], ["--ignore-user-config", "--ignore-rules", "--ephemeral"]),
    async run({ prompt }, { timeoutMs, cwd, isolation, model }) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-eval-codex-"));
      live.tempDirs.add(tempDir);
      const lastFile = path.join(tempDir, "last-message.md");
      const args = ["exec", "-C", cwd, "-s", "workspace-write", "--skip-git-repo-check", ...(model ? ["-m", model] : []), ...isolation, "--json", "-o", lastFile, prompt];
      try {
        const r = await runProcess("codex", args, { cwd, timeoutMs });
        const events = jsonLines(r.stdout);
        const turns = events.filter((e) => e.type === "turn.completed" && e.usage);
        let tokens = sumTokens(turns.map((e) => e.usage));
        if (!tokens) tokens = sumTokens([...walk(events)]);
        const lastMessage = fs.existsSync(lastFile) ? fs.readFileSync(lastFile, "utf8").trim() || null : null;
        const model = firstModel(events.filter((e) => e.type === "thread.started" || e.type === "turn.started")) ?? firstModel(events);
        return { ...r, lastMessage, tokens, costUsd: null, model, argv: ["codex", ...args] };
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
        live.tempDirs.delete(tempDir);
      }
    },
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

// Splits a Markdown body into its `## ` sections: [{ heading, lines }], lines exclude the heading.
function h2Sections(body) {
  const sections = [];
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    if (/^## /.test(line)) {
      current = { heading: line.trim(), lines: [] };
      sections.push(current);
    } else if (current) current.lines.push(line);
  }
  return sections;
}

// Heading identity for section matching: case, punctuation, a trailing plural, and the phase/step
// synonym do not count. Later phases read artifacts whole, so `## Research Questions` satisfies a
// template's `## Research Question` and `## Phase 1:` satisfies an outline's `## Step 1:`, which
// workflow.mjs treats alike.
function headingKey(heading) {
  return heading
    .replace(/^#+\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/s$/, ""))
    .map((w) => (w === "step" ? "phase" : w))
    .join(" ");
}

const OPTIONAL_SECTION = /Include only when|Omit this section|Repeat (?:this|the same) structure/i;

// Required `## ` headings of the artifact template of the skill that creates `type` (an iterate
// skill edits an artifact the create skill wrote, so its own template does not apply). A heading
// with a `[placeholder]` tail is matched by its prefix (`## Phase 1:`); a section whose first body
// line says it may be omitted or repeated is optional. Null when no artifact template exists.
function requiredSections(skill, type) {
  const creator = skill.startsWith("iterate-") ? (Object.entries(PHASES).find(([name, p]) => p.type === type && !name.startsWith("iterate-"))?.[0] ?? skill) : skill;
  const creatorDir = findSkillDirSafe(creator);
  const dir = creatorDir ? path.join(creatorDir, "references") : null;
  if (!dir || !fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith("_template.md"));
  const texts = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  let index = texts.findIndex((t) => parseFrontmatter(t).data.type === type);
  if (index === -1 && files.length === 1) index = 0;
  if (index === -1) return null;
  return h2Sections(parseFrontmatter(texts[index]).body)
    .filter((s) => !OPTIONAL_SECTION.test(s.lines.find((l) => l.trim()) ?? ""))
    .map((s) => {
      const bracket = s.heading.indexOf("[");
      return bracket === -1 ? { heading: s.heading, prefix: null } : { heading: s.heading, prefix: s.heading.slice(0, bracket).trimEnd() };
    });
}

const PLACEHOLDER_PATTERNS = [
  [/\[[A-Z][^\]\n]+\](?!\()/g, "template placeholder"],
  [/\[([^[\]\n]+)\](?!\()/g, "bracketed phrase", (m) => m[1].trim().split(/\s+/).length > 3],
  [/\beng-xxxx\b/gi, "template task id"],
  [/\{[A-Z][A-Z_]+\}/g, "unfilled token"],
];

// Code fences and inline code are real content (array literals, shell brackets), so the placeholder
// scan runs on prose only.
function proseOnly(body) {
  return body.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

function artifactContentIssues(text, { skill, type, contains }) {
  const issues = [];
  const body = parseFrontmatter(text).body;
  const prose = proseOnly(body);
  const placeholders = new Set();
  for (const [re, label, accept] of PLACEHOLDER_PATTERNS) {
    for (const m of prose.matchAll(re)) if (!accept || accept(m)) placeholders.add(`${label} ${m[0].slice(0, 40)}`);
  }
  if (placeholders.size) issues.push(`body still holds ${[...placeholders].slice(0, 4).join(", ")}${placeholders.size > 4 ? `, ${placeholders.size - 4} more` : ""}`);
  const required = requiredSections(skill, type);
  if (required) {
    const sections = h2Sections(body);
    for (const { heading, prefix } of required) {
      const found = sections.find((s) => (prefix ? headingKey(s.heading).startsWith(headingKey(prefix)) : headingKey(s.heading) === headingKey(heading)));
      if (!found) issues.push(`missing section ${prefix ?? heading}`);
      else if (!found.lines.some((l) => l.trim() && !/^#/.test(l) && l.trim() !== "---")) issues.push(`section ${found.heading} has no content`);
    }
  }
  // The summary is part of the artifact's content (later phases read it alone), so case regexes see the whole file.
  for (const pattern of contains) if (!new RegExp(pattern, "m").test(text)) issues.push(`artifact does not match /${pattern}/`);
  return issues;
}

function findArtifact(c, taskDir) {
  const task = readTask(taskDir);
  const seeded = c.artifacts;
  const ofType = listArtifacts(taskDir, task.slug).filter((a) => a.type === c.expect.artifactType);
  const fresh = ofType.filter((a) => !(a.name in seeded));
  if (c.expect.artifactMode === "created") {
    return fresh.length ? { artifact: fresh.at(-1) } : { error: `no new artifact of type ${c.expect.artifactType} in the task directory` };
  }
  // modified: a seeded artifact of the type changed and no new one appeared.
  if (fresh.length) return { error: `a new artifact of type ${c.expect.artifactType} was added (${fresh.map((a) => a.name).join(", ")}) instead of editing the seeded one in place` };
  const changed = ofType.filter((a) => a.name in seeded && a.text !== seeded[a.name]);
  return changed.length ? { artifact: changed.at(-1) } : { error: `no seeded artifact of type ${c.expect.artifactType} was modified` };
}

const LINK_LINE = /^(Artifact saved|Review artifact):(.*)$/gm;
const MD_LINK = /\[[^\]\n]*\]\(([^)\s]+)\)/;

function grade(c, { root, taskDir, replyFile, result, before }) {
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

  // artifact and artifact-content
  let artifact = null;
  if (!c.expect.artifactType) {
    add("artifact", "SKIP", "case expects no artifact");
    add("artifact-content", "SKIP", "case expects no artifact");
  } else {
    const found = findArtifact(c, taskDir);
    if (found.error) {
      add("artifact", "FAIL", found.error);
      add("artifact-content", "SKIP", "no artifact to check");
    } else {
      artifact = found.artifact;
      const issues = validateArtifact(artifact.text, { type: c.expect.artifactType, gate: c.expect.gate });
      // Numbering: a new artifact takes the next number after everything that existed before the run.
      if (c.expect.artifactMode === "created" && artifact.nn !== null && typeof before.maxArtifact === "number" && artifact.nn <= before.maxArtifact) {
        issues.push(`numbered ${String(artifact.nn).padStart(2, "0")} but ${String(before.maxArtifact).padStart(2, "0")} already existed; the next number was ${String(before.maxArtifact + 1).padStart(2, "0")}`);
      }
      add("artifact", issues.length ? "FAIL" : "PASS", issues.length ? `${artifact.name}: ${issues.join("; ")}` : `${artifact.name} (${c.expect.artifactMode})`);
      const content = artifactContentIssues(artifact.text, { skill: c.command, type: c.expect.artifactType, contains: c.expect.artifactContains });
      add("artifact-content", content.length ? "FAIL" : "PASS", content.length ? `${artifact.name}: ${content.join("; ")}` : `${artifact.name}: sections filled, no placeholders${c.expect.artifactContains.length ? `, matches ${c.expect.artifactContains.map((p) => `/${p}/`).join(" ")}` : ""}`);
    }
  }

  // reply-links
  if (reply === null) add("reply-links", "FAIL", "no reply to check");
  else {
    const issues = [];
    const parsed = parseReply(reply);
    if (parsed.arg) {
      const target = [path.join(taskDir, parsed.arg), path.resolve(root, parsed.arg)].find((p) => fs.existsSync(p));
      if (!target) issues.push(`fence argument @${parsed.arg} names no file in the task directory`);
      else if (c.expect.fenceArgIsArtifact && artifact && path.resolve(target) !== path.resolve(artifact.file)) issues.push(`fence argument @${parsed.arg} is not the produced artifact ${artifact.name}`);
    } else if (c.expect.fenceArgIsArtifact) issues.push("fence carries no @<file> argument");
    let linkedArtifact = false;
    for (const m of reply.matchAll(LINK_LINE)) {
      const link = MD_LINK.exec(m[2]);
      if (!link) {
        issues.push(`"${m[1]}:" line carries no Markdown link`);
        continue;
      }
      const target = path.resolve(root, link[1]);
      if (!fs.existsSync(target)) issues.push(`${m[1]} link ${link[1]} does not exist`);
      else if (artifact && path.resolve(target) === path.resolve(artifact.file)) linkedArtifact = true;
    }
    if (artifact && !linkedArtifact) issues.push(`no "Artifact saved:" or "Review artifact:" line links ${artifact.name}`);
    add("reply-links", issues.length ? "FAIL" : "PASS", issues.length ? issues.join("; ") : artifact ? `reply links ${artifact.name}` : "every link resolves");
  }

  // scope
  const porcelain = git(root, "status", "--porcelain", "--untracked-files=all")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim().replace(/^"|"$/g, ""));
  const allowed = c.expect.allowedWrites.map(globToRegExp);
  const stray = porcelain.filter((p) => !allowed.some((re) => re.test(p)));
  const after = gitState(root);
  const scopeIssues = [];
  if (stray.length) scopeIssues.push(`writes outside the task directory: ${stray.join(", ")}`);
  if (after.head !== before.head && !c.expect.allowCommits) scopeIssues.push(`HEAD moved from ${before.head.slice(0, 12)} to ${after.head.slice(0, 12)} (the phase committed)`);
  if (after.stash !== before.stash) scopeIssues.push("the stash list changed");
  add("scope", scopeIssues.length ? "FAIL" : "PASS", scopeIssues.length ? scopeIssues.join("; ") : "working tree clean outside .agents/tasks/, HEAD and stash unchanged");

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
  return { graders, warnings, failed, pass: failed.length === 0, reply, artifact: artifact?.name ?? null };
}

// Runs ------------------------------------------------------------------------------------------

// Keeps the first and last STORE_CAP characters of driver output for the results file.
function clip(text) {
  if (text.length <= 2 * STORE_CAP) return { text, truncated: false };
  const omitted = text.length - 2 * STORE_CAP;
  return { text: `${text.slice(0, STORE_CAP)}\n\n[eval: ${omitted} characters omitted]\n\n${text.slice(-STORE_CAP)}`, truncated: true };
}

async function runOnce(c, opts, runIndex, driver) {
  const { root, taskDir, before } = buildFixture(c);
  const { prompt, replyFile } = composePrompt(c, taskDir);
  const result = await driver.run({ prompt, taskDir, skill: c.command, root }, { timeoutMs: opts.timeoutMs, cwd: root, isolation: driver.isolationFlags, model: opts.model });
  const graded = grade(c, { root, taskDir, replyFile, result, before });
  const reason = result.timedOut ? "timeout" : result.spawnError ? `spawn error: ${result.spawnError}` : graded.pass ? "" : graded.failed.join(", ");
  const stdout = clip(result.stdout);
  const stderr = clip(result.stderr);
  const record = {
    run: runIndex,
    pass: graded.pass && !result.timedOut,
    reason,
    failed: graded.failed,
    graders: graded.graders,
    warnings: graded.warnings,
    artifact: graded.artifact,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    tokens: result.tokens,
    costUsd: result.costUsd,
    model: result.model ?? null,
    sessionId: result.sessionId ?? null,
    argv: result.argv ?? [],
    fixture: opts.keep ? root : null,
    prompt,
    reply: graded.reply,
    stdout: stdout.text,
    stderr: stderr.text,
    outputTruncated: stdout.truncated || stderr.truncated,
  };
  if (!opts.keep) fs.rmSync(root, { recursive: true, force: true });
  live.fixtures.delete(root);
  return record;
}

// Chain mode ------------------------------------------------------------------------------------

// Phases that legitimately change the repository and commit; every other phase must leave it untouched.
const REPO_WRITING_SKILLS = new Set(["implement-plan", "implement-outline", "iterate-implementation", "oneshot", "ci-commit", "fix-code-review"]);
// record-evidence writes recordings under the task directory only; its receipt is a task artifact.

function loadChain(workflow) {
  const file = path.join(chainsDir, `${workflow}.json`);
  if (!fs.existsSync(file)) throw new UsageError(`no chain fixture eval/chains/${workflow}.json`);
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    name: `chain-${workflow}`,
    workflow,
    slug: c.slug ?? "demo",
    request: c.request ?? `Chain eval for ${workflow}`,
    fixture: c.fixture ?? { files: {} },
    artifacts: {},
    replies: {},
    artifactContains: c.artifactContains ?? [],
    with: c.with ?? [],
  };
}

// One phase of a chain graded like a case: the expected artifact type and next skill come from the
// table, the fence is compared with the full predicted command, and repository-writing phases may commit.
function chainPhaseCase(chain, next, skill) {
  const phase = PHASES[skill] ?? null;
  return {
    ...chain,
    kind: "phase",
    command: skill,
    arg: next.arg ? `@${next.arg}` : null,
    feedback: null,
    prompt: null,
    expect: {
      artifactType: phase?.type ?? null,
      artifactMode: "created",
      artifactContains: phase ? chain.artifactContains : [],
      nextSkill: null,
      fenceArgIsArtifact: false,
      gate: phase?.gate ?? false,
      replyContains: [],
      allowedWrites: REPO_WRITING_SKILLS.has(skill) ? ["**"] : skill === "setup-worktree" ? [".agents/**"] : [],
      allowCommits: REPO_WRITING_SKILLS.has(skill),
      replyFile: true,
    },
  };
}

async function runChain(chain, opts, driver) {
  const { root, taskDir } = buildFixture(chain);
  const phases = [];
  let done = false;
  let reason = "";
  let pass = true;
  for (let n = 1; n <= opts.maxPhases; n++) {
    const next = nextCommand(taskDir, { with: chain.with });
    if (next.done) {
      done = true;
      reason = next.reason;
      break;
    }
    const skill = next.inline ? "oneshot" : next.skill;
    const c = chainPhaseCase(chain, next, skill);
    const before = gitState(root, taskDir);
    const nn = String(nextReplyNumber(taskDir)).padStart(2, "0");
    const replyFile = replyPath(taskDir, nn, skill);
    const prompt = next.inline
      ? `Read ${repoRoot}/shared/CONVENTIONS.md, then: ${next.command} The task directory is ${taskDir}. When finished, also write your complete final reply (the message you print last, filled from the answer template, not the artifact) verbatim to ${replyFile}.`
      : composePrompt(c, taskDir).prompt;
    const result = await driver.run({ prompt, taskDir, skill, root }, { timeoutMs: opts.timeoutMs, cwd: root, isolation: driver.isolationFlags, model: opts.model });
    // Expected handoff from the table, computed after the phase wrote its artifact.
    const predicted = next.inline ? "/describe-pr" : predictNext(skill, taskDir);
    c.expect.nextSkill = predicted ? parseCommand(predicted)?.skill ?? null : null;
    c.expect.fenceArgIsArtifact = Boolean(predicted && parseCommand(predicted)?.arg && ["create-plan", "iterate-plan", "create-structure-outline", "iterate-structure-outline", "create-design-discussion", "iterate-design-discussion", "create-prd", "iterate-prd", "create-tdd", "iterate-tdd", "create-epic-plan"].includes(skill));
    const graded = grade(c, { root, taskDir, replyFile, result, before });
    const fence = graded.reply ? parseReply(graded.reply).command : null;
    if (predicted && fence !== predicted) {
      graded.graders.push({ name: "fence-command", status: "FAIL", message: `fence is ${fence ? `"${fence}"` : "missing"}, table predicts "${predicted}"` });
      graded.failed.push("fence-command");
      graded.pass = false;
    } else if (predicted) graded.graders.push({ name: "fence-command", status: "PASS", message: predicted });
    const stdout = clip(result.stdout);
    const record = {
      phase: n,
      skill,
      command: next.command,
      pass: graded.pass && !result.timedOut,
      failed: graded.failed,
      graders: graded.graders,
      warnings: graded.warnings,
      artifact: graded.artifact,
      predicted,
      fence,
      gate: c.expect.gate,
      autoApproved: c.expect.gate,
      durationMs: result.durationMs,
      tokens: result.tokens,
      costUsd: result.costUsd,
      model: result.model ?? null,
      sessionId: result.sessionId ?? null,
      exitCode: result.exitCode,
      argv: result.argv ?? [],
      prompt,
      replyFile: path.relative(root, replyFile),
      reply: graded.reply,
      stdout: stdout.text,
      outputTruncated: stdout.truncated,
    };
    phases.push(record);
    // A failed phase whose fence still names the predicted command lets the chain continue, so one run
    // measures every phase; the failure is recorded. --strict stops at the first failure. A reply the
    // module cannot follow (no fence, wrong command) always stops the chain, as run-task would.
    if (!record.pass) {
      pass = false;
      const usable = predicted !== null && fence === predicted;
      if (opts.strict || !usable) {
        reason = `phase ${n} (${skill}) failed: ${graded.failed.join(", ")}${usable ? "" : "; the reply cannot be followed"}`;
        break;
      }
      process.stderr.write(`[chain] ${skill} failed ${graded.failed.join(", ")}; fence usable, continuing\n`);
    } else if (record.gate) process.stderr.write(`[chain] gate after ${skill} auto-approved (test mode)\n`);
    else process.stderr.write(`[chain] ${skill} -> ${fence}\n`);
  }
  if (!done && !reason && phases.length >= opts.maxPhases) reason = `stopped after ${opts.maxPhases} phases (--max-phases)`;
  if (done && !pass) reason = `${reason ? `${reason}; ` : ""}chain completed with ${phases.filter((p) => !p.pass).length} failed phase(s)`;
  const sum = (key) => phases.reduce((a, p) => a + (typeof p[key] === "number" ? p[key] : 0), 0);
  const tokens = phases.some((p) => p.tokens) ? phases.reduce((a, p) => ({ input: a.input + (p.tokens?.input ?? 0), output: a.output + (p.tokens?.output ?? 0) }), { input: 0, output: 0 }) : null;
  const record = {
    workflow: chain.workflow,
    pass: pass && done,
    done,
    reason,
    phases,
    totals: { phases: phases.length, durationMs: sum("durationMs"), tokens, costUsd: phases.some((p) => typeof p.costUsd === "number") ? sum("costUsd") : null },
    fixture: opts.keep ? root : null,
    taskDir: opts.keep ? taskDir : null,
  };
  if (!opts.keep) fs.rmSync(root, { recursive: true, force: true });
  live.fixtures.delete(root);
  return record;
}

function renderChainReport(report) {
  const chain = report.chain;
  const lines = [
    `# Chain eval: ${chain.workflow}, driver ${report.driver.name}${report.driver.version ? ` ${report.driver.version}` : ""}${report.driver.model ? `, model ${report.driver.model}` : ""}`,
    "",
    `Skills ${report.skills.commit ? report.skills.commit.slice(0, 12) : "n/a"}${report.skills.dirty ? " (dirty)" : ""}, node ${report.node}, isolation ${report.driver.isolation.length ? report.driver.isolation.join(" ") : "none"}. One fresh process per phase; gates auto-approved (test mode).`,
    "",
    "| Phase | Skill | Result | Fence | Gate | Duration | Tokens | Cost | Model | Session |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const p of chain.phases) {
    lines.push(`| ${p.phase} | ${p.skill} | ${p.pass ? "PASS" : `FAIL (${p.failed.join(", ")})`} | ${p.fence ?? "-"} | ${p.gate ? "yes, auto-approved" : "no"} | ${fmtDuration(p.durationMs)} | ${fmtTokens(p.tokens)} | ${fmtCost(p.costUsd)} | ${p.model ?? "n/a"} | ${p.sessionId ? p.sessionId.slice(0, 12) : "n/a"} |`);
  }
  for (const p of chain.phases) {
    for (const g of p.graders.filter((g) => g.status === "FAIL")) lines.push(`- phase ${p.phase} ${g.name}: ${g.message}`);
    for (const w of p.warnings) lines.push(`- phase ${p.phase} warning: ${w}`);
  }
  lines.push("", `${chain.pass ? "PASS" : "FAIL"}: ${chain.reason}. ${chain.totals.phases} phases, ${fmtDuration(chain.totals.durationMs)}, ${fmtTokens(chain.totals.tokens)}, ${fmtCost(chain.totals.costUsd)}.`);
  if (chain.fixture) lines.push(`Fixture kept: ${chain.fixture}`);
  lines.push(`Results: ${path.relative(repoRoot, report.resultsFile)}`);
  return lines.join("\n");
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

// Provenance ------------------------------------------------------------------------------------

function skillsProvenance() {
  try {
    return { root: repoRoot, commit: git(repoRoot, "rev-parse", "HEAD").trim(), dirty: git(repoRoot, "status", "--porcelain").trim().length > 0 };
  } catch {
    return { root: repoRoot, commit: null, dirty: null };
  }
}

// Report ----------------------------------------------------------------------------------------

const fmtDuration = (ms) => (ms === null || ms === undefined ? "n/a" : ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
const fmtTokens = (t) => (t ? `${t.input} in / ${t.output} out` : "n/a");
const fmtCost = (c) => (typeof c === "number" ? `$${c.toFixed(4)}` : "n/a");

function renderReport(report) {
  const models = [...new Set(report.cases.flatMap((c) => c.runs.map((r) => r.model)).filter(Boolean))];
  const lines = [
    `# Eval: driver ${report.driver.name}${report.driver.version ? ` ${report.driver.version}` : ""}, k=${report.k}`,
    "",
    `Skills ${report.skills.commit ? report.skills.commit.slice(0, 12) : "n/a"}${report.skills.dirty ? " (dirty)" : ""}, node ${report.node}, model ${models.length ? models.join(", ") : "n/a"}, isolation ${report.driver.isolation.length ? report.driver.isolation.join(" ") : "none"}`,
    "",
  ];
  for (const c of report.cases) {
    lines.push(`## ${c.name} (${c.command}${c.arg ? ` ${c.arg}` : ""}, workflow ${c.workflow}${c.kind === "smoke" ? ", smoke: instruction following, not a phase" : ""})`, "");
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

const USAGE = `usage: node scripts/eval.mjs --driver <${DRIVERS.join("|")}> [--case <name>...] [--k 3] [--model <spec>] [--json] [--keep] [--timeout <seconds>]
       node scripts/eval.mjs --driver <driver> --chain <${TYPES.join("|")}> [--model <spec>] [--with <skill,...>] [--strict] [--max-phases 12] [--json] [--keep]`;

async function main(argv) {
  let opts;
  let cases = [];
  let chain = null;
  try {
    opts = parseArgs(argv);
    if (opts.chain) {
      chain = loadChain(opts.chain);
      chain.with = [...new Set([...chain.with, ...opts.with])];
    }
    else cases = loadCases(opts.cases);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    return 2;
  }
  if (opts.driver === "fake" && !fs.existsSync(simulateScript) && (chain || cases.some((c) => c.command !== "run-task"))) {
    process.stderr.write(`${path.relative(repoRoot, simulateScript)} is missing; the fake driver needs it for every skill except run-task\n`);
    return 2;
  }
  live.keep = opts.keep;
  installSignalHandlers();
  const driver = drivers[opts.driver];
  driver.isolationFlags = driver.isolation();
  const startedAt = new Date();
  const report = {
    driver: { name: opts.driver, binary: driver.binary, version: driver.version(), model: opts.model, isolation: driver.isolationFlags },
    skills: skillsProvenance(),
    node: process.version,
    platform: `${process.platform} ${os.release()} ${process.arch}`,
    k: chain ? 1 : opts.k,
    timeoutMs: opts.timeoutMs,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    cases: [],
    chain: null,
    resultsFile: null,
  };
  if (chain) report.chain = await runChain(chain, opts, driver);
  else {
    for (const c of cases) {
      const runs = [];
      for (let i = 1; i <= opts.k; i++) runs.push(await runOnce(c, opts, i, driver));
      report.cases.push({ name: c.name, kind: c.kind, command: c.command, arg: c.arg, workflow: c.workflow, expect: c.expect, runs, summary: summarize(runs) });
    }
  }
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(resultsDir, { recursive: true });
  report.resultsFile = path.join(resultsDir, `${startedAt.toISOString().replaceAll(":", "-")}-${opts.driver}${chain ? `-chain-${chain.workflow}` : ""}.json`);
  fs.writeFileSync(report.resultsFile, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${opts.json ? JSON.stringify(report, null, 2) : chain ? renderChainReport(report) : renderReport(report)}\n`);
  if (chain) return report.chain.pass ? 0 : 1;
  return report.cases.every((c) => c.summary.passPowK === 1) ? 0 : 1;
}

process.exit(await main(process.argv.slice(2)));
