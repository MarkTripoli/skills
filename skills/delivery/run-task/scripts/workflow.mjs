#!/usr/bin/env node
// Deterministic state for the delivery workflow. Reads a task directory, decides the next command,
// validates replies and artifacts, renders the run-task status report. Node built-ins only, so an
// installed copy of the run-task skill carries it unchanged and a runtime plugin can import it.
//
// CLI:
//   node workflow.mjs next <task dir> [--json] [--herdr-kind <kind>] [--backend <b>]
//   node workflow.mjs status <task dir> [--herdr-kind <kind>] [--backend <b>]
//   node workflow.mjs check-reply <file> [--expect <skill>] [--json]
//   node workflow.mjs check-artifact <file> [--type <type>] [--json]
//   node workflow.mjs probe [<project root>] [--json]
//   node workflow.mjs create-task <project root> --workflow <type> "<request>"
// Exit 0 on success; 1 with one issue per line on validation failure or usage error.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TYPES = ["full", "lean", "prd", "oneshot"];

export const FRESH_SESSION_SENTENCE =
  "Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one.";

export const ONESHOT_PROMPT =
  "Complete the task in `task.md` end to end: implement, run the narrowest checks that prove it, commit with explicit paths, then reply per the conventions with `/describe-pr`.";

const RESEARCH_NEXT = { full: "/create-design-discussion", lean: "/create-structure-outline", prd: "/create-prd" };

function implementationNext(skill) {
  return ({ remaining, planFile }) => (remaining.length > 0 && planFile ? `/${skill} @${planFile}` : "/describe-pr");
}

function planNext(implementSkill) {
  return ({ probe, artifact }) =>
    probe.inWorktree || probe.disabled ? `/${implementSkill} @${artifact}` : `/setup-worktree @${artifact}`;
}

// Mirrors the phase table in workflows/delivery.md; scripts/validate.mjs checks the two agree.
// next(ctx) returns the command the phase's reply fence must name, or null when the loop ends.
export const PHASES = {
  "create-research-questions": { type: "research-questions", gate: false, interactive: false, next: () => "/create-research" },
  "iterate-research-questions": { type: "research-questions", gate: false, interactive: true, next: () => "/create-research" },
  "create-research": { type: "research", gate: false, interactive: false, next: ({ workflow }) => RESEARCH_NEXT[workflow] ?? null },
  "iterate-research": { type: "research", gate: false, interactive: true, next: ({ workflow }) => RESEARCH_NEXT[workflow] ?? null },
  "create-design-discussion": { type: "design-discussion", gate: true, interactive: false, next: ({ artifact }) => `/create-plan @${artifact}` },
  "iterate-design-discussion": { type: "design-discussion", gate: true, interactive: true, next: ({ artifact }) => `/create-plan @${artifact}` },
  "create-prd": { type: "design-prd", gate: true, interactive: true, next: ({ artifact }) => `/create-tdd @${artifact}` },
  "iterate-prd": { type: "design-prd", gate: true, interactive: true, next: ({ artifact }) => `/create-tdd @${artifact}` },
  "create-tdd": { type: "design-tdd", gate: true, interactive: true, next: ({ artifact }) => `/create-plan @${artifact}` },
  "iterate-tdd": { type: "design-tdd", gate: true, interactive: true, next: ({ artifact }) => `/create-plan @${artifact}` },
  "create-structure-outline": { type: "structure-outline", gate: true, interactive: false, next: planNext("implement-outline") },
  "iterate-structure-outline": { type: "structure-outline", gate: true, interactive: true, next: planNext("implement-outline") },
  "create-plan": { type: "plan", gate: true, interactive: false, next: planNext("implement-plan") },
  "iterate-plan": { type: "plan", gate: true, interactive: true, next: planNext("implement-plan") },
  "create-epic-plan": { type: "epic-plan", gate: true, interactive: false, next: ({ artifact }) => `/start-epic-delivery @${artifact}` },
  "start-epic-delivery": { type: "epic-delivery", gate: true, interactive: false, next: () => null },
  "configure-workspaces": { type: "workspace-config", gate: true, interactive: true, next: () => "/setup-worktree" },
  "setup-worktree": {
    type: "worktree-setup",
    gate: false,
    interactive: false,
    next: ({ workflow, planFile }) => `/${workflow === "lean" ? "implement-outline" : "implement-plan"}${planFile ? ` @${planFile}` : ""}`,
  },
  "implement-plan": { type: "implementation", gate: true, interactive: false, next: implementationNext("implement-plan") },
  "implement-outline": { type: "implementation", gate: true, interactive: false, next: implementationNext("implement-outline") },
  "iterate-implementation": {
    type: "implementation",
    gate: true,
    interactive: true,
    next: ({ workflow, remaining, planFile }) => implementationNext(workflow === "lean" ? "implement-outline" : "implement-plan")({ remaining, planFile }),
  },
  "review-code": {
    type: "code-review",
    gate: false,
    interactive: false,
    next: ({ status, artifact }) => (status === "clean" ? "/describe-pr" : status === "findings" ? `/fix-code-review @${artifact}` : null),
  },
  "fix-code-review": { type: "code-review-fixes", gate: false, interactive: false, next: () => "/review-code" },
  "describe-pr": { type: "pr-description", gate: true, interactive: false, next: () => "/resolve-pr-reviews" },
  "resolve-pr-reviews": { type: "pr-review", gate: true, interactive: false, next: ({ status }) => (status === "approved" ? null : "/resolve-pr-reviews") },
  "ci-commit": { type: "commit", gate: false, interactive: false, next: () => "/describe-pr" },
  "review-artifact-comments": { type: "comment-review", gate: false, interactive: true, next: () => "/iterate-implementation" },
  "show-me": { type: "show-me", gate: false, interactive: false, next: () => null },
};

