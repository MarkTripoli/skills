#!/usr/bin/env node
// Keeps the Claude Code plugin in step with the collection: copies package.json's version into
// .claude-plugin/plugin.json, lists every non-worker skill directory in its `skills` array, and regenerates
// agents/<agent-*>.md (Claude Code's agent format, picked up from the default `agents/` directory) from the
// worker skills. Runs as part of `npm run version`, right after `changeset version`. With --check it changes
// nothing and exits 1 when anything is out of date.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkill, repoRoot } from "./lib/build.mjs";
import { scanSkills } from "./lib/layout.mjs";

const check = process.argv.includes("--check");
const pluginPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
const agentsDir = path.join(repoRoot, "agents");

const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const layout = scanSkills(path.join(repoRoot, "skills"));
if (layout.problems.length) {
  for (const problem of layout.problems) console.error(`${path.relative(repoRoot, problem.path)}: ${problem.message}`);
  process.exit(1);
}

// Expected state ------------------------------------------------------------------------------

const plugin = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
const workers = layout.skills.filter((s) => s.name.startsWith("agent-"));
const expectedPlugin = {
  ...plugin,
  version,
  skills: layout.skills.filter((s) => !s.name.startsWith("agent-")).map((s) => `./${path.relative(repoRoot, s.dir).split(path.sep).join("/")}`),
};
delete expectedPlugin.agents;
const expectedAgents = new Map(
  workers.map((s) => {
    const skill = parseSkill(path.join(s.dir, "SKILL.md"));
    return [`${s.name}.md`, ["---", `name: ${s.name}`, `description: ${skill.description}`, "---", "", skill.body.trim(), ""].join("\n")];
  }),
);

// Diff -------------------------------------------------------------------------------------------

const changes = [];
const pluginText = `${JSON.stringify(expectedPlugin, null, 2)}\n`;
if (fs.readFileSync(pluginPath, "utf8") !== pluginText) {
  changes.push(plugin.version !== version ? `plugin.json version ${plugin.version} -> ${version}` : "plugin.json skills list");
}
const existingAgents = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")) : [];
for (const [file, content] of expectedAgents) {
  const full = path.join(agentsDir, file);
  if (!fs.existsSync(full) || fs.readFileSync(full, "utf8") !== content) changes.push(`agents/${file}`);
}
for (const file of existingAgents) if (!expectedAgents.has(file)) changes.push(`remove agents/${file}`);

if (changes.length === 0) {
  console.log(`plugin in sync (version ${version}, ${expectedPlugin.skills.length} skills, ${expectedAgents.size} agents)`);
  process.exit(0);
}
if (check) {
  console.error(`plugin out of date: ${changes.join(", ")}. Run \`npm run sync-plugin\`.`);
  process.exit(1);
}

// Apply ------------------------------------------------------------------------------------------

fs.writeFileSync(pluginPath, pluginText);
fs.mkdirSync(agentsDir, { recursive: true });
for (const [file, content] of expectedAgents) fs.writeFileSync(path.join(agentsDir, file), content);
for (const file of existingAgents) if (!expectedAgents.has(file)) fs.rmSync(path.join(agentsDir, file));
console.log(`plugin updated: ${changes.join(", ")}`);
