import { buildReport } from "../skills/delivery/skill-usage-lifecycle/scripts/skill-usage-lifecycle.mjs";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plan, apply, buildTrees, destinations, atomicDestination, detectTargets, parseArgs, promptSelections, updateConfigBlock } from "../scripts/install.mjs";
import { scanSkills } from "../scripts/lib/layout.mjs";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveSkillsDir } from "../atomic/lib/skill-storage.mjs";

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

test("usage lifecycle requires consented supported coverage and preserves unknown telemetry", () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(REPO, "tests/fixtures/skill-usage-lifecycle.json"), "utf8"));
  const unknown = buildReport(fixture);
  assert.equal(unknown.coverage.sufficient, false);
  assert.deepEqual(unknown.suggestions.map(({ status }) => status), ["unknown", "unknown", "pinned"]);

  const stale = buildReport({
    ...fixture,
    coverage: {
      complete: true,
      source: "codex",
      consent: true,
      observedFrom: "2026-01-01T00:00:00Z",
      observedThrough: "2026-02-01T00:00:00Z",
    },
  });
  assert.deepEqual(stale.suggestions.map(({ status }) => status), ["stale-candidate", "stale-candidate", "pinned"]);

  const future = buildReport({
    ...fixture,
    coverage: {
      complete: true,
      source: "codex",
      consent: true,
      observedFrom: "2999-01-01T00:00:00Z",
      observedThrough: "2999-02-01T00:00:00Z",
    },
  });
  assert.equal(future.coverage.sufficient, false);
  assert.deepEqual(future.suggestions.map(({ status }) => status), ["unknown", "unknown", "pinned"]);
});

test("installed usage lifecycle skill includes a runnable report executable", () => {
  const home = tmpdir("skills-lifecycle-install-");
  const planned = install({ targets: ["portable"], skillNames: ["skill-usage-lifecycle"], project: true, cwd: home, home, env });
  const destination = planned.steps.find((step) => step.kind === "skills").to;
  const executable = path.join(destination, "skill-usage-lifecycle", "scripts", "skill-usage-lifecycle.mjs");
  assert.ok(fs.existsSync(executable));
  const result = spawnSync(process.execPath, [executable, path.join(REPO, "tests/fixtures/skill-usage-lifecycle.json")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).suggestions.map(({ status }) => status), ["unknown", "unknown", "pinned"]);
  uninstall(planned, home);
});

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
  const installed = install({ ...parseArgs(["pi", "--atomic", "--skill", "*"]), home, cwd: home, env });
  const workflow = installed.steps.find(step => step.kind === "workflow").to;
  for (const helper of ["publication-proof.mjs", "publication-proof-policy.mjs", "task-artifacts.mjs", "task-root.mjs"]) {
    assert.ok(fs.existsSync(path.join(workflow, "shared", helper)));
  }
  uninstall(installed, home);
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

test("First Sergent opt-in installs a real worker without Atomic or unrelated worker removal", () => {
  for (const target of ["claude-code", "codex", "oh-my-pi", "pi", "portable"]) {
    const home = tmpdir();
    const skillDir = destinations(target, { home, env }).skills;
    const existing = install({ targets: [target], skillNames: ["agent-implementer"], cwd: home, home, env });
    const liaison = install({ targets: [target], skillNames: ["deliver"], cwd: home, home, env });
    assert.ok(fs.existsSync(path.join(skillDir, "deliver", "SKILL.md")));
    assert.ok(fs.existsSync(path.join(skillDir, "route-model", "route-model.mjs")));
    assert.ok(fs.existsSync(path.join(skillDir, "typed-judgment", "judge.mjs")));
    assert.ok(fs.existsSync(path.join(skillDir, "agent-first-sergent", "SKILL.md")));
    assert.ok(fs.existsSync(path.join(skillDir, "agent-first-sergent", "state.mjs")));
    assert.equal(fs.existsSync(path.join(home, ".atomic")), false);
    const worker = destinations(target, { home, env }).agents;
    if (worker) {
      const ext = target === "codex" ? "toml" : "md";
      assert.ok(fs.existsSync(path.join(worker, `agent-first-sergent.${ext}`)));
      assert.ok(fs.existsSync(path.join(worker, `agent-implementer.${ext}`)));
    }
    uninstall(liaison, home);
    assert.ok(fs.existsSync(path.join(skillDir, "agent-implementer", "SKILL.md")));
    if (worker) assert.ok(fs.existsSync(path.join(worker, `agent-implementer.${target === "codex" ? "toml" : "md"}`)));
    uninstall(existing, home);
  }
});

