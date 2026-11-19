#!/usr/bin/env node
// Diagnoses one skill directory, or every skill under a directory, against the mechanical part of the published
// Agent Skills authoring guidance. Reads only; writes nothing. Node.js built-in modules only.
// Usage: node doctor.mjs <skill-dir | directory of skills> [--json]
// Prints one finding per line as `<severity> <rule> <file>:<line> <message>`, then a summary.
// Exit 0 with no error findings, 1 with at least one error, 2 for a bad argument.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keys every skill host accepts. Any other key is a hard error on upload to hosts outside Claude Code.
const PORTABLE_KEYS = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
// Keys only Claude Code reads.
const CLAUDE_CODE_KEYS = new Set(["when_to_use", "argument-hint", "arguments", "disable-model-invocation", "user-invocable", "disallowed-tools", "model", "effort", "context", "agent", "background", "hooks", "paths", "shell"]);
const NAME_MAX = 64; // platform limit on `name`
const DESCRIPTION_MAX = 1024; // platform limit on `description`
const LISTING_MAX = 1536; // Claude Code truncates description + when_to_use here in the skill listing
const BODY_MAX_LINES = 500; // guidance: keep SKILL.md under 500 lines
const COMPACTION_TOKENS = 5000; // after compaction Claude Code keeps the first 5,000 tokens of an invoked skill
const CHARS_PER_TOKEN = 4; // rough English average, good enough for a warning
const REFERENCE_TOC_LINES = 100; // guidance: a reference longer than this needs a table of contents
const TOC_WITHIN = 15; // lines from the top in which the contents list must appear
const VAGUE_NAMES = /^(?:helpers?|utils?|tools?|documents?|data|files?|misc)$/;
const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".html", ".css", ".csv", ".xml", ".toml", ".mjs", ".js", ".cjs", ".ts", ".py", ".sh", ".rb", ".go"]);
const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const TIME_SENSITIVE = new RegExp(`\\b${MONTH}\\.?,?\\s+(?:\\d{1,2},?\\s+)?20\\d\\d\\b|\\b(?:as of|until|since)\\s+20\\d\\d\\b`, "i");
const EMPHASIS = /\b(?:MUST|CRITICAL|IMPORTANT|NEVER|ALWAYS)\b/;
const WINDOWS_PATH = /[\w.-]+\\[\w-][\w.-]*\.[A-Za-z0-9]{1,5}\b/;
const FIRST_PERSON = /\bI\b(?![./])|\b(?:you|your|we|our)\b/i;
const TRIGGER = /\b(?:use (?:when|for|this|it)|when (?:the user|a user|asked|working)|triggers? on)\b/i;

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

// Lines outside code fences, as [lineNumber, text].
function proseLines(text) {
  const out = [];
  let fence = null;
  text.split("\n").forEach((line, i) => {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length) fence = null;
      return;
    }
    if (!fence) out.push([i + 1, line]);
  });
  return out;
}

