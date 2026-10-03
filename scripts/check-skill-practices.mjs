#!/usr/bin/env node
// Checks every skill under skills/ against the deterministic subset of Anthropic's skill authoring
// guidance (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices; section names in the messages).
// Usage: node scripts/check-skill-practices.mjs [--json] [--root <dir>]
// Exit 1 with one `path:line: <rule id>: <message> (<guidance section>)` per failure.
// Judgment rules no script can check (conciseness, degrees of freedom, examples) live in
// skills/author-skill/references/rules.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { scanSkills } from "./lib/layout.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Skills with no scenario of their own in evals/scenarios/, each with the reason.
export const EVAL_EXEMPT = {
  "land-pr-stack": "live forge merge chain",
  "extract-figma-visuals": "needs a Figma MCP server the harness cannot stub",
  "video-iterative-development": "requires authenticated application services and real Android Patrol/device recording",
  "video-iterative-orchestration": "requires a live ticket queue, isolated repository worktrees and device-backed implementation workers",
  "agent-web-search-researcher": "needs live web access",
};

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const UNIT = "(?!\\s*(?:ms|s|bytes|tokens|characters|lines|words|px)\\b)";
const TIME_SENSITIVE = new RegExp(`\\b${MONTH}\\.?,?\\s+(?:\\d{1,2},?\\s+)?20\\d\\d\\b|\\b(?:as of|before|after|until|since)\\s+20\\d\\d\\b${UNIT}`, "i");
const EMPHASIS = /\b(?:MUST|CRITICAL|IMPORTANT|NEVER|ALWAYS)\b/;
const XML_TAG = /<\/?[A-Za-z][^>]*>/;
const FIRST_PERSON = [/\bI\b(?![./])/, /\b(?:you|your|we|our)\b/i];
// Backslash path segments: a file with an extension, or three segments.
const WINDOWS_PATH = /[\w.-]+\\[\w-][\w.-]*\.[A-Za-z0-9]{1,5}\b|[\w.-]+\\[\w-][\w.-]*\\[\w-][\w.-]*/;
const TEST_FILE = /^(?:test_.*|.*\.test\..*|test-.*)$/;
// Answer and artifact templates are copied into artifacts, so a contents list would land in every artifact.
const TEMPLATE_FILE = /(?:_template|_answer)\.md$/;

const walk = (dir) =>
  !fs.existsSync(dir)
    ? []
    : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.name.startsWith(".") || e.name === "__pycache__") return [];
        return e.isDirectory() ? walk(full) : [full];
      });

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// Lines outside code fences, as [lineNumber, text].
function proseLines(text) {
  const out = [];
  let fence = null;
  text.split("\n").forEach((line, i) => {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!fence) fence = m[1];
      else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return;
    }
    if (!fence) out.push([i + 1, line]);
  });
  return out;
}

