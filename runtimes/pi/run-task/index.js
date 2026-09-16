// Pi extension: `/run-task` drives a delivery-workflow task one fresh session per phase.
//
// Wiring only. Every decision (next command, gate, optional phases, reply shape) comes from the installed
// run-task skill's `scripts/plugin.mjs` and `scripts/workflow.mjs`, loaded from the skills tree this file
// finds, so the skills stay the single source of truth and this module has no dependencies of its own.
//
// Pi replaces the whole extension runtime on `/new`: the old instance is shut down, a new one is created for
// the replacement session, and objects captured from the old one throw. A run therefore lives on disk
// (`replies/run.json` in the task directory) and advances in steps that each fit one instance:
//   1. `/run-task` plans the phase, records it, opens a new session, and sends the phase prompt there.
//   2. The new instance's `agent_settled` handler sees the reply file, records the session's context usage,
//      runs the gate dialog, and re-dispatches `/run-task --continue` so a command context can open the next
//      session.
// The user watches every phase live in the TUI and can answer an interactive phase's questions there; the
// orchestrator itself spends no tokens.
//
// Install: copy this directory to ~/.pi/agent/extensions/run-task/, or list it under `extensions` in
// ~/.pi/agent/settings.json. See runtimes/pi.md.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = "Pi";
const CONTINUE = "--continue";

