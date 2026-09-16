// Oh My Pi extension: `/run-task` drives a delivery-workflow task one fresh session per phase.
//
// Wiring only. Every decision (next command, gate, optional phases, reply shape) comes from the installed
// run-task skill's `scripts/plugin.mjs` and `scripts/workflow.mjs`, loaded from the skills tree this file
// finds, so the skills stay the single source of truth and this module has no dependencies of its own.
//
// Oh My Pi keeps one AgentSession and one extension instance across `/new`, so a run is one loop in memory:
// open a new session, send the file-form phase prompt, poll for the reply file, record the session's context
// usage beside it, then continue or stop at a human gate with a dialog. The user watches every phase live and
// can answer an interactive phase's questions there; the orchestrator itself spends no tokens.
//
// Install: point `extensions:` in ~/.omp/agent/config.yml at this directory, or copy it to
// ~/.omp/agent/extensions/run-task/. See runtimes/oh-my-pi.md.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = "Oh My Pi";

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

function skillDirOf(root, name) {
  const direct = path.join(root, name);
  if (fs.existsSync(path.join(direct, "SKILL.md"))) return direct;
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(root, entry.name, name);
    if (fs.existsSync(path.join(nested, "SKILL.md"))) return nested;
  }
  return null;
}

// The first candidate root holding run-task with its plugin module, with that module loaded.
export async function loadPlugin(cwd, env = process.env) {
  for (const root of skillsRootCandidates(cwd, env)) {
    const runTaskDir = skillDirOf(root, "run-task");
    const module = runTaskDir && path.join(runTaskDir, "scripts", "plugin.mjs");
    if (module && fs.existsSync(module)) return { root, runTaskDir, plugin: await import(pathToFileURL(module).href) };
  }
  return null;
}

function sleep(ctx, ms) {
  return new Promise((resolve) => ctx.setTimeout(resolve, ms));
}

