import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plan, apply, buildTrees } from "../scripts/install.mjs";

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


function put(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// A model profile pins the builder workers of runtimes whose worker definition honors a model field, in each runtime's own id form.
const profileFor = (economy) => ({ economy, candidates: [{ model: economy, cost: 1, description: "economy" }, { model: "strong/model", cost: 4, description: "strong" }] });
const WORKERS = ["agent-implementer", "agent-outline-implementer", "agent-implementation-reviewer"];
const BUILDERS = ["agent-implementer", "agent-outline-implementer"];

// Installs `targets` with the profile in a fresh project. `scope: "project"` installs into it; `"user"` installs into a fresh home.
function pinInstall(economy, targets, { scope = "project", profile = true, extraEnv = {} } = {}) {
  const home = tmpdir();
  const project = tmpdir();
  if (profile) put(path.join(project, ".agents", "model-candidates.json"), JSON.stringify(profileFor(economy)));
  const planned = install({ targets, skillNames: WORKERS, project: scope === "project", cwd: project, home, env: { PATH: "", ...extraEnv } });
  const dirs = scope === "project"
    ? { "claude-code": path.join(project, ".claude", "agents"), "oh-my-pi": path.join(project, ".omp", "agents") }
    : { "claude-code": path.join(home, ".claude", "agents"), "oh-my-pi": path.join(home, ".omp", "agent", "agents"), codex: path.join(home, ".codex", "agents") };
  const read = (target, name) => fs.readFileSync(path.join(dirs[target], `${name}.${target === "codex" ? "toml" : "md"}`), "utf8");
  return { planned, read, home };
}
const modelOf = (text) => /^model(?: =|:) "?([^"\n]+)"?$/m.exec(text)?.[1] ?? null;

test("Oh My Pi gets the economy id as written; every builder is pinned and no other worker is", () => {
  const { planned, read } = pinInstall("anthropic/claude-sonnet-5-5", ["oh-my-pi"]);
  assert.equal(planned.workerModel, "anthropic/claude-sonnet-5-5");
  for (const name of BUILDERS) assert.equal(modelOf(read("oh-my-pi", name)), "anthropic/claude-sonnet-5-5");
  assert.equal(modelOf(read("oh-my-pi", "agent-implementation-reviewer")), null);
  assert.match(read("oh-my-pi", "agent-implementer"), /^---\nname: agent-implementer\nmodel: "anthropic\/claude-sonnet-5-5"\ndescription:/);
  assert.ok(planned.notes.some((note) => note.includes("pinned for oh-my-pi (anthropic/claude-sonnet-5-5)")));
});

test("Claude Code is pinned only with a claude id or alias, stripping a leading anthropic/", () => {
  for (const [economy, expected] of [["anthropic/claude-sonnet-5-5", "claude-sonnet-5-5"], ["claude-sonnet-5-5", "claude-sonnet-5-5"], ["sonnet", "sonnet"], ["sonnet[1m]", "sonnet[1m]"]]) {
    const { read } = pinInstall(economy, ["claude-code"]);
    for (const name of BUILDERS) assert.equal(modelOf(read("claude-code", name)), expected, economy);
  }
  const { planned, read } = pinInstall("openai-codex/gpt-5.6-luna-fast", ["claude-code"]);
  assert.equal(planned.workerModel, null);
  assert.equal(modelOf(read("claude-code", "agent-implementer")), null);
  assert.ok(planned.notes.some((note) => note.includes("openai-codex/gpt-5.6-luna-fast is not a claude-code model id")));
});

