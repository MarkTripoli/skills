#!/usr/bin/env node
// Emits a runtime-specific install tree from the canonical skills.
// Usage: node scripts/build-runtimes.mjs --runtime <claude-code|codex|oh-my-pi> [--dest <dir>]
// Output: <dest>/skills/<name>/ (SKILL.md with the runtime's notes inserted after line 6),
//         <dest>/agents/ (one worker definition per agent-* skill in the runtime's format),
//         codex only: skills/<name>/agents/openai.yaml and <dest>/config.snippet.toml.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSkills } from "./lib/layout.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const runtime = option("--runtime");
const RUNTIMES = ["claude-code", "codex", "oh-my-pi"];
if (!runtime || !RUNTIMES.includes(runtime)) {
  console.error(`usage: node scripts/build-runtimes.mjs --runtime <${RUNTIMES.join("|")}> [--dest <dir>]`);
  process.exit(1);
}
const dest = path.resolve(option("--dest") ?? path.join(repoRoot, "dist", runtime));

const runtimeFile = path.join(repoRoot, "runtimes", `${runtime}.md`);
if (!fs.existsSync(runtimeFile)) {
  console.error(`missing runtime adapter ${path.relative(repoRoot, runtimeFile)}`);
  process.exit(1);
}

const adapter = parseAdapter(fs.readFileSync(runtimeFile, "utf8"), runtimeFile);

function parseAdapter(content, file) {
  const title = /^# (.+)$/m.exec(content)?.[1]?.trim();
  const sections = [];
  for (const line of content.split("\n")) {
    if (line.startsWith("## ")) sections.push([line.slice(3).trim(), []]);
    else if (sections.length > 0) sections[sections.length - 1][1].push(line);
  }
  for (const section of sections) section[1] = section[1].join("\n").trim();
  const names = sections.map(([name]) => name);
  if (!title || names.join("|") !== "Skill notes|Install") {
    console.error(`${path.relative(repoRoot, file)}: expected an H1 title and exactly two H2 sections, "Skill notes" then "Install" (found ${names.join(", ") || "none"})`);
    process.exit(1);
  }
  const notes = sections[0][1];
  const noteLines = notes.split("\n").length;
  if (noteLines > 12) {
    console.error(`${path.relative(repoRoot, file)}: Skill notes must be at most 12 lines (found ${noteLines})`);
    process.exit(1);
  }
  return { title, notes };
}

function parseSkill(file) {
  const content = fs.readFileSync(file, "utf8");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!fm) throw new Error(`${file}: missing frontmatter`);
  const name = /^name:\s*(.*)$/m.exec(fm[1])?.[1]?.trim();
  const description = /^description:\s*(.*)$/m.exec(fm[1])?.[1]?.trim();
  if (!name || !description) throw new Error(`${file}: frontmatter needs name and description`);
  return { content, name, description, body: content.slice(fm[0].length) };
}

function titleCase(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// The purpose sentence: drop the trigger prefix ("Run for /x requests." or "Child worker role.").
function shortDescription(text, max = 80) {
  const purpose = text.replace(/^(?:Run for \/[a-z0-9-]+ requests\.|Child worker role\.)\s*/, "");
  const sentence = purpose.split(/(?<=\.)\s/)[0].trim();
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}.`;
}

function yamlString(value) {
  return JSON.stringify(value);
}

function tomlString(value) {
  return JSON.stringify(value);
}

function tomlMultiline(value) {
  return `"""\n${value.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')}\n"""`;
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, "skills"), { recursive: true });
fs.mkdirSync(path.join(dest, "agents"), { recursive: true });

const skillsDir = path.join(repoRoot, "skills");
const layout = scanSkills(skillsDir);
if (layout.problems.length) {
  for (const problem of layout.problems) console.error(`${path.relative(repoRoot, problem.path)}: ${problem.message}`);
  process.exit(1);
}
const skillNames = layout.skills.map((s) => s.name);
const sourceOf = new Map(layout.skills.map((s) => [s.name, s.dir]));

const snippet = [];
let workers = 0;

for (const name of skillNames) {
  const source = sourceOf.get(name);
  const target = path.join(dest, "skills", name);
  fs.cpSync(source, target, { recursive: true, filter: (src) => path.basename(src) !== ".DS_Store" });

  const skill = parseSkill(path.join(source, "SKILL.md"));
  const lines = skill.content.split("\n");
  if (lines.length < 7 || lines[6] !== "") throw new Error(`${name}/SKILL.md: expected line 6 to be the shared sentence followed by a blank line`);
  const inserted = [...lines.slice(0, 6), "", `Runtime: ${adapter.title}.`, adapter.notes, ...lines.slice(6)];
  fs.writeFileSync(path.join(target, "SKILL.md"), inserted.join("\n"));

  if (runtime === "codex") {
    fs.mkdirSync(path.join(target, "agents"), { recursive: true });
    const yaml = [
      "interface:",
      `  display_name: ${yamlString(titleCase(name))}`,
      `  short_description: ${yamlString(shortDescription(skill.description))}`,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(target, "agents", "openai.yaml"), yaml);
  }

  if (!name.startsWith("agent-")) continue;
  workers += 1;
  const body = skill.body.trim();
  if (runtime === "claude-code" || runtime === "oh-my-pi") {
    const agent = ["---", `name: ${name}`, `description: ${skill.description}`, "---", "", body, ""].join("\n");
    fs.writeFileSync(path.join(dest, "agents", `${name}.md`), agent);
  } else {
    const toml = [
      `name = ${tomlString(name)}`,
      `description = ${tomlString(skill.description)}`,
      `developer_instructions = ${tomlMultiline(body)}`,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(dest, "agents", `${name}.toml`), toml);
    snippet.push(`[agents.${name}]`, `config_file = "./agents/${name}.toml"`, "");
  }
}

if (runtime === "codex") {
  fs.writeFileSync(path.join(dest, "config.snippet.toml"), snippet.join("\n"));
}

console.log(`built ${runtime}: ${skillNames.length} skills, ${workers} workers -> ${dest}`);
