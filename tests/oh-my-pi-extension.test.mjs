// The Oh My Pi run-task extension against a fake host: the fake `pi` records registrations, the fake
// `ctx` scripts dialog answers, and `sendUserMessage` hands each phase prompt to the simulator's fake
// agent, which writes the artifact and reply file the way a real phase would. No tokens, no omp binary.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as wf from "../skills/delivery/run-task/scripts/workflow.mjs";
import { makeFixture, fakePhase } from "../scripts/simulate.mjs";
import { parseArgs, readPhaseLog, findSkillDir } from "../skills/delivery/run-task/scripts/plugin.mjs";
import { createExtension, loadPlugin } from "../runtimes/oh-my-pi/run-task/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fixtures = [];
function fixture(options) {
  const f = makeFixture(options);
  fixtures.push(f);
  return f;
}
after(() => {
  for (const f of fixtures) f.cleanup();
});

// What a real agent reads out of the phase prompt.
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

const chain = (z) => z;
const zod = { object: chain, string: () => ({ optional: () => ({ describe: chain }), describe: chain }) };

// `agent(prompt, host)` plays the phase; by default the simulator's fake agent writes artifact and reply.
async function host({ cwd, answers = [], inputs = [], agent = null, scenario = {} }) {
  const h = { cwd, commands: new Map(), tools: new Map(), handlers: new Map(), notices: [], selects: [], widgets: [], statuses: [], messages: [], prompts: [], sessions: 0, branch: [], idle: true };
  const emit = async (event) => {
    for (const handler of h.handlers.get(event.type) ?? []) await handler(event, ctx);
  };
  h.emit = emit;
  const defaultAgent = async (prompt) => {
    const p = parsePrompt(prompt);
    await emit({ type: "agent_start" });
    h.idle = false;
    await new Promise((r) => setTimeout(r, 5));
    fakePhase(p.skill, p.taskDir, { arg: p.arg, replyFile: p.replyFile, feedback: p.feedback, scenario });
    h.idle = true;
    await emit({ type: "agent_end", messages: [] });
  };
  const pi = {
    zod,
    on: (event, handler) => (h.handlers.get(event) ?? h.handlers.set(event, []).get(event)).push(handler),
    registerTool: (def) => h.tools.set(def.name, def),
    registerCommand: (name, def) => h.commands.set(name, def),
    sendMessage: (payload) => h.messages.push(payload),
    setModel: async () => true,
    sendUserMessage: (prompt) => {
      h.prompts.push(prompt);
      void (agent ?? defaultAgent)(prompt, h);
    },
  };
  const ctx = {
    cwd,
    hasUI: true,
    model: { provider: "fake", id: "agent" },
    ui: {
      notify: (message, type) => h.notices.push({ type, message }),
      select: async (title, options) => {
        h.selects.push({ title, options: options.map((o) => (typeof o === "string" ? o : o.label)) });
        const answer = answers.shift();
        if (answer === undefined) return undefined;
        const label = typeof answer === "function" ? answer(h.selects.at(-1).options) : answer;
        return label;
      },
      input: async () => inputs.shift(),
      setWidget: (_key, content) => h.widgets.push(content),
      setStatus: (_key, text) => h.statuses.push(text),
    },
    newSession: async () => {
      h.sessions += 1;
      h.branch = [];
      return { cancelled: false };
    },
    waitForIdle: async () => {},
    isIdle: () => h.idle,
    getContextUsage: () => ({ tokens: 1234, contextWindow: 200000, percent: 0.617 }),
    sessionManager: { getBranch: () => h.branch, getSessionFile: () => `/sessions/${h.sessions}.jsonl` },
    models: { resolve: (spec) => ({ provider: "fake", id: spec }) },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
  h.ctx = ctx;
  await createExtension({ pollMs: 5 })(pi);
  h.run = async (args) => {
    h.mark = h.widgets.length;
    await h.commands.get("run-task").handler(args, ctx);
  };
  // The loop is detached; a run is over when it clears the widget it set.
  h.finished = () => waitFor(() => h.widgets.slice(h.mark).includes(undefined), { what: "the run to finish" });
  return h;
}

const approve = (options) => options.find((o) => o.startsWith("Approve") || o.startsWith("Continue"));
const skillsOf = (h) => h.prompts.map((p) => parsePrompt(p).skill);

test("lean chain: one new session per phase, file-form prompts, approvals at every gate, context recorded per phase", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean" });
  const h = await host({ cwd: projectRoot, answers: [approve, approve, approve] });
  await h.run(`@${taskDir}`);
  await h.finished();

  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline", "setup-worktree", "implement-outline", "describe-pr"]);
  assert.equal(h.sessions, 6, "each phase opened a new session");
  const skillPath = path.join(findSkillDir((await loadPlugin(projectRoot)).root, "create-research-questions"), "SKILL.md");
  assert.ok(h.prompts[0].startsWith(`Read and follow ${skillPath}, the installed skill for /create-research-questions, for task directory ${taskDir}.`), h.prompts[0]);
  assert.match(h.prompts[0], /verbatim to .*replies\/01-create-research-questions\.md\.$/);
  assert.match(h.prompts[2], /for \/create-structure-outline, for task directory/);
  assert.match(h.prompts[4], /for \/implement-outline @03-structure-outline-verbose-flag\.md, for task directory/);

  // describe-pr is a gate too, but nothing runs after it automatically, so the run ends with the notice instead of a dialog.
  assert.deepEqual(
    h.selects.map((s) => s.title),
    ["Gate after 03 create-structure-outline: review 03-structure-outline-verbose-flag.md in verbose-flag", "Gate after 05 implement-outline: review 06-implementation-verbose-flag.md in verbose-flag"],
  );
  assert.deepEqual(h.selects[0].options, ["Approve: run /setup-worktree @03-structure-outline-verbose-flag.md", "Request changes: /iterate-structure-outline @03-structure-outline-verbose-flag.md", "Run another command instead", "Stop here"]);
  assert.deepEqual(h.selects[1].options.slice(0, 2), ["Approve: run /describe-pr", "Request changes: /iterate-implementation @03-structure-outline-verbose-flag.md"], "implementation changes go through the outline");

  const log = readPhaseLog(taskDir);
  assert.deepEqual(log.map((r) => [r.nn, r.skill, r.contextTokens, r.replyWrittenBy]), [1, 2, 3, 4, 5, 6].map((nn, i) => [nn, skillsOf(h)[i], 1234, "phase"]));
  assert.equal(log[0].model, "fake/agent");
  assert.equal(log[0].sessionFile, "/sessions/1.jsonl");
  assert.deepEqual(wf.listReplies(taskDir).map((r) => r.name), ["01-create-research-questions.md", "02-create-research.md", "03-create-structure-outline.md", "04-setup-worktree.md", "05-implement-outline.md", "06-describe-pr.md"]);
  assert.match(h.notices.at(-1).message, /pull request review is external/);
  assert.equal(h.statuses.at(-1), undefined, "status cleared at the end");
  assert.ok(h.notices.every((n) => n.type !== "error" && n.type !== "warning"), JSON.stringify(h.notices.filter((n) => n.type !== "info")));
});

