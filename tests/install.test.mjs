import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plan, apply, buildTrees, destinations, detectTargets, parseArgs, promptSelections, updateConfigBlock } from "../scripts/install.mjs";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const env = { PATH: "" };
const temps = [];
function tmpdir(prefix = "skills-install-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

function install(options) {
  const planned = plan(options);
  apply(planned, { built: buildTrees(planned, tmpdir()), uninstall: false, home: options.home });
  return planned;
}

function uninstall(planned, home) {
  apply(planned, { built: new Map(), uninstall: true, home });
}

function put(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test("skill validator ignores external reference URLs but rejects missing local references", () => {
  const root = tmpdir("skills-validator-test-");
  fs.cpSync(path.join(REPO, "skills"), path.join(root, "skills"), { recursive: true });
  const validator = path.join(REPO, "scripts", "validate.mjs");
  const validate = () => spawnSync(process.execPath, [validator, "--root", root], { encoding: "utf8" });

  const externalReference = validate();
  assert.doesNotMatch(externalReference.stderr, /references\/commands\.md does not exist/);

  const skillFile = path.join(root, "skills", "delivery", "agent-slack-control-plane", "SKILL.md");
  fs.appendFileSync(skillFile, "\n[missing local reference](references/not-present.md)\n");
  const missingLocalReference = validate();
  assert.equal(missingLocalReference.status, 1);
  assert.match(missingLocalReference.stderr, /references\/not-present\.md does not exist/);
});

test("detectTargets falls back to portable when no runtime binary is on PATH", () => {
  const bin = tmpdir();
  assert.deepEqual(detectTargets({ PATH: bin }), ["portable"]);
  fs.writeFileSync(path.join(bin, "pi"), "");
  fs.writeFileSync(path.join(bin, "omp"), "");
  assert.deepEqual(detectTargets({ PATH: bin }), ["oh-my-pi", "pi"]);
});

test("installer prompts for harnesses and a searchable skill subset", async () => {
  const catalog = [{ name: "create-plan", group: "delivery" }, { name: "show-me", group: null }];
  const prompt = {
    isCancel: () => false,
    multiselect: async () => ["codex", "oh-my-pi"],
    select: async () => "choose",
    autocompleteMultiselect: async () => ["show-me"],
  };
  const selected = await promptSelections(parseArgs([]), catalog, { prompt, isTTY: true, env });
  assert.deepEqual(selected, { targets: ["codex", "oh-my-pi"], skillNames: ["show-me"] });
});

test("--yes skips menus and repeated --skill flags select exact skills", async () => {
  const catalog = [{ name: "create-plan", group: "delivery" }, { name: "show-me", group: null }];
  const args = parseArgs(["codex", "--skill", "show-me", "--skill=create-plan", "--yes"]);
  const prompt = new Proxy({}, { get: () => () => assert.fail("prompt should not run") });
  const selected = await promptSelections(args, catalog, { prompt, isTTY: true, env });
  assert.deepEqual(selected, { targets: ["codex"], skillNames: ["create-plan", "show-me"] });
  assert.equal(parseArgs(["--skill"]).errors.length, 1);
});

test("destinations honor runtime overrides globally but stay local in project scope", () => {
  const home = "/h";
  const overrides = { CLAUDE_CONFIG_DIR: "/cc", CODEX_HOME: "/cx", ATOMIC_CODING_AGENT_DIR: "/aa" };
  assert.deepEqual(destinations("claude-code", { home, env: overrides }), { skills: "/cc/skills", agents: "/cc/agents" });
  assert.deepEqual(destinations("codex", { home, env: overrides }), { skills: "/h/.agents/skills", agents: "/cx/agents", config: "/cx/config.toml" });
  assert.deepEqual(destinations("pi", { home, env }), { skills: "/h/.pi/agent/skills" });

  const local = plan({ targets: ["claude-code", "codex", "oh-my-pi", "pi", "portable"], project: true, cwd: "/p", home, env: overrides });
  assert.ok(local.steps.every((step) => step.to.startsWith("/p/")));
  assert.equal(local.steps.some((step) => step.kind === "config"), false);
  assert.equal(local.steps.filter((step) => step.kind === "skills" && step.to === "/p/.agents/skills").length, 1);
});

test("standalone defaults only plan selected runtime skills and workers", () => {
  const args = parseArgs(["claude-code", "--yes"]);
  const standalone = plan({ ...args, cwd: "/p", home: "/h", env });
  assert.deepEqual(standalone.steps.map((step) => step.to), ["/h/.claude/skills", "/h/.claude/agents"]);
  const both = plan({ targets: ["codex", "portable"], cwd: "/p", home: "/h", env });
  assert.equal(both.steps.filter((step) => step.to === "/h/.agents/skills").length, 1);
});


test("a selected skill installs and uninstalls independently in every target", () => {
  for (const target of ["claude-code", "codex", "oh-my-pi", "pi", "portable"]) {
    const home = tmpdir();
    const skillDir = destinations(target, { home, env }).skills;
    const foreign = path.join(skillDir, "mine", "SKILL.md");
    put(foreign, "keep me\n");
    const planned = install({ targets: [target], skillNames: ["show-me"], cwd: home, home, env });
    assert.deepEqual(fs.readdirSync(skillDir).sort(), ["mine", "show-me"]);
    assert.ok(fs.existsSync(path.join(skillDir, "show-me", "SKILL.md")));
    assert.equal(fs.existsSync(path.join(home, ".atomic")), false);
    assert.equal(fs.existsSync(path.join(home, ".codex", "config.toml")), false);
    uninstall(planned, home);
    assert.deepEqual(fs.readdirSync(skillDir), ["mine"]);
    assert.equal(fs.readFileSync(foreign, "utf8"), "keep me\n");
  }
});

test("partial Codex worker changes preserve other skills and worker configuration", () => {
  const home = tmpdir();
  const configFile = path.join(home, ".codex", "config.toml");
  put(configFile, 'model = "gpt-5"\n');
  const full = install({ targets: ["codex"], cwd: home, home, env });
  const partial = install({ targets: ["codex"], skillNames: ["agent-implementer"], cwd: home, home, env });
  const afterInstall = fs.readFileSync(configFile, "utf8");
  assert.match(afterInstall, /\[agents\.agent-implementer\]/);
  assert.match(afterInstall, /\[agents\.agent-codebase-analyzer\]/);
  uninstall(partial, home);
  const afterRemove = fs.readFileSync(configFile, "utf8");
  assert.doesNotMatch(afterRemove, /\[agents\.agent-implementer\]/);
  assert.match(afterRemove, /\[agents\.agent-codebase-analyzer\]/);
  assert.equal(fs.existsSync(path.join(home, ".agents", "skills", "agent-implementer")), false);
  assert.ok(fs.existsSync(path.join(home, ".agents", "skills", "create-plan", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(home, ".codex", "agents", "agent-codebase-analyzer.toml")));
  uninstall(full, home);
  assert.equal(fs.readFileSync(configFile, "utf8"), 'model = "gpt-5"\n');
});

test("deliver installs its companions without unrelated worker removal", () => {
  for (const target of ["claude-code", "codex", "oh-my-pi", "pi", "portable"]) {
    const home = tmpdir();
    const skillDir = destinations(target, { home, env }).skills;
    const existing = install({ targets: [target], skillNames: ["agent-implementer"], cwd: home, home, env });
    const liaison = install({ targets: [target], skillNames: ["deliver"], cwd: home, home, env });
    assert.ok(fs.existsSync(path.join(skillDir, "deliver", "SKILL.md")));
    assert.ok(fs.existsSync(path.join(skillDir, "route-model", "route-model.mjs")));
    assert.equal(fs.existsSync(path.join(home, ".atomic")), false);
    const worker = destinations(target, { home, env }).agents;
    if (worker) {
      const ext = target === "codex" ? "toml" : "md";
      assert.ok(fs.existsSync(path.join(worker, `agent-implementer.${ext}`)));
    }
    uninstall(liaison, home);
    assert.ok(fs.existsSync(path.join(skillDir, "agent-implementer", "SKILL.md")));
    if (worker) assert.ok(fs.existsSync(path.join(worker, `agent-implementer.${target === "codex" ? "toml" : "md"}`)));
    uninstall(existing, home);
  }
});

test("managed config edits preserve surrounding user configuration", () => {
  const original = 'model = "gpt-5"\n';
  const first = updateConfigBlock(original, '[agents.a]\nconfig_file = "./agents/a.toml"\n');
  const second = updateConfigBlock(`${first}\n[other]\nx = 1\n`, '[agents.b]\nconfig_file = "./agents/b.toml"\n');
  assert.ok(second.startsWith(original));
  assert.match(second, /\[agents\.b\]/);
  assert.doesNotMatch(second, /\[agents\.a\]/);
  assert.ok(second.endsWith("\n[other]\nx = 1\n"));
  assert.equal(updateConfigBlock(first, null), original);
});



test("route-model installs independently and falls back economically without typed-judgment", async () => {
  const home = tmpdir();
  const planned = install({ targets: ["portable"], skillNames: ["route-model"], cwd: home, home, env });
  const skillDir = path.join(home, ".agents", "skills");
  const route = await import(`${pathToFileURL(path.join(skillDir, "route-model", "route-model.mjs")).href}?standalone=${Date.now()}`);
  const result = await route.routeModel(skillDir, { phase: "create-plan", economy: "cheap", candidates: [{ model: "cheap", cost: 1, description: "ordinary" }, { model: "strong", cost: 2, description: "reasoning" }] });
  assert.equal(result.model, "cheap");
  assert.equal(result.source, "fallback");
  assert.match(result.reason, /helper unavailable/);
  uninstall(planned, home);
});


test("selected jev-ui installs as a portable consumer outside the repository", async () => {
  const home = tmpdir("jev-ui-install-test-");
  const outside = tmpdir("jev-ui-consumer-");
  const skillDir = path.join(home, ".agents", "skills");
  const foreign = path.join(skillDir, "foreign", "README.md");
  put(foreign, "preserve this file\n");
  const planned = install({ targets: ["portable"], skillNames: ["jev-ui"], cwd: outside, home, env });
  const installed = path.join(skillDir, "jev-ui");
  assert.ok(fs.existsSync(path.join(installed, "SKILL.md")));
  assert.ok(fs.existsSync(path.join(skillDir, "typed-judgment", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(skillDir, "record-evidence", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(installed, "references", "result-schema.md")));
  assert.ok(fs.existsSync(path.join(installed, "scripts", "jev-ui.mjs")));
  assert.equal(fs.readFileSync(foreign, "utf8"), "preserve this file\n");
  assert.equal(fs.existsSync(path.join(home, ".atomic")), false);
  const help = spawnSync(process.execPath, [path.join(installed, "scripts", "jev-ui.mjs"), "--help"], { cwd: outside, encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: node .*jev-ui\.mjs/);
  const mod = await import(pathToFileURL(path.join(installed, "scripts", "jev-ui.mjs")).href + `?portable=${Date.now()}`);
  const result = await mod.run({
    goal: "confirm",
    expectedPostconditions: ["Confirmed"],
    session: { id: "consumer" },
    adapter: {
      observe: async () => ({ fingerprint: "done", elements: [{ id: "status", role: "status", name: "Confirmed", operations: [] }] }),
      act: async () => assert.fail("DONE must not execute an action")
    },
    chooser: async () => ({ decision: { operation: "DONE" }, model: "injected", usage: { total_tokens: 1 } }),
    limits: { maxActions: 1, maxModels: 1 }
  });
  assert.equal(result.status, "passed");
  assert.equal(fs.existsSync(path.join(outside, ".atomic")), false);
  uninstall(planned, home);
  assert.ok(fs.existsSync(foreign));
  assert.ok(fs.existsSync(path.join(skillDir, "typed-judgment", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(skillDir, "record-evidence", "SKILL.md")));
  assert.equal(fs.existsSync(installed), false);
});
for (const project of [false, true]) {
  test(`selected iterate-evidence preserves dependency ownership in ${project ? "project" : "home"} installs`, () => {
    const home = tmpdir("iterate-evidence-home-");
    const cwd = tmpdir("iterate-evidence-project-");
    const options = { targets: ["oh-my-pi"], skillNames: ["iterate-evidence"], project, cwd, home, env };
    const skillDir = destinations("oh-my-pi", options).skills;
    const foreign = path.join(skillDir, "foreign", "sentinel");
    const task = path.join(cwd, ".agents", "tasks", "existing", "task.md");
    put(foreign, "unrelated resource\n");
    put(task, "existing task\n");

    const installed = install(options);
    assert.ok(fs.existsSync(path.join(skillDir, "iterate-evidence", "SKILL.md")));
    assert.ok(fs.existsSync(path.join(skillDir, "record-evidence", "SKILL.md")));
    const recorder = fs.readFileSync(path.join(skillDir, "record-evidence", "SKILL.md"));
    uninstall(installed, home);

    assert.equal(fs.existsSync(path.join(skillDir, "iterate-evidence")), false);
    assert.deepEqual(fs.readFileSync(path.join(skillDir, "record-evidence", "SKILL.md")), recorder);
    assert.equal(fs.readFileSync(foreign, "utf8"), "unrelated resource\n");
    assert.equal(fs.readFileSync(task, "utf8"), "existing task\n");
  });
}

test("video skills install by their canonical names without enabling workflow orchestration", () => {
  const home = tmpdir("video-skills-install-");
  const skillNames = ["video-iterative-development", "video-iterative-orchestration"];
  const skillDir = destinations("portable", { home, env }).skills;
  const foreign = path.join(skillDir, "foreign", "sentinel");
  put(foreign, "keep unrelated resource\n");

  const planned = install({ targets: ["portable"], skillNames, cwd: home, home, env });
  assert.ok(planned.names.includes("agent-implementation-reviewer"));
  assert.ok(planned.names.includes("feature-conformance"));
  for (const name of skillNames) assert.ok(fs.existsSync(path.join(skillDir, name, "SKILL.md")));
  assert.equal(fs.existsSync(path.join(home, ".atomic")), false);
  assert.equal(fs.readFileSync(foreign, "utf8"), "keep unrelated resource\n");

  uninstall(planned, home);
  for (const name of skillNames) assert.equal(fs.existsSync(path.join(skillDir, name)), false);
  assert.equal(fs.readFileSync(foreign, "utf8"), "keep unrelated resource\n");
});

test("optional OMP publication hook installs a self-contained guarded entry only when selected", () => {
  const home = tmpdir("omp-hook-home-");
  const project = tmpdir("omp-hook-project-");
  assert.equal(parseArgs(["oh-my-pi", "--omp-publication-hook"]).ompPublicationHook, true);
  assert.throws(() => plan({ targets: ["codex"], ompPublicationHook: true, cwd: project, home, env }), /requires the oh-my-pi target/);
  const ordinary = plan({ targets: ["oh-my-pi"], skillNames: ["show-me"], cwd: project, home, env });
  assert.equal(ordinary.steps.some(step => step.kind === "publication-hook"), false);
  assert.match(ordinary.notes.join("\\n"), /optional.*--omp-publication-hook/);

  for (const projectScope of [false, true]) {
    const options = { targets: ["oh-my-pi"], skillNames: ["show-me"], ompPublicationHook: true, project: projectScope, cwd: project, home, env };
    const planned = install(options);
    const step = planned.steps.find(item => item.kind === "publication-hook");
    const base = projectScope ? project : home;
    const entry = path.join(base, ".omp", ...(projectScope ? [] : ["agent"]), "hooks", "skills-publication", "hooks", "omp-publication.mjs");
    assert.equal(path.join(step.to, "hooks", "omp-publication.mjs"), entry);
    assert.ok(fs.existsSync(entry));
    assert.ok(fs.existsSync(path.join(step.to, "shared", "publication-command.mjs")));
    assert.ok(fs.existsSync(path.join(step.to, "shared", "publication-proof.mjs")));
    assert.ok(fs.existsSync(path.join(step.to, "shared", "task-artifacts.mjs")));
    const foreign = path.join(step.to, "foreign");
    put(foreign, "keep\\n");
    uninstall(planned, home);
    assert.equal(fs.existsSync(entry), false);
    assert.equal(fs.readFileSync(foreign, "utf8"), "keep\\n");
  }
});