test("Codex is pinned only with a non-claude id, stripping a leading openai/ or openai-codex/", () => {
  for (const [economy, expected] of [["openai-codex/gpt-5.6-luna-fast", "gpt-5.6-luna-fast"], ["openai/gpt-5.5", "gpt-5.5"], ["gpt-5.5", "gpt-5.5"]]) {
    const { read } = pinInstall(economy, ["codex"], { scope: "user", extraEnv: { SKILLS_MODEL_CANDIDATES_FILE: writeProfile(economy) } });
    for (const name of BUILDERS) assert.equal(modelOf(read("codex", name)), expected, economy);
    assert.match(read("codex", "agent-implementer"), /^description = .+\nmodel = "[^"]+"\ndeveloper_instructions = /m);
  }
  for (const foreign of ["anthropic/claude-sonnet-5-5", "claude-sonnet-5-5", "vendor/some-model", "sonnet", "sonnet[1m]", "opus", "Sonnet", "sonnet-4", "HAIKU", "Fable[1m]", "sonnet4", "opus4.1"]) {
    const { planned, read } = pinInstall(foreign, ["codex"], { scope: "user", extraEnv: { SKILLS_MODEL_CANDIDATES_FILE: writeProfile(foreign) } });
    assert.equal(planned.workerModel, null, foreign);
    assert.equal(modelOf(read("codex", "agent-implementer")), null, foreign);
    assert.ok(planned.notes.some((note) => note.includes(`${foreign} is not a codex model id`)), foreign);
  }
});

function writeProfile(economy) {
  const file = path.join(tmpdir(), "profile.json");
  put(file, JSON.stringify(profileFor(economy)));
  return file;
}

test("one profile pins only the runtimes whose id form it matches", () => {
  const { planned, read } = pinInstall("anthropic/claude-sonnet-5-5", ["claude-code", "oh-my-pi", "codex"], { scope: "user", extraEnv: { SKILLS_MODEL_CANDIDATES_FILE: writeProfile("anthropic/claude-sonnet-5-5") } });
  assert.equal(modelOf(read("claude-code", "agent-implementer")), "claude-sonnet-5-5");
  assert.equal(modelOf(read("oh-my-pi", "agent-implementer")), "anthropic/claude-sonnet-5-5");
  assert.equal(modelOf(read("codex", "agent-implementer")), null);
  assert.ok(planned.notes.some((note) => note.includes("is not a codex model id")));
});

test("install without a model profile writes no model field", () => {
  const { planned, read } = pinInstall("x/y", ["claude-code", "oh-my-pi"], { profile: false });
  assert.equal(planned.workerModel, null);
  for (const target of ["claude-code", "oh-my-pi"]) for (const name of BUILDERS) assert.equal(modelOf(read(target, name)), null);
});

test("a runtime without worker definitions gets none", () => {
  const { planned, home } = pinInstall("anthropic/claude-sonnet-5-5", ["pi", "portable"]);
  assert.equal(planned.workerModel, null);
  assert.equal(fs.existsSync(path.join(home, ".pi", "agent", "agents")), false);
});

test("a user-scope install pins only from SKILLS_MODEL_CANDIDATES_FILE; a project profile pins only project installs", () => {
  const user = pinInstall("anthropic/claude-sonnet-5-5", ["claude-code"], { scope: "user" });
  assert.equal(user.planned.workerModel, null);
  assert.equal(modelOf(user.read("claude-code", "agent-implementer")), null);
  assert.ok(user.planned.notes.some((note) => note.includes("project model profile ignored for a user-scope install")));
  const env = pinInstall("openai/x", ["claude-code"], { scope: "user", extraEnv: { SKILLS_MODEL_CANDIDATES_FILE: writeProfile("sonnet") } });
  assert.equal(modelOf(env.read("claude-code", "agent-implementer")), "sonnet");
  assert.ok(!env.planned.notes.some((note) => note.includes("project model profile ignored")));
  const project = pinInstall("anthropic/claude-sonnet-5-5", ["claude-code"]);
  assert.equal(modelOf(project.read("claude-code", "agent-implementer")), "claude-sonnet-5-5");
});

test("project-scope Codex writes no workers, so it is neither pinned nor noted", () => {
  const { planned } = pinInstall("gpt-5.5", ["codex"]);
  assert.equal(planned.workerModel, null);
  assert.ok(!planned.notes.some((note) => note.includes("pinned")));
});