// Top-level frontmatter keys with their text values and line numbers. Folded and quoted scalars are joined to one
// string; nested maps and lists keep their raw text, which is all the checks below need.
export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const keys = new Map();
  let current = null;
  text.slice(4, end).split("\n").forEach((line, i) => {
    const top = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (top) {
      current = top[1];
      keys.set(current, { value: (top[2] ?? "").trim(), line: i + 2 });
    } else if (current && /^\s+\S/.test(line)) {
      const entry = keys.get(current);
      entry.value = `${entry.value.replace(/^[>|][+-]?$/, "")} ${line.trim()}`.trim();
    }
  });
  for (const entry of keys.values()) entry.value = entry.value.replace(/^(["'])([\s\S]*)\1$/, "$2");
  return { keys, bodyStart: text.slice(0, end + 4).split("\n").length };
}

// Returns the findings for one skill directory: [{ severity, rule, file, line, message }].
export function diagnoseSkill(dir) {
  const findings = [];
  const skillMd = path.join(dir, "SKILL.md");
  const relative = (file) => path.relative(dir, file).split(path.sep).join("/");
  const add = (severity, rule, file, line, message) => findings.push({ severity, rule, file: relative(file), line, message });
  if (!fs.existsSync(skillMd)) {
    add("error", "structure", skillMd, 0, "no SKILL.md in this directory; the file name is case-sensitive");
    return findings;
  }
  const text = fs.readFileSync(skillMd, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) {
    add("error", "frontmatter", skillMd, 1, "frontmatter must start on line 1 with --- and close with ---; without it the skill loads with no name or description");
    return findings;
  }
  const dirName = path.basename(path.resolve(dir));

  for (const [key, { line }] of fm.keys) {
    if (PORTABLE_KEYS.has(key)) continue;
    if (CLAUDE_CODE_KEYS.has(key)) add("info", "frontmatter-portability", skillMd, line, `"${key}" is read only by Claude Code; uploading this skill to another host rejects it`);
    else add("warning", "frontmatter-unknown", skillMd, line, `"${key}" is not a documented frontmatter field; hosts ignore or reject it`);
  }

  const name = fm.keys.get("name");
  if (!name || !name.value) add("warning", "name", skillMd, name?.line ?? 1, `no name; Claude Code falls back to the directory name "${dirName}" and other hosts reject the skill`);
  else {
    const value = name.value;
    if (value.length > NAME_MAX) add("error", "name", skillMd, name.line, `name is ${value.length} characters; the maximum is ${NAME_MAX}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) add("error", "name", skillMd, name.line, "name may hold only lowercase letters, digits and single hyphens, and may not start or end with a hyphen");
    if (/anthropic|claude/i.test(value)) add("error", "name", skillMd, name.line, `name must not contain the reserved words "anthropic" or "claude"`);
    if (value !== dirName) add("warning", "name", skillMd, name.line, `name "${value}" differs from its directory "${dirName}"; rename one so the command and the folder agree`);
    if (value.split("-").some((part) => VAGUE_NAMES.test(part))) add("info", "name", skillMd, name.line, "name uses a vague word (helper, utils, tools, data, files); name the activity instead");
  }

  const description = fm.keys.get("description");
  if (!description || !description.value) add("error", "description", skillMd, description?.line ?? 1, "no description; the model selects a skill from its description alone");
  else {
    const value = description.value;
    const line = description.line;
    if (value.length > DESCRIPTION_MAX) add("error", "description", skillMd, line, `description is ${value.length} characters; the maximum is ${DESCRIPTION_MAX}`);
    if (/[<>]/.test(value)) add("error", "description", skillMd, line, "description must not contain < or >; use [brackets] for placeholders");
    const person = FIRST_PERSON.exec(value.replace(/"[^"]*"|“[^”]*”/g, ""));
    if (person) add("warning", "description", skillMd, line, `description should be third person; found "${person[0]}" outside a quoted phrase`);
    if (!TRIGGER.test(value)) add("warning", "description", skillMd, line, `description says what the skill does but not when to use it; add "Use when ..." with the words a user would say`);
    const listing = value.length + (fm.keys.get("when_to_use")?.value.length ?? 0);
    if (listing > LISTING_MAX) add("warning", "description", skillMd, line, `description plus when_to_use is ${listing} characters; Claude Code cuts the skill listing at ${LISTING_MAX}`);
  }

  const bodyLines = text.split("\n").slice(fm.bodyStart);
  while (bodyLines.length && bodyLines.at(-1) === "") bodyLines.pop();
  if (bodyLines.length >= BODY_MAX_LINES) add("error", "body-size", skillMd, fm.bodyStart + 1, `SKILL.md body is ${bodyLines.length} lines; keep it under ${BODY_MAX_LINES} and move detail into reference files`);
  const tokens = Math.round(bodyLines.join("\n").length / CHARS_PER_TOKEN);
  if (tokens > COMPACTION_TOKENS) add("warning", "body-size", skillMd, fm.bodyStart + 1, `SKILL.md body is about ${tokens} tokens; after compaction only the first ${COMPACTION_TOKENS} stay in context, so later steps can be lost`);

  // Supporting files: every one is reachable from SKILL.md, every link resolves, references sit one level deep.
  const files = walk(dir).filter((file) => file !== skillMd);
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A file is named by its path, by its file name, or by its directory ("one file per persona in personas/").
  const mentions = (haystack, file) => haystack.includes(relative(file)) || (relative(file).includes("/") && new RegExp(`(?<![\\w.-])${escape(path.dirname(relative(file)))}/(?![\\w.{-])`).test(haystack)) || new RegExp(`(?<![\\w.-])${escape(path.basename(file))}(?![\\w-])`).test(haystack);
  const markdown = [skillMd, ...files.filter((file) => file.endsWith(".md"))];
  const texts = new Map(markdown.map((file) => [file, file === skillMd ? text : fs.readFileSync(file, "utf8")]));
  // Relative links in prose. Links inside code fences and links holding a {placeholder} or <placeholder> are template text.
  const linkTargets = (source) => {
    const prose = new Set(proseLines(source).map(([line]) => line));
    return [...source.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].filter((m) => !/^[a-z][a-z0-9+.-]*:/i.test(m[1]) && !/[{}<>]/.test(m[1]) && prose.has(source.slice(0, m.index).split("\n").length));
  };
  for (const [file, source] of texts) {
    for (const match of linkTargets(source)) {
      const target = path.resolve(path.dirname(file), match[1]);
      const line = source.slice(0, match.index).split("\n").length;
      if (!fs.existsSync(target)) add("error", "broken-link", file, line, `link target ${match[1]} does not exist`);
      else if (file !== skillMd && target.startsWith(path.resolve(dir) + path.sep) && target !== skillMd && target !== file && !mentions(text, target))
        add("warning", "nested-reference", file, line, `links ${relative(target)}, which SKILL.md does not mention; link it from SKILL.md so every file sits one level deep`);
    }
  }
  const named = new Set(files.filter((file) => mentions(text, file)));
  // A file a named file names or loads is reachable through it (a module a script imports, a template a reference fills).
  for (let grew = true; grew; ) {
    grew = false;
    const loaded = [...named].filter((file) => TEXT_EXTENSIONS.has(path.extname(file))).map((file) => fs.readFileSync(file, "utf8")).join("\n");
    for (const file of files) {
      if (named.has(file) || !mentions(loaded, file)) continue;
      named.add(file);
      grew = true;
    }
  }
  for (const file of files) {
    // Code under references/ is a library an installer or a script places there, not a file the model chooses to open.
    if (/^references\/[^/]+\.(?:mjs|js|cjs|py)$/.test(relative(file))) continue;
    if (named.has(file) || /^(?:test[_-].*|.*\.test\..*|LICENSE.*|README\.md)$/i.test(path.basename(file))) continue;
    add("warning", "unreferenced-file", file, 0, "SKILL.md never names this file, so the model cannot know when to read or run it; link it with what it holds, or delete it");
  }
  for (const [file, source] of texts) {
    if (file === skillMd) continue;
    const lines = source.replace(/\n$/, "").split("\n");
    if (lines.length > REFERENCE_TOC_LINES && !/(?:_template|_answer)\.md$/.test(file) && !lines.slice(0, TOC_WITHIN).some((line) => /^\s*(?:#+\s*)?(?:table of )?contents\b/i.test(line)))
      add("warning", "reference-toc", file, 1, `${lines.length} lines with no contents list in the first ${TOC_WITHIN}; a partial read then misses what the file covers`);
  }

  for (const [file, source] of texts) {
    for (const match of source.matchAll(new RegExp(WINDOWS_PATH, "g"))) add("warning", "windows-path", file, source.slice(0, match.index).split("\n").length, `backslash path "${match[0]}"; use forward slashes`);
    for (const match of source.matchAll(/mcp__[A-Za-z0-9_]+/g)) add("info", "mcp-name", file, source.slice(0, match.index).split("\n").length, `"${match[0]}" is one host's spelling; write ServerName:tool_name`);
    for (const [line, raw] of proseLines(source)) {
      const plain = raw.replace(/`[^`]*`|"[^"]*"|“[^”]*”/g, "");
      const dated = TIME_SENSITIVE.exec(plain);
      if (dated) add("warning", "time-sensitive", file, line, `"${dated[0]}" will go stale; state the current rule, or move history under an "Old patterns" heading`);
      const loud = EMPHASIS.exec(plain);
      if (loud) add("info", "emphasis", file, line, `all-caps "${loud[0]}"; current models over-apply shouted rules, so state the rule and its reason plainly`);
    }
  }
  return findings;
}

// Skill directories at or below `target`: the directory itself when it holds SKILL.md, else every descendant that does.
export function findSkills(target) {
  if (fs.existsSync(path.join(target, "SKILL.md"))) return [target];
  return walk(target).filter((file) => path.basename(file) === "SKILL.md").map((file) => path.dirname(file)).sort();
}

export function diagnose(target) {
  const skills = findSkills(target).map((dir) => {
    const fm = fs.existsSync(path.join(dir, "SKILL.md")) ? parseFrontmatter(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")) : null;
    const listing = (fm?.keys.get("description")?.value.length ?? 0) + (fm?.keys.get("when_to_use")?.value.length ?? 0);
    return { skill: path.basename(dir), dir, listingChars: Math.min(listing, LISTING_MAX), findings: diagnoseSkill(dir) };
  });
  // Two skills answering to one name: the later one shadows the earlier on install.
  const byName = new Map();
  for (const entry of skills) byName.set(entry.skill, [...(byName.get(entry.skill) ?? []), entry]);
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const entry of group) entry.findings.push({ severity: "error", rule: "duplicate-name", file: "SKILL.md", line: 0, message: `${group.length} skills share the name "${entry.skill}": ${group.map((g) => g.dir).join(", ")}` });
  }
  const count = (severity) => skills.reduce((n, entry) => n + entry.findings.filter((f) => f.severity === severity).length, 0);
  return { skills, totals: { skills: skills.length, errors: count("error"), warnings: count("warning"), info: count("info"), listingChars: skills.reduce((n, entry) => n + entry.listingChars, 0) } };
}

export function format(result) {
  const out = [];
  for (const entry of result.skills) {
    if (!entry.findings.length) continue;
    out.push(`${entry.skill} (${entry.dir})`);
    const order = { error: 0, warning: 1, info: 2 };
    for (const f of [...entry.findings].sort((a, b) => order[a.severity] - order[b.severity])) out.push(`  ${f.severity} ${f.rule} ${f.file}:${f.line} ${f.message}`);
  }
  const t = result.totals;
  out.push(`${t.skills} skill(s): ${t.errors} error(s), ${t.warnings} warning(s), ${t.info} info`);
  if (t.skills > 1) {
    const top = [...result.skills].sort((a, b) => b.listingChars - a.listingChars).slice(0, 5).map((entry) => `${entry.skill} ${entry.listingChars}`);
    out.push(`skill listing cost: ${t.listingChars} characters of description in every session; largest: ${top.join(", ")}`);
  }
  return out.join("\n");
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const target = args.find((arg) => !arg.startsWith("--"));
  const usage = "Usage: node doctor.mjs <skill-dir | directory of skills> [--json]";
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error(`doctor: ${target ? `"${target}" is not a directory` : "missing the directory to diagnose"}\n${usage}`);
    process.exit(2);
  }
  const result = diagnose(path.resolve(target));
  if (!result.skills.length) {
    console.error(`doctor: no SKILL.md at or below ${target}; pass a skill directory or a directory that contains skills\n${usage}`);
    process.exit(2);
  }
  console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : format(result));
  process.exitCode = result.totals.errors ? 1 : 0;
}
