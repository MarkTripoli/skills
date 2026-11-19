#!/usr/bin/env node
// Checks the Markdown working copy of a technical six-pager RFC, and scores its prose.
// Structure comes from a template (default: ../references/rfc_template.md). Word and sentence rules come from the
// technical-writing skill, which is installed beside this one (../../technical-writing/scripts/score-prose.mjs).
// Usage: node check-rfc.mjs <rfc.md> [--template <template.md>] [--score | --claims | --judge <votes.json>...]
// Prints one `<file>:<line>: <rule>: <message>` per problem; exits 1 when any exist, 2 on a usage or template error.
// With --score the first line is `score: <n>/100`, then the breakdown, then the problems.
// With --judge the first line is `combined: <n>/100 (script <n>, judged <n>)`: the readers' answers to
// ../references/decision_rubric.md, tallied with the score. It exits 0 unless the arguments are wrong.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { needsLogin } from "./check-links.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TEMPLATE = path.join(here, "..", "references", "rfc_template.md");
const SCORER = path.join(here, "..", "..", "technical-writing", "scripts", "score-prose.mjs");
if (!fs.existsSync(SCORER)) {
  console.error(`check-rfc: missing ${SCORER}. Install the technical-writing skill in the same directory as rfc-six-pager (the checker reads its word list and scorer), then rerun.`);
  process.exit(2);
}
const { lintProse, scoreProse, report } = await import(SCORER);
const { runTally } = await import(path.join(path.dirname(SCORER), "judge-tally.mjs"));
export const RUBRIC = path.join(here, "..", "references", "decision_rubric.md");

// The seven body sections every template keeps, in reading order. Together they are the six pages.
export const BODY = ["Decision", "Problem and goals", "Options", "Proposed design", "Cost", "Failure modes and risks", "Outcomes", "Open questions"];
const STATUSES = ["Draft", "In review", "Accepted", "Accepted with changes", "Rejected", "Superseded"];
// Six printed pages of 11-point single-spaced text hold about 500 words each. Tables and code count.
export const BODY_WORD_LIMIT = 3000;
// The opening must fit on a screen: what the team will do, why, and the main cost.
const DECISION_WORD_LIMIT = 250;
// A paragraph past this length hides its claim. Five sentences of 25 words is 125.
const PARAGRAPH_WORD_LIMIT = 125;
// A table cell holds one claim. Past this length the content is a paragraph in the wrong place.
const CELL_WORD_LIMIT = 40;
// The one section where an item may stay open and a limit may be stated.
const OPEN_SECTION = "Open questions";
// A metadata value that says nobody knows. An RFC with no decider or date cannot be decided.
const UNKNOWN = /^(?:unknown|tbd|n\/a|none|not (?:named|known|set|decided|given)\b.*|\?+)$/i;
// Rules of the prose scorer that do not apply here: the readers are engineers, and an acronym they know is not a fault.
const SCORE_ONLY = ["acronym"];
// Problems that mean the RFC is not in the format yet. They hold the score down however clean the prose is.
const FORMAT_RULES = ["title", "metadata", "sections", "page-limit", "decision", "table", "placeholder", "sources"];
const isFormat = (p) => FORMAT_RULES.includes(p.rule);

