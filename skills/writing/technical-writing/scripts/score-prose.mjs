#!/usr/bin/env node
// Scores the prose of a Markdown or plain-text file from 0 to 100. Deterministic: the same text gives the same number.
// It measures known faults (listed words, sentence shapes, repetition, long and passive sentences). It does not judge
// whether the text is true, complete or right for its reader; references/rubric.md holds the questions a reader answers.
// Usage: node score-prose.mjs <file> [--json]
// Exit 0 with a report, 2 on a usage error. The score is on the first line: `score: <n>/100`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const WORD_LIST = path.join(here, "..", "references", "word-list.md");

// Each group can take at most `cap` points off, so no one family of rules decides the score. The caps sum to 100.
// `budget` is the weighted rate at which the group loses its whole cap. Rates for hit groups are weighted hits per
// 1,000 words. Caps and budgets are judgment calls, set so that a clean technical document scores above 90 and a
// typical machine-written draft below 50; no published formula exists. Retune them against documents people have ranked.
export const GROUPS = {
  words: { cap: 25, budget: 20, label: "listed words (weasel, jargon, metaphors, signposts)" },
  shapes: { cap: 20, budget: 10, label: "sentence shapes (contrast frames, emoji, dashes)" },
  claims: { cap: 15, budget: 12, label: "empty claims (hinted risks, disclaimers, undefined acronyms, leftover notes)" },
  filler: { cap: 10, budget: 15, label: "filler and hedges" },
  repeats: { cap: 10, budget: 0.05, label: "sentences that repeat an earlier one" },
  long: { cap: 8, budget: 0.25, label: "sentences over 30 words" },
  passive: { cap: 7, budget: 0.25, label: "passive sentences with no actor" },
  grade: { cap: 5, budget: 4, label: "reading grade above 14" },
};
// Which group a word-list category belongs to, and how much one hit weighs. A signpost or a metaphor is rarer in
// careful human prose than a weasel word, so it weighs more.
const CATEGORY = {
  weasel: ["words", 1], jargon: ["words", 2], metaphors: ["words", 2], signposts: ["words", 2],
  filler: ["filler", 1], hedges: ["filler", 1],
};
// A leftover note to the writer or a placeholder means the text was not finished, whatever else it does well.
const UNFINISHED_CAP = 70;
// A rate on a very short text swings on one hit, so short texts are scored as if they had this many words.
const MIN_WORDS = 300;
const LONG_SENTENCE = 30;
// Reading grade is a weak signal: formulas measure word and sentence length, not understanding. A low grade is never
// penalized, because short sentences of plain words are the house style. Only text above this grade loses points.
const MAX_GRADE = 14;
// Sentences this similar say the same thing twice. Short sentences are skipped: they collide by chance.
const REPEAT_SIMILARITY = 0.8;
const REPEAT_MIN_WORDS = 8;