function parseSkill(dir) {
  const text = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const fmLines = fm ? fm[1].split("\n") : [];
  const field = (key) => {
    const i = fmLines.findIndex((l) => l.startsWith(`${key}:`));
    if (i === -1) return { value: "", line: 1 };
    const value = fmLines[i].slice(key.length + 1).trim().replace(/^(["'])([\s\S]*)\1$/, "$2");
    return { value, line: i + 2 };
  };
  const bodyStart = fm ? fm[0].split("\n").length - 1 : 0;
  return { text, name: field("name"), description: field("description"), body: text.split("\n").slice(bodyStart) };
}

function checkTimeSensitive(text, add) {
  let details = 0;
  let oldLevel = null;
  let fence = false;
  text.split("\n").forEach((line, i) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fence = !fence;
    else if (fence) return;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      if (oldLevel !== null && heading[1].length <= oldLevel) oldLevel = null;
      if (/old patterns/i.test(heading[2])) oldLevel = heading[1].length;
    }
    details += (line.match(/<details\b/gi) || []).length;
    const m = TIME_SENSITIVE.exec(line);
    if (m && details === 0 && oldLevel === null) add(i + 1, "time-sensitive", `"${m[0]}" will become outdated; state the current rule, or move history into <details> under an "Old patterns" heading`, "Avoid time-sensitive information");
    details -= (line.match(/<\/details>/gi) || []).length;
    if (details < 0) details = 0;
  });
}

function checkSkill(skill, rel, add) {
  const { dir } = skill;
  const p = parseSkill(dir);
  const skillMd = path.join(dir, "SKILL.md");
  const at = (file) => (line, rule, message, section) => add(rel(file), line, rule, message, section);
  const here = at(skillMd);

  // frontmatter must parse as YAML: runtimes load it with a YAML parser, so a stray ": " in a plain value drops the skill
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(p.text);
  try {
    const data = fm ? parseYaml(fm[1]) : null;
    if (!data || typeof data.name !== "string" || typeof data.description !== "string") here(1, "frontmatter-yaml", "frontmatter must be YAML with string name and description", "Skill structure");
  } catch (error) {
    here(1, "frontmatter-yaml", `frontmatter is not valid YAML (${error.message.split("\n")[0]}); quote the value or remove ": " from it`, "Skill structure");
  }

  // name
  const { value: name, line: nameLine } = p.name;
  if (name.length > 64) here(nameLine, "name", `name is ${name.length} chars; the maximum is 64`, "Skill structure");
  if (!/^[a-z0-9-]+$/.test(name)) here(nameLine, "name", "name may hold only lowercase letters, digits and hyphens", "Skill structure");
  if (/anthropic|claude/.test(name)) here(nameLine, "name", "name must not contain the reserved words anthropic or claude", "Skill structure");
  if (XML_TAG.test(name)) here(nameLine, "name", "name must not contain XML tags", "Skill structure");

  // description
  const { value: desc, line: descLine } = p.description;
  if (desc.length < 1 || desc.length > 1024) here(descLine, "description", `description is ${desc.length} chars; it must be 1-1024`, "Writing effective descriptions");
  if (XML_TAG.test(desc)) here(descLine, "description", "description must not contain XML tags", "Writing effective descriptions");
  // Quoted phrases are what a user would say, so they may hold "you".
  const unquoted = desc.replace(/"[^"]*"|“[^”]*”/g, "");
  const person = FIRST_PERSON.map((re) => re.exec(unquoted)).find(Boolean);
  if (person) here(descLine, "description", `description must be third person; found "${person[0]}"`, "Writing effective descriptions");

  // body-lines
  if (p.body.at(-1) === "") p.body.pop(); // the trailing newline is not a line
  if (p.body.length >= 500) here(1, "body-lines", `SKILL.md body is ${p.body.length} lines; keep it under 500 and move detail into references/`, "Progressive disclosure patterns");

  // reference files
  const refDir = path.join(dir, "references");
  const linked = walk(refDir).filter((f) => /\.(md|html)$/.test(f)); // scanned for links
  const refs = linked.filter((f) => f.endsWith(".md"));
  const mentioned = new Set([...p.text.matchAll(/references\/([A-Za-z0-9_./-]+)/g)].map((m) => m[1].replace(/\.+$/, "")));
  for (const file of linked) {
    const text = fs.readFileSync(file, "utf8");
    const there = at(file);
    const own = path.relative(refDir, file).split(path.sep).join("/");
    const targets = [
      ...[...text.matchAll(/\]\(([^)#\s]+)/g)].map((m) => ({ index: m.index, target: path.resolve(path.dirname(file), m[1]) })),
      ...[...text.matchAll(/`references\/([A-Za-z0-9_./-]+?)\.?`/g)].map((m) => ({ index: m.index, target: path.join(refDir, m[1]) })),
    ];
    const reported = new Set();
    for (const { index, target } of targets) {
      const sub = path.relative(refDir, target).split(path.sep).join("/");
      if (sub.startsWith("..") && rel(target).split("/").slice(0, -1).includes("references") && fs.existsSync(target) && fs.statSync(target).isFile() && !reported.has(sub)) {
        reported.add(sub);
        there(lineOf(text, index), "nested-reference", `links ${path.relative(dir, target).split(path.sep).join("/")}, a reference of another skill; name that skill or its operation instead of its file, or copy what is needed into this skill's references/`, "Avoid deeply nested references");
        continue;
      }
      if (sub.startsWith("..") || sub === own || reported.has(sub) || !fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
      if (!mentioned.has(sub)) {
        reported.add(sub);
        there(lineOf(text, index), "nested-reference", `links references/${sub}, which SKILL.md does not link; link it from SKILL.md so every reference sits one level deep`, "Avoid deeply nested references");
      }
    }
    if (!file.endsWith(".md")) continue;
    const lines = text.replace(/\n$/, "").split("\n");
    if (lines.length > 100 && !TEMPLATE_FILE.test(file) && !lines.slice(0, 15).some((l) => /^\s*(?:#+\s*)?(?:table of )?contents\b/i.test(l))) {
      there(1, "reference-toc", `${lines.length} lines without a contents list in the first 15 lines`, "Structure longer reference files with table of contents");
    }
  }

  // scripts
  // A script the instructions name is run or read on purpose; a module only such a script imports or sources is its
  // implementation detail, so it is named through that script. Anything else is a file the model cannot tell what to do with.
  const known = [p.text, ...refs.map((f) => fs.readFileSync(f, "utf8"))].join("\n");
  const scripts = walk(path.join(dir, "scripts")).filter((file) => !TEST_FILE.test(path.basename(file)));
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = new Set(scripts.filter((file) => new RegExp(`(?<![\\w.-])${escape(path.basename(file))}(?![\\w-])`).test(known)));
  for (let grew = true; grew; ) {
    grew = false;
    const loaded = [...named].map((file) => fs.readFileSync(file, "utf8")).join("\n");
    for (const file of scripts) {
      if (named.has(file)) continue;
      const fileName = escape(path.basename(file));
      const moduleName = escape(path.basename(file).replace(/\.[^.]+$/, ""));
      // A quoted path ending in the file name (JS import or require, shell source), or a Python import of the module.
      const pathLiteral = new RegExp(`["'\`](?:[^"'\`\\n]*/)?${fileName}["'\`]`);
      const pythonImport = new RegExp(`^\\s*(?:from|import)\\s+${moduleName}\\b`, "m");
      if (pathLiteral.test(loaded) || (file.endsWith(".py") && pythonImport.test(loaded))) {
        named.add(file);
        grew = true;
      }
    }
  }
  for (const file of scripts) {
    if (named.has(file)) continue;
    add(rel(file), 1, "script-intent", `${path.basename(file)} is not named in SKILL.md or a reference, nor loaded by a script that is; say whether to run it or read it`, "Make execution intent clear");
  }

  // markdown content rules
  for (const file of [skillMd, ...refs]) {
    const text = fs.readFileSync(file, "utf8");
    const there = at(file);
    for (const m of text.matchAll(new RegExp(WINDOWS_PATH, "g"))) there(lineOf(text, m.index), "windows-path", `backslash path "${m[0]}"; use forward slashes`, "Avoid Windows-style paths");
    for (const m of text.matchAll(/mcp__[A-Za-z0-9_]+/g)) there(lineOf(text, m.index), "runtime-mcp-name", `"${m[0]}" is runtime-specific; write <server>:<tool>`, "MCP tool references");
    checkTimeSensitive(text, there);
    for (const [line, raw] of proseLines(text)) {
      // Literal quoted strings and inline code may carry the words (quoting a rule, a test fixture).
      const stripped = raw.replace(/`[^`]*`|"[^"]*"|“[^”]*”/g, "");
      const m = EMPHASIS.exec(stripped);
      if (m) there(line, "emphasis", `all-caps "${m[0]}"; state the rule plainly, or back a recurring failure with a check or eval`, "Concise is key");
    }
  }
}

async function scenarioSkills(root) {
  const dir = path.join(root, "evals", "scenarios");
  if (!fs.existsSync(dir)) return null;
  const covered = new Set();
  const errors = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mjs"))) {
    try {
      const scenario = (await import(pathToFileURL(path.join(dir, f)))).default;
      // A phase runs `skill`; a scenario or phase may also name, in `covers`, a skill it exercises through another one
      // (typed-judgment through a grading step, agent-slack-control-plane through /deliver).
      for (const name of scenario?.covers ?? []) covered.add(name);
      for (const phase of scenario?.phases ?? []) {
        if (phase.skill) covered.add(phase.skill);
        for (const name of phase.covers ?? []) covered.add(name);
      }
    } catch (error) {
      errors.push(`evals/scenarios/${f}: cannot import: ${error.message}`);
    }
  }
  return { covered, errors };
}

// Returns { skills: <count>, failures: [{ path, line, rule, message, section }] } for a repository root.
export async function checkSkillPractices(root = repoRoot) {
  const failures = [];
  const rel = (file) => path.relative(root, file).split(path.sep).join("/");
  const add = (file, line, rule, message, section) => failures.push({ path: file, line, rule, message, section });
  const layout = scanSkills(path.join(root, "skills"));
  for (const problem of layout.problems) add(rel(problem.path), 0, "layout", problem.message, "Skill structure");
  for (const skill of layout.skills) checkSkill(skill, rel, add);
  const evals = await scenarioSkills(root);
  if (evals) {
    for (const message of evals.errors) add(message.split(":")[0], 0, "eval-coverage", message, "Build evaluations first");
    for (const skill of layout.skills) {
      if (evals.covered.has(skill.name) || EVAL_EXEMPT[skill.name]) continue;
      add(rel(path.join(skill.dir, "SKILL.md")), 1, "eval-coverage", `no phase in evals/scenarios/ runs or covers ${skill.name}; add a scenario or list it in EVAL_EXEMPT with a reason`, "Build evaluations first");
    }
  }
  return { skills: layout.skills.length, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const root = rootIndex === -1 ? repoRoot : path.resolve(args[rootIndex + 1] ?? "");
  const result = await checkSkillPractices(root);
  if (args.includes("--json")) console.log(JSON.stringify({ ok: result.failures.length === 0, ...result }, null, 2));
  else {
    for (const f of result.failures) console.error(`${f.path}:${f.line}: ${f.rule}: ${f.message} (${f.section})`);
    if (result.failures.length) console.error(`\n${result.failures.length} problem(s) in ${result.skills} skills`);
    else console.log(`ok: ${result.skills} skills`);
  }
  process.exitCode = result.failures.length ? 1 : 0;
}