// `pollMs` is how often the reply file is checked; tests shorten it.
export function createExtension({ pollMs = 1000 } = {}) {
  // One run per process; see plugin.newRun for the shape, plus agentStarts/agentEnds counters.
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
        const loaded = await loadPlugin(ctx.cwd);
        if (!loaded) return { content: [{ type: "text", text: `No installed skills found. Looked in: ${skillsRootCandidates(ctx.cwd).join(", ")}` }], isError: true };
        const { plugin } = loaded;
        const dirs = params.taskDir ? [plugin.resolveTaskDir(ctx.cwd, params.taskDir)] : plugin.listTaskDirs(ctx.cwd);
        if (dirs.some((d) => !d)) return { content: [{ type: "text", text: `No task.md at ${params.taskDir}` }], isError: true };
        if (dirs.length === 0) return { content: [{ type: "text", text: `No tasks under ${path.join(ctx.cwd, ".agents", "tasks")}` }] };
        const reports = dirs.map((dir) => {
          try {
            return plugin.statusReport(dir, { runtime: RUNTIME, run: state.run });
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
        const loaded = await loadPlugin(ctx.cwd);
        if (!loaded) {
          ctx.ui.notify(`run-task: no installed skills found. Looked in: ${skillsRootCandidates(ctx.cwd).join(", ")}`, "error");
          return;
        }
        const { plugin, root } = loaded;
        const wf = plugin.workflow;
        const parsed = plugin.parseArgs(args);
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
          ctx.ui.notify(`run-task: ${state.run.slug} is running (phase ${state.run.phase?.label ?? "?"}); /run-task stop first`, "warning");
          return;
        }

        let taskDir = null;
        if (parsed.taskDir) {
          taskDir = plugin.resolveTaskDir(ctx.cwd, parsed.taskDir);
          if (!taskDir) {
            ctx.ui.notify(`run-task: no task.md at ${parsed.taskDir} (looked relative to ${ctx.cwd} and under .agents/tasks/)`, "error");
            return;
          }
        } else if (parsed.request) {
          try {
            const created = wf.createTask(ctx.cwd, { request: parsed.request, workflow: parsed.workflow });
            taskDir = created.taskDir;
            ctx.ui.notify(`run-task: created ${plugin.relative(ctx.cwd, taskDir)}/task.md (${parsed.workflow})${created.gitignoreUpdated ? "; added .agents/tasks/ to .gitignore" : ""}`, "info");
          } catch (error) {
            ctx.ui.notify(`run-task: ${error.message}`, "error");
            return;
          }
        } else {
          taskDir = await plugin.pickTask(ctx.ui, ctx.cwd);
          if (!taskDir) return;
        }

        if (parsed.action === "status") {
          pi.sendMessage({ customType: "run-task.status", content: plugin.statusReport(taskDir, { with: parsed.with, runtime: RUNTIME, run: state.run }), display: true }, { triggerTurn: false });
          return;
        }
        if (!ctx.hasUI) {
          ctx.ui.notify("run-task: gates need the interactive UI; run the fenced commands by hand in this mode", "error");
          return;
        }

        const run = { ...plugin.newRun(taskDir, { step: parsed.step, with: parsed.with, model: parsed.model }), stop: false, agentStarts: 0, agentEnds: 0 };
        state.run = run;
        // Detached on purpose: the handler returns so the editor stays free for the phase sessions.
        ctx.setTimeout(() => {
          drive(pi, ctx, plugin, root, run, pollMs)
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

// The loop. Each iteration runs one phase in a new session and decides whether to go on.
async function drive(pi, ctx, plugin, skillsRoot, run, pollMs) {
  const { taskDir, slug } = run;
  const say = (text, level = "info") => ctx.ui.notify(`run-task: ${text}`, level);
  const resume = `/run-task @${plugin.relative(ctx.cwd, taskDir)}`;
  for (;;) {
    if (run.stop) return say(`stopped ${slug}; resume with ${resume}`);
    const planned = plugin.planPhase(run, skillsRoot);
    if (planned.kind === "done") return say(`${slug}: ${planned.reason}`);
    if (planned.kind === "error") return say(planned.message, "error");
    const phase = planned;

    const opened = await ctx.newSession();
    if (opened.cancelled) return say(`a new session was refused; resume with ${resume}`, "warning");
    if (run.model) {
      const model = ctx.models.resolve(run.model);
      if (!model) say(`model "${run.model}" not found; the session keeps its current model`, "warning");
      else if (!(await pi.setModel(model))) say(`no credentials for ${run.model}; the session keeps its current model`, "warning");
    }
    phase.startedAt = Date.now();
    run.phase = phase;
    run.agentStarts = 0;
    run.agentEnds = 0;
    ctx.ui.setStatus("run-task", `${slug}: ${phase.label}`);
    ctx.ui.setWidget("run-task", plugin.phaseWidget(run, phase, ctx.cwd), { placement: "belowEditor" });
    pi.sendUserMessage(phase.prompt);

    const outcome = await waitForReply(ctx, plugin, run, pollMs, say);
    if (outcome.status === "stopped") return say(`stopped ${slug} during ${phase.label}; the phase session keeps running. Resume with ${resume}`);

    const usage = ctx.getContextUsage?.() ?? null;
    plugin.recordPhase(taskDir, phase, { usage, model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null, sessionFile: ctx.sessionManager.getSessionFile?.() ?? null, source: outcome.source });
    const issues = plugin.replyIssues(outcome.text);
    if (issues.length) say(`reply ${path.basename(phase.replyFile)}: ${issues.join("; ")}`, "warning");
    say(`phase ${phase.label} done${usage ? ` (${Math.round(usage.percent)}% of context)` : ""}`);

    const next = plugin.afterPhase(run, phase.skill);
    if (next.after.done) return say(`${slug}: ${next.after.reason}`);
    if (!next.stops) continue;
    const decision = await plugin.gateDialog(ctx.ui, skillsRoot, run, phase, next);
    if (decision.kind === "stop") return say(plugin.stopMessage(run, next.after, phase, ctx.cwd));
    if (decision.kind === "changes" || decision.kind === "command") run.override = { command: decision.command, feedback: decision.feedback ?? null };
  }
}

// Poll for the reply file. A phase that stops without one either printed a valid reply (then the file is
// written from it) or is waiting for the user.
async function waitForReply(ctx, plugin, run, pollMs, say) {
  let waitingNoted = false;
  for (;;) {
    if (run.stop) return { status: "stopped" };
    const { replyFile, skill } = run.phase;
    const stopped = run.agentStarts > 0 && run.agentEnds >= run.agentStarts && ctx.isIdle();
    const outcome = plugin.replyOutcome(replyFile, stopped ? ctx.sessionManager : null);
    if (outcome.status === "reply") {
      // The skill writes the file after printing, but a model may write first; never cut the turn short.
      await ctx.waitForIdle();
      return outcome;
    }
    if (stopped && !waitingNoted) {
      waitingNoted = true;
      say(`phase ${skill} stopped without its reply file; it is probably asking you something. Answer here; the run continues when ${path.basename(replyFile)} appears.`, "warning");
    }
    await sleep(ctx, pollMs);
  }
}

export default createExtension();