// Sentence shapes a word list cannot hold. Each: [rule, group, weight, pattern, message].
export const PATTERNS = [
  ["contrast-frame", "shapes", 2, /\b(?:not|n't) (?:just|only|merely|simply)\b[^.?!\n]*\bbut\b|\b(?:is|are|was) not (?:about )?[^.?!,\n]{1,60}[,;] (?:it|they|this) (?:is|are|'s)\b/gi, "states what the thing is not before what it is; state what it is"],
  ["copula-dodge", "shapes", 1, /\b(?:serves?|stands?|acts?|functions?) as (?:a|an|the)\b|\bboasts? (?:a|an)\b/gi, "avoids \"is\"; write \"is\" or the verb for what it does"],
  ["trailing-ing", "shapes", 2, /,\s+(?:highlighting|underscoring|showcasing|emphasizing|reflecting|demonstrating|illustrating|signaling|cementing|solidifying|paving the way|ensuring that|making it)\b/gi, "ends on a clause that comments instead of stating; make it a sentence with a subject, or cut it"],
  ["emoji", "shapes", 2, /\p{Extended_Pictographic}/gu, "is an emoji; delete it"],
  ["vague-risk", "claims", 2, /\b(?:may|might|could|can) (?:cause|lead to|introduce|pose|present) (?:some |potential |certain )?(?:issues|problems|challenges|complications|risks?)\b|\bcould be (?:problematic|an issue|a problem|challenging)\b|\bneeds? (?:care|careful (?:thought|consideration|handling))\b|\bnon-trivial\b|\bpotential(?:ly)? (?:issues?|problems?|pitfalls?)\b/gi, "hints at a risk without saying what it is; write the trigger, the effect and the response, or delete the sentence"],
  ["disclaimer", "claims", 1, /\b(?:does|did|(?:we|they|these|results|checks|tests) do) not (?:establish|prove|promise|claim|guarantee|imply|constitute|represent)\b|\b(?:is|are) not (?:a|an) (?:forecast|commitment|promise|guarantee|claim|audit|estimate|budget|benchmark)\b|\bnot claimed\b|\bno (?:claim|promise|guarantee) is made\b/gi, "says what is not claimed; state what is true, and state a real limit once"],
  ["vague-source", "claims", 2, /\b(?:experts|researchers|analysts|observers|critics|many people|some people) (?:say|argue|believe|suggest|agree|note|warn)\b|\bit is (?:widely|generally|commonly) (?:believed|accepted|known|recognized|agreed)\b|\bresearch (?:shows|suggests|indicates)\b(?! \()/gi, "names no source; name it, or cut the claim"],
  ["residue", "claims", 3, /\b(?:TODO|TBD|FIXME|XXX)\b|\bto be determined\b|\bas an AI\b|\bas a (?:large )?language model\b|\bI hope this helps\b|\[(?:insert|placeholder|your)\b[^\]]*\]/gi, "is a leftover note, not finished text; resolve it and delete it"],
  ["residue", "claims", 3, /^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*)?(?:Keep|Ensure|Make sure|Remember|Consider|Address|Include|Add|Expand|Clarify|Note to|Be sure)\b[^.!?\n]*:(?:\*\*)?\s*$/gim, "is an instruction to the writer; do what it asks, then delete the line"],
  ["residue", "claims", 3, /\((?:aka|a\.k\.a\.)\b[^)]*\)|\bplease click\b/gi, "is an author's note or template boilerplate; delete it or write it as text"],
];
const BOLD_LEAD = /^\s*(?:[-*+]|\d+[.)])\s+\*\*[^*]+(?::\*\*|\*\*\s*[:—–-])/;
// Acronyms a technical reader knows. Anything else in capitals is expected to be explained where it first appears.
const KNOWN_ACRONYMS = new Set("API APIs CLI CPU CSS CSV DNS FAQ GPU HTML HTTP HTTPS ID IDs IO IP JSON JWT MR MRs OS PDF PR PRs RAM REST RFC RFCs SDK SQL SSH SSL TCP TLS UI URL URLs USB UTC UX VM VPN XML YAML CI CD AWS US UK EU AI OK AM PM PIN SMS QA ZIP PNG JPG GIF SVG SHA MIT TOML UTF ASCII HEAD GET POST PUT TODO README NOTE GB MB KB CRLF EOF ISO UUID RPC NPM GIT LLM MCP".split(" "));
const BE = "(?:is|are|was|were|be|been|being)";
const IRREGULAR = "built|done|made|sent|kept|held|run|set|put|read|written|taken|given|shown|known|seen|found|lost|left|paid|sold|told|chosen|broken|driven|drawn|thrown|grown|stored|cut|hit|shut";
const PASSIVE = new RegExp(`\\b${BE}\\s+(?:\\w+ly\\s+)?(?:\\w+ed|${IRREGULAR})\\b(?!\\s+(?:\\w+\\s+){0,4}by\\b)`, "i");

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsOf = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