// Newest-artifact recovery: artifact type -> the skill whose next() applies.
export function skillForArtifactType(type, workflow) {
  if (type === "implementation") return workflow === "lean" ? "implement-outline" : "implement-plan";
  for (const [skill, phase] of Object.entries(PHASES)) {
    if (phase.type === type && skill.startsWith("create-")) return skill;
  }
  for (const [skill, phase] of Object.entries(PHASES)) if (phase.type === type) return skill;
  return null;
}

export const START_COMMAND = { full: "/create-research-questions", lean: "/create-research-questions", prd: "/create-research" };

// Files and parsing -------------------------------------------------------------------------

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { data: {}, body: text, raw: null };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    data[m[1]] = value;
  }
  return { data, body: text.slice(match[0].length), raw: match[1] };
}

export function readTask(taskDir) {
  const file = path.join(taskDir, "task.md");
  if (!fs.existsSync(file)) throw new Error(`${file}: task.md not found`);
  const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  const workflow = data.workflow || "full";
  if (!TYPES.includes(workflow)) throw new Error(`${file}: workflow "${workflow}" is not one of ${TYPES.join(", ")}`);
  return { file, slug: data.slug || path.basename(taskDir), title: data.title || "", workflow, created: data.created || "", body: body.trim() };
}

const ARTIFACT_NAME = /^(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*?)-(.+)\.md$/;

// Artifact type is frontmatter `type`; receipts without frontmatter use the name segment before the slug.
// describe-pr writes an unnumbered `pr-description.md`; it sorts after every numbered artifact except pr-review.
export function listArtifacts(taskDir, slug) {
  if (!fs.existsSync(taskDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(taskDir)) {
    const m = ARTIFACT_NAME.exec(name);
    if (!m) continue;
    const file = path.join(taskDir, name);
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, "utf8");
    const { data } = parseFrontmatter(text);
    let type = data.type;
    if (!type) {
      // Name segment between NN- and the slug: strip the slug suffix when known, else take the longest known type.
      const rest = name.slice(3, -3);
      type = slug && rest.endsWith(`-${slug}`) ? rest.slice(0, -(slug.length + 1)) : null;
      if (!type) {
        const known = Object.values(PHASES).map((p) => p.type).sort((a, b) => b.length - a.length);
        type = known.find((t) => rest.startsWith(`${t}-`)) ?? m[2];
      }
    }
    out.push({ file, name, nn: Number(m[1]), type, summary: data.summary ?? "", status: data.status ?? "", data, text });
  }
  out.sort((a, b) => a.nn - b.nn || a.name.localeCompare(b.name));
  const prFile = path.join(taskDir, "pr-description.md");
  if (fs.existsSync(prFile) && fs.statSync(prFile).isFile()) {
    const text = fs.readFileSync(prFile, "utf8");
    const { data } = parseFrontmatter(text);
    const pseudo = { file: prFile, name: "pr-description.md", nn: null, type: "pr-description", summary: data.summary ?? "", status: data.status ?? "", data, text };
    const firstReview = out.findIndex((a) => a.type === "pr-review");
    if (firstReview === -1) out.push(pseudo);
    else out.splice(firstReview, 0, pseudo);
  }
  return out;
}

