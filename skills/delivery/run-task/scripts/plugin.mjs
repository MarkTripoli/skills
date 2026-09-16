// The runtime-neutral half of a run-task plugin. A runtime extension (Oh My Pi, Pi) supplies sessions,
// dialogs, and events; this module supplies the rest: argument parsing, skill lookup, phase planning, the
// reply check, the per-phase context log, the gate dialog, and the on-disk run state a runtime that
// re-creates extensions per session needs. Node built-ins only; imports ./workflow.mjs beside it, so an
// extension that finds the installed run-task skill has both.

import fs from "node:fs";
import path from "node:path";
import * as wf from "./workflow.mjs";

export { wf as workflow };

export const LOG_NAME = "phases.jsonl";
export const RUN_NAME = "run.json";

// Skills -------------------------------------------------------------------------------------

// <root>/<name>/SKILL.md or, one level down, <root>/<group>/<name>/SKILL.md.
export function findSkillDir(root, name) {
  const direct = path.join(root, name);
  if (fs.existsSync(path.join(direct, "SKILL.md"))) return direct;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(root, entry.name, name);
    if (fs.existsSync(path.join(nested, "SKILL.md"))) return nested;
  }
  return null;
}

// The first candidate root holding the run-task skill with its scripts, or null.
export function resolveSkills(candidates) {
  for (const root of candidates) {
    const runTaskDir = findSkillDir(root, "run-task");
    if (runTaskDir && fs.existsSync(path.join(runTaskDir, "scripts", "plugin.mjs"))) return { root, runTaskDir };
  }
  return null;
}

// Arguments ----------------------------------------------------------------------------------

export const FLAGS = ["--step", "--status", "--with <skill,...>", "--model <spec>", "--workflow <type>"];

// `/run-task` argument forms: `@<task dir>`, free text (a new task), `stop`, and the flags in FLAGS. Other
// `--tokens` belong to the request (a task may well mention a CLI flag). `extraFlags` names boolean flags a
// runtime adds (collected in `flags`). The workflow type comes from `--workflow` or from a bare type name in
// the text, else `full`.
export function parseArgs(text, { extraFlags = [] } = {}) {
  const types = wf.TYPES;
  const out = { action: "run", taskDir: null, request: null, workflow: null, step: false, with: [], model: null, flags: new Set(), errors: [] };
  const words = [];
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--step") out.step = true;
    else if (token === "--status") out.action = "status";
    else if (extraFlags.includes(token)) out.flags.add(token);
    else if (token === "--with" || token === "--model" || token === "--workflow") {
      const value = tokens[++i];
      if (!value || value.startsWith("--")) out.errors.push(`${token} needs a value`);
      else if (token === "--with") out.with.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
      else if (token === "--model") out.model = value;
      else out.workflow = value;
    } else if (token.startsWith("@") && token.length > 1 && !out.taskDir) out.taskDir = token.slice(1);
    else words.push(token);
  }
  if (words.length === 1 && words[0] === "stop" && !out.taskDir) out.action = "stop";
  else if (words.length) out.request = words.join(" ");
  if (out.taskDir && out.request) out.errors.push("give either @<task dir> or a request, not both");
  if (out.workflow && !types.includes(out.workflow)) out.errors.push(`workflow "${out.workflow}" is not one of ${types.join(", ")}`);
  if (!out.workflow && out.request) out.workflow = workflowNamedIn(out.request);
  return out;
}

export function workflowNamedIn(text) {
  return wf.TYPES.find((t) => new RegExp(`\\b${t}\\b`, "i").test(text)) ?? "full";
}

// Task directories -----------------------------------------------------------------------------

// `@<dir>` relative to the project, or a bare slug under .agents/tasks/.
export function resolveTaskDir(cwd, given) {
  const direct = path.resolve(cwd, given);
  if (fs.existsSync(path.join(direct, "task.md"))) return direct;
  const bySlug = path.join(cwd, ".agents", "tasks", given);
  if (fs.existsSync(path.join(bySlug, "task.md"))) return bySlug;
  return null;
}

export function listTaskDirs(cwd) {
  const root = path.join(cwd, ".agents", "tasks");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, "task.md")))
    .map((e) => path.join(root, e.name))
    .sort();
}

export function relative(cwd, file) {
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith("..") ? rel : file;
}

// Asks for a task when the command had no argument: the tasks under .agents/tasks/, or a new one.
export async function pickTask(ui, cwd) {
  const dirs = listTaskDirs(cwd);
  const NEW = "New task (describe it)";
  if (dirs.length) {
    const labels = dirs.map((dir) => {
      try {
        const next = wf.nextCommand(dir);
        const where = next.done ? `done: ${next.reason}` : `${next.inline ? "oneshot" : next.command}${next.pendingGate ? " (gate)" : ""}`;
        return { label: `${next.task.slug} (${next.task.workflow})`, description: where, dir };
      } catch (error) {
        return { label: path.basename(dir), description: error.message, dir };
      }
    });
    const picked = await ui.select("run-task: which task?", [...labels.map(({ label, description }) => ({ label, description })), NEW]);
    if (picked === undefined) return null;
    const hit = labels.find((l) => l.label === picked);
    if (hit) return hit.dir;
    if (picked !== NEW) return null;
  }
  const request = await ui.input("run-task: describe the task", "Add a --verbose flag to the CLI (lean)");
  if (!request?.trim()) return null;
  const created = wf.createTask(cwd, { request: request.trim(), workflow: workflowNamedIn(request) });
  ui.notify(`run-task: created ${relative(cwd, created.taskDir)}/task.md (${wf.readTask(created.taskDir).workflow})`, "info");
  return created.taskDir;
}