// A record of how evidence was gathered. The body states the result; revisions and logs go to an appendix.
// A commit hash has at least three letters, which keeps names such as ed25519 out.
const PROVENANCE = /\b(?=(?:\d*[a-f]){3})(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b|\b(?:at|as of|from) (?:revision|commit)\b|\b(?:reported|recorded) results?\b|\bnot (?:re-?run|repeated|re-?checked|audited) for this\b/gi;
// Wording that asks the reader for something. An RFC states the recommendation and asks for nothing.
const ASK = /\b(?:we ask|asks? you|please approve|approve this|approval|we request|seeking|sign[- ]?off)\b/gi;
// Implementation planning. The RFC states outcomes; phases and schedules belong to the tickets.
const PLANNING = /\b(?:phases?|stage \d+|milestones?|sprints?|epics?|story points?|week \d+|(?:engineer|person|people|developer)-(?:weeks?|months?|days?))\b/gi;
const OPEN_ITEM = /\b(?:remains?|stays?|left|kept) (?:still )?(?:open|unresolved|undecided|unsolved|unverified|unestimated|unmeasured|undefined|a follow-up|follow-ups)\b|\b(?:is|are) (?:still |currently )?(?:unresolved|undecided|unsolved|unestimated|unmeasured)\b|\bto be decided\b|\bopen for now\b|\bwill (?:be )?figure[d]? out\b|\bfor future (?:work|discussion|consideration)\b|\b(?:neither|no|none)\b[^.?!\n]{0,40}\bis (?:selected|chosen|committed|decided)\b/gi;
// A statement of absence: a sentence whose content is that a fact is missing. It informs nobody. A fact that a decision
// needs becomes a question in Open questions; any other missing fact is left out. "The key is not stored" is a fact about
// the design, so the participles that can state one (recorded, reported) count only after a noun that names a figure.
const ABSENCE = /\b(?:is|are|was|were|has been|have been|had been|remains?|still) (?:still |currently |yet )?(?:not (?:yet )?(?:measured|known|estimated|counted|quantified)|unknown|unquantified|unrecorded|unreported)\b(?! (?:to|by)\b)|\b(?:has|have|had) not (?:yet )?(?:been )?(?:measured|counted|estimated|quantified)\b|\b(?:nobody|no one|no-one) (?:has |have |had )?(?:counted|measured|tracked|recorded|estimated|quantified)\b|\bno (?:source|document|record|report)s? (?:gives?|states?|holds?|records?|reports?)\b|\bno (?:data|figures?|measurements?|counts?|estimates?) (?:is |are )?(?:available|exists?|yet)\b|\bno data(?= *(?:[.;|]|$))|(?<=\|) *(?:unknown|not (?:yet )?(?:known|measured|recorded|reported|estimated)) *(?=\|)|\b(?:period|date|time|duration|count|number|size|cost|figure|rate|share|source|total|impact|extent)\b[^.?!\n]{0,30}? (?:is|are|was|were|has been|have been) (?:still )?not (?:recorded|reported|tracked|documented|given|stated|available)\b/gi;
// Reassurance: a good outcome claimed without saying what happens. The sentence after it, if any, carries the content.
const REASSURE = /\bnothing (?:breaks|fails|goes wrong|is affected|changes for (?:users|customers))\b|\bno (?:user-facing |customer )?(?:impact|disruption|downtime)\b(?! of \d)|\bworks? (?:as before|fine|normally|as expected)\b|\bwithout (?:any )?(?:issues|problems|disruption|interruption)\b|\b(?:users|customers) (?:will )?(?:not notice|notice nothing)\b/gi;
const BOILERPLATE = /^#+ *(?:go here|click here|see here)\b.*$/i;

// Claims and their sources. A claim is a sentence, list item or table row that gives a number or a size in words. It is
// backed when it cites an entry of `## Sources` as [n], or labels itself an estimate or an assumption. A goal, a limit
// the design sets, or a position the team takes is not a claim about the world, so the words that mark one exempt it.
const SOURCES = "Sources";
const CITE = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;
const CLAIM_SECTIONS = ["Problem and goals", "Options", "Cost", "Outcomes", "Failure modes and risks"];
const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const NOT_A_NUMBER = new RegExp([
  `\\b${MONTH}\\.? \\d{1,2}(?:, \\d{4})?\\b`, `\\b\\d{1,2} ${MONTH} \\d{4}\\b`, `\\b${MONTH} \\d{4}\\b`,
  "\\b(?:19|20)\\d{2}(?:-\\d{2}-\\d{2})?\\b", "\\bQ[1-4]\\b", "\\b[A-Z]{2,}-\\d+\\b",
  "\\b(?:priority|priorities|step|phase|option|question|appendix|section|goal|tenet)s? \\d+(?:(?:,| and| or| to) \\d+)*\\b",
].join("|"), "gi");
// A quantity given as a word in a section the claim check does not read. "the most", "at most" and "at least" are not.
const VAGUE_SECTIONS = ["Decision", "Proposed design", "Outcomes"];
const VAGUE_SIZE = /(?<!\b(?:the|at) )\b(?:most|much|many|few|several|majority|minority)\b/i;
const SIZE_WORD = /\b(?:most|majority|minority|many|few|several|rarely|often|frequently|usually|typically|significantly|much|faster|slower|cheaper|costlier|fewer)\b/i;
const NOT_A_CLAIM = /\b(?:estimate[sd]?|assum(?:e|es|ed|ing|ption)|targets?|goals?|must|at most|at least|limit(?:s|ed)?|we (?:propose|set|choose|accept|ask|recommend|lean))\b/i;
const sentencesOf = (line) => line.split(/(?<=[.!?])\s+(?=[A-Z"(*[`])/);
const clip = (s) => (s.length > 90 ? `${s.slice(0, 87)}...` : s);

// Every claim in the claim sections, with what backs it: [{ line, text, section, cites: [n], backing }], where backing
// is "source", "estimate" (an estimate, assumption, goal or limit) or "none".
export function claims(text, names = CLAIM_SECTIONS) {
  const { sections } = parse(text);
  const found = [];
  for (const s of sections.filter((x) => names.some((n) => same(n, x.name)))) {
    let fenced = false;
    let header = true;
    // The line that introduces a list: the items under "The design must:" are goals, and inherit its exemption.
    let lead = "";
    s.lines.forEach((raw, i) => {
      const line = s.start + i + 1;
      if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; return; }
      if (/^#+ /.test(raw)) lead = "";
      if (fenced || !raw.trim() || /^#+ /.test(raw) || /^\s*>/.test(raw)) { header = true; return; }
      let units;
      let inherited = "";
      if (isRow(raw)) {
        if (isRule(raw)) return;
        if (header) { header = false; return; }
        units = [cells(raw).join(" | ")];
      } else {
        header = true;
        const item = /^\s*(?:[-*+]|\d+[.)])\s+/.test(raw);
        if (item) inherited = lead;
        else lead = raw;
        // A bold label ("**C. Remote evaluation.**") names the item; it is not a sentence of its own.
        units = sentencesOf(raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/\*\*[^*]*\*\*\s*/g, ""));
      }
      for (const unit of units) {
        const plain = unit.replace(/`[^`]*`/g, "").replace(/\*\*[^*]*\*\*/g, "");
        const cites = [...plain.matchAll(CITE)].flatMap((m) => m[1].split(/\s*[,–-]\s*/).map(Number));
        const bare = plain.replace(CITE, "").replace(NOT_A_NUMBER, "");
        if (!/\d/.test(bare) && !SIZE_WORD.test(bare)) continue;
        const backing = cites.length ? "source" : NOT_A_CLAIM.test(plain) || NOT_A_CLAIM.test(inherited) ? "estimate" : "none";
        found.push({ line, text: unit.trim(), section: s.name, cites, backing });
      }
    });
  }
  return found;
}

// The numbered entries of `## Sources`: Map(n -> { line, text }).
function sourceEntries(section) {
  const entries = new Map();
  section.lines.forEach((raw, i) => {
    const m = raw.match(/^\s*(?:(\d+)[.)]|\[(\d+)\])\s+(.*)$/);
    if (m) entries.set(Number(m[1] ?? m[2]), { line: section.start + i + 1, text: m[3] });
  });
  return entries;
}

export const words = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
const isRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isRule = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
// Tables of a section: [{ line, header: [cell], rows: [{ line, cells }] }]. `start` is the 0-based index of the section's first line.
function tables(section) {
  const found = [];
  let table = null;
  section.lines.forEach((line, i) => {
    if (!isRow(line)) { table = null; return; }
    if (!table) { table = { line: section.start + i + 1, header: cells(line), rows: [] }; found.push(table); return; }
    if (!isRule(line)) table.rows.push({ line: section.start + i + 1, cells: cells(line) });
  });
  return found;
}
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const isAppendix = (name) => /^Appendix\b/i.test(name);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// H2 sections of a Markdown text, skipping fenced code so a `## ` inside a fence is not a heading.
export function parse(text) {
  const lines = text.split("\n");
  const sections = [];
  let fenced = false;
  let title = 0;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;
    if (!title && /^# \S/.test(line)) title = i + 1;
    // A leading section number ("## 4. Current state") is tolerated, so a numbered house style still matches the template.
    const h2 = line.match(/^## +(?:\d+[.)]\s+)?(.+?)\s*$/);
    if (h2) sections.push({ name: h2[1], line: i + 1, start: i + 1, end: lines.length });
  });
  sections.forEach((s, i) => { if (sections[i + 1]) s.end = sections[i + 1].line - 1; });
  for (const s of sections) s.lines = lines.slice(s.start, s.end);
  const head = lines.slice(0, sections[0] ? sections[0].line - 1 : lines.length);
  return { lines, sections, title, head };
}

// A template gives the metadata keys, the body sections (the H2 headings up to `## Open questions`), the optional
// sections after it, and the placeholders a finished RFC must not keep. Throws with the fix when the template drops a
// base section.
export function readTemplate(text, name = "template") {
  const { sections, head } = parse(text);
  const end = sections.findIndex((s) => same(s.name, BODY.at(-1)));
  if (end < 0) throw new Error(`${name} has no \`## ${BODY.at(-1)}\` heading; the headings up to it are the body, so the checker cannot tell where the six pages end`);
  const body = sections.slice(0, end + 1).map((s) => s.name);
  let at = -1;
  for (const base of BODY) {
    const i = body.findIndex((n) => same(n, base));
    if (i < 0) throw new Error(`${name} has no \`## ${base}\` before \`## ${BODY.at(-1)}\`; a template may add sections but keeps the ${BODY.length} base sections`);
    if (i < at) throw new Error(`${name} has \`## ${base}\` out of order; keep the base order ${BODY.join(", ")}`);
    at = i;
  }
  return {
    keys: head.map((l) => l.match(/^([A-Z][A-Za-z ]*):\s/)?.[1]).filter(Boolean),
    body,
    after: sections.slice(end + 1).map((s) => s.name).filter((n) => !isAppendix(n)),
    placeholders: [...new Set(text.match(/<[A-Za-z][^<>\n]*>/g) ?? [])],
  };
}

// Everything the checker finds: { problems, scored, bodyWords }. `problems` is what stops an RFC; `scored` is the text
// of the body and the FAQ with every other line blanked, so line numbers match the file.
function inspect(text, { template = fs.readFileSync(DEFAULT_TEMPLATE, "utf8"), templateName = "template" } = {}) {
  const shape = readTemplate(template, templateName);
  const { lines, sections, title, head } = parse(text);
  const problems = [];
  const add = (line, rule, message, extra = {}) => problems.push({ line, rule, message, ...extra });
  const find = (name) => sections.find((s) => same(s.name, name));

  if (!title) add(0, "title", "no `# <title>` line; open the file with the RFC title as the only H1");

  // Metadata sits between the title and the first section.
  const headText = head.join("\n");
  for (const key of shape.keys) {
    const value = headText.match(new RegExp(`^${escape(key)}:[ \\t]*(\\S.*?)\\s*$`, "m"));
    if (!value) add(title, "metadata", `no \`${key}:\` line under the title`);
    else if (UNKNOWN.test(value[1])) add(title, "metadata", `\`${key}: ${value[1]}\` names nothing; ask the author for it, because an RFC without it cannot be decided`);
  }
  const status = headText.match(/^Status:\s*(.+?)\s*$/m);
  if (status && !STATUSES.includes(status[1])) add(title, "metadata", `Status "${status[1]}" is not one of ${STATUSES.join(", ")}`);

  // Section names and order.
  const allowed = [...shape.body, ...shape.after];
  for (const s of sections) {
    if (same(s.name, "Out of scope") && !allowed.some((n) => same(n, s.name))) {
      add(s.line, "sections", "Out of scope is part of Problem and goals; make it `### Out of scope` at the end of that section, so a reader knows what the RFC leaves out before reading the options");
    } else if (!isAppendix(s.name) && !allowed.some((n) => same(n, s.name))) {
      add(s.line, "sections", `"${s.name}" is not a section of the template; place its content under the section whose question it answers (${shape.body.join(", ")}), or move it to an \`## Appendix <letter>: <name>\``);
    }
  }
  let last = 0;
  for (const name of shape.body) {
    const s = find(name);
    if (!s) { add(0, "sections", `missing \`## ${name}\``); continue; }
    if (s.line < last) add(s.line, "sections", `\`## ${name}\` is out of order; the body order is ${shape.body.join(", ")}`);
    last = Math.max(last, s.line);
  }
  const faq = find("FAQ");
  for (const s of sections) {
    if ((isAppendix(s.name) || shape.after.some((n) => same(n, s.name))) && last && s.line < last) {
      add(s.line, "sections", `\`## ${s.name}\` sits inside the six pages; move it after \`## ${shape.body.at(-1)}\``);
    }
  }

  // Page limit.
  const body = shape.body.map(find).filter(Boolean);
  // A diagram replaces prose, so its labels do not count against the page limit; other code blocks do.
  const count = (s) => words(s.lines.join("\n").replace(/^```mermaid\n[\s\S]*?^```$/gm, ""));
  const bodyWords = body.reduce((n, s) => n + count(s), 0);
  if (bodyWords > BODY_WORD_LIMIT) {
    const largest = [...body].sort((a, b) => count(b) - count(a))[0];
    add(body[0].line, "page-limit", `the body is ${bodyWords} words, over the ${BODY_WORD_LIMIT}-word limit for six pages; cut a topic nobody would argue about, then move detail to an appendix, starting with "${largest.name}" (${count(largest)} words)`);
  }

  // The opening: what the team will do, why, and the main cost. It asks for nothing.
  const decision = find("Decision");
  if (decision) {
    const n = words(decision.lines.join("\n"));
    if (!n) add(decision.line, "decision", "the Decision section has no text; state what the team will do, why in a sentence, and the main cost");
    if (n > DECISION_WORD_LIMIT) add(decision.line, "decision", `the Decision section has ${n} words, over the limit of ${DECISION_WORD_LIMIT}; keep what the team will do, why in a sentence and the main cost, and move the reasons to Options`);
  }

  // Tables that must exist, with nothing left blank.
  const need = (name, columns, empty, min = 1) => {
    const s = find(name);
    if (!s) return;
    const t = tables(s).find((x) => columns.every((c) => x.header.some((h) => new RegExp(`^${c}`, "i").test(h))));
    if (!t) {
      if (empty && /^\s*None\b/m.test(s.lines.join("\n"))) return;
      add(s.line, "table", `\`## ${name}\` has no table with the columns ${columns.map((c) => c.replace(/^\(\?:|\)$/g, "").replace("|", " or ")).join(", ")}${empty ? "; write the table, or `None.` when nothing is open" : ""}`);
      return;
    }
    if (t.rows.length < min) add(t.line, "table", `the table in \`## ${name}\` has ${t.rows.length} row${t.rows.length === 1 ? "" : "s"}; it needs at least ${min}`);
    // A proposal is optional: an open question the team has no answer for leaves that cell blank, not "None".
    const optional = t.header.map((h) => /proposal/i.test(h));
    for (const r of t.rows) if (r.cells.length < t.header.length || r.cells.some((c, i) => !c && !optional[i])) add(r.line, "table", `a cell in this row is empty; every ${name.toLowerCase()} row fills ${t.header.filter((_, i) => !optional[i]).join(", ")}`);
  };
  // Every real option in one table, compared on the same goals, so the decider sees why the recommendation wins.
  need("Options", ["Option", "Verdict"], false, 2);
  need("Failure modes and risks", ["(?:Trigger|Risk)", "Effect", "(?:Response|Mitigation)"], false);
  // Open questions are a table with a Question column, a list, or `None.`.
  const open = find(OPEN_SECTION);
  if (open) {
    const listed = open.lines.some((l) => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(l));
    if (!listed) need(OPEN_SECTION, ["Question"], true);
  }

  // Paragraphs and cells short enough to scan.
  for (const s of body) {
    let fenced = false;
    let paragraph = [];
    const flush = (end) => {
      const n = words(paragraph.join(" "));
      if (n > PARAGRAPH_WORD_LIMIT) add(end - paragraph.length + 1, "paragraph", `this paragraph has ${n} words, over ${PARAGRAPH_WORD_LIMIT}; open with its claim, then split it, or turn a comparison into a table and a sequence into a numbered list`, { group: "shapes", weight: 2 });
      paragraph = [];
    };
    s.lines.forEach((line, i) => {
      const at = s.start + i + 1;
      if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; flush(at - 1); return; }
      if (fenced) return;
      if (isRow(line)) {
        flush(at - 1);
        if (!isRule(line)) for (const c of cells(line)) if (words(c) > CELL_WORD_LIMIT) add(at, "cell", `a table cell has ${words(c)} words, over ${CELL_WORD_LIMIT}; a cell holds one claim, so move the reasoning to a sentence below the table`, { group: "shapes", weight: 2 });
        return;
      }
      if (!line.trim() || /^#+ /.test(line) || /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) { flush(at - 1); return; }
      paragraph.push(line);
    });
    flush(s.end);
  }

  // Words and sentence shapes, in the body and the FAQ. The shared rules come from the prose scorer; the rest are
  // specific to an RFC. `sectionAt` maps a line to its section so that a rule can be lifted where it does not apply.
  const scoredSections = [...body, ...(faq ? [faq] : [])];
  const sectionAt = (line) => scoredSections.find((s) => line > s.start && line <= s.end);
  const scored = lines.map((line, i) => (sectionAt(i + 1) ? line : "")).join("\n");
  const applies = (hit) => {
    const s = sectionAt(hit.line);
    if (!s) return false;
    if (SCORE_ONLY.includes(hit.rule)) return false;
    if (hit.rule === "disclaimer" && same(s.name, OPEN_SECTION)) return false;
    return true;
  };
  for (const hit of lintProse(scored).filter(applies)) {
    if (!SCORE_ONLY.includes(hit.rule)) add(hit.line, hit.rule, hit.message);
  }
  const placeholders = shape.placeholders.map((p) => new RegExp(escape(p), "g"));
  for (const s of scoredSections) {
    let inFence = false;
    s.lines.forEach((line, i) => {
      const at = s.start + i + 1;
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence || /^\s*>/.test(line)) return;
      const prose = line.replace(/`[^`]*`/g, "").replace(/"[^"]*"|“[^”]*”/g, "");
      for (const m of prose.matchAll(PROVENANCE)) add(at, "provenance", `"${m[0]}" is a record of how the evidence was gathered; state the result, and put revisions and logs in an appendix`, { group: "claims", weight: 2 });
      if (!same(s.name, OPEN_SECTION) && !same(s.name, "FAQ") && !isRow(line)) {
        for (const m of prose.matchAll(OPEN_ITEM)) add(at, "open-item", `"${m[0]}" leaves an item open outside \`## ${OPEN_SECTION}\`; state the decision here, or move the item to that table as a question`, { group: "claims", weight: 2 });
      }
      if (!same(s.name, OPEN_SECTION)) {
        for (const m of prose.matchAll(REASSURE)) add(at, "reassure", `"${m[0]}" claims a good outcome without saying what happens; state what the system does instead`, { group: "claims", weight: 2 });
        for (const m of prose.matchAll(ABSENCE)) add(at, "absence", `"${m[0]}" says a fact is missing; cut it, or ask it as a question in \`## ${OPEN_SECTION}\` when a decision needs the fact`, { group: "claims", weight: 2 });
      }
      if (!same(s.name, OPEN_SECTION) && !/^\s*#{1,6}\s/.test(line)) {
        for (const m of prose.matchAll(ASK)) add(at, "ask", `"${m[0]}" asks the reader for something; state the recommendation instead, and what it costs`, { group: "claims", weight: 2 });
      }
      for (const m of prose.matchAll(PLANNING)) add(at, "planning", `"${m[0]}" is implementation planning; the RFC states outcomes, and planning goes to the tickets`, { group: "claims", weight: 2 });
      if (BOILERPLATE.test(line)) add(at, "residue", `"${line.trim().slice(0, 60)}" is template boilerplate; delete it or write it as RFC text`, { group: "claims", weight: 3 });
      for (const re of placeholders) {
        for (const m of line.matchAll(re)) add(at, "placeholder", `"${m[0]}" is a template placeholder; fill it in or delete the line`);
      }
    });
  }
  for (const re of placeholders) {
    head.forEach((line, i) => { for (const m of line.matchAll(re)) add(i + 1, "placeholder", `"${m[0]}" is a template placeholder; fill it in`); });
  }

  // Sources: each citation names an entry, each entry is cited and says when, and each claim is backed.
  const sources = find(SOURCES);
  const entries = sources ? sourceEntries(sources) : new Map();
  const cited = new Set();
  // An appendix carries detail moved out of the body, and its claims cite sources the same way.
  for (const s of [...scoredSections, ...sections.filter((x) => isAppendix(x.name))]) {
    let inFence = false;
    s.lines.forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return;
      for (const m of line.replace(/`[^`]*`/g, "").matchAll(CITE)) {
        for (const n of m[1].split(/\s*[,–-]\s*/).map(Number)) {
          cited.add(n);
          if (!entries.has(n)) add(s.start + i + 1, "sources", sources ? `[${n}] cites no entry of \`## ${SOURCES}\`; add entry ${n}, or cite the entry that holds the fact` : `[${n}] is cited but the RFC has no \`## ${SOURCES}\`; add it after \`## ${OPEN_SECTION}\` with one numbered entry for each source`);
        }
      }
    });
  }
  for (const [n, e] of entries) {
    if (/<[A-Za-z][^<>]*>/.test(e.text)) add(e.line, "placeholder", `source ${n} is a template placeholder; name the source or delete the entry`);
    else if (!cited.has(n)) add(e.line, "sources", `source ${n} is never cited; cite it as [${n}] at the claim it backs, or delete it`);
    else if ((e.text.match(/https?:\/\/[^\s,)\]]+/g) ?? []).some(needsLogin)) add(e.line, "sources", `source ${n} links an internal page; give its title and "internal" instead of the URL, because readers outside the team cannot open it and a private page should not be shared`);
    else if (!/\d|\bundated\b/i.test(e.text)) add(e.line, "sources", `source ${n} gives no date or period; say when it was measured or written, or write \`undated\` when the source does not say, so the reader can tell how current it is`);
  }
  for (const c of claims(text, VAGUE_SECTIONS)) {
    const bare = c.text.replace(/`[^`]*`|"[^"]*"|“[^”]*”/g, "").replace(CITE, "").replace(NOT_A_NUMBER, "");
    if (!c.cites.length && !/\d/.test(bare) && VAGUE_SIZE.test(bare)) {
      add(c.line, "claim", `"${clip(c.text)}" gives a size as a word ("${bare.match(VAGUE_SIZE)[0]}"); give the number and cite its source, or leave the size out`, { group: "claims", weight: 1 });
    }
  }
  for (const c of claims(text).filter((x) => x.backing === "none")) {
    add(c.line, "claim", `"${clip(c.text)}" states a fact with no source; cite the entry of \`## ${SOURCES}\` that holds it as [n], label it an estimate with what it rests on, or ask the author for the source`, { group: "claims", weight: 1 });
  }

  problems.sort((a, b) => a.line - b.line);
  return { problems, scored, applies, bodyWords };
}

