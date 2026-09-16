// Oh My Pi extension: `/run-task` drives a delivery-workflow task one fresh session per phase.
//
// The extension is wiring only. Every decision (next command, gate, optional phases, reply shape) comes
// from the installed run-task skill's `scripts/workflow.mjs`, loaded at startup from the skills tree it
// finds, so the skills stay the single source of truth and this module has no dependencies of its own.
//
// Per phase: open a new session, send the same file-form prompt the run-task skill uses, wait for the
// reply file, record the session's context usage beside it, then continue or stop at a human gate with a
// dialog. The user watches every phase live in the TUI and can answer an interactive phase's questions
// there; the orchestrator itself spends no tokens.
//
// Install: point `extensions:` in ~/.omp/agent/config.yml at this directory, or copy it to
// ~/.omp/agent/extensions/run-task/. See runtimes/oh-my-pi.md.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const LOG_NAME = "phases.jsonl";
const FLAGS = ["--step", "--status", "--with <skill,...>", "--model <spec>", "--workflow <type>"];

// Skill layout ---------------------------------------------------------------------------------

// Where the installed skills may live, first hit wins: a checkout of the collection (this file sits at
// runtimes/oh-my-pi/run-task/), a built tree (dist/oh-my-pi/extensions/run-task/), the project, the portable
// install directory, the Oh My Pi agent directory.
export function skillsRootCandidates(cwd, env = process.env) {
  const home = os.homedir();
  const agentDir = env.PI_CODING_AGENT_DIR ?? path.join(home, ".omp", "agent");
  return [
    path.resolve(here, "../../../skills"),
    path.resolve(here, "../../skills"),
    path.join(cwd, ".agents", "skills"),
    path.join(home, ".agents", "skills"),
    path.join(agentDir, "skills"),
  ];
}

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

// The first candidate root holding run-task with its workflow module, or null.
export function resolveSkills(cwd, env = process.env) {
  for (const root of skillsRootCandidates(cwd, env)) {
    const runTaskDir = findSkillDir(root, "run-task");
    if (runTaskDir && fs.existsSync(path.join(runTaskDir, "scripts", "workflow.mjs"))) return { root, runTaskDir };
  }
  return null;
}

export function loadWorkflow(runTaskDir) {
  return import(pathToFileURL(path.join(runTaskDir, "scripts", "workflow.mjs")).href);
}

// Arguments ----------------------------------------------------------------------------------

// `/run-task` argument forms: `@<task dir>`, free text (a new task), `stop`, and the flags in FLAGS. Other
// `--tokens` belong to the request (a task may well mention a CLI flag). The workflow type comes from
// `--workflow` or from a bare type name in the text, else `full`.
export function parseArgs(text, types) {
  const out = { action: "run", taskDir: null, request: null, workflow: null, step: false, with: [], model: null, errors: [] };
  const words = [];
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--step") out.step = true;
    else if (token === "--status") out.action = "status";
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
  if (!out.workflow && out.request) out.workflow = types.find((t) => new RegExp(`\\b${t}\\b`, "i").test(out.request)) ?? "full";
  return out;
}

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

// Phase log ----------------------------------------------------------------------------------

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

// Session helpers ----------------------------------------------------------------------------

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

function sleep(ctx, ms) {
  return new Promise((resolve) => ctx.setTimeout(resolve, ms));
}

function relative(cwd, file) {
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith("..") ? rel : file;
}

// Extension ----------------------------------------------------------------------------------