test("an invalid model profile leaves workers unpinned and says so", () => {
  const { planned, read } = pinInstall("missing/model", ["oh-my-pi"], { profile: false });
  const project = tmpdir();
  put(path.join(project, ".agents", "model-candidates.json"), JSON.stringify({ economy: "missing/model", candidates: profileFor("x/y").candidates }));
  const bad = plan({ targets: ["oh-my-pi"], skillNames: WORKERS, project: true, cwd: project, home: tmpdir(), env: { PATH: "" } });
  assert.equal(bad.workerModel, null);
  assert.ok(bad.notes.some((note) => note.includes("model profile ignored")));
  assert.equal(planned.workerModel, null);
  assert.equal(modelOf(read("oh-my-pi", "agent-implementer")), null);
});

test("every relative link in an installed skill or worker resolves in the installed layout", () => {
  const brokenLinks = (root) => {
    const broken = [];
    const visit = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.(md|toml)$/.test(entry.name)) {
          for (const [, target] of fs.readFileSync(file, "utf8").matchAll(/\]\(([^)\s#]+)(?:#[^)\s]*)?\)/g)) {
            // Template placeholders such as `.agents/tasks/<slug>/NN-x.md` are text in the skills, not links to a file.
            if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(target) || /[<{]/.test(target)) continue;
            if (!fs.existsSync(path.resolve(path.dirname(file), target))) broken.push(`${path.relative(root, file)} -> ${target}`);
          }
        }
      }
    };
    visit(root);
    return broken;
  };
  for (const skillNames of [["*"], ["agent-slack-control-plane"]]) {
    const home = tmpdir();
    const planned = plan({ targets: ["claude-code", "codex", "oh-my-pi", "pi"], skillNames, home, cwd: home, env });
    apply(planned, { built: buildTrees(planned, tmpdir()), uninstall: false, home });
    for (const dir of [".claude", ".codex", ".omp", ".pi", ".agents"]) if (fs.existsSync(path.join(home, dir))) assert.deepEqual(brokenLinks(path.join(home, dir)), [], `${dir} for ${skillNames}`);
  }
  // The portable copy is flattened the same way.
  const home = tmpdir();
  const planned = plan({ targets: ["portable"], skillNames: ["*"], home, cwd: home, env });
  apply(planned, { built: buildTrees(planned, tmpdir()), uninstall: false, home });
  assert.deepEqual(brokenLinks(path.join(home, ".agents")), []);
  // A sibling that is part of the install is linked relatively; one that is not, and anything outside skills/, by its published URL.
  const part = tmpdir();
  const only = plan({ targets: ["claude-code"], skillNames: ["agent-slack-control-plane"], home: part, cwd: part, env });
  apply(only, { built: buildTrees(only, tmpdir()), uninstall: false, home: part });
  const worker = fs.readFileSync(path.join(part, ".claude", "agents", "agent-slack-control-plane.md"), "utf8");
  assert.match(worker, /\]\(\.\.\/skills\/(slack-coordinator|agent-slack-control-plane)\/|\]\(https:\/\/github\.com\/MarkTripoli\/skills\/blob\/main\/skills\/slack-coordinator\/SKILL\.md\)/);
});

test("Claude Code and Oh My Pi workers link an installed skill as ../skills/<name>/…", () => {
  const home = tmpdir();
  const planned = plan({ targets: ["claude-code", "oh-my-pi"], skillNames: ["agent-implementation-reviewer"], home, cwd: home, env });
  apply(planned, { built: buildTrees(planned, tmpdir()), uninstall: false, home });
  const link = "](../skills/agent-implementation-reviewer/references/review_record_template.md)";
  for (const dir of [path.join(".claude", "agents"), path.join(".omp", "agent", "agents")]) {
    const text = fs.readFileSync(path.join(home, dir, "agent-implementation-reviewer.md"), "utf8");
    assert.ok(text.includes(link), `${dir} worker links the record template as ${link}`);
    assert.ok(fs.existsSync(path.resolve(home, dir, "../skills/agent-implementation-reviewer/references/review_record_template.md")) || fs.existsSync(path.resolve(home, dir, "..", "skills", "agent-implementation-reviewer", "references", "review_record_template.md")));
  }
});