// The word list is Markdown tables under H2 headings. Rule name: the first word of the heading, lowercased.
// First cell: comma-separated terms, a trailing `*` matching any word ending. Second cell: what to write instead.
// A term after "how" or "as" is a question or a comparison ("how many", "as soon as"), not a claim, so it passes.
export function readWordList(text) {
  const entries = [];
  let rule = null;
  for (const line of text.split("\n")) {
    const h2 = line.match(/^## +(\w+)/);
    if (h2) { rule = h2[1].toLowerCase(); continue; }
    const row = line.match(/^\|([^|]+)\|([^|]+)\|\s*$/);
    if (!rule || !row || /^[\s:-]+$/.test(row[1]) || /^\s*Word or phrase\s*$/i.test(row[1])) continue;
    for (const term of row[1].split(",").map((t) => t.trim()).filter(Boolean)) {
      const stem = term.endsWith("*") ? term.slice(0, -1) : term;
      const source = `(?<![\\w-])(?<!\\b(?:how|as)\\s)${escape(stem).replace(/\s+/g, "\\s+")}${term.endsWith("*") ? "\\w*" : ""}(?![\\w-])`;
      entries.push({ rule, re: new RegExp(source, "gi"), instead: row[2].trim() });
    }
  }
  return entries;
}

// The prose of each line: empty for fenced code, block quotes, table rows and headings; inline code, quoted strings,
// links' targets and bare URLs removed from the rest, so identifiers and quotations are never scored.
export function proseLines(text) {
  let fenced = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return ""; }
    if (fenced || /^\s*>/.test(line) || /^\s*\|/.test(line) || /^\s*#/.test(line)) return "";
    return line.replace(/`[^`]*`/g, "").replace(/"[^"]*"|“[^”]*”/g, "").replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, "");
  });
}

// Word and shape hits on prose lines: [{ line, rule, group, weight, match, message }], line 1-based.
// boldLead: also report list items that open with a bold label. Off by default, because a reference document may
// repeat labelled bullets on purpose; a caller whose format wants paragraphs (the RFC checker) turns it on.
export function lintProse(text, { wordList = fs.readFileSync(WORD_LIST, "utf8"), boldLead = false } = {}) {
  const banned = readWordList(wordList);
  const raw = text.split("\n");
  const prose = proseLines(text);
  const hits = [];
  const add = (line, rule, group, weight, match, message) => hits.push({ line, rule, group, weight, match, message });
  let dashes = 0;
  const seenAcronyms = new Set();
  prose.forEach((p, i) => {
    const at = i + 1;
    if (!p.trim()) { dashes = 0; return; }
    for (const { rule, re, instead } of banned) {
      const [group, weight] = CATEGORY[rule] ?? ["words", 1];
      for (const m of p.matchAll(re)) add(at, rule, group, weight, m[0], `"${m[0]}": write ${instead}`);
    }
    for (const [rule, group, weight, re, message] of PATTERNS) {
      for (const m of p.matchAll(re)) add(at, rule, group, weight, m[0].trim(), `"${m[0].trim().slice(0, 60)}" ${message}`);
    }
    if (boldLead && BOLD_LEAD.test(raw[i])) add(at, "bold-lead", "shapes", 2, raw[i].trim().slice(0, 40), "a list item that opens with a bold label is a slide bullet; write the sentence that connects it to the argument");
    dashes += (p.match(/—|\s–\s|\s--\s/g) ?? []).length;
    if (dashes > 1) { add(at, "dashes", "shapes", 1, "—", "more than one dash-separated aside in this paragraph; make the aside its own sentence"); dashes = 0; }
    for (const m of p.matchAll(/\b[A-Z][A-Z0-9]{2,5}s?\b/g)) {
      const a = m[0];
      if (KNOWN_ACRONYMS.has(a) || seenAcronyms.has(a)) continue;
      seenAcronyms.add(a);
      // Explained where it first appears: "Full Name (ABC)", "ABC (full name)" or "ABC, the ...".
      const around = p.slice(Math.max(0, m.index - 80), m.index + a.length + 60);
      if (new RegExp(`\\(${escape(a)}\\)|${escape(a)}\\s*\\(|${escape(a)},\\s+(?:the|a|an|or|short for|which)\\b`).test(around)) continue;
      add(at, "acronym", "claims", 0.5, a, `"${a}" is not explained where it first appears; explain it in a clause, or spell it out`);
    }
  });
  return hits;
}

const syllables = (word) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return w ? 1 : 0;
  return Math.max(1, (w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g) ?? []).length);
};

// Sentence measures over prose paragraphs. List items count as sentences of their own.
export function measure(text) {
  const prose = proseLines(text);
  const sentences = [];
  let paragraph = [];
  const flush = () => {
    const joined = paragraph.join(" ");
    for (const s of joined.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)) if (wordsOf(s).length) sentences.push(s.trim());
    paragraph = [];
  };
  for (const line of prose) {
    if (!line.trim()) { flush(); continue; }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) { flush(); paragraph.push(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")); flush(); continue; }
    paragraph.push(line);
  }
  flush();
  const lengths = sentences.map((s) => wordsOf(s).length);
  const words = lengths.reduce((a, b) => a + b, 0);
  const syllableCount = sentences.reduce((n, s) => n + wordsOf(s).reduce((m, w) => m + syllables(w), 0), 0);
  const sets = sentences.map((s) => new Set(wordsOf(s.toLowerCase().replace(/[^a-z0-9\s]/g, ""))));
  const repeated = [];
  sets.forEach((a, i) => {
    if (a.size < REPEAT_MIN_WORDS) return;
    for (let j = 0; j < i; j++) {
      const b = sets[j];
      if (b.size < REPEAT_MIN_WORDS) continue;
      let shared = 0;
      for (const w of a) if (b.has(w)) shared++;
      if (shared / (a.size + b.size - shared) >= REPEAT_SIMILARITY) { repeated.push(sentences[i]); break; }
    }
  });
  const n = sentences.length || 1;
  return {
    words,
    sentences: sentences.length,
    longShare: lengths.filter((l) => l > LONG_SENTENCE).length / n,
    longest: sentences.filter((s, i) => lengths[i] > LONG_SENTENCE).sort((a, b) => wordsOf(b).length - wordsOf(a).length).slice(0, 3),
    passiveShare: sentences.filter((s) => PASSIVE.test(s)).length / n,
    passive: sentences.filter((s) => PASSIVE.test(s)).slice(0, 3),
    repeatShare: repeated.length / n,
    repeated: repeated.slice(0, 3),
    // Flesch-Kincaid grade level.
    grade: words ? 0.39 * (words / n) + 11.8 * (syllableCount / words) - 15.59 : 0,
  };
}

// extraHits: hits from a caller's own rules, in the same shape as lintProse returns, scored in their group.
// keep: a caller's filter over the hits found here, for a rule that does not apply in part of its document.
// unfinished: true when the caller found the text unfinished by its own rules (a missing required section, say).
export function scoreProse(text, { wordList, extraHits = [], keep = () => true, unfinished = false, boldLead = false } = {}) {
  const hits = [...lintProse(text, wordList ? { wordList, boldLead } : { boldLead }).filter(keep), ...extraHits].sort((a, b) => a.line - b.line);
  const m = measure(text);
  const per1000 = (group) => (hits.filter((h) => h.group === group).reduce((n, h) => n + h.weight, 0) * 1000) / Math.max(m.words, MIN_WORDS);
  const gradeDistance = Math.max(0, m.grade - MAX_GRADE);
  const rates = {
    words: per1000("words"), shapes: per1000("shapes"), claims: per1000("claims"), filler: per1000("filler"),
    repeats: m.repeatShare, long: m.longShare, passive: m.passiveShare, grade: gradeDistance,
  };
  const round = (x) => Math.round(x * 10) / 10;
  const groups = Object.entries(GROUPS).map(([name, { cap, budget, label }]) => ({
    name, label, cap,
    penalty: round(Math.min(cap, (cap * rates[name]) / budget)),
    hits: hits.filter((h) => h.group === name).length,
  }));
  let score = Math.round(100 - groups.reduce((n, g) => n + g.penalty, 0));
  const isUnfinished = unfinished || hits.some((h) => h.rule === "residue" || h.rule === "placeholder");
  const capped = isUnfinished && score > UNFINISHED_CAP;
  if (capped) score = UNFINISHED_CAP;
  return { score, capped, words: m.words, sentences: m.sentences, grade: round(m.grade), groups, hits, examples: { long: m.longest, passive: m.passive, repeats: m.repeated } };
}

export function report(file, result) {
  const lines = [`score: ${result.score}/100${result.capped ? ` (held at ${UNFINISHED_CAP}: the text has leftover notes or is unfinished)` : ""}`, `${file}: ${result.words} words, ${result.sentences} sentences, reading grade ${result.grade}`, ""];
  for (const g of result.groups) {
    lines.push(`  -${g.penalty.toFixed(1).padStart(4)} of ${String(g.cap).padStart(2)}  ${g.label}${g.hits ? ` (${g.hits} hits)` : ""}`);
  }
  const worst = result.groups.filter((g) => g.penalty > 0).sort((a, b) => b.penalty - a.penalty);
  if (worst.length) lines.push("", `Fix first: ${worst[0].label}.`);
  if (result.hits.length) lines.push("", ...result.hits.map((h) => `${file}:${h.line}: ${h.rule}: ${h.message}`));
  for (const [name, title] of [["repeats", "repeats an earlier sentence"], ["long", `over ${LONG_SENTENCE} words`], ["passive", "passive with no actor"]]) {
    for (const s of result.examples[name]) lines.push(`${file}: ${title}: "${s.slice(0, 110)}${s.length > 110 ? "..." : ""}"`);
  }
  return lines.join("\n");
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file || !fs.existsSync(file)) {
    console.error(`score-prose: ${file ? `no file at ${file}` : "no file given"}\nUsage: node score-prose.mjs <file> [--json]`);
    process.exit(2);
  }
  const result = scoreProse(fs.readFileSync(file, "utf8"));
  console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : report(file, result));
}