// `pollMs` is how often the reply file is checked; tests shorten it.
export function createExtension({ pollMs = 1000 } = {}) {
  // One run per process: { taskDir, slug, workflow, step, with, model, override, feedback, stop, agentStarts, agentEnds, phase }
  const state = { run: null };

  return async function runTaskExtension(pi) {
    const z = pi.zod;

    // Phase progress is read from the live session: a phase has stopped when every agent loop that
    // started in its session has ended and the session is idle. The counters reset per phase.
    pi.on("agent_start", async () => {
      if (state.run) state.run.agentStarts += 1;
    });
    pi.on("agent_end", async () => {
      if (state.run) state.run.agentEnds += 1;
    });

    pi.registerTool({
      name: "task_status",
      label: "Task Status",
      description: "Report where a delivery-workflow task stands: artifacts, replies, the next command, and whether a human gate is pending. Reads .agents/tasks/ in the working directory when no task directory is given.",
      parameters: z.object({ taskDir: z.string().optional().describe("Task directory; defaults to every task under .agents/tasks/") }),
      approval: "read",
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const skills = resolveSkills(ctx.cwd);
        if (!skills) return { content: [{ type: "text", text: `No installed skills found. Looked in: ${skillsRootCandidates(ctx.cwd).join(", ")}` }], isError: true };
        const wf = await loadWorkflow(skills.runTaskDir);
        const dirs = params.taskDir ? [resolveTaskDir(ctx.cwd, params.taskDir)] : listTaskDirs(ctx.cwd);
        if (dirs.some((d) => !d)) return { content: [{ type: "text", text: `No task.md at ${params.taskDir}` }], isError: true };
        if (dirs.length === 0) return { content: [{ type: "text", text: `No tasks under ${path.join(ctx.cwd, ".agents", "tasks")}` }] };
        const reports = dirs.map((dir) => {
          try {
            return wf.statusReport(dir, { backend: sessionBackend(state, dir) });
          } catch (error) {
            return `Task at ${dir}: ${error.message}`;
          }
        });
        return { content: [{ type: "text", text: reports.join("\n\n") }], details: { tasks: dirs } };
      },
    });

    pi.registerCommand("run-task", {
      description: "Drive a task through its workflow, one fresh session per phase, stopping at human gates. Args: @<task dir> | <request> | stop, --step, --status, --with <skill,...>, --model <spec>, --workflow <type>",
      handler: async (args, ctx) => {
        const skills = resolveSkills(ctx.cwd);
        if (!skills) {
          ctx.ui.notify(`run-task: no installed skills found. Looked in: ${skillsRootCandidates(ctx.cwd).join(", ")}`, "error");
          return;
        }
        const wf = await loadWorkflow(skills.runTaskDir);
        const parsed = parseArgs(args, wf.TYPES);
        if (parsed.errors.length) {
          ctx.ui.notify(`run-task: ${parsed.errors.join("; ")}`, "error");
          return;
        }
        if (parsed.action === "stop") {
          if (!state.run) ctx.ui.notify("run-task: nothing is running", "info");
          else {
            state.run.stop = true;
            ctx.ui.notify(`run-task: stopping ${state.run.slug} after the current phase check; the phase session keeps running`, "info");
          }
          return;
        }
        if (state.run && parsed.action === "run") {
          ctx.ui.notify(`run-task: ${state.run.slug} is running (phase ${state.run.phase?.nn ?? "?"} ${state.run.phase?.skill ?? ""}); /run-task stop first`, "warning");
          return;
        }

        let taskDir = null;
        if (parsed.taskDir) {
          taskDir = resolveTaskDir(ctx.cwd, parsed.taskDir);
          if (!taskDir) {
            ctx.ui.notify(`run-task: no task.md at ${parsed.taskDir} (looked relative to ${ctx.cwd} and under .agents/tasks/)`, "error");
            return;
          }
        } else if (parsed.request) {
          try {
            const created = wf.createTask(ctx.cwd, { request: parsed.request, workflow: parsed.workflow });
            taskDir = created.taskDir;
            ctx.ui.notify(`run-task: created ${relative(ctx.cwd, taskDir)}/task.md (${parsed.workflow})${created.gitignoreUpdated ? "; added .agents/tasks/ to .gitignore" : ""}`, "info");
          } catch (error) {
            ctx.ui.notify(`run-task: ${error.message}`, "error");
            return;
          }
        } else {
          taskDir = await pickTask(ctx, wf);
          if (!taskDir) return;
        }

        if (parsed.action === "status") {
          pi.sendMessage({ customType: "run-task.status", content: wf.statusReport(taskDir, { with: parsed.with, backend: sessionBackend(state, taskDir) }), display: true }, { triggerTurn: false });
          return;
        }
        if (!ctx.hasUI) {
          ctx.ui.notify("run-task: gates need the interactive UI; run the fenced commands by hand in this mode", "error");
          return;
        }

        const task = wf.readTask(taskDir);
        state.run = { taskDir, slug: task.slug, workflow: task.workflow, step: parsed.step, with: parsed.with, model: parsed.model, override: null, feedback: null, stop: false, agentStarts: 0, agentEnds: 0, phase: null };
        const run = state.run;
        // Detached on purpose: the handler returns so the editor stays free for the phase sessions.
        ctx.setTimeout(() => {
          drive(pi, ctx, wf, skills, run, pollMs)
            .catch((error) => ctx.ui.notify(`run-task: ${error?.stack ?? error}`, "error"))
            .finally(() => {
              if (state.run === run) state.run = null;
              ctx.ui.setStatus("run-task", undefined);
              ctx.ui.setWidget("run-task", undefined);
            });
        }, 0);
      },
    });
  };
}

function sessionBackend(state, taskDir) {
  const active = state.run && path.resolve(state.run.taskDir) === path.resolve(taskDir);
  return { backend: "session", reason: active ? `this Oh My Pi extension is running phase ${state.run.phase?.nn ?? "?"} ${state.run.phase?.skill ?? ""}`.trim() : "this Oh My Pi extension opens a new session per phase" };
}