export function nextArtifactNumber(taskDir, slug) {
  const numbers = listArtifacts(taskDir, slug).map((a) => a.nn).filter((nn) => nn !== null);
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

const REPLY_NAME = /^(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export function listReplies(taskDir) {
  const dir = path.join(taskDir, "replies");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const m = REPLY_NAME.exec(name);
    if (!m) continue;
    const file = path.join(dir, name);
    out.push({ file, name, nn: Number(m[1]), skill: m[2], text: fs.readFileSync(file, "utf8") });
  }
  return out.sort((a, b) => a.nn - b.nn || a.name.localeCompare(b.name));
}

export function nextReplyNumber(taskDir) {
  return listReplies(taskDir).length + 1;
}

export function replyPath(taskDir, nn, skill) {
  return path.join(taskDir, "replies", `${String(nn).padStart(2, "0")}-${skill}.md`);
}

export function fences(text) {
  const out = [];
  const re = /^(`{3,})([^\n`]*)\n([\s\S]*?)\n\1[ \t]*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ lang: m[2].trim(), body: m[3], start: m.index, end: m.index + m[0].length });
  return out;
}

const COMMAND_LINE = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?: @(\S+))?$/;

export function parseCommand(line) {
  const m = COMMAND_LINE.exec(line.trim());
  return m ? { command: line.trim(), skill: m[1], arg: m[2] ?? null } : null;
}

export function parseReply(text) {
  const blocks = fences(text);
  const last = blocks.at(-1) ?? null;
  const command = last && last.lang.toLowerCase() === "text" ? parseCommand(last.body.trim()) : null;
  return {
    fences: blocks,
    fence: last,
    command: command?.command ?? null,
    skill: command?.skill ?? null,
    arg: command?.arg ?? null,
    trailing: last ? text.slice(last.end).trim() : "",
    freshSentences: text.split(FRESH_SESSION_SENTENCE).length - 1,
  };
}

// Validation ---------------------------------------------------------------------------------

export function validateReply(text, { expectSkill = null, knownSkills = null } = {}) {
  const issues = [];
  const parsed = parseReply(text);
  if (!parsed.fence) return ["no fenced block; the reply must end with one ```text fence holding the next command"];
  if (parsed.fence.lang.toLowerCase() !== "text") issues.push(`final fence is "${parsed.fence.lang}", expected "text"`);
  const lines = parsed.fence.body.trim().split("\n");
  if (lines.length !== 1) issues.push(`final fence holds ${lines.length} lines, expected exactly one command`);
  if (!parsed.command) issues.push(`final fence "${parsed.fence.body.trim()}" is not /<skill>[ @<file>]`);
  if (parsed.trailing) issues.push(`text follows the command fence: "${parsed.trailing.slice(0, 60)}"`);
  if (parsed.skill && knownSkills && !knownSkills.has(parsed.skill)) issues.push(`fence names unknown skill "${parsed.skill}"`);
  if (expectSkill && parsed.skill !== expectSkill) issues.push(`fence names "/${parsed.skill}", expected "/${expectSkill}"`);
  const terminal = parsed.skill === "show-me";
  if (terminal && parsed.freshSentences !== 0) issues.push("terminal reply must not carry the fresh-session sentence");
  if (!terminal && parsed.freshSentences !== 1) issues.push(`fresh-session sentence appears ${parsed.freshSentences} times, expected once`);
  if (!terminal && parsed.freshSentences === 1 && text.indexOf(FRESH_SESSION_SENTENCE) > parsed.fence.start) issues.push("fresh-session sentence must come before the fence");
  const placeholders = [...text.matchAll(/\{[a-z_]+\}/g)].map((m) => m[0]);
  if (placeholders.length) issues.push(`unfilled placeholders: ${[...new Set(placeholders)].join(", ")}`);
  if (/<!--\s*\/?workflow-variants\s*-->/.test(text)) issues.push("workflow-variant markers were not pruned");
  return issues;
}