test("gate stop, then re-invocation records approval and continues past that gate", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const h = await host({ cwd: projectRoot, answers: ["Stop here", approve, approve] });
  await h.run(`@${taskDir}`);
  await h.finished();
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline"]);
  assert.match(h.notices.at(-1).message, /^run-task: stopped after 03 create-structure-outline\. Review 03-structure-outline-verbose-flag\.md, then run \/run-task @\.agents\/tasks\/verbose-flag to continue; running it records approval\.$/);

  await h.run(`@${taskDir}`);
  await h.finished();
  assert.deepEqual(skillsOf(h).slice(3), ["implement-outline", "describe-pr"], "no setup-worktree with a disabled workspace, and the outline gate was not asked again");
  assert.deepEqual(h.selects.map((s) => s.title.split(":")[0]), ["Gate after 03 create-structure-outline", "Gate after 04 implement-outline"]);
});

test("request changes runs the iterate skill with the feedback in the prompt, then gates again", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const h = await host({ cwd: projectRoot, answers: [(o) => o.find((x) => x.startsWith("Request changes")), approve, approve, approve], inputs: ["Add a step that updates the README"] });
  await h.run(`@${taskDir}`);
  await h.finished();
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline", "iterate-structure-outline", "implement-outline", "describe-pr"]);
  assert.match(h.prompts[3], /for \/iterate-structure-outline @03-structure-outline-verbose-flag\.md, for task directory/);
  assert.match(h.prompts[3], /\n\nFeedback: Add a step that updates the README$/);
  assert.equal(h.selects[1].title, "Gate after 04 iterate-structure-outline: review 03-structure-outline-verbose-flag.md in verbose-flag");
  assert.match(fs.readFileSync(path.join(taskDir, "03-structure-outline-verbose-flag.md"), "utf8"), /Revision 1: Add a step that updates the README/);
});