// Returns [{ line, rule, message }]; line is 1-based, 0 when the problem is the whole file.
export function checkRfc(text, options = {}) {
  return inspect(text, options).problems.map(({ line, rule, message }) => ({ line, rule, message }));
}

// The prose score of the body and the FAQ, with the RFC's own rules counted in. A format problem holds the score down:
// a document that is not yet in the format has not been finished. Returns the scorer's result plus `problems`.
export function scoreRfc(text, options = {}) {
  const { problems, scored, applies, bodyWords } = inspect(text, options);
  const extraHits = problems.filter((p) => p.group).map((p) => ({ line: p.line, rule: p.rule, group: p.group, weight: p.weight, match: "", message: p.message }));
  const result = scoreProse(scored, { extraHits, keep: applies, unfinished: problems.some(isFormat) });
  return { ...result, bodyWords, problems: problems.map(({ line, rule, message }) => ({ line, rule, message })) };
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const t = args.indexOf("--template");
  const templateFile = t >= 0 ? args[t + 1] : DEFAULT_TEMPLATE;
  const j = args.indexOf("--judge");
  const voteFiles = j >= 0 ? args.slice(j + 1).filter((a, i, rest) => !a.startsWith("--") && rest[i - 1] !== "--template") : [];
  const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--template" && !voteFiles.includes(a));
  const usage = "Usage: node check-rfc.mjs <rfc.md> [--template <template.md>] [--score | --claims | --judge <votes.json>... [--json]]";
  if (!file || !fs.existsSync(file)) {
    console.error(`check-rfc: ${file ? `no file at ${file}` : "no file given"}\n${usage}`);
    process.exit(2);
  }
  if (!templateFile || !fs.existsSync(templateFile)) {
    console.error(`check-rfc: ${templateFile ? `no template at ${templateFile}` : "--template needs a path"}\n${usage}`);
    process.exit(2);
  }
  const options = { template: fs.readFileSync(templateFile, "utf8"), templateName: templateFile };
  const text = fs.readFileSync(file, "utf8");
  if (j >= 0) {
    const missing = voteFiles.filter((f) => !fs.existsSync(f));
    if (!voteFiles.length || missing.length) {
      console.error(`check-rfc: ${missing.length ? `no votes file at ${missing.join(", ")}` : "--judge needs at least one votes file"}\n${usage}`);
      process.exit(2);
    }
    try {
      const scored = scoreRfc(text, options);
      console.log(runTally({ file, text, voteFiles, rubricFile: RUBRIC, scriptScore: scored.score, scriptGroups: scored.groups, json: args.includes("--json") }));
    } catch (error) {
      console.error(`check-rfc: ${error.message}`);
      process.exit(2);
    }
    process.exit(0);
  }
  if (args.includes("--claims")) {
    // The claim ledger: every claim with what backs it, so a writer or reviewer can check each one.
    const found = claims(text);
    const label = { source: "source", estimate: "estimate, goal or limit", none: "NO SOURCE" };
    for (const c of found) console.log(`${file}:${c.line}: ${label[c.backing]}${c.cites.length ? ` [${c.cites.join(", ")}]` : ""}: ${c.text}`);
    const none = found.filter((c) => c.backing === "none").length;
    console.log(`\n${file}: ${found.length} claims, ${found.length - none} backed, ${none} with no source`);
    process.exit(none ? 1 : 0);
  }
  let problems;
  try {
    if (args.includes("--score")) {
      const result = scoreRfc(text, options);
      problems = result.problems;
      // The scorer's report lists its own hits; the checker's list below is the complete one, so drop the duplicate.
      console.log(report(file, { ...result, hits: [] }));
      console.log(`${file}: body ${result.bodyWords} of ${BODY_WORD_LIMIT} words\n`);
    } else {
      problems = checkRfc(text, options);
    }
  } catch (error) {
    console.error(`check-rfc: ${error.message}`);
    process.exit(2);
  }
  for (const p of problems) console.log(`${file}:${p.line}: ${p.rule}: ${p.message}`);
  if (problems.length) process.exit(1);
  if (!args.includes("--score")) console.log(`${file}: passes the RFC format checks`);
}