const HUMAN_REVIEW_HEADINGS = ["## Human Review", "### Review targets", "### Verify", "### Known limits"];

// `pr-description.md` is published verbatim as the pull request body, so it carries no frontmatter.
export function validateArtifact(text, { type = null, gate = null } = {}) {
  const issues = [];
  const { data, raw } = parseFrontmatter(text);
  if (type === "pr-description" && raw === null) {
    if (!/^## Purpose\b/m.test(text)) issues.push("pull request description lacks its `## Purpose` section");
    if (/\{[A-Z][A-Z_]+\}/.test(text)) issues.push("pull request description still holds template placeholders");
    return issues;
  }
  if (raw === null) return ["missing frontmatter"];
  if (!data.type) issues.push("frontmatter lacks `type`");
  if (type && data.type !== type) issues.push(`frontmatter type is "${data.type}", expected "${type}"`);
  if (!data.summary) issues.push("frontmatter lacks `summary`");
  else if (/^\[/.test(data.summary)) issues.push("summary still holds the template placeholder");
  for (const [key, value] of Object.entries(data)) {
    if (key !== "summary" && /^\[[^\],]*\s[^\],]*\]$/.test(value)) issues.push(`frontmatter ${key} still holds the template placeholder ${value}`);
  }
  if (data.task === "eng-xxxx-description") issues.push("frontmatter task still holds the template id");
  const expectGate = gate ?? (data.type ? Object.values(PHASES).some((p) => p.type === data.type && p.gate) : false);
  if (expectGate && data.type !== "worktree-setup" && data.type !== "workspace-config") {
    for (const heading of HUMAN_REVIEW_HEADINGS) {
      const count = text.split(`\n${heading}\n`).length - 1;
      if (count !== 1) issues.push(`expected exactly one "${heading}" heading, found ${count}`);
    }
  }
  if (data.type === "implementation" && !/^[1-9]\d*$/.test(data.completed_phase ?? "")) issues.push("implementation artifact needs `completed_phase: <positive integer>`");
  return issues;
}

// Plans and outlines --------------------------------------------------------------------------

// Plans use `## Phase N` sections, structure outlines `## Step N`; both count as phases here.
const PHASE_HEADING = /^## (?:Phase|Step) (\d+)\b/;

// Phase numbers whose sections still hold an unchecked box. Boxes outside any phase section (such as an
// outline's `## Phase Checklist`) and inside `## Human Review` are ignored. Without phase headings the
// whole body outside `## Human Review` counts as phase 1.
export function remainingPhases(text) {
  const { body } = parseFrontmatter(text);
  const lines = body.split(/\r?\n/);
  const remaining = new Set();
  let phase = null;
  let inHumanReview = false;
  const sawPhase = lines.some((line) => PHASE_HEADING.test(line));
  for (const line of lines) {
    const h = PHASE_HEADING.exec(line);
    if (h) {
      phase = Number(h[1]);
      inHumanReview = false;
      continue;
    }
    if (/^## Human Review\b/.test(line)) {
      inHumanReview = true;
      phase = null;
      continue;
    }
    if (/^## /.test(line)) {
      phase = null;
      inHumanReview = false;
      continue;
    }
    if (inHumanReview) continue;
    if (/^\s*- \[ \]/.test(line)) {
      if (!sawPhase) remaining.add(1);
      else if (phase !== null) remaining.add(phase);
    }
  }
  return [...remaining].sort((a, b) => a - b);
}

// Ticks every unchecked box inside phase section n and the section's entry in a top-level checklist
// (`- [ ] Step n:` or `- [ ] Phase n:` outside any phase section), as the implementation skills do after
// the phase commit. Without phase headings the whole body outside `## Human Review` is phase 1.
export function completePhase(text, n) {
  const lines = text.split(/\r?\n/);
  const hasPhases = lines.some((line) => PHASE_HEADING.test(line));
  const checklistEntry = new RegExp(`^(\\s*- )\\[ \\](\\s+(?:Step|Phase) ${n}\\b)`);
  let inPhase = !hasPhases && n === 1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      const h = PHASE_HEADING.exec(lines[i]);
      inPhase = hasPhases ? h !== null && Number(h[1]) === n : n === 1 && !/^## Human Review\b/.test(lines[i]);
    } else if (inPhase) lines[i] = lines[i].replace(/^(\s*- )\[ \]/, "$1[x]");
    else if (hasPhases) lines[i] = lines[i].replace(checklistEntry, "$1[x]$2");
  }
  return lines.join("\n");
}

