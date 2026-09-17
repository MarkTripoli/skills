import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { plan, apply, buildTrees, destinations, detectTargets, updateConfigBlock, packDestination, packFlavors, PACKS } from "../scripts/install.mjs";
import { buildRuntime } from "../scripts/lib/build.mjs";
import { scanSkills } from "../scripts/lib/layout.mjs";
import { listNative } from "../scripts/build-packs.mjs";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const temps = [];
function tmpdir(prefix = "skills-install-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

test("install removes retired skill and extension paths", () => {
  const home = tmpdir("skills-install-retired-");
  fs.mkdirSync(path.join(home, ".claude", "skills", "run-task"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "skills", "run-task", "SKILL.md"), "retired\n");
  fs.mkdirSync(path.join(home, ".omp", "agent", "extensions", "run-task"), { recursive: true });
  fs.writeFileSync(path.join(home, ".omp", "agent", "extensions", "run-task", "x"), "retired\n");
  const work = tmpdir();
  const built = new Map();
  for (const target of ["claude-code", "oh-my-pi"]) {
    buildRuntime(target, path.join(work, target));
    built.set(target, path.join(work, target));
  }
  const planned = plan({ targets: ["claude-code", "oh-my-pi"], project: false, packs: false, cwd: home, home, env });
  assert.ok(planned.steps.some((s) => s.kind === "retired"));
  apply(planned, { built, uninstall: false, home });
  assert.equal(fs.existsSync(path.join(home, ".claude", "skills", "run-task")), false);
  assert.equal(fs.existsSync(path.join(home, ".omp", "agent", "extensions", "run-task")), false);
});

const env = { PATH: "" };

// The first archon on PATH that is 0.10 or later; the installed-packs listing is skipped without one.
function archonBinary() {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, "archon");
    if (!dir || !fs.existsSync(candidate)) continue;
    try {
      const version = /v(\d+)\.(\d+)\./.exec(execFileSync(candidate, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      if (version && (Number(version[1]) > 0 || Number(version[2]) >= 10)) return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}
const ARCHON = archonBinary();

test("detectTargets falls back to portable when no runtime binary is on PATH", () => {
  const bin = tmpdir();
  assert.deepEqual(detectTargets({ PATH: bin }), ["portable"]);
  fs.writeFileSync(path.join(bin, "pi"), "");
  fs.writeFileSync(path.join(bin, "omp"), "");
  assert.deepEqual(detectTargets({ PATH: bin }), ["oh-my-pi", "pi"]);
});

test("destinations follow each runtime's directories and honor CLAUDE_CONFIG_DIR and CODEX_HOME", () => {
  const home = "/h";
  assert.deepEqual(destinations("claude-code", { project: false, home, env: { CLAUDE_CONFIG_DIR: "/cc" } }), { skills: "/cc/skills", agents: "/cc/agents" });
  assert.deepEqual(destinations("codex", { project: false, home, env: { CODEX_HOME: "/cx" } }), { skills: "/h/.agents/skills", agents: "/cx/agents", config: "/cx/config.toml" });
  assert.deepEqual(destinations("oh-my-pi", { project: true, cwd: "/p", home, env }), { skills: "/p/.omp/skills", agents: "/p/.omp/agents" });
  assert.deepEqual(destinations("pi", { project: false, home, env }), { skills: "/h/.pi/agent/skills" });
  assert.deepEqual(destinations("portable", { project: true, cwd: "/p", home, env }), { skills: "/p/.agents/skills" });
});

test("plan: codex and portable share ~/.agents/skills, so the portable copy is skipped with a note; project scope drops codex workers", () => {
  const home = "/h";
  const both = plan({ targets: ["codex", "portable"], project: false, packs: false, cwd: "/p", home, env });
  assert.deepEqual(both.steps.filter((s) => s.kind !== "retired").map((s) => `${s.target}:${s.kind}`), ["codex:skills", "codex:agents", "codex:config"]);
  assert.match(both.notes[0], /portable: skills directory ~\/.agents\/skills is already written by codex/);
  const project = plan({ targets: ["codex", "oh-my-pi"], project: true, packs: false, cwd: "/p", home, env });
  assert.deepEqual(project.steps.filter((s) => s.kind !== "retired").map((s) => `${s.target}:${s.kind}`), ["codex:skills", "oh-my-pi:skills", "oh-my-pi:agents"]);
  assert.match(project.notes[0], /codex: worker definitions .* user-level/);
  assert.equal(project.steps[0].names.length, scanSkills(path.join(REPO, "skills")).skills.length);
});

test("plan: packs add the ~/.agents/skills copy they read unless a target already writes it, then the two pack directories", () => {
  const home = "/h";
  const claude = plan({ targets: ["claude-code"], project: false, packs: true, cwd: "/p", home, env });
  assert.deepEqual(claude.steps.filter((s) => s.kind !== "retired").map((s) => `${s.target}:${s.kind}:${s.to}`), [
    "claude-code:skills:/h/.claude/skills",
    "claude-code:agents:/h/.claude/agents",
    "packs:skills:/h/.agents/skills",
    "packs:packs:/h/.archon/workflows",
  ]);
  const codex = plan({ targets: ["codex"], project: false, packs: true, cwd: "/p", home, env });
  assert.deepEqual(codex.steps.filter((s) => s.target === "packs").map((s) => s.kind), ["packs"], "codex already writes ~/.agents/skills");
  const project = plan({ targets: ["pi"], project: true, packs: true, cwd: "/p", home, env });
  const projectPacks = project.steps.find((s) => s.kind === "packs");
  assert.equal(projectPacks.to, "/p/.archon/workflows");
  assert.deepEqual(projectPacks.names, ["delivery"], "a Pi install gets the native flavor only");
  assert.deepEqual(packFlavors(["oh-my-pi"]), ["delivery-omp"]);
  assert.deepEqual(packFlavors(["claude-code", "oh-my-pi"]), PACKS);
  assert.deepEqual(packFlavors(["portable"]), ["delivery"], "no runtime on PATH still installs the native packs for Archon");
  assert.match(project.notes.at(-1), /project-scoped packs still read skills from ~\/.agents\/skills/);
  assert.equal(packDestination({ project: false, home }), "/h/.archon/workflows");
  const self = plan({ targets: ["portable"], project: true, packs: true, cwd: REPO, home, env });
  assert.equal(self.steps.some((s) => s.kind === "packs"), false);
  assert.ok(self.notes.includes("packs: this checkout already holds the packs; nothing to copy"));
});

test("updateConfigBlock appends once, replaces in place, and removes cleanly", () => {
  const original = 'model = "gpt-5"\n';
  const first = updateConfigBlock(original, "[agents.a]\nconfig_file = \"./agents/a.toml\"\n");
  assert.match(first, /^model = "gpt-5"\n\n# >>> MarkTripoli\/skills workers[^\n]*\n\[agents\.a\]\nconfig_file = "\.\/agents\/a\.toml"\n# <<< MarkTripoli\/skills workers\n$/);
  const second = updateConfigBlock(`${first}\n[other]\nx = 1\n`, "[agents.b]\nconfig_file = \"./agents/b.toml\"\n");
  assert.equal(second.split("# >>>").length, 2, "one managed block");
  assert.ok(second.includes("[agents.b]") && !second.includes("[agents.a]"));
  assert.ok(second.endsWith("\n[other]\nx = 1\n"), "content after the block survives");
  assert.equal(updateConfigBlock(first, null), original);
  assert.equal(updateConfigBlock("", null), "");
});

test("apply installs every target into a home directory and uninstall leaves only what was there before", () => {
  const home = tmpdir("skills-install-home-");
  fs.mkdirSync(path.join(home, ".codex"));
  fs.writeFileSync(path.join(home, ".codex", "config.toml"), 'model = "gpt-5"\n');
  fs.mkdirSync(path.join(home, ".claude", "skills", "mine"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "skills", "mine", "SKILL.md"), "---\nname: mine\ndescription: x\n---\n");
  fs.mkdirSync(path.join(home, ".archon", "workflows", "mine"), { recursive: true });
  fs.writeFileSync(path.join(home, ".archon", "workflows", "mine", "mine.yaml"), "name: mine\n");
  const targets = ["claude-code", "codex", "oh-my-pi", "pi"];
  const planned = plan({ targets, project: false, packs: true, cwd: home, home, env });
  // The installer's own build step: the plan also carries the `retired` removal step, whose pseudo-target is no runtime.
  const built = buildTrees(planned, tmpdir());
  assert.deepEqual([...built.keys()].sort(), [...targets, "packs"].sort(), "one tree per runtime plus the canonical copy the packs read; nothing for the retired step");
  apply(planned, { built, uninstall: false, home });

  const count = scanSkills(path.join(REPO, "skills")).skills.length;
  assert.equal(fs.readdirSync(path.join(home, ".claude", "skills")).length, count + 1, "existing skills stay");
  assert.equal(fs.readdirSync(path.join(home, ".claude", "agents")).length, 7);
  assert.ok(fs.readFileSync(path.join(home, ".pi", "agent", "skills", "create-plan", "SKILL.md"), "utf8").includes("Runtime: Pi."));
  assert.ok(fs.readFileSync(path.join(home, ".agents", "skills", "create-plan", "SKILL.md"), "utf8").includes("Runtime: Codex."));
  const config = fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
  assert.ok(config.startsWith('model = "gpt-5"\n') && config.includes("[agents.agent-implementer]"));
  // Both pack flavors land beside existing workflows; the native full pack is byte-identical to the source.
  assert.deepEqual(fs.readdirSync(path.join(home, ".archon", "workflows")).sort(), ["delivery", "delivery-omp", "mine"]);
  assert.equal(
    fs.readFileSync(path.join(home, ".archon", "workflows", "delivery", "full", "delivery-full.yaml"), "utf8"),
    fs.readFileSync(path.join(REPO, ".archon", "workflows", "delivery", "full", "delivery-full.yaml"), "utf8"),
  );
  assert.ok(fs.existsSync(path.join(home, ".archon", "workflows", "delivery-omp", "full", "delivery-full-omp.yaml")));
  const partial = plan({ targets: ["codex"], project: false, packs: false, uninstall: true, cwd: home, home, env });
  assert.equal(partial.steps.some((s) => s.kind === "skills" && s.to === path.join(home, ".agents", "skills")), false);
  assert.ok(partial.notes.includes("packs: kept, so the ~/.agents/skills copy they read stays too"));
  apply(partial, { built, uninstall: true, home });
  assert.ok(fs.existsSync(path.join(home, ".agents", "skills", "create-plan", "SKILL.md")), "partial uninstall keeps the packs' skills");
  assert.ok(fs.existsSync(path.join(home, ".archon", "workflows", "delivery", "full", "delivery-full.yaml")), "partial uninstall keeps the packs");
  if (ARCHON) {
    // Archon reads ~/.archon/workflows from HOME and needs a git repository as cwd.
    const project = tmpdir("skills-install-project-");
    execFileSync("git", ["init", "-q", project]);
    const listed = JSON.parse(execFileSync(ARCHON, ["workflow", "list", "--cwd", project, "--json"], { encoding: "utf8", env: { ...process.env, HOME: home, DO_NOT_TRACK: "1" }, stdio: ["ignore", "pipe", "ignore"], timeout: 120000 }));
    const delivery = listed.workflows.filter((w) => w.name.startsWith("delivery-"));
    assert.deepEqual(delivery.map((w) => w.name).sort(), listNative().flatMap(({ dir }) => [`delivery-${dir}`, `delivery-${dir}-omp`]).sort(), "the installed packs load from the home directory");
    assert.deepEqual(delivery.filter((w) => w.parseWarnings?.length).map((w) => w.name), []);
    assert.deepEqual(listed.errors.filter((e) => e.filename.startsWith("delivery")), []);
  } else {
    console.log("# no archon 0.10+ on PATH: skipping the installed-packs listing");
  }

  const ompOnly = plan({ targets: ["oh-my-pi"], project: false, packs: true, cwd: home, home, env });
  const ompWork = tmpdir();
  buildRuntime("oh-my-pi", path.join(ompWork, "oh-my-pi"));
  fs.mkdirSync(path.join(ompWork, "packs", "skills"), { recursive: true });
  for (const skill of scanSkills(path.join(REPO, "skills")).skills) fs.cpSync(skill.dir, path.join(ompWork, "packs", "skills", skill.name), { recursive: true });
  const ompBuilt = new Map([["oh-my-pi", path.join(ompWork, "oh-my-pi")], ["packs", path.join(ompWork, "packs")]]);
  apply(ompOnly, { built: ompBuilt, uninstall: false, home });
  assert.deepEqual(fs.readdirSync(path.join(home, ".archon", "workflows")).sort(), ["delivery-omp", "mine"]);

  apply(planned, { built, uninstall: true, home });
  assert.deepEqual(fs.readdirSync(path.join(home, ".claude", "skills")), ["mine"]);
  assert.equal(fs.readdirSync(path.join(home, ".claude", "agents")).length, 0);
  assert.equal(fs.readdirSync(path.join(home, ".agents", "skills")).length, 0);
  assert.deepEqual(fs.readdirSync(path.join(home, ".archon", "workflows")), ["mine"]);
  assert.equal(fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8"), 'model = "gpt-5"\n');
  // A config.toml the installer created is removed again once its block is gone; a foreign one is kept.
  const bare = tmpdir("skills-install-bare-");
  const bareStep = { target: "codex", kind: "config", to: path.join(bare, ".codex", "config.toml") };
  apply({ steps: [bareStep], notes: [] }, { built, uninstall: false, home: bare });
  assert.ok(fs.readFileSync(bareStep.to, "utf8").includes("[agents."));
  apply({ steps: [bareStep], notes: [] }, { built, uninstall: true, home: bare });
  assert.ok(!fs.existsSync(bareStep.to), "an empty config file is not left behind");
  apply({ steps: [bareStep], notes: [] }, { built, uninstall: true, home: bare });
  assert.ok(!fs.existsSync(path.join(bare, ".codex")) || fs.readdirSync(path.join(bare, ".codex")).length === 0, "uninstall creates nothing");
});