// Where the installed skills may live, first hit wins: a checkout of the collection (this file sits at
// runtimes/pi/run-task/), a built tree (dist/pi/extensions/run-task/), the project's two skill directories,
// the portable install directory, the Pi agent directory.
export function skillsRootCandidates(cwd, env = process.env) {
  const home = os.homedir();
  const agentDir = env.PI_CODING_AGENT_DIR ?? path.join(home, ".pi", "agent");
  return [
    path.resolve(here, "../../../skills"),
    path.resolve(here, "../../skills"),
    path.join(cwd, ".agents", "skills"),
    path.join(cwd, ".pi", "skills"),
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

// Tool parameters use Pi's bundled TypeBox when it resolves (it does inside Pi); a plain JSON schema stands in
// where it does not, such as the test host.
async function statusParameters() {
  const description = "Task directory; defaults to every task under .agents/tasks/";
  try {
    const { Type } = await import("typebox");
    return Type.Object({ taskDir: Type.Optional(Type.String({ description })) });
  } catch {
    return { type: "object", properties: { taskDir: { type: "string", description } } };
  }
}

export default async function runTaskExtension(pi) {
  const say = (ctx, text, level = "info") => ctx.ui.notify(`run-task: ${text}`, level);

  // A phase's `--model` is applied by the instance that owns the phase's session, since the instance that
  // opened it is gone by then.
  pi.on("session_start", async (_event, ctx) => {
    const loaded = await loadPlugin(ctx.cwd);
    if (!loaded) return;
    const { plugin } = loaded;
    const run = plugin.findActiveRun(ctx.cwd);
    if (!run?.phase?.pendingModel || !run.model) return;
    run.phase.pendingModel = false;
    plugin.writeRun(run);
    const slash = run.model.indexOf("/");
    const model = slash > 0 ? ctx.modelRegistry.find(run.model.slice(0, slash), run.model.slice(slash + 1)) : null;
    if (!model) say(ctx, `model "${run.model}" not found (use provider/id); the phase runs on the session's model`, "warning");
    else if (!(await pi.setModel(model))) say(ctx, `no credentials for ${run.model}; the phase runs on the session's model`, "warning");
  });

  // The phase's session has settled: either its reply exists and the run moves on, or it is waiting for the user.
  pi.on("agent_settled", async (_event, ctx) => {
    const loaded = await loadPlugin(ctx.cwd);
    if (!loaded) return;
    const { plugin, root } = loaded;
    const run = plugin.findActiveRun(ctx.cwd);
    if (!run?.phase) return;
    const sessionFile = ctx.sessionManager.getSessionFile?.() ?? null;
    if (run.phase.sessionFile && sessionFile && run.phase.sessionFile !== sessionFile) return;
    const outcome = plugin.replyOutcome(run.phase.replyFile, ctx.sessionManager);
    if (outcome.status === "none") {
      if (!run.phase.waitingNoted) {
        run.phase.waitingNoted = true;
        plugin.writeRun(run);
        say(ctx, `phase ${run.phase.skill} stopped without its reply file; it is probably asking you something. Answer here; the run continues when ${path.basename(run.phase.replyFile)} appears.`, "warning");
      }
      return;
    }
    const result = await completePhase(ctx, plugin, root, run, outcome, { usage: ctx.getContextUsage?.() ?? null, model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null, sessionFile });
    if (result === "continue") pi.sendUserMessage(`/run-task ${CONTINUE} @${run.taskDir}`, { expandPromptTemplates: true });
  });

  pi.registerTool({
    name: "task_status",
    label: "Task Status",
    description: "Report where a delivery-workflow task stands: artifacts, replies, the next command, and whether a human gate is pending. Reads .agents/tasks/ in the working directory when no task directory is given.",
    parameters: await statusParameters(),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const loaded = await loadPlugin(ctx.cwd);
      if (!loaded) return { content: [{ type: "text", text: `No installed skills found. Looked in: ${skillsRootCandidates(ctx.cwd).join(", ")}` }], isError: true };
      const { plugin } = loaded;
      const dirs = params.taskDir ? [plugin.resolveTaskDir(ctx.cwd, params.taskDir)] : plugin.listTaskDirs(ctx.cwd);
      if (dirs.some((d) => !d)) return { content: [{ type: "text", text: `No task.md at ${params.taskDir}` }], isError: true };
      if (dirs.length === 0) return { content: [{ type: "text", text: `No tasks under ${path.join(ctx.cwd, ".agents", "tasks")}` }] };
      const run = plugin.findActiveRun(ctx.cwd);
      const reports = dirs.map((dir) => {
        try {
          return plugin.statusReport(dir, { runtime: RUNTIME, run });
        } catch (error) {
          return `Task at ${dir}: ${error.message}`;
        }
      });
      return { content: [{ type: "text", text: reports.join("\n\n") }], details: { tasks: dirs } };
    },
  });

  pi.registerCommand("run-task", {
    description: "Drive a task through its workflow, one fresh session per phase, stopping at human gates. Args: @<task dir> | <request> | stop, --step, --status, --with <skill,...>, --model <provider/id>, --workflow <type>",
    handler: async (args, ctx) => {
      const loaded = await loadPlugin(ctx.cwd);
      if (!loaded) return say(ctx, `no installed skills found. Looked in: ${skillsRootCandidates(ctx.cwd).join(", ")}`, "error");
      const { plugin, root } = loaded;
      const wf = plugin.workflow;
      const parsed = plugin.parseArgs(args, { extraFlags: [CONTINUE] });
      if (parsed.errors.length) return say(ctx, parsed.errors.join("; "), "error");

      if (parsed.action === "stop") {
        const run = plugin.findActiveRun(ctx.cwd);
        if (!run) return say(ctx, "nothing is running");
        run.active = false;
        plugin.writeRun(run);
        return say(ctx, `stopped ${run.slug}${run.phase ? ` during ${run.phase.label}; the phase session keeps running` : ""}. Resume with /run-task @${plugin.relative(ctx.cwd, run.taskDir)}`);
      }

      let taskDir = null;
      if (parsed.taskDir) {
        taskDir = plugin.resolveTaskDir(ctx.cwd, parsed.taskDir);
        if (!taskDir) return say(ctx, `no task.md at ${parsed.taskDir} (looked relative to ${ctx.cwd} and under .agents/tasks/)`, "error");
      } else if (parsed.request) {
        try {
          const created = wf.createTask(ctx.cwd, { request: parsed.request, workflow: parsed.workflow });
          taskDir = created.taskDir;
          say(ctx, `created ${plugin.relative(ctx.cwd, taskDir)}/task.md (${parsed.workflow})${created.gitignoreUpdated ? "; added .agents/tasks/ to .gitignore" : ""}`);
        } catch (error) {
          return say(ctx, error.message, "error");
        }
      } else {
        taskDir = await plugin.pickTask(ctx.ui, ctx.cwd);
        if (!taskDir) return;
      }

      const active = plugin.findActiveRun(ctx.cwd);
      if (parsed.action === "status") {
        pi.sendMessage({ customType: "run-task.status", content: plugin.statusReport(taskDir, { with: parsed.with, runtime: RUNTIME, run: active }), display: true }, { triggerTurn: false });
        return;
      }
      if (!ctx.hasUI) return say(ctx, "gates need the interactive UI; run the fenced commands by hand in this mode", "error");
      if (active && path.resolve(active.taskDir) !== path.resolve(taskDir)) return say(ctx, `${active.slug} is running (phase ${active.phase?.label ?? "at a gate"}); /run-task stop first`, "warning");

      let run = active;
      if (parsed.flags.has(CONTINUE)) {
        if (!run) return say(ctx, "nothing to continue");
      } else if (run?.phase) {
        // The instance that started this phase is gone (Pi restarted, or the user left the session).
        const outcome = plugin.replyOutcome(run.phase.replyFile, null);
        if (outcome.status === "reply") {
          const result = await completePhase(ctx, plugin, root, run, outcome, { usage: null, model: null, sessionFile: run.phase.sessionFile });
          if (result !== "continue") return;
        } else say(ctx, `phase ${run.phase.label} has no reply yet (session ${run.phase.sessionFile ?? "unknown"}); starting it again`, "warning");
      } else if (run) {
        // Stopped at a gate whose dialog never got an answer; running again records approval, as with the skill.
      } else {
        run = plugin.newRun(taskDir, { step: parsed.step, with: parsed.with, model: parsed.model });
      }
      await startPhase(ctx, plugin, root, run);
    },
  });

  // Plans the next phase, records it, and opens its session. Everything the replacement session needs is plain
  // data captured before the switch; the old ctx and pi are stale inside withSession.
  async function startPhase(ctx, plugin, skillsRoot, run) {
    const planned = plugin.planPhase(run, skillsRoot);
    if (planned.kind !== "phase") {
      run.active = false;
      run.phase = null;
      plugin.writeRun(run);
      return say(ctx, planned.kind === "done" ? `${run.slug}: ${planned.reason}` : planned.message, planned.kind === "done" ? "info" : "error");
    }
    run.active = true;
    run.phase = { ...planned, sessionFile: null, waitingNoted: false, pendingModel: Boolean(run.model) };
    plugin.writeRun(run);
    const { taskDir } = run;
    const { prompt, label } = planned;
    const status = `${run.slug}: ${label}`;
    const widget = plugin.phaseWidget(run, run.phase, ctx.cwd);
    const opened = await ctx.newSession({
      withSession: async (sctx) => {
        const fresh = plugin.readRun(taskDir);
        if (fresh?.phase) {
          fresh.phase.sessionFile = sctx.sessionManager.getSessionFile?.() ?? null;
          plugin.writeRun(fresh);
        }
        sctx.ui.setStatus("run-task", status);
        sctx.ui.setWidget("run-task", widget, { placement: "belowEditor" });
        await sctx.sendUserMessage(prompt);
      },
    });
    if (opened.cancelled) {
      const fresh = plugin.readRun(taskDir);
      if (fresh) {
        fresh.active = false;
        fresh.phase = null;
        plugin.writeRun(fresh);
      }
    }
  }

  // Records the finished phase, then decides: "done", "stopped", or "continue" (the caller opens the next session).
  async function completePhase(ctx, plugin, skillsRoot, run, outcome, { usage, model, sessionFile }) {
    const phase = run.phase;
    plugin.recordPhase(run.taskDir, phase, { usage, model, sessionFile, source: outcome.source });
    const issues = plugin.replyIssues(outcome.text);
    if (issues.length) say(ctx, `reply ${path.basename(phase.replyFile)}: ${issues.join("; ")}`, "warning");
    say(ctx, `phase ${phase.label} done${usage ? ` (${Math.round(usage.percent)}% of context)` : ""}`);
    run.phase = null;
    const next = plugin.afterPhase(run, phase.skill);
    if (next.after.done) {
      run.active = false;
      plugin.writeRun(run);
      say(ctx, `${run.slug}: ${next.after.reason}`);
      return "done";
    }
    plugin.writeRun(run);
    if (!next.stops) return "continue";
    const decision = await plugin.gateDialog(ctx.ui, skillsRoot, run, phase, next);
    if (decision.kind === "stop") {
      run.active = false;
      plugin.writeRun(run);
      say(ctx, plugin.stopMessage(run, next.after, phase, ctx.cwd));
      return "stopped";
    }
    if (decision.kind === "changes" || decision.kind === "command") {
      run.override = { command: decision.command, feedback: decision.feedback ?? null };
      plugin.writeRun(run);
    }
    return "continue";
  }
}