test("another command at a gate runs in place of the table's default; an invalid one is refused and asked again", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const other = (o) => o.find((x) => x.startsWith("Run another"));
  const h = await host({ cwd: projectRoot, answers: [approve, other, other, approve], inputs: ["/no-such-skill", "/review-code"] });
  await h.run(`@${taskDir}`);
  await h.finished();
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline", "implement-outline", "review-code", "describe-pr"]);
  assert.ok(h.notices.some((n) => n.type === "error" && /no skill "no-such-skill"/.test(n.message)));
  assert.match(h.prompts[4], /for \/review-code, for task directory/);
});

test("--step stops after every phase with a Continue option", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const h = await host({ cwd: projectRoot, answers: [approve, "Stop here"] });
  await h.run(`@${taskDir} --step`);
  await h.finished();
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research"]);
  assert.equal(h.selects[0].title, "Phase 01 create-research-questions done (--step)");
  assert.equal(h.selects[0].options[0], "Continue: run /create-research");
});

test("a phase that prints a valid reply without writing the file gets its reply file written by run-task", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  let forgetOnce = true;
  const agent = async (prompt, h) => {
    const p = parsePrompt(prompt);
    await h.emit({ type: "agent_start" });
    h.idle = false;
    const result = fakePhase(p.skill, p.taskDir, { arg: p.arg, replyFile: p.replyFile, feedback: p.feedback });
    if (forgetOnce) {
      forgetOnce = false;
      fs.rmSync(p.replyFile);
      h.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "text", text: result.reply }] } });
    }
    h.idle = true;
    await h.emit({ type: "agent_end", messages: [] });
  };
  const h = await host({ cwd: projectRoot, agent, answers: ["Stop here"] });
  await h.run(`@${taskDir}`);
  await h.finished();
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline"]);
  const log = readPhaseLog(taskDir);
  assert.deepEqual(log.map((r) => r.replyWrittenBy), ["run-task", "phase", "phase"]);
  assert.ok(fs.existsSync(path.join(taskDir, "replies", "01-create-research-questions.md")));
});

test("a phase that stops to ask a question is reported once and the run resumes when the reply file appears", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  let asked = false;
  const agent = async (prompt, h) => {
    const p = parsePrompt(prompt);
    await h.emit({ type: "agent_start" });
    h.idle = false;
    await new Promise((r) => setTimeout(r, 5));
    if (p.skill === "create-research" && !asked) {
      asked = true;
      h.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Which CLI entry point should the research cover?" }] } });
      h.idle = true;
      await h.emit({ type: "agent_end", messages: [] });
      // The user answers; the phase finishes a moment later.
      setTimeout(() => fakePhase(p.skill, p.taskDir, { replyFile: p.replyFile }), 40);
      return;
    }
    fakePhase(p.skill, p.taskDir, { arg: p.arg, replyFile: p.replyFile });
    h.idle = true;
    await h.emit({ type: "agent_end", messages: [] });
  };
  const h = await host({ cwd: projectRoot, agent, answers: ["Stop here"] });
  await h.run(`@${taskDir}`);
  await h.finished();
  assert.deepEqual(skillsOf(h), ["create-research-questions", "create-research", "create-structure-outline"]);
  const warnings = h.notices.filter((n) => n.type === "warning");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /phase create-research stopped without its reply file; it is probably asking you something/);
});

test("/run-task stop ends the loop after the running phase; a second run while active is refused", async () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  let release;
  const gate = new Promise((r) => (release = r));
  const agent = async (prompt, h) => {
    const p = parsePrompt(prompt);
    await h.emit({ type: "agent_start" });
    h.idle = false;
    await gate;
    fakePhase(p.skill, p.taskDir, { replyFile: p.replyFile });
    h.idle = true;
    await h.emit({ type: "agent_end", messages: [] });
  };
  const h = await host({ cwd: projectRoot, agent });
  await h.run(`@${taskDir}`);
  await waitFor(() => h.prompts.length === 1, { what: "the first phase" });
  await h.run(`@${taskDir}`);
  assert.match(h.notices.at(-1).message, /verbose-flag is running \(phase 01 create-research-questions\); \/run-task stop first/);
  await h.run("stop");
  release();
  await h.finished();
  assert.equal(h.prompts.length, 1);
  assert.match(h.notices.at(-1).message, /stopped verbose-flag/);
  await h.run("stop");
  assert.equal(h.notices.at(-1).message, "run-task: nothing is running");
});

