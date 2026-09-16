import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plan, apply, destinations, detectTargets, updateConfigBlock } from "../scripts/install.mjs";
import { buildRuntime } from "../scripts/lib/build.mjs";
import { scanSkills } from "../scripts/lib/layout.mjs";

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

const env = { PATH: "" };

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
  assert.deepEqual(destinations("oh-my-pi", { project: true, cwd: "/p", home, env }), { skills: "/p/.omp/skills", agents: "/p/.omp/agents", extension: "/p/.omp/extensions/run-task" });
  assert.deepEqual(destinations("pi", { project: false, home, env }), { skills: "/h/.pi/agent/skills", extension: "/h/.pi/agent/extensions/run-task" });
  assert.deepEqual(destinations("portable", { project: true, cwd: "/p", home, env }), { skills: "/p/.agents/skills" });
});

test("plan: codex and portable share ~/.agents/skills, so the portable copy is skipped with a note; project scope drops codex workers", () => {
  const home = "/h";
  const both = plan({ targets: ["codex", "portable"], project: false, extension: true, cwd: "/p", home, env });
  assert.deepEqual(both.steps.map((s) => `${s.target}:${s.kind}`), ["codex:skills", "codex:agents", "codex:config"]);
  assert.match(both.notes[0], /portable: skills directory ~\/.agents\/skills is already written by codex/);
  const project = plan({ targets: ["codex", "oh-my-pi"], project: true, extension: false, cwd: "/p", home, env });
  assert.deepEqual(project.steps.map((s) => `${s.target}:${s.kind}`), ["codex:skills", "oh-my-pi:skills", "oh-my-pi:agents"]);
  assert.match(project.notes[0], /codex: worker definitions .* user-level/);
  assert.equal(project.steps[0].names.length, scanSkills(path.join(REPO, "skills")).skills.length);
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
  const targets = ["claude-code", "codex", "oh-my-pi", "pi"];
  const planned = plan({ targets, project: false, extension: true, cwd: home, home, env });
  const work = tmpdir();
  const built = new Map();
  for (const target of targets) {
    buildRuntime(target, path.join(work, target));
    built.set(target, path.join(work, target));
  }
  apply(planned, { built, uninstall: false, home });

  const count = scanSkills(path.join(REPO, "skills")).skills.length;
  assert.equal(fs.readdirSync(path.join(home, ".claude", "skills")).length, count + 1, "existing skills stay");
  assert.equal(fs.readdirSync(path.join(home, ".claude", "agents")).length, 7);
  assert.ok(fs.readFileSync(path.join(home, ".pi", "agent", "skills", "create-plan", "SKILL.md"), "utf8").includes("Runtime: Pi."));
  assert.ok(fs.readFileSync(path.join(home, ".agents", "skills", "create-plan", "SKILL.md"), "utf8").includes("Runtime: Codex."));
  assert.ok(fs.existsSync(path.join(home, ".omp", "agent", "extensions", "run-task", "index.js")));
  assert.ok(fs.existsSync(path.join(home, ".pi", "agent", "extensions", "run-task", "index.js")));
  const config = fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
  assert.ok(config.startsWith('model = "gpt-5"\n') && config.includes("[agents.agent-implementer]"));
  // The copied extension finds the skills installed beside it.
  const rel = path.relative(path.join(home, ".pi", "agent", "extensions", "run-task"), path.join(home, ".pi", "agent", "skills"));
  assert.equal(rel, "../../skills");

  apply(planned, { built, uninstall: true, home });
  assert.deepEqual(fs.readdirSync(path.join(home, ".claude", "skills")), ["mine"]);
  assert.equal(fs.readdirSync(path.join(home, ".claude", "agents")).length, 0);
  assert.equal(fs.readdirSync(path.join(home, ".agents", "skills")).length, 0);
  assert.equal(fs.existsSync(path.join(home, ".omp", "agent", "extensions", "run-task")), false);
  assert.equal(fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8"), 'model = "gpt-5"\n');
});