// Worktree probe -----------------------------------------------------------------------------

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function worktreeProbe(projectRoot) {
  let gitDir = null;
  try {
    gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    gitDir = null;
  }
  const base = readJson(path.join(projectRoot, ".agents", "workspace.json"));
  const local = readJson(path.join(projectRoot, ".agents", "workspace.local.json"));
  const disabled = (local && "disabled" in local ? local.disabled : base?.disabled) === true;
  const inWorktree = gitDir !== null && gitDir.replaceAll("\\", "/").includes("/worktrees/");
  return { gitDir, inWorktree, disabled, configPresent: base !== null || local !== null };
}

// Next command -------------------------------------------------------------------------------

export function projectRootOf(taskDir) {
  const abs = path.resolve(taskDir);
  const marker = `${path.sep}.agents${path.sep}tasks${path.sep}`;
  const idx = abs.lastIndexOf(marker);
  return idx === -1 ? path.dirname(path.dirname(path.dirname(abs))) : abs.slice(0, idx);
}

function phaseContext(skill, task, artifacts, taskDir, projectRoot) {
  const phase = PHASES[skill];
  const own = [...artifacts].reverse().find((a) => a.type === phase.type) ?? null;
  const planType = task.workflow === "lean" ? "structure-outline" : "plan";
  const plan = [...artifacts].reverse().find((a) => a.type === planType) ?? null;
  return {
    workflow: task.workflow,
    artifact: own?.name ?? null,
    status: own?.status ?? "",
    planFile: plan?.name ?? null,
    remaining: plan ? remainingPhases(plan.text) : [],
    probe: worktreeProbe(projectRoot),
    taskDir,
  };
}

// The command a phase's reply must name once its artifact is on disk, from the table alone. Used by the
// simulator and the eval harness to check a reply against the table rather than trusting the reply.
export function predictNext(skill, taskDir, { projectRoot = projectRootOf(taskDir) } = {}) {
  const phase = PHASES[skill];
  if (!phase) return null;
  const task = readTask(taskDir);
  return phase.next(phaseContext(skill, task, listArtifacts(taskDir, task.slug), taskDir, projectRoot));
}

// Returns { command, skill, arg, inline, source, pendingGate, gateArtifact, interactive, done, reason, lastSkill }.
export function nextCommand(taskDir, { projectRoot = projectRootOf(taskDir) } = {}) {
  const task = readTask(taskDir);
  const artifacts = listArtifacts(taskDir, task.slug);
  const replies = listReplies(taskDir);
  const base = { task, artifacts, replies, lastSkill: null, pendingGate: false, gateArtifact: null, inline: false, done: false, reason: "", arg: null };

  const finish = (command, extra) => {
    const parsed = command ? parseCommand(command) : null;
    const skill = parsed?.skill ?? extra.skill ?? null;
    return {
      ...base,
      ...extra,
      command,
      skill,
      arg: parsed?.arg ?? null,
      interactive: skill ? (PHASES[skill]?.interactive ?? false) : false,
    };
  };

  if (replies.length > 0) {
    const last = replies.at(-1);
    const parsed = parseReply(last.text);
    const lastPhase = PHASES[last.skill];
    const own = lastPhase ? [...artifacts].reverse().find((a) => a.type === lastPhase.type) : null;
    const gateInfo = { lastSkill: last.skill, pendingGate: lastPhase?.gate ?? false, gateArtifact: lastPhase?.gate ? own?.name ?? null : null };
    if (!parsed.command) return finish(null, { ...gateInfo, done: true, reason: `reply ${last.name} has no command fence`, source: "reply" });
    if (last.skill === "start-epic-delivery") return finish(null, { ...gateInfo, done: true, reason: "epic children run as their own tasks with /run-task @<child dir>", source: "reply" });
    if (parsed.skill === "resolve-pr-reviews") return finish(null, { ...gateInfo, done: true, reason: "pull request review is external; run /resolve-pr-reviews when reviewers respond", source: "reply" });
    if (parsed.skill === "show-me") return finish(null, { ...gateInfo, done: true, reason: `reply ${last.name} ends the chain`, source: "reply" });
    return finish(parsed.command, { ...gateInfo, source: "reply" });
  }

  if (artifacts.length === 0) {
    if (task.workflow === "oneshot") return finish(ONESHOT_PROMPT, { skill: "oneshot", inline: true, source: "start", reason: "oneshot runs one inline prompt" });
    return finish(START_COMMAND[task.workflow], { source: "start" });
  }

  const newest = artifacts.at(-1);
  const skill = skillForArtifactType(newest.type, task.workflow);
  if (!skill) return finish(null, { done: true, reason: `artifact ${newest.name} has unknown type "${newest.type}"`, source: "artifact" });
  const phase = PHASES[skill];
  const command = phase.next(phaseContext(skill, task, artifacts, taskDir, projectRoot));
  const gateInfo = { lastSkill: skill, pendingGate: phase.gate, gateArtifact: phase.gate ? newest.name : null, source: "artifact" };
  if (!command) return finish(null, { ...gateInfo, done: true, reason: `after ${newest.name} nothing runs automatically` });
  if (parseCommand(command)?.skill === "resolve-pr-reviews") return finish(null, { ...gateInfo, done: true, reason: "pull request review is external; run /resolve-pr-reviews when reviewers respond" });
  return finish(command, gateInfo);
}