test("free text creates the task with the workflow it names; --status reports without running", async () => {
  const { projectRoot } = fixture({ workflow: "full" });
  const h = await host({ cwd: projectRoot, answers: ["Stop here"] });
  await h.run("Add a --quiet flag to the CLI (lean) --step");
  await h.finished();
  const taskDir = path.join(projectRoot, ".agents", "tasks", "quiet-flag-cli-lean");
  assert.equal(wf.readTask(taskDir).workflow, "lean");
  assert.match(h.notices[0].message, /created \.agents\/tasks\/quiet-flag-cli-lean\/task\.md \(lean\)/);
  assert.deepEqual(skillsOf(h), ["create-research-questions"]);

  const before = h.prompts.length;
  await h.run(`@${taskDir} --status`);
  assert.equal(h.prompts.length, before);
  const status = h.messages.at(-1);
  assert.equal(status.customType, "run-task.status");
  assert.match(status.content, /^Task: quiet-flag-cli-lean \(lean\)/);
  assert.match(status.content, /Next: \/create-research; runs without a gate/);
  assert.match(status.content, /Backend: session \(the Oh My Pi extension opens a new session per phase\)/);
});

test("task_status tool reports every task under .agents/tasks/ when no directory is given", async () => {
  const { projectRoot } = fixture({ workflow: "prd", slug: "one" });
  wf.createTask(projectRoot, { request: "Second task", workflow: "oneshot", slug: "two" });
  const h = await host({ cwd: projectRoot });
  const result = await h.tools.get("task_status").execute("id", {}, undefined, undefined, h.ctx);
  const text = result.content[0].text;
  assert.match(text, /Task: one \(prd\)[\s\S]*Next: \/create-research/);
  assert.match(text, /Task: two \(oneshot\)[\s\S]*Next: inline oneshot prompt/);
  const missing = await h.tools.get("task_status").execute("id", { taskDir: "nope" }, undefined, undefined, h.ctx);
  assert.equal(missing.isError, true);
});

test("parseArgs: flags, task dir, request with workflow detection, stop, and errors", () => {
  assert.deepEqual(parseArgs("@.agents/tasks/x --step --with review-code,record-evidence --model anthropic/claude-haiku-4-5"), { action: "run", taskDir: ".agents/tasks/x", request: null, workflow: null, step: true, with: ["review-code", "record-evidence"], model: "anthropic/claude-haiku-4-5", maxDepth: null, flags: new Set(), errors: [] });
  assert.equal(parseArgs("Ship the prd for onboarding").workflow, "prd");
  assert.equal(parseArgs("Ship onboarding --workflow lean").workflow, "lean");
  assert.equal(parseArgs("Ship onboarding").workflow, "full");
  assert.equal(parseArgs("stop").action, "stop");
  assert.equal(parseArgs("  ").action, "run");
  assert.equal(parseArgs("@x --status").action, "status");
  assert.equal(parseArgs("Add a --quiet flag").request, "Add a --quiet flag", "unknown --tokens belong to the request");
  assert.deepEqual([...parseArgs("@x --continue", { extraFlags: ["--continue"] }).flags], ["--continue"]);
  assert.deepEqual(parseArgs("@x --backend herdr").errors, ["give either @<task dir> or a request, not both"]);
  assert.deepEqual(parseArgs("x --workflow big").errors, ['workflow "big" is not one of full, lean, prd, oneshot']);
  assert.deepEqual(parseArgs("@x --with").errors, ["--with needs a value"]);
  assert.equal(parseArgs("--max-depth 3").maxDepth, 3);
  assert.deepEqual(parseArgs("--max-depth 0").errors, ['--max-depth needs a positive integer, got "0"']);
  assert.deepEqual(parseArgs("--max-depth x").errors, ['--max-depth needs a positive integer, got "x"']);
});

test("loadPlugin finds the checkout's skills tree from the extension's own location", async () => {
  const found = await loadPlugin("/nonexistent");
  assert.equal(found.root, path.join(REPO, "skills"));
  assert.equal(found.runTaskDir, path.join(REPO, "skills", "delivery", "run-task"));
  assert.equal(typeof found.plugin.planPhase, "function");
});