test("selective compliance-report install includes executable scanner triage dependency", async () => {
  const home = tmpdir();
  const installed = install({ targets: ["portable"], skillNames: ["compliance-report"], cwd: home, home, env });
  assert.deepEqual(installed.names, ["compliance-report", "security-check"]);
  const skills = destinations("portable", { home, env }).skills;
  const adapter = path.join(skills, "security-check", "scripts", "compliance.mjs");
  const {assessCompliance} = await import(pathToFileURL(adapter).href);
  const result = assessCompliance({schema_version: 1, repository: "https://example.test/acme/project", revision: "a".repeat(40), findings: []});
  assert.equal(result.coverage, "incomplete");
  assert.equal(result.accounting.reported_findings, 0);
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

test("Atomic skill directory precedence is explicit then project then user", () => {
  const root = tmpdir();
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  const projectSkills = path.join(project, ".agents", "skills");
  fs.mkdirSync(home);
  fs.mkdirSync(projectSkills, { recursive: true });

  assert.equal(resolveSkillsDir("custom/skills", project, home), path.join(project, "custom", "skills"));
  assert.equal(resolveSkillsDir(undefined, project, home), projectSkills);
  fs.rmSync(projectSkills, { recursive: true });
  assert.equal(resolveSkillsDir(undefined, project, home), path.join(home, ".agents", "skills"));
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

test("partial Oh My Pi uninstall preserves shared security hook until full target removal", () => {
  const home = tmpdir("omp-partial-uninstall-home-");
  const cwd = tmpdir("omp-partial-uninstall-project-");
  const options = { targets: ["oh-my-pi"], skillNames: ["show-me", "record-evidence"], cwd, home, env };
  const skillDir = destinations("oh-my-pi", options).skills;
  const securityHook = path.join(home, ".omp", "agent", "hooks", "skills-security", "hooks", "security-edit.mjs");
  install(options);
  assert.ok(fs.existsSync(securityHook));

  const partial = plan({ ...options, skillNames: ["show-me"], uninstall: true });
  assert.equal(partial.steps.some(step => step.kind === "security-edit-hook"), false);
  apply(partial, { built: new Map(), uninstall: true, home });
  assert.equal(fs.existsSync(path.join(skillDir, "show-me")), false);
  assert.ok(fs.existsSync(path.join(skillDir, "record-evidence", "SKILL.md")));
  assert.ok(fs.existsSync(securityHook));

  const full = plan({ ...options, skillNames: [], uninstall: true });
  assert.ok(full.steps.some(step => step.kind === "security-edit-hook"));
  apply(full, { built: new Map(), uninstall: true, home });
  assert.equal(fs.existsSync(securityHook), false);
});

test("video skills install by their canonical names without enabling workflow orchestration", () => {
  const home = tmpdir("video-skills-install-");
  const skillNames = ["video-iterative-development", "video-iterative-orchestration"];
  const skillDir = destinations("portable", { home, env }).skills;
  const foreign = path.join(skillDir, "foreign", "sentinel");
  put(foreign, "keep unrelated resource\n");

  const planned = install({ targets: ["portable"], skillNames, cwd: home, home, env });
  assert.deepEqual(planned.names, skillNames);
  for (const name of skillNames) assert.ok(fs.existsSync(path.join(skillDir, name, "SKILL.md")));
  assert.equal(fs.existsSync(path.join(home, ".atomic")), false);
  assert.equal(fs.readFileSync(foreign, "utf8"), "keep unrelated resource\n");

  uninstall(planned, home);
  for (const name of skillNames) assert.equal(fs.existsSync(path.join(skillDir, name)), false);
  assert.equal(fs.readFileSync(foreign, "utf8"), "keep unrelated resource\n");
});


test("project OMP installs reject symlinked skill and agent destinations before mutation", () => {
  for (const destination of ["skills", "agents"]) {
    const home = tmpdir("omp-project-install-home-");
    const project = tmpdir("omp-project-install-project-");
    const outside = tmpdir("omp-project-install-outside-");
    const skillName = destination === "skills" ? "show-me" : "agent-implementer";
    const link = path.join(project, ".omp", destination);
    const sentinel = destination === "skills"
      ? path.join(outside, skillName, "SKILL.md")
      : path.join(outside, `${skillName}.md`);
    put(sentinel, "external install sentinel\n");
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(outside, link, "dir");

    const planned = plan({
      targets: ["oh-my-pi"], skillNames: [skillName], project: true, cwd: project, home, env,
    });
    assert.throws(() => apply(planned, {
      built: buildTrees(planned, tmpdir()), uninstall: false, home,
    }), /refusing symlinked project destination/);

    assert.equal(fs.readFileSync(sentinel, "utf8"), "external install sentinel\n");
    assert.equal(fs.readlinkSync(link), outside);
  }
});

test("project installer Python helpers ignore project-local json modules", () => {
  const home = tmpdir("omp-project-python-home-");
  const project = tmpdir("omp-project-python-project-");
  const sentinel = path.join(tmpdir("omp-project-python-outside-"), "sentinel");
  put(sentinel, "unchanged\n");
  put(path.join(project, "json.py"), `open(${JSON.stringify(sentinel)}, 'w').write('imported\\n')\n`);
  const planned = plan({ targets: ["oh-my-pi"], skillNames: ["show-me"], project: true, cwd: project, home, env });
  const built = buildTrees(planned, tmpdir());
  const originalCwd = process.cwd();
  try {
    process.chdir(project);
    apply(planned, { built, uninstall: false, home });
  } finally {
    process.chdir(originalCwd);
  }
  assert.equal(fs.readFileSync(sentinel, "utf8"), "unchanged\n");
  assert.ok(fs.existsSync(path.join(project, ".omp", "skills", "show-me", "SKILL.md")));
});

test("project OMP installs and uninstalls stay rooted across destination parent swaps", () => {
  for (const uninstall of [false, true]) {
    for (const destination of ["skills", "agents"]) {
      const home = tmpdir("omp-project-race-home-");
      const project = tmpdir("omp-project-race-project-");
      const outside = tmpdir("omp-project-race-outside-");
      const skillName = destination === "skills" ? "show-me" : "agent-implementer";
      const targetRoot = path.join(project, ".omp", destination);
      const savedRoot = `${targetRoot}-saved`;
      const outsideSentinel = destination === "skills"
        ? path.join(outside, skillName, "SKILL.md")
        : path.join(outside, `${skillName}.md`);
      fs.mkdirSync(targetRoot, { recursive: true });
      const savedFile = destination === "skills"
        ? path.join(targetRoot, skillName, "SKILL.md")
        : path.join(targetRoot, `${skillName}.md`);
      put(savedFile, "original project file\n");
      put(outsideSentinel, "external sentinel\n");

      const planned = plan({
        targets: ["oh-my-pi"], skillNames: [skillName], project: true, cwd: project, home, env, uninstall,
      });
      const built = uninstall ? new Map() : buildTrees(planned, tmpdir());
      const root = path.resolve(project);
      const originalOpen = fs.openSync;
      let swapped = false;
      fs.openSync = function (target, ...args) {
        const fd = originalOpen.call(fs, target, ...args);
        if (!swapped && target === root) {
          fs.renameSync(targetRoot, savedRoot);
          fs.symlinkSync(outside, targetRoot, "dir");
          swapped = true;
        }
        return fd;
      };
      try {
        assert.throws(() => apply(planned, { built, uninstall, home }), /refusing symlinked project destination/);
      } finally {
        fs.openSync = originalOpen;
      }

      assert.equal(swapped, true);
      assert.equal(fs.readFileSync(outsideSentinel, "utf8"), "external sentinel\n");
      assert.equal(fs.readFileSync(savedFile.replace(targetRoot, savedRoot), "utf8"), "original project file\n");
      assert.equal(fs.readlinkSync(targetRoot), outside);
    }
  }
});

test("project root replacement after opening fails closed before external mutation", () => {
  const home = tmpdir("omp-project-root-race-home-");
  const project = tmpdir("omp-project-root-race-project-");
  const savedProject = `${project}-saved`;
  temps.push(savedProject);
  const outside = tmpdir("omp-project-root-race-outside-");
  const sentinel = path.join(outside, ".omp", "skills", "show-me", "SKILL.md");
  put(sentinel, "external root sentinel\n");
  const planned = plan({ targets: ["oh-my-pi"], skillNames: ["show-me"], project: true, cwd: project, home, env });
  const built = buildTrees(planned, tmpdir());
  const originalOpen = fs.openSync;
  let swapped = false;
  fs.openSync = function (target, ...args) {
    const fd = originalOpen.call(fs, target, ...args);
    if (!swapped && target === project) {
      fs.renameSync(project, savedProject);
      fs.symlinkSync(outside, project, "dir");
      swapped = true;
    }
    return fd;
  };
  try {
    assert.throws(() => apply(planned, { built, uninstall: false, home }), /project root identity change/);
  } finally {
    fs.openSync = originalOpen;
  }
  assert.equal(swapped, true);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "external root sentinel\n");
  assert.equal(fs.readlinkSync(project), outside);
  assert.equal(fs.existsSync(path.join(savedProject, ".omp")), false);
});

test("project OMP hook uninstall refuses symlinked security and publication directories", () => {
  for (const hook of ["security", "publication"]) {
    const home = tmpdir("omp-project-uninstall-home-");
    const project = tmpdir("omp-project-uninstall-project-");
    const outside = tmpdir("omp-project-uninstall-outside-");
    const name = hook === "security" ? "skills-security" : "skills-publication";
    const entry = hook === "security" ? "hooks/security-edit.mjs" : "hooks/omp-publication.mjs";
    const externalDirectory = path.join(outside, name);
    const sentinel = path.join(externalDirectory, entry);
    put(sentinel, "external hook sentinel\n");
    const link = path.join(project, ".omp", "hooks", name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(externalDirectory, link, "dir");

    const planned = plan({
      targets: ["oh-my-pi"], skillNames: [], ompPublicationHook: true,
      project: true, cwd: project, home, env, uninstall: true,
    });
    assert.throws(() => apply(planned, { built: new Map(), uninstall: true, home }), /refusing symlinked project destination/);

    assert.equal(fs.readFileSync(sentinel, "utf8"), "external hook sentinel\n");
    assert.equal(fs.readlinkSync(link), externalDirectory);
  }
});
test("OMP hook installation preserves external files behind symlinked destinations", () => {
  for (const symlinkParent of [false, true]) {
    const home = tmpdir("omp-hook-safe-home-");
    const project = tmpdir("omp-hook-safe-project-");
    const outside = tmpdir("omp-hook-safe-outside-");
    const planned = plan({
      targets: ["oh-my-pi"], skillNames: ["show-me"], ompPublicationHook: true,
      project: true, cwd: project, home, env,
    });
    const security = planned.steps.find(step => step.kind === "security-edit-hook");
    const securitySentinel = path.join(outside, "skills-security", "hooks", "security-edit.mjs");
    const publicationSentinel = path.join(outside, "skills-publication", "hooks", "omp-publication.mjs");
    put(securitySentinel, "external security file\n");
    put(publicationSentinel, "external publication file\n");
    const tree = directory => fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(entry => [entry.name, entry.isDirectory() ? tree(path.join(directory, entry.name)) : null]);
    const externalTree = tree(outside);

    if (symlinkParent) {
      fs.mkdirSync(path.dirname(path.dirname(security.to)), { recursive: true });
      fs.symlinkSync(outside, path.dirname(security.to), "dir");
    } else {
      fs.mkdirSync(path.dirname(security.to), { recursive: true });
      fs.symlinkSync(path.join(outside, "skills-security"), security.to, "dir");
    }

    assert.throws(() => apply(planned, { built: new Map(), uninstall: false, home }));
    assert.equal(fs.readFileSync(securitySentinel, "utf8"), "external security file\n");
    assert.equal(fs.readFileSync(publicationSentinel, "utf8"), "external publication file\n");
    assert.deepEqual(tree(outside), externalTree);
    const symlink = symlinkParent ? path.dirname(security.to) : security.to;
    assert.equal(fs.readlinkSync(symlink), symlinkParent ? outside : path.join(outside, "skills-security"));
  }
});

test("OMP hook installation atomically replaces a regular existing hook", () => {
  const home = tmpdir("omp-hook-update-home-");
  const project = tmpdir("omp-hook-update-project-");
  const planned = plan({ targets: ["oh-my-pi"], skillNames: ["show-me"], project: true, cwd: project, home, env });
  const security = planned.steps.find(step => step.kind === "security-edit-hook");
  const target = path.join(security.to, "hooks", "security-edit.mjs");
  put(target, "previous regular hook\n");

  apply({ ...planned, steps: [security] }, { built: new Map(), uninstall: false, home });

  assert.deepEqual(fs.readFileSync(target), fs.readFileSync(path.join(REPO, "hooks", "security-edit.mjs")));
});

test("optional OMP publication hook installs a self-contained guarded entry only when selected", () => {
  const home = tmpdir("omp-hook-home-");
  const project = tmpdir("omp-hook-project-");
  assert.equal(parseArgs(["oh-my-pi", "--omp-publication-hook"]).ompPublicationHook, true);
  assert.throws(() => plan({ targets: ["codex"], ompPublicationHook: true, cwd: project, home, env }), /requires the oh-my-pi target/);
  const ordinary = plan({ targets: ["oh-my-pi"], skillNames: ["show-me"], cwd: project, home, env });
  assert.equal(ordinary.steps.some(step => step.kind === "publication-hook"), false);
  assert.ok(ordinary.steps.some(step => step.kind === "security-edit-hook"));
  assert.match(ordinary.notes.join("\\n"), /optional.*--omp-publication-hook/);
  assert.match(ordinary.notes.join("\\n"), /Codex.*payload is unverified/);

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
    const securityStep = planned.steps.find(item => item.kind === "security-edit-hook");
    const securityEntry = path.join(securityStep.to, "hooks", "security-edit.mjs");
    assert.ok(fs.existsSync(securityEntry));
    const foreign = path.join(step.to, "foreign");
    put(foreign, "keep\\n");
    uninstall(planned, home);
    assert.equal(fs.existsSync(entry), false);
    assert.equal(fs.existsSync(securityEntry), false);
    assert.equal(fs.readFileSync(foreign, "utf8"), "keep\\n");
  }
});