async function pickTask(ctx, wf) {
  const dirs = listTaskDirs(ctx.cwd);
  const NEW = "New task (describe it)";
  let choice = NEW;
  if (dirs.length) {
    const labels = dirs.map((dir) => {
      try {
        const next = wf.nextCommand(dir);
        const task = next.task;
        const where = next.done ? `done: ${next.reason}` : `${next.inline ? "oneshot" : next.command}${next.pendingGate ? " (gate)" : ""}`;
        return { label: `${task.slug} (${task.workflow})`, description: where, dir };
      } catch (error) {
        return { label: path.basename(dir), description: error.message, dir };
      }
    });
    const picked = await ctx.ui.select("run-task: which task?", [...labels.map(({ label, description }) => ({ label, description })), NEW]);
    if (picked === undefined) return null;
    choice = picked;
    const hit = labels.find((l) => l.label === picked);
    if (hit) return hit.dir;
  }
  if (choice !== NEW) return null;
  const request = await ctx.ui.input("run-task: describe the task", "Add a --verbose flag to the CLI (lean)");
  if (!request?.trim()) return null;
  const workflow = wf.TYPES.find((t) => new RegExp(`\\b${t}\\b`, "i").test(request)) ?? "full";
  const created = wf.createTask(ctx.cwd, { request: request.trim(), workflow });
  ctx.ui.notify(`run-task: created ${relative(ctx.cwd, created.taskDir)}/task.md (${workflow})`, "info");
  return created.taskDir;
}

// The loop. Each iteration runs one phase in a new session and decides whether to go on.
async function drive(pi, ctx, wf, skills, run, pollMs) {
  const { taskDir, slug } = run;
  const say = (text, level = "info") => ctx.ui.notify(`run-task: ${text}`, level);
  for (;;) {
    if (run.stop) return say(`stopped ${slug}; resume with /run-task @${relative(ctx.cwd, taskDir)}`);
    let next;
    if (run.override) {
      const parsed = wf.parseCommand(run.override.command);
      next = { command: run.override.command, skill: parsed.skill, arg: parsed.arg, inline: false, pendingGate: false, interactive: wf.PHASES[parsed.skill]?.interactive ?? false, done: false };
      run.feedback = run.override.feedback ?? null;
      run.override = null;
    } else {
      next = wf.nextCommand(taskDir, { with: run.with });
      if (next.done) return say(`${slug}: ${next.reason}`);
    }
    const nn = wf.nextReplyNumber(taskDir);
    const skill = next.inline ? "oneshot" : next.skill;
    const replyFile = wf.replyPath(taskDir, nn, skill);
    let skillPath = null;
    if (!next.inline) {
      const dir = findSkillDir(skills.root, skill);
      if (!dir) return say(`no skill "${skill}" under ${skills.root}`, "error");
      skillPath = path.join(dir, "SKILL.md");
    }
    const prompt = wf.phasePrompt({ command: next.command, skillPath, taskDir, replyFile, feedback: run.feedback });
    run.feedback = null;

    const opened = await ctx.newSession();
    if (opened.cancelled) return say(`a new session was refused; resume with /run-task @${relative(ctx.cwd, taskDir)}`, "warning");
    if (run.model) {
      const model = ctx.models.resolve(run.model);
      if (!model) say(`model "${run.model}" not found; the session keeps its current model`, "warning");
      else if (!(await pi.setModel(model))) say(`no credentials for ${run.model}; the session keeps its current model`, "warning");
    }
    fs.mkdirSync(path.dirname(replyFile), { recursive: true });
    const startedAt = Date.now();
    run.phase = { nn, skill, replyFile, startedAt };
    run.agentStarts = 0;
    run.agentEnds = 0;
    const label = `${String(nn).padStart(2, "0")} ${skill}`;
    ctx.ui.setStatus("run-task", `${slug}: ${label}`);
    ctx.ui.setWidget("run-task", [`run-task ${slug} (${run.workflow}): phase ${label}${next.interactive ? ", interactive: answer its questions here" : ""}`, `Reply file ${relative(ctx.cwd, replyFile)} ends the phase; /run-task stop cancels.`], { placement: "belowEditor" });
    pi.sendUserMessage(prompt);

    const outcome = await waitForReply(ctx, wf, run, pollMs, say);
    if (outcome.status === "stopped") return say(`stopped ${slug} during ${label}; the phase session keeps running. Resume with /run-task @${relative(ctx.cwd, taskDir)}`);

    const usage = ctx.getContextUsage?.() ?? null;
    const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null;
    appendPhaseLog(taskDir, {
      nn,
      skill,
      command: next.command,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      model,
      contextTokens: usage?.tokens ?? null,
      contextWindow: usage?.contextWindow ?? null,
      contextPercent: usage?.percent ?? null,
      replyWrittenBy: outcome.source,
      sessionFile: ctx.sessionManager.getSessionFile?.() ?? null,
    });
    const issues = wf.validateReply(outcome.text).map((issue) => issue.replace(/\s+/g, " ").slice(0, 160));
    if (issues.length) say(`reply ${path.basename(replyFile)}: ${issues.join("; ")}`, "warning");
    const pct = usage ? ` (${Math.round(usage.percent)}% of context)` : "";
    say(`phase ${label} done${pct}`);

    const after = wf.nextCommand(taskDir, { with: run.with });
    if (after.done) return say(`${slug}: ${after.reason}`);
    const gate = wf.PHASES[skill]?.gate ?? false;
    if (!gate && !run.step) continue;
    // Changes to an implementation go through the plan or outline it follows; other gates revise the artifact itself.
    const iterate = wf.iterateSkillFor(skill);
    const planType = run.workflow === "lean" ? "structure-outline" : "plan";
    const target = iterate === "iterate-implementation" ? [...after.artifacts].reverse().find((a) => a.type === planType)?.name ?? after.gateArtifact : after.gateArtifact;
    const decision = await gateDialog(ctx, wf, skills, { label, gate, artifact: after.gateArtifact, iterate, target, nextCommand: after.inline ? "the oneshot prompt" : after.command, taskDir });
    if (decision.kind === "stop") return say(`stopped after ${label}. Review ${after.gateArtifact ?? "the newest artifact"}, then run /run-task @${relative(ctx.cwd, taskDir)} to continue; running it records approval.`);
    if (decision.kind === "changes" || decision.kind === "command") run.override = { command: decision.command, feedback: decision.feedback ?? null };
  }
}

