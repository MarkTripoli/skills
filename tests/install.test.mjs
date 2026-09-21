import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plan, apply, buildTrees, destinations, atomicDestination, detectTargets, parseArgs, promptSelections, updateConfigBlock } from "../scripts/install.mjs";
import { scanSkills } from "../scripts/lib/layout.mjs";
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
  assert.equal(atomicDestination({ home, env }), "/h/.atomic/agent/workflows/skills-delivery");
  assert.equal(atomicDestination({ home, env: overrides }), "/aa/workflows/skills-delivery");

  const local = plan({ targets: ["claude-code", "codex", "oh-my-pi", "pi", "portable"], atomic: true, project: true, cwd: "/p", home, env: overrides });
  assert.ok(local.steps.every((step) => step.to.startsWith("/p/")));
  assert.equal(local.steps.find((step) => step.kind === "workflow").to, "/p/.atomic/workflows/skills-delivery");
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

test("Atomic is opt-in and rejects partial skill selection before writing", () => {
  const home = tmpdir();
  const args = parseArgs(["pi", "--atomic", "--skill", "show-me", "--yes"]);
  assert.throws(() => plan({ ...args, home, cwd: home, env }), /--atomic requires all skills/);
  assert.deepEqual(fs.readdirSync(home), []);
  const full = plan({ ...parseArgs(["pi", "--atomic", "--skill", "*"]), home, cwd: home, env });
  assert.equal(full.steps.find((step) => step.kind === "workflow").to, path.join(home, ".atomic", "agent", "workflows", "skills-delivery"));
  assert.equal(full.steps.find((step) => step.target === "portable").to, path.join(home, ".agents", "skills"));
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

test("Atomic installs canonical full skills and workflow sources beside unrelated files", () => {
  const home = tmpdir();
  const agentDir = path.join(home, "custom-agent");
  const options = { targets: ["claude-code", "codex", "oh-my-pi", "pi"], atomic: true, cwd: home, home, env: { ...env, ATOMIC_CODING_AGENT_DIR: agentDir } };
  const foreignSkill = path.join(home, ".agents", "skills", "mine", "SKILL.md");
  const foreignWorkflow = path.join(agentDir, "workflows", "mine", "index.ts");
  const foreignState = path.join(agentDir, "sessions", "existing.json");
  put(foreignSkill, "my skill\n");
  put(foreignWorkflow, "my workflow\n");
  put(foreignState, "my session\n");
  const planned = install(options);
  const skillsDir = path.join(home, ".agents", "skills");
  const canonical = scanSkills(path.join(REPO, "skills")).skills;
  assert.deepEqual(fs.readdirSync(skillsDir).sort(), [...canonical.map((skill) => skill.name), "mine"].sort());
  for (const skill of canonical) {
    assert.equal(fs.readFileSync(path.join(skillsDir, skill.name, "SKILL.md"), "utf8"), fs.readFileSync(path.join(skill.dir, "SKILL.md"), "utf8"));
  }
  const workflowRoot = atomicDestination(options);
  const entry = path.join(path.dirname(workflowRoot), "skills-delivery.mjs");
  assert.ok(fs.existsSync(entry));
  const workflow = path.join(workflowRoot, "workflows", "delivery.ts");
  assert.ok(fs.existsSync(path.join(workflowRoot, "lib")));
  assert.ok(fs.existsSync(path.join(home, ".codex", "agents", "agent-implementer.toml")));

  // Selecting one ordinary skill removes that skill even if the optional workflow remains installed.
  uninstall(plan({ targets: ["codex"], skillNames: ["create-plan"], home, cwd: home, env }), home);
  assert.equal(fs.existsSync(path.join(skillsDir, "create-plan")), false);
  assert.ok(fs.existsSync(workflow));
  assert.ok(fs.existsSync(entry));
  assert.ok(fs.existsSync(path.join(skillsDir, "show-me", "SKILL.md")));

  uninstall(planned, home);
  assert.deepEqual(fs.readdirSync(skillsDir), ["mine"]);
  assert.equal(fs.existsSync(workflowRoot), false);
  assert.equal(fs.existsSync(entry), false);
  assert.equal(fs.readFileSync(foreignSkill, "utf8"), "my skill\n");
  assert.equal(fs.readFileSync(foreignWorkflow, "utf8"), "my workflow\n");
  assert.equal(fs.readFileSync(foreignState, "utf8"), "my session\n");
  assert.equal(fs.existsSync(path.join(home, ".codex", "config.toml")), false);
  uninstall(planned, home);
  assert.equal(fs.existsSync(path.join(home, ".codex", "config.toml")), false);
});
test("isolated Atomic install loads the portable route-model from the installed skills directory", async () => {
  const home = tmpdir();
  const options = { targets: ["portable"], atomic: true, cwd: home, home, env };
  install(options);
  const workflowRoot = atomicDestination(options);
  const installedModels = await import(`${pathToFileURL(path.join(workflowRoot, "lib", "models.mjs")).href}?isolated-model=${Date.now()}`);
  const selected = await installedModels.selectStageModel(path.join(home, ".agents", "skills"), { skill: "implement-plan", model: "cheap", reasoningModel: "strong", modelRouting: "fixed", availableModels: ["cheap", "strong"] });
  assert.equal(selected.model, "cheap");
  assert.equal(selected.source, "fixed");
});

test("isolated Atomic install parses frontmatter through its copied YAML dependency", async () => {
  const home = tmpdir();
  const options = { targets: ["portable"], atomic: true, cwd: home, home, env };
  install(options);
  const workflowRoot = atomicDestination(options);
  const parser = await import(`${pathToFileURL(path.join(workflowRoot, "lib", "artifacts.mjs")).href}?isolated=${Date.now()}`);
  const parsed = parser.frontmatter("---\nslug: isolated-parser\nworkflow: full\n---\nParse this task.\n");
  assert.equal(parsed.metadata.slug, "isolated-parser");
  assert.equal(parsed.metadata.workflow, "full");
  assert.equal(parsed.body, "Parse this task.");
});

test("project Atomic install and uninstall never mutate home or overridden global directories", () => {
  const root = tmpdir();
  const home = path.join(root, "home");
  const cwd = path.join(root, "project");
  fs.mkdirSync(home);
  fs.mkdirSync(cwd);
  const untouched = path.join(home, "sentinel");
  put(untouched, "unchanged\n");
  const options = { targets: ["claude-code", "codex", "oh-my-pi", "pi"], atomic: true, project: true, cwd, home, env: { ...env, CLAUDE_CONFIG_DIR: path.join(home, "claude"), CODEX_HOME: path.join(home, "codex"), ATOMIC_CODING_AGENT_DIR: path.join(home, "atomic") } };
  const planned = install(options);
  assert.ok(fs.existsSync(path.join(cwd, ".agents", "skills", "create-plan", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(cwd, ".atomic", "workflows", "skills-delivery", "workflows", "delivery.ts")));
  assert.ok(fs.existsSync(path.join(cwd, ".atomic", "workflows", "skills-delivery.mjs")));
  assert.deepEqual(fs.readdirSync(home), ["sentinel"]);
  uninstall(planned, home);
  assert.deepEqual(fs.readdirSync(home), ["sentinel"]);
  assert.equal(fs.readFileSync(untouched, "utf8"), "unchanged\n");
  assert.equal(fs.existsSync(path.join(cwd, ".atomic", "workflows", "skills-delivery")), false);
  assert.equal(fs.existsSync(path.join(cwd, ".atomic", "workflows", "skills-delivery.mjs")), false);
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
test("Safety Dance installs as a non-worker skill across targets and runtime builds", () => {
  const sourceSkill = path.join(REPO, "skills", "delivery", "safety-dance");
  const sourceSkillText = fs.readFileSync(path.join(sourceSkill, "SKILL.md"), "utf8");
  for (const target of ["claude-code", "codex", "oh-my-pi", "pi", "portable"]) {
    const home = tmpdir(`safety-dance-${target}-`);
    const skillDir = destinations(target, { home, env }).skills;
    const foreign = path.join(skillDir, "mine", "SKILL.md");
    put(foreign, "keep me\n");
    const planned = install({ targets: [target], skillNames: ["safety-dance"], cwd: home, home, env });
    const installed = path.join(skillDir, "safety-dance");
    if (target === "portable") assert.equal(fs.readFileSync(path.join(installed, "SKILL.md"), "utf8"), sourceSkillText);
    else assert.match(fs.readFileSync(path.join(installed, "SKILL.md"), "utf8"), /Runtime: /);
    assert.ok(fs.existsSync(path.join(installed, "references", "commands.md")));
    assert.ok(fs.existsSync(path.join(installed, "references", "safety.md")));
    assert.ok(fs.existsSync(foreign));
    assert.equal(fs.existsSync(path.join(home, ".claude", "agents", "safety-dance.md")), false);
    assert.equal(fs.existsSync(path.join(home, ".codex", "agents", "safety-dance.toml")), false);
    assert.doesNotMatch(fs.existsSync(path.join(home, ".codex", "config.toml")) ? fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8") : "", /safety-dance/);
    uninstall(planned, home);
    assert.equal(fs.existsSync(installed), false);
    assert.equal(fs.existsSync(foreign), true);
  }

  for (const runtime of ["claude-code", "codex", "oh-my-pi", "pi"]) {
    const dest = tmpdir(`safety-dance-runtime-${runtime}-`);
    const result = spawnSync(process.execPath, [path.join(REPO, "scripts", "build-runtimes.mjs"), "--runtime", runtime, "--dest", dest], { cwd: REPO, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const built = path.join(dest, "skills", "safety-dance");
    assert.ok(fs.existsSync(path.join(built, "SKILL.md")));
    assert.ok(fs.existsSync(path.join(built, "references", "commands.md")));
    assert.ok(fs.existsSync(path.join(built, "references", "safety.md")));
    assert.match(fs.readFileSync(path.join(built, "SKILL.md"), "utf8"), new RegExp(`Runtime: ${runtime === "oh-my-pi" ? "Oh My Pi" : runtime === "claude-code" ? "Claude Code" : runtime === "codex" ? "Codex" : "Pi"}\\.`));
    assert.equal(fs.existsSync(path.join(dest, "agents", "safety-dance.md")), false);
    assert.equal(fs.existsSync(path.join(dest, "agents", "safety-dance.toml")), false);
  }
  assert.equal(fs.readFileSync(path.join(sourceSkill, "SKILL.md"), "utf8"), sourceSkillText);
});
