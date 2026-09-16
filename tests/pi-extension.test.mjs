// The Pi run-task extension against a fake host that behaves like Pi: `newSession({ withSession })` shuts the
// old extension instance down (its ctx and pi throw afterwards), runs the factory again for the replacement
// session, emits `session_start` there, then calls `withSession` with the new session's context. The fake
// agent is the simulator's, so no tokens and no pi binary.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as wf from "../skills/delivery/run-task/scripts/workflow.mjs";
import { readPhaseLog, readRun } from "../skills/delivery/run-task/scripts/plugin.mjs";
import { makeFixture, fakePhase } from "../scripts/simulate.mjs";
import runTaskExtension from "../runtimes/pi/run-task/index.js";

const fixtures = [];
function fixture(options) {
  const f = makeFixture(options);
  fixtures.push(f);
  return f;
}
after(() => {
  for (const f of fixtures) f.cleanup();
});

function parsePrompt(prompt) {
  const skill = /\/([a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md/.exec(prompt)?.[1] ?? "oneshot";
  const arg = /for \/[a-z0-9-]+ (@\S+), for task directory/.exec(prompt)?.[1] ?? null;
  const taskDir = /for task directory (\S+?)\.?(?:\s|$)/.exec(prompt)[1];
  const replyFile = /verbatim to (\S+?)\.?(?:\s|$)/.exec(prompt)[1];
  const feedback = /^Feedback: (.+)$/m.exec(prompt)?.[1] ?? null;
  return { skill, arg, taskDir, replyFile, feedback };
}

function waitFor(check, { timeoutMs = 5000, what = "condition" } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${what}`));
      setTimeout(tick, 5);
    };
    tick();
  });
}

const tick = () => new Promise((r) => setTimeout(r, 5));

// `agent(parsedPrompt, instance)` plays a phase; by default the simulator writes artifact and reply.
async function host({ cwd, answers = [], inputs = [], agent = null }) {
  const h = { cwd, instances: [], notices: [], selects: [], prompts: [], messages: [], errors: [], setModels: [], sessions: 0 };
  const emit = async (inst, type) => {
    for (const handler of inst.handlers.get(type) ?? []) {
      try {
        await handler({ type }, makeCtx(inst));
      } catch (error) {
        h.errors.push(`${type}: ${error.message}`);
      }
    }
  };
  const defaultAgent = async (p) => fakePhase(p.skill, p.taskDir, { arg: p.arg, replyFile: p.replyFile, feedback: p.feedback });
  const runAgent = async (inst, prompt) => {
    const p = parsePrompt(prompt);
    await emit(inst, "agent_start");
    inst.idle = false;
    await tick();
    try {
      await (agent ?? defaultAgent)(p, inst);
    } catch (error) {
      h.errors.push(`agent: ${error.message}`);
      return;
    }
    inst.idle = true;
    await emit(inst, "agent_end");
    await emit(inst, "agent_settled");
  };
  const dispatch = async (inst, text) => {
    const [name, ...rest] = text.slice(1).split(" ");
    const command = inst.commands.get(name);
    if (!command) return h.errors.push(`no command ${name}`);
    try {
      await command.handler(rest.join(" "), makeCtx(inst, { command: true }));
    } catch (error) {
      h.errors.push(`command: ${error.message}`);
    }
  };
  async function createInstance() {
    const inst = { id: h.sessions, sessionFile: `/sessions/${h.sessions}.jsonl`, commands: new Map(), tools: new Map(), handlers: new Map(), stale: false, branch: [], idle: true, model: { provider: "fake", id: "agent" } };
    const live = () => {
      if (inst.stale) throw new Error(`stale pi of session ${inst.id}`);
    };
    const pi = {
      on: (event, handler) => (inst.handlers.get(event) ?? inst.handlers.set(event, []).get(event)).push(handler),
      registerTool: (def) => inst.tools.set(def.name, def),
      registerCommand: (name, def) => inst.commands.set(name, def),
      sendMessage: (payload) => {
        live();
        h.messages.push(payload);
      },
      setModel: async (model) => {
        live();
        inst.model = model;
        h.setModels.push({ session: inst.id, model });
        return true;
      },
      sendUserMessage: (text, options) => {
        live();
        if (text.startsWith("/") && options?.expandPromptTemplates) return void dispatch(inst, text);
        h.prompts.push(text);
        void runAgent(inst, text);
      },
    };
    await runTaskExtension(pi);
    h.instances.push(inst);
    return inst;
  }
  function makeCtx(inst, { command = false } = {}) {
    const live = () => {
      if (inst.stale) throw new Error(`stale ctx of session ${inst.id}`);
    };
    const ctx = {
      cwd,
      hasUI: true,
      get model() {
        return inst.model;
      },
      ui: {
        notify: (message, type) => {
          live();
          h.notices.push({ type, message, session: inst.id });
        },
        select: async (title, options) => {
          live();
          h.selects.push({ title, options: options.map((o) => (typeof o === "string" ? o : o.label)), session: inst.id });
          const answer = answers.shift();
          if (answer === undefined) return undefined;
          return typeof answer === "function" ? answer(h.selects.at(-1).options) : answer;
        },
        input: async () => inputs.shift(),
        setWidget: () => live(),
        setStatus: () => live(),
      },
      isIdle: () => inst.idle,
      getContextUsage: () => {
        live();
        return { tokens: 4321, contextWindow: 200000, percent: 2.16 };
      },
      sessionManager: { getSessionFile: () => inst.sessionFile, getBranch: () => inst.branch },
      modelRegistry: { find: (provider, id) => ({ provider, id }) },
    };
    if (command) {
      ctx.waitForIdle = async () => {};
      ctx.newSession = async ({ withSession } = {}) => {
        live();
        inst.stale = true;
        h.sessions += 1;
        const next = await createInstance();
        await emit(next, "session_start");
        const sctx = makeCtx(next, { command: true });
        sctx.sendUserMessage = async (text) => {
          h.prompts.push(text);
          void runAgent(next, text);
        };
        if (withSession) await withSession(sctx);
        return { cancelled: false };
      };
    }
    return ctx;
  }
  const first = await createInstance();
  await emit(first, "session_start");
  h.emit = emit;
  // A new pi process: a fresh instance on a fresh session, nothing carried over but the files.
  h.restart = async () => {
    h.current().stale = true;
    h.sessions += 1;
    const inst = await createInstance();
    await emit(inst, "session_start");
    return inst;
  };
  h.current = () => h.instances.at(-1);
  h.run = (args) => dispatch(h.current(), `/run-task ${args}`);
  h.finished = (taskDir) => waitFor(() => readRun(taskDir)?.active === false, { what: "the run to finish" });
  h.tool = (params) => h.current().tools.get("task_status").execute("id", params, undefined, undefined, makeCtx(h.current()));
  return h;
}

const approve = (options) => options.find((o) => o.startsWith("Approve") || o.startsWith("Continue"));
const skillsOf = (h) => h.prompts.map((p) => parsePrompt(p).skill);

test("lean chain across replaced extension instances: one session per phase, gates approved, nothing stale touched", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const h = await host({ cwd: projectRoot, answers: [approve, approve] });
  await h.run(`@${taskDir}`);
  await h.finished(taskDir);

  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline", "implement-outline", "describe-pr"]);
  assert.equal(h.sessions, 5, "each phase opened a new session");
  assert.equal(h.instances.length, 6, "the factory ran once per session");
  assert.deepEqual(h.errors, []);
  assert.match(h.prompts[0], /^Read and follow .*\/create-research-questions\/SKILL\.md, the installed skill for \/create-research-questions, for task directory /);
  assert.deepEqual(h.selects.map((s) => [s.title, s.session]), [
    ["Gate after 03 create-structure-outline: review 03-structure-outline-verbose-flag.md in verbose-flag", 3],
    ["Gate after 04 implement-outline: review 05-implementation-verbose-flag.md in verbose-flag", 4],
  ]);
  const log = readPhaseLog(taskDir);
  assert.deepEqual(log.map((r) => [r.nn, r.skill, r.contextTokens, r.sessionFile, r.replyWrittenBy]), [
    [1, "create-research-questions", 4321, "/sessions/1.jsonl", "phase"],
    [2, "create-research", 4321, "/sessions/2.jsonl", "phase"],
    [3, "create-structure-outline", 4321, "/sessions/3.jsonl", "phase"],
    [4, "implement-outline", 4321, "/sessions/4.jsonl", "phase"],
    [5, "describe-pr", 4321, "/sessions/5.jsonl", "phase"],
  ]);
  const run = readRun(taskDir);
  assert.equal(run.active, false);
  assert.equal(run.phase, null);
  assert.match(h.notices.at(-1).message, /pull request review is external/);
  assert.ok(h.notices.every((n) => n.type === "info"), JSON.stringify(h.notices.filter((n) => n.type !== "info")));
});

test("stop at a gate, then re-invocation records approval; request changes carries feedback into the iterate phase", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const h = await host({ cwd: projectRoot, answers: ["Stop here", (o) => o.find((x) => x.startsWith("Request changes")), approve, approve], inputs: ["Split step 2 into two steps"] });
  await h.run(`@${taskDir}`);
  await h.finished(taskDir);
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline"]);
  assert.match(h.notices.at(-1).message, /^run-task: stopped after 03 create-structure-outline\. Review 03-structure-outline-verbose-flag\.md, then run \/run-task @\.agents\/tasks\/verbose-flag to continue; running it records approval\.$/);

  await h.run(`@${taskDir}`);
  await h.finished(taskDir);
  assert.deepEqual(skillsOf(h).slice(3), ["implement-outline", "iterate-implementation", "describe-pr"]);
  assert.match(h.prompts[4], /for \/iterate-implementation @03-structure-outline-verbose-flag\.md, for task directory/);
  assert.match(h.prompts[4], /\n\nFeedback: Split step 2 into two steps$/);
  assert.deepEqual(h.errors, []);
});

test("--model is applied by the instance that owns each phase session; --step stops after every phase", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const h = await host({ cwd: projectRoot, answers: [approve, "Stop here"] });
  await h.run(`@${taskDir} --step --model anthropic/claude-haiku-4-5`);
  await h.finished(taskDir);
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research"]);
  assert.deepEqual(h.setModels, [
    { session: 1, model: { provider: "anthropic", id: "claude-haiku-4-5" } },
    { session: 2, model: { provider: "anthropic", id: "claude-haiku-4-5" } },
  ]);
  assert.equal(readPhaseLog(taskDir)[0].model, "anthropic/claude-haiku-4-5");
  assert.equal(h.selects[0].title, "Phase 01 create-research-questions done (--step)");
  assert.equal(readRun(taskDir).phase, null);
  assert.deepEqual(h.errors, []);
});

test("after a restart mid-run, /run-task completes the phase whose reply exists and re-runs one that has none", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  // The phase's process dies after writing its reply but before agent_settled: run.json still names the phase.
  let vanish = true;
  const agent = async (p) => {
    fakePhase(p.skill, p.taskDir, { arg: p.arg, replyFile: p.replyFile });
    if (vanish) {
      vanish = false;
      throw new Error("process exit");
    }
  };
  const h = await host({ cwd: projectRoot, agent, answers: ["Stop here", approve] });
  await h.run(`@${taskDir}`);
  await waitFor(() => h.errors.length > 0, { what: "the simulated exit" });
  assert.deepEqual(h.errors, ["agent: process exit"]);
  h.errors.length = 0;
  assert.equal(readRun(taskDir).phase.skill, "create-research-questions");

  await h.restart();
  await h.run(`@${taskDir}`);
  await h.finished(taskDir);
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline"]);
  const log = readPhaseLog(taskDir);
  assert.equal(log[0].contextTokens, null, "a phase completed after a restart has no context usage to record");
  assert.equal(log[0].sessionFile, "/sessions/1.jsonl");
  assert.deepEqual(h.errors, []);

  // No reply at all: the phase is started again under the same number.
  const run = readRun(taskDir);
  run.active = true;
  run.phase = { nn: 4, skill: "implement-outline", command: "/implement-outline @03-structure-outline-verbose-flag.md", replyFile: wf.replyPath(taskDir, 4, "implement-outline"), label: "04 implement-outline", startedAt: Date.now(), sessionFile: "/sessions/9.jsonl", waitingNoted: false, pendingModel: false };
  fs.writeFileSync(path.join(taskDir, "replies", "run.json"), JSON.stringify(run));
  await h.restart();
  await h.run(`@${taskDir}`);
  await h.finished(taskDir);
  assert.ok(h.notices.some((n) => /phase 04 implement-outline has no reply yet \(session \/sessions\/9\.jsonl\); starting it again/.test(n.message)), JSON.stringify(h.notices.slice(-4)));
  assert.deepEqual(skillsOf(h).slice(3), ["implement-outline", "describe-pr"]);
  assert.deepEqual(h.errors, []);
});

test("a phase that settles without a reply is reported once and continues when the reply appears", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  let asked = false;
  let h;
  const agent = async (p, inst) => {
    if (p.skill === "create-research" && !asked) {
      asked = true;
      inst.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Which entry point?" }] } });
      // The user answers; the agent finishes and settles again a moment later.
      setTimeout(async () => {
        fakePhase(p.skill, p.taskDir, { replyFile: p.replyFile });
        await h.emit(inst, "agent_settled");
      }, 40);
      return;
    }
    fakePhase(p.skill, p.taskDir, { arg: p.arg, replyFile: p.replyFile });
  };
  h = await host({ cwd: projectRoot, agent, answers: ["Stop here"] });
  await h.run(`@${taskDir}`);
  await h.finished(taskDir);
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline"]);
  const warnings = h.notices.filter((n) => n.type === "warning");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /phase create-research stopped without its reply file; it is probably asking you something/);
  assert.deepEqual(h.errors, []);
});

test("stop marks the run inactive so the running phase's settle does not continue it; status and the tool report the session backend", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  let release;
  const gate = new Promise((r) => (release = r));
  const agent = async (p) => {
    await gate;
    fakePhase(p.skill, p.taskDir, { replyFile: p.replyFile });
  };
  const h = await host({ cwd: projectRoot, agent });
  await h.run(`@${taskDir}`);
  await waitFor(() => h.prompts.length === 1, { what: "the first phase" });
  assert.equal(readRun(taskDir).active, true);
  await h.run("stop");
  assert.match(h.notices.at(-1).message, /stopped verbose-flag during 01 create-research-questions; the phase session keeps running/);
  release();
  await waitFor(() => fs.existsSync(wf.replyPath(taskDir, 1, "create-research-questions")), { what: "the phase reply" });
  await tick();
  await tick();
  assert.equal(h.prompts.length, 1, "no further phase started");
  assert.equal(readRun(taskDir).active, false);

  await h.run(`@${taskDir} --status`);
  const status = h.messages.at(-1);
  assert.equal(status.customType, "run-task.status");
  assert.match(status.content, /Next: \/create-research; runs without a gate/);
  assert.match(status.content, /Backend: session \(the Pi extension opens a new session per phase\)/);
  const tool = await h.tool({});
  assert.match(tool.content[0].text, /Task: verbose-flag \(lean\)/);
  assert.deepEqual(h.errors, []);
});