// Poll for the reply file. A phase that stops without one either printed a valid reply (then the file is
// written from it, as the run-task skill does for subagents) or is waiting for the user.
async function waitForReply(ctx, wf, run, pollMs, say) {
  let waitingNoted = false;
  for (;;) {
    if (run.stop) return { status: "stopped" };
    const { replyFile, skill } = run.phase;
    if (fs.existsSync(replyFile)) {
      const text = fs.readFileSync(replyFile, "utf8");
      if (text.trim()) {
        // The skill writes the file after printing, but a model may write first; never cut the turn short.
        await ctx.waitForIdle();
        return { status: "reply", text, source: "phase" };
      }
    }
    if (run.agentStarts > 0 && run.agentEnds >= run.agentStarts && ctx.isIdle()) {
      const text = lastAssistantText(ctx.sessionManager);
      if (text && wf.parseReply(text).command) {
        fs.writeFileSync(replyFile, text.endsWith("\n") ? text : `${text}\n`);
        return { status: "reply", text, source: "run-task" };
      }
      if (!waitingNoted) {
        waitingNoted = true;
        say(`phase ${skill} stopped without its reply file; it is probably asking you something. Answer here; the run continues when ${path.basename(replyFile)} appears.`, "warning");
      }
    }
    await sleep(ctx, pollMs);
  }
}

// Human gate (or --step stop). Returns { kind: "continue" | "stop" | "changes" | "command", command?, feedback? }.
async function gateDialog(ctx, wf, skills, { label, gate, artifact, iterate, target, nextCommand, taskDir }) {
  const changes = iterate && target ? `Request changes: /${iterate} @${target}` : null;
  const approve = gate ? `Approve: run ${nextCommand}` : `Continue: run ${nextCommand}`;
  const other = "Run another command instead";
  const stop = "Stop here";
  const title = gate ? `Gate after ${label}: review ${artifact ?? "the newest artifact"} in ${path.basename(taskDir)}` : `Phase ${label} done (--step)`;
  for (;;) {
    const choice = await ctx.ui.select(title, [approve, ...(changes ? [changes] : []), other, stop]);
    if (choice === undefined || choice === stop) return { kind: "stop" };
    if (choice === approve) return { kind: "continue" };
    if (choice === changes) {
      const feedback = await ctx.ui.input(`What should change in ${artifact ?? target}?`, "The plan skips the migration step");
      if (!feedback?.trim()) continue;
      return { kind: "changes", command: `/${iterate} @${target}`, feedback: feedback.trim() };
    }
    const typed = await ctx.ui.input("Command to run as the next phase", "/review-code");
    if (!typed?.trim()) continue;
    const parsed = wf.parseCommand(typed);
    if (!parsed) {
      ctx.ui.notify(`run-task: "${typed.trim()}" is not /<skill>[ @<file>]`, "error");
      continue;
    }
    if (!findSkillDir(skills.root, parsed.skill)) {
      ctx.ui.notify(`run-task: no skill "${parsed.skill}" under ${skills.root}`, "error");
      continue;
    }
    return { kind: "command", command: parsed.command };
  }
}

export default createExtension();
