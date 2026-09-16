// Builds a runtime-specific install tree from the canonical skills. Used by scripts/build-runtimes.mjs (CLI)
// and scripts/install.mjs (installer). Throws on a malformed adapter or skill; the callers report.
//
// Output: <dest>/skills/<name>/ (SKILL.md with the runtime's notes inserted after line 6),
//         <dest>/agents/ (one worker definition per agent-* skill, in the runtime's format, when it has one),
//         codex only: skills/<name>/agents/openai.yaml and <dest>/config.snippet.toml,
//         runtimes with a runtimes/<runtime>/ directory (oh-my-pi, pi): <dest>/extensions/ copied from it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSkills } from "./layout.mjs";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const RUNTIMES = ["claude-code", "codex", "oh-my-pi", "pi"];

// Worker definition format per runtime; pi has no worker mechanism, so its tree carries none.
export const WORKER_FORMAT = { "claude-code": "md", "oh-my-pi": "md", codex: "toml" };

export function parseAdapter(content, file) {
  const title = /^# (.+)$/m.exec(content)?.[1]?.trim();
  const sections = [];
  for (const line of content.split("\n")) {
    if (line.startsWith("## ")) sections.push([line.slice(3).trim(), []]);
    else if (sections.length > 0) sections[sections.length - 1][1].push(line);
  }
  for (const section of sections) section[1] = section[1].join("\n").trim();
  const names = sections.map(([name]) => name);
  if (!title || names[0] !== "Skill notes" || names[1] !== "Install") {
    throw new Error(`${path.relative(repoRoot, file)}: expected an H1 title and H2 sections "Skill notes" then "Install" first (found ${names.join(", ") || "none"})`);
  }
  const notes = sections[0][1];
  const noteLines = notes.split("\n").length;
  if (noteLines > 12) throw new Error(`${path.relative(repoRoot, file)}: Skill notes must be at most 12 lines (found ${noteLines})`);
  return { title, notes };
}

export function parseSkill(file) {
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
export function shortDescription(text, max = 80) {
  const purpose = text.replace(/^(?:Run for \/[a-z0-9-]+ requests\.|Child worker role\.)\s*/, "");
  const sentence = purpose.split(/(?<=\.)\s/)[0].trim();
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}.`;
}

const quote = (value) => JSON.stringify(value);

function tomlMultiline(value) {
  return `"""\n${value.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')}\n"""`;
}

const noDsStore = (src) => path.basename(src) !== ".DS_Store";

// Returns { skills: [names], workers, extension: <path or null> }.
export function buildRuntime(runtime, dest) {
  if (!RUNTIMES.includes(runtime)) throw new Error(`unknown runtime "${runtime}"; choose one of ${RUNTIMES.join(", ")}`);
  const runtimeFile = path.join(repoRoot, "runtimes", `${runtime}.md`);
  if (!fs.existsSync(runtimeFile)) throw new Error(`missing runtime adapter ${path.relative(repoRoot, runtimeFile)}`);
  const adapter = parseAdapter(fs.readFileSync(runtimeFile, "utf8"), runtimeFile);

  const layout = scanSkills(path.join(repoRoot, "skills"));
  if (layout.problems.length) throw new Error(layout.problems.map((p) => `${path.relative(repoRoot, p.path)}: ${p.message}`).join("\n"));

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, "skills"), { recursive: true });
  if (WORKER_FORMAT[runtime]) fs.mkdirSync(path.join(dest, "agents"), { recursive: true });

  const snippet = [];
  let workers = 0;
  for (const { name, dir: source } of layout.skills) {
    const target = path.join(dest, "skills", name);
    fs.cpSync(source, target, { recursive: true, filter: noDsStore });

    const skill = parseSkill(path.join(source, "SKILL.md"));
    const lines = skill.content.split("\n");
    if (lines.length < 7 || lines[6] !== "") throw new Error(`${name}/SKILL.md: expected line 6 to be the shared sentence followed by a blank line`);
    const inserted = [...lines.slice(0, 6), "", `Runtime: ${adapter.title}.`, adapter.notes, ...lines.slice(6)];
    fs.writeFileSync(path.join(target, "SKILL.md"), inserted.join("\n"));

    if (runtime === "codex") {
      fs.mkdirSync(path.join(target, "agents"), { recursive: true });
      fs.writeFileSync(path.join(target, "agents", "openai.yaml"), ["interface:", `  display_name: ${quote(titleCase(name))}`, `  short_description: ${quote(shortDescription(skill.description))}`, ""].join("\n"));
    }

    if (!name.startsWith("agent-") || !WORKER_FORMAT[runtime]) continue;
    workers += 1;
    const body = skill.body.trim();
    if (WORKER_FORMAT[runtime] === "md") {
      fs.writeFileSync(path.join(dest, "agents", `${name}.md`), ["---", `name: ${name}`, `description: ${skill.description}`, "---", "", body, ""].join("\n"));
    } else {
      fs.writeFileSync(path.join(dest, "agents", `${name}.toml`), [`name = ${quote(name)}`, `description = ${quote(skill.description)}`, `developer_instructions = ${tomlMultiline(body)}`, ""].join("\n"));
      snippet.push(`[agents.${name}]`, `config_file = "./agents/${name}.toml"`, "");
    }
  }

  if (runtime === "codex") fs.writeFileSync(path.join(dest, "config.snippet.toml"), snippet.join("\n"));

  // A runtime's extension ships beside the skills it drives; it finds them at ../../skills from its own directory.
  const extensionSource = path.join(repoRoot, "runtimes", runtime);
  let extension = null;
  if (fs.existsSync(extensionSource)) {
    extension = path.join(dest, "extensions");
    fs.cpSync(extensionSource, extension, { recursive: true, filter: noDsStore });
  }

  return { skills: layout.skills.map((s) => s.name), workers, extension };
}