// Phase log -----------------------------------------------------------------------------------

export function logPath(taskDir) {
  return path.join(taskDir, "replies", LOG_NAME);
}

export function appendPhaseLog(taskDir, record) {
  fs.mkdirSync(path.dirname(logPath(taskDir)), { recursive: true });
  fs.appendFileSync(logPath(taskDir), `${JSON.stringify(record)}\n`);
}

export function readPhaseLog(taskDir) {
  const file = logPath(taskDir);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// One line per completed phase: what ran, how long, on which model, how much of the context window the
// phase's session used, who wrote the reply file, and which session file holds the transcript.
export function recordPhase(taskDir, phase, { usage = null, model = null, sessionFile = null, source }) {
  appendPhaseLog(taskDir, {
    nn: phase.nn,
    skill: phase.skill,
    command: phase.command,
    startedAt: new Date(phase.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - phase.startedAt,
    model,
    contextTokens: usage?.tokens ?? null,
    contextWindow: usage?.contextWindow ?? null,
    contextPercent: usage?.percent ?? null,
    replyWrittenBy: source,
    sessionFile,
  });
}

// Run state ------------------------------------------------------------------------------------

// A run is one `/run-task` invocation driving a task: its options, the phase in progress, and what the gate
// dialog decided. Runtimes that keep one extension instance for the whole run can hold this in memory;
// runtimes that re-create the extension per session persist it here.
export function newRun(taskDir, { step = false, with: withPhases = [], model = null } = {}) {
  const task = wf.readTask(taskDir);
  return { taskDir, slug: task.slug, workflow: task.workflow, step, with: withPhases, model, override: null, feedback: null, active: true, phase: null };
}

export function runPath(taskDir) {
  return path.join(taskDir, "replies", RUN_NAME);
}

export function readRun(taskDir) {
  const file = runPath(taskDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeRun(run) {
  fs.mkdirSync(path.dirname(runPath(run.taskDir)), { recursive: true });
  fs.writeFileSync(runPath(run.taskDir), `${JSON.stringify(run, null, 2)}\n`);
}

// The active run among the project's tasks, or null.
export function findActiveRun(cwd) {
  for (const dir of listTaskDirs(cwd)) {
    const run = readRun(dir);
    if (run?.active) return run;
  }
  return null;
}

// Phases ----------------------------------------------------------------------------------------

// Decides the next phase of a run: a gate decision recorded in `run.override` wins, else the workflow's next
// command. Returns { kind: "done", reason }, { kind: "error", message }, or the phase to start with its prompt.
// Consumes `run.override` and `run.feedback`.
export function planPhase(run, skillsRoot) {
  let next;
  if (run.override) {
    const parsed = wf.parseCommand(run.override.command);
    if (!parsed) return { kind: "error", message: `override "${run.override.command}" is not /<skill>[ @<file>]` };
    next = { command: run.override.command, skill: parsed.skill, arg: parsed.arg, inline: false, interactive: wf.PHASES[parsed.skill]?.interactive ?? false };
    run.feedback = run.override.feedback ?? null;
    run.override = null;
  } else {
    next = wf.nextCommand(run.taskDir, { with: run.with });
    if (next.done) return { kind: "done", reason: next.reason };
  }
  const nn = wf.nextReplyNumber(run.taskDir);
  const skill = next.inline ? "oneshot" : next.skill;
  const replyFile = wf.replyPath(run.taskDir, nn, skill);
  let skillPath = null;
  if (!next.inline) {
    const dir = findSkillDir(skillsRoot, skill);
    if (!dir) return { kind: "error", message: `no skill "${skill}" under ${skillsRoot}` };
    skillPath = path.join(dir, "SKILL.md");
  }
  const prompt = wf.phasePrompt({ command: next.command, skillPath, taskDir: run.taskDir, replyFile, feedback: run.feedback });
  run.feedback = null;
  fs.mkdirSync(path.dirname(replyFile), { recursive: true });
  return { kind: "phase", nn, skill, command: next.command, replyFile, prompt, interactive: next.interactive, label: `${String(nn).padStart(2, "0")} ${skill}`, startedAt: Date.now() };
}

// Lines for the runtime's widget while a phase runs.
export function phaseWidget(run, phase, cwd) {
  return [
    `run-task ${run.slug} (${run.workflow}): phase ${phase.label}${phase.interactive ? ", interactive: answer its questions here" : ""}`,
    `Reply file ${relative(cwd, phase.replyFile)} ends the phase; /run-task stop cancels.`,
  ];
}

// Text of the newest assistant message on the current branch, or null.
export function lastAssistantText(sessionManager) {
  let branch;
  try {
    branch = sessionManager.getBranch();
  } catch {
    return null;
  }
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry?.type !== "message" || entry.message?.role !== "assistant") continue;
    const content = entry.message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const text = content
        .filter((block) => block?.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n");
      if (text.trim()) return text;
    }
  }
  return null;
}

// Whether the phase has produced its reply: the file exists, or (the session having stopped) its last
// assistant message is a valid reply, which is then written to the file as the run-task skill does for a
// subagent. `sessionManager` may be null when the session is gone. Returns { status: "reply", text, source }
// or { status: "none" }.
export function replyOutcome(replyFile, sessionManager) {
  if (fs.existsSync(replyFile)) {
    const text = fs.readFileSync(replyFile, "utf8");
    if (text.trim()) return { status: "reply", text, source: "phase" };
  }
  const text = sessionManager ? lastAssistantText(sessionManager) : null;
  if (text && wf.parseReply(text).command) {
    fs.mkdirSync(path.dirname(replyFile), { recursive: true });
    fs.writeFileSync(replyFile, text.endsWith("\n") ? text : `${text}\n`);
    return { status: "reply", text, source: "run-task" };
  }
  return { status: "none" };
}

// Validation issues of a reply, shortened for a notification.
export function replyIssues(text) {
  return wf.validateReply(text).map((issue) => issue.replace(/\s+/g, " ").slice(0, 160));
}

// What follows a completed phase: the workflow's next step, whether the phase was a gate, and where a
// change request goes. Implementation changes go through the plan or outline; other gates revise the artifact.
export function afterPhase(run, skill) {
  const after = wf.nextCommand(run.taskDir, { with: run.with });
  const gate = wf.PHASES[skill]?.gate ?? false;
  const iterate = wf.iterateSkillFor(skill);
  const planType = run.workflow === "lean" ? "structure-outline" : "plan";
  const target = iterate === "iterate-implementation" ? ([...after.artifacts].reverse().find((a) => a.type === planType)?.name ?? after.gateArtifact) : after.gateArtifact;
  return { after, gate, iterate, target, stops: !after.done && (gate || run.step) };
}

// Human gate (or --step stop). Returns { kind: "continue" | "stop" | "changes" | "command", command?, feedback? }.
export async function gateDialog(ui, skillsRoot, run, phase, { after, gate, iterate, target }) {
  const artifact = after.gateArtifact;
  const nextCommand = after.inline ? "the oneshot prompt" : after.command;
  const changes = iterate && target ? `Request changes: /${iterate} @${target}` : null;
  const approve = gate ? `Approve: run ${nextCommand}` : `Continue: run ${nextCommand}`;
  const other = "Run another command instead";
  const stop = "Stop here";
  const title = gate ? `Gate after ${phase.label}: review ${artifact ?? "the newest artifact"} in ${path.basename(run.taskDir)}` : `Phase ${phase.label} done (--step)`;
  for (;;) {
    const choice = await ui.select(title, [approve, ...(changes ? [changes] : []), other, stop]);
    if (choice === undefined || choice === stop) return { kind: "stop" };
    if (choice === approve) return { kind: "continue" };
    if (choice === changes) {
      const feedback = await ui.input(`What should change in ${artifact ?? target}?`, "The plan skips the migration step");
      if (!feedback?.trim()) continue;
      return { kind: "changes", command: `/${iterate} @${target}`, feedback: feedback.trim() };
    }
    const typed = await ui.input("Command to run as the next phase", "/review-code");
    if (!typed?.trim()) continue;
    const parsed = wf.parseCommand(typed);
    if (!parsed) {
      ui.notify(`run-task: "${typed.trim()}" is not /<skill>[ @<file>]`, "error");
      continue;
    }
    if (!findSkillDir(skillsRoot, parsed.skill)) {
      ui.notify(`run-task: no skill "${parsed.skill}" under ${skillsRoot}`, "error");
      continue;
    }
    return { kind: "command", command: parsed.command };
  }
}

export function stopMessage(run, after, phase, cwd) {
  return `stopped after ${phase.label}. Review ${after.gateArtifact ?? "the newest artifact"}, then run /run-task @${relative(cwd, run.taskDir)} to continue; running it records approval.`;
}

// Status ----------------------------------------------------------------------------------------

// The run-task status report with the plugin named as the backend.
export function statusReport(taskDir, { with: withPhases = [], runtime, run = null } = {}) {
  const active = run?.active && path.resolve(run.taskDir) === path.resolve(taskDir);
  const reason = active ? `the ${runtime} extension is running phase ${run.phase?.label ?? "?"}` : `the ${runtime} extension opens a new session per phase`;
  return wf.statusReport(taskDir, { with: withPhases, backend: { backend: "session", reason } });
}