// Backend and status -------------------------------------------------------------------------

function onPath(binary, env) {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return dirs.some((dir) => {
    try {
      fs.accessSync(path.join(dir, binary), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function chooseBackend({ env = process.env, herdrKind = null, interactive = false, forced = null, subagentAvailable = true } = {}) {
  if (forced) return { backend: forced, reason: `forced by --backend ${forced}` };
  const herdr = env.HERDR_ENV === "1" && onPath("herdr", env);
  if (herdr && herdrKind) return { backend: "herdr", reason: `HERDR_ENV=1, herdr on PATH, agent kind ${herdrKind}` };
  const whyNotHerdr = !herdr ? "no Herdr" : "Herdr present but the installed skill names no agent kind";
  if (interactive) return { backend: "inline", reason: `interactive phase and ${whyNotHerdr}; runs in this session` };
  if (subagentAvailable) return { backend: "subagent", reason: whyNotHerdr };
  return { backend: "manual", reason: `${whyNotHerdr} and no subagent tool` };
}

export function statusReport(taskDir, { env = process.env, herdrKind = null, forced = null, projectRoot = projectRootOf(taskDir) } = {}) {
  const next = nextCommand(taskDir, { projectRoot });
  const { task, artifacts, replies } = next;
  const artifactList = artifacts.length ? artifacts.map((a) => (a.nn === null ? a.type : `${String(a.nn).padStart(2, "0")}-${a.type}`)).join(", ") : "none";
  const lastReply = replies.at(-1);
  const repliesLine = `${replies.length}${lastReply ? ` (last: ${lastReply.name.replace(/\.md$/, "")})` : " (last: none)"}`;
  let nextLine;
  if (next.done) nextLine = `Next: none; loop ends: ${next.reason}`;
  else {
    const shown = next.inline ? "inline oneshot prompt" : next.command;
    const gate = next.pendingGate ? `human gate: review ${next.gateArtifact ?? "the newest artifact"} before continuing` : "runs without a gate";
    nextLine = `Next: ${shown}; ${gate}`;
  }
  const backend = next.done ? null : chooseBackend({ env, herdrKind, interactive: next.interactive, forced });
  const lines = [
    `Task: ${task.slug} (${task.workflow}) at ${path.resolve(taskDir)}`,
    `Artifacts: ${artifactList}`,
    `Replies: ${repliesLine}`,
    nextLine,
    backend ? `Backend: ${backend.backend} (${backend.reason})` : "Backend: none",
    `Context: run the next command in a new session or with /run-task @${path.resolve(taskDir)}; do not continue in a session that already ran a phase.`,
  ];
  return lines.join("\n");
}

// Task creation ------------------------------------------------------------------------------

export function slugify(text, max = 4) {
  const stop = new Set(["a", "an", "the", "to", "of", "for", "in", "on", "and", "or", "with", "that", "this", "add", "make", "create", "please"]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !stop.has(w));
  const picked = (words.length >= 2 ? words : text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean)).slice(0, max);
  return picked.join("-") || "task";
}

export function createTask(projectRoot, { request, workflow = "full", slug = slugify(request), title = request.split(/\r?\n/)[0].slice(0, 120), created = new Date().toISOString().slice(0, 10) }) {
  if (!TYPES.includes(workflow)) throw new Error(`workflow "${workflow}" is not one of ${TYPES.join(", ")}`);
  const taskDir = path.join(projectRoot, ".agents", "tasks", slug);
  if (fs.existsSync(path.join(taskDir, "task.md"))) throw new Error(`${taskDir}/task.md already exists`);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "task.md"), `---\nslug: ${slug}\ntitle: ${title}\nworkflow: ${workflow}\ncreated: ${created}\n---\n${request.trim()}\n`);
  const gitignore = path.join(projectRoot, ".gitignore");
  let gitignoreUpdated = false;
  if (fs.existsSync(gitignore)) {
    const text = fs.readFileSync(gitignore, "utf8");
    if (!text.split(/\r?\n/).some((line) => line.trim() === ".agents/tasks/" || line.trim() === ".agents/tasks")) {
      fs.writeFileSync(gitignore, `${text.endsWith("\n") || text === "" ? text : `${text}\n`}.agents/tasks/\n`);
      gitignoreUpdated = true;
    }
  }
  return { taskDir, slug, gitignoreUpdated };
}

// CLI ----------------------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [cmd, target] = positional;
  const json = flags.json === true;
  const out = (value) => process.stdout.write(`${json ? JSON.stringify(value, null, 2) : value}\n`);
  try {
    switch (cmd) {
      case "next": {
        if (!target) throw new Error("usage: next <task dir>");
        const next = nextCommand(target);
        const { task, artifacts, replies, ...rest } = next;
        if (json) out({ ...rest, workflow: task.workflow, slug: task.slug, artifacts: artifacts.map((a) => a.name), replies: replies.map((r) => r.name) });
        else out(next.done ? `done: ${next.reason}` : `${next.command}${next.pendingGate ? `\ngate: review ${next.gateArtifact ?? "the newest artifact"} before continuing` : ""}`);
        return 0;
      }
      case "status": {
        if (!target) throw new Error("usage: status <task dir>");
        out(statusReport(target, { herdrKind: typeof flags["herdr-kind"] === "string" ? flags["herdr-kind"] : null, forced: typeof flags.backend === "string" ? flags.backend : null }));
        return 0;
      }
      case "check-reply": {
        if (!target) throw new Error("usage: check-reply <file>");
        const issues = validateReply(fs.readFileSync(target, "utf8"), { expectSkill: typeof flags.expect === "string" ? flags.expect : null });
        out(json ? { file: target, issues } : issues.length ? issues.map((i) => `${target}: ${i}`).join("\n") : `ok: ${target}`);
        return issues.length ? 1 : 0;
      }
      case "check-artifact": {
        if (!target) throw new Error("usage: check-artifact <file>");
        const issues = validateArtifact(fs.readFileSync(target, "utf8"), { type: typeof flags.type === "string" ? flags.type : null });
        out(json ? { file: target, issues } : issues.length ? issues.map((i) => `${target}: ${i}`).join("\n") : `ok: ${target}`);
        return issues.length ? 1 : 0;
      }
      case "probe": {
        const probe = worktreeProbe(target ?? process.cwd());
        out(json ? probe : `inWorktree=${probe.inWorktree} disabled=${probe.disabled} configPresent=${probe.configPresent}`);
        return 0;
      }
      case "create-task": {
        const request = positional[2];
        if (!target || !request) throw new Error('usage: create-task <project root> --workflow <type> "<request>"');
        const result = createTask(target, { request, workflow: typeof flags.workflow === "string" ? flags.workflow : "full" });
        out(json ? result : `${result.taskDir}${result.gitignoreUpdated ? "\n.gitignore: added .agents/tasks/" : ""}`);
        return 0;
      }
      default:
        throw new Error("usage: workflow.mjs <next|status|check-reply|check-artifact|probe|create-task> ...");
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
