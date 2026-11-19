#!/usr/bin/env node
// Tallies the answers of fresh readers to a rubric and prints the combined score of a text.
// It checks every quoted sentence against the text, takes the answer most readers gave, and combines the judged
// score with the script score. The rubric file holds the questions and a "Scoring key" block; see references/rubric.md.
// Usage: node judge-tally.mjs <file> <votes.json>... [--rubric <rubric.md>] [--script-score <n>] [--json]
// A votes file is one reader's reply: {"answers":[{"question":1,"answer":"yes","quote":"<exact sentence>"}]}.
// An answer that fails its question may add "fix" (what to write or cut) and "needs" (a fact only the author has).
// After the failed questions the report lists the fixes, each with the points it adds to the combined score.
// Exit 0 with a report, 2 on a usage error or a votes file that cannot be read.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreProse } from "./score-prose.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RUBRIC = path.join(here, "..", "references", "rubric.md");
// The script score counts for more because it is the same on every run; the judged score moves between readers.
const SCRIPT_WEIGHT = 0.6;
const JUDGED_WEIGHT = 0.4;
// A quote shorter than this could be found in any text, so it proves nothing.
const MIN_QUOTE_WORDS = 4;
// A script fault worth less than this on the combined score is not worth a line in the list of fixes.
const MIN_GAIN = 0.5;
// One reader's answer is one sample. Three is the fewest that gives a majority.
export const READERS = 3;

// Quotes are compared without Markdown marks, case, or the difference between straight and curly quotation marks,
// because a reader copies what is rendered and not the source.
const normalize = (s) => s.toLowerCase().replace(/[`*_]/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
const numbers = (s) => (s.match(/\d+/g) ?? []).map(Number);

// A rubric gives its questions as a numbered list under `## The questions` and its key in a fenced block under
// `## Scoring key`. Throws with the fix when either is missing.
export function readRubric(text, name = "rubric") {
  const section = (title) => text.match(new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"))?.[1];
  const list = section("The questions");
  if (!list) throw new Error(`${name} has no \`## The questions\` section`);
  const questions = {};
  for (const m of list.matchAll(/^(\d+)\. (.+)$/gm)) questions[Number(m[1])] = m[2];
  const key = section("Scoring key")?.match(/```[^\n]*\n([\s\S]*?)```/)?.[1];
  if (!key) throw new Error(`${name} has no \`## Scoring key\` section with a fenced block`);
  const line = (label) => key.match(new RegExp(`^${label}:\\s*(.*)$`, "m"))?.[1] ?? "";
  const total = Object.keys(questions).length;
  if (numbers(line("questions"))[0] !== total) throw new Error(`${name} lists ${total} questions but its scoring key says ${line("questions") || "nothing"}`);
  return {
    questions,
    faultWhenYes: numbers(line("yes is the fault")),
    mustPass: numbers(line("must pass")),
    allowNa: /^yes/i.test(line("n/a allowed")),
  };
}

// One reader's reply as text. Tolerates a code fence or a sentence around the JSON object.
export function readVotes(text, name = "votes") {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let parsed;
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error(`${name} holds no JSON object; a reader replies with {"answers":[{"question":1,"answer":"yes","quote":"..."}]}`); }
  if (!Array.isArray(parsed.answers)) throw new Error(`${name} has no "answers" list`);
  const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  return parsed.answers.map((a) => ({ question: Number(a.question), answer: clean(a.answer).toLowerCase(), quote: String(a.quote ?? ""), fix: clean(a.fix), needs: clean(a.needs) }));
}

// text: the judged text. readers: one list of answers per reader, as readVotes returns. rubric: as readRubric returns.
// scriptGroups: the `groups` of a scoreProse result, when the caller has them, so that script faults join the fixes.
// Each failed question carries `gain`, the points its fix adds to the combined score, and `fixes`, what the readers
// who failed it proposed. `fixes` on the result ranks every fix: must-pass first, then the largest gain, then the
// questions the readers agreed on. `ceiling` is the combined score with every listed fix made.
// Returns { combined, script, judged, notReady, passed, counted, readers, questions: [{ number, text, outcome, votes,
// unverified }] }. notReady lists the must-pass questions that failed. They do not lower the number, so that two texts
// can still be ranked; they are a verdict beside it.
export function tally(text, readers, rubric, scriptScore, scriptGroups = []) {
  const haystack = normalize(text);
  const found = (quote) => normalize(quote).split(" ").length >= MIN_QUOTE_WORDS && haystack.includes(normalize(quote));
  const questions = Object.keys(rubric.questions).map(Number).map((number) => {
    const fault = rubric.faultWhenYes.includes(number);
    const unverified = [];
    const fixes = [];
    const failing = fault ? "yes" : "no";
    const votes = readers.map((answers, i) => {
      const a = answers.find((x) => x.question === number);
      if (!a || !["yes", "no", "n/a"].includes(a.answer)) return "none";
      if (a.answer === "n/a") return rubric.allowNa ? "n/a" : "none";
      // A "yes" is a claim about the text, so it needs a sentence from the text. Without one it counts as "no".
      if (a.answer === "yes" && !found(a.quote)) { unverified.push({ reader: i + 1, quote: a.quote }); return "no"; }
      if (a.answer === failing && (a.fix || a.needs)) fixes.push({ reader: i + 1, fix: a.fix, needs: a.needs });
      return a.answer;
    });
    const count = (v) => votes.filter((x) => x === v).length;
    const half = readers.length / 2;
    const outcome = count("n/a") > half ? "n/a" : count(fault ? "no" : "yes") > half ? "pass" : "fail";
    return { number, text: rubric.questions[number], outcome, votes, unverified, fixes: outcome === "fail" ? fixes : [], agreed: count(failing) === readers.length };
  });
  const counted = questions.filter((q) => q.outcome !== "n/a");
  const passed = counted.filter((q) => q.outcome === "pass").length;
  const judged = counted.length ? Math.round((100 * passed) / counted.length) : 0;
  const combined = Math.round(SCRIPT_WEIGHT * scriptScore + JUDGED_WEIGHT * judged);
  const notReady = questions.filter((q) => rubric.mustPass.includes(q.number) && q.outcome === "fail").map((q) => q.number);
  const round1 = (n) => Math.round(n * 10) / 10;
  const perQuestion = counted.length ? round1((JUDGED_WEIGHT * 100) / counted.length) : 0;
  const fixes = [
    ...questions.filter((q) => q.outcome === "fail").map((q) => ({ kind: "question", number: q.number, mustPass: rubric.mustPass.includes(q.number), gain: perQuestion, agreed: q.agreed, text: q.text, proposals: q.fixes })),
    ...scriptGroups.filter((g) => SCRIPT_WEIGHT * g.penalty >= MIN_GAIN).map((g) => ({ kind: "script", mustPass: false, gain: round1(SCRIPT_WEIGHT * g.penalty), agreed: true, text: g.label, hits: g.hits, proposals: [] })),
  ].sort((a, b) => b.mustPass - a.mustPass || b.gain - a.gain || b.agreed - a.agreed);
  const ceiling = Math.min(100, Math.round(combined + fixes.reduce((n, f) => n + f.gain, 0)));
  return { combined, script: scriptScore, judged, notReady, fixes, ceiling, passed, counted: counted.length, readers: readers.length, questions };
}

export function report(file, result, rubric) {
  const lines = [
    `combined: ${result.combined}/100 (script ${result.script}, judged ${result.judged})`,
    ...(result.notReady.length ? [`not ready: must-pass question${result.notReady.length === 1 ? "" : "s"} ${result.notReady.join(", ")} failed`] : []),
    `${file}: ${result.readers} reader${result.readers === 1 ? "" : "s"}, ${result.passed} of ${result.counted} questions passed`,
  ];
  if (result.readers < READERS) lines.push(`warning: ${result.readers} of ${READERS} readers; one reader's answers vary from run to run, so treat the judged score as a draft`);
  lines.push("");
  for (const q of result.questions) {
    if (q.outcome !== "fail") continue;
    lines.push(`fail ${q.number}${rubric.mustPass.includes(q.number) ? " (must pass)" : ""}: ${q.text} [${q.votes.join(", ")}]`);
    for (const u of q.unverified) lines.push(`  reader ${u.reader} said yes, but the quote is not in the text: "${u.quote.slice(0, 120)}"`);
  }
  if (!result.questions.some((q) => q.outcome === "fail")) lines.push("every counted question passed");
  if (result.fixes.length) {
    lines.push("", `fixes, in the order to make them (points are on the combined score; all of them give ${result.ceiling}/100):`);
    for (const f of result.fixes) {
      const gain = `+${f.gain.toFixed(1)}`;
      if (f.kind === "script") { lines.push(`${gain}  script: ${f.text}${f.hits ? ` (${f.hits} hit${f.hits === 1 ? "" : "s"})` : ""}; the hits are in the checker's list`); continue; }
      lines.push(`${gain}  question ${f.number}${f.mustPass ? " (must pass)" : ""}${f.agreed ? "" : " (readers split; may be noise)"}`);
      // Readers mostly propose the same fix in other words, so the report prints one. --json has them all.
      const [p, ...more] = f.proposals;
      if (p?.fix) lines.push(`      fix: ${p.fix}`);
      const needs = f.proposals.find((x) => x.needs)?.needs;
      if (needs) lines.push(`      needs from the author: ${needs}`);
      if (more.length) lines.push(`      ${more.length} more reader${more.length === 1 ? "" : "s"} proposed a fix; --json lists them`);
      if (!f.proposals.length) lines.push("      no reader proposed a fix; reread the question against the text");
    }
  }
  return lines.join("\n");
}

// Shared by this CLI and by a caller with its own script score (the RFC checker).
export function runTally({ file, text, voteFiles, rubricFile = DEFAULT_RUBRIC, scriptScore, scriptGroups = [], json = false }) {
  const rubric = readRubric(fs.readFileSync(rubricFile, "utf8"), rubricFile);
  const readers = voteFiles.map((f) => readVotes(fs.readFileSync(f, "utf8"), f));
  const result = tally(text, readers, rubric, scriptScore, scriptGroups);
  return json ? JSON.stringify(result, null, 2) : report(file, result, rubric);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const positional = args.filter((a, i) => !a.startsWith("--") && !["--rubric", "--script-score"].includes(args[i - 1]));
  const [file, ...voteFiles] = positional;
  const usage = "Usage: node judge-tally.mjs <file> <votes.json>... [--rubric <rubric.md>] [--script-score <n>] [--json]";
  const missing = [file, ...voteFiles, option("--rubric")].filter((f) => f && !fs.existsSync(f));
  if (!file || !voteFiles.length || missing.length) {
    console.error(`judge-tally: ${missing.length ? `no file at ${missing.join(", ")}` : "give the text and at least one votes file"}\n${usage}`);
    process.exit(2);
  }
  try {
    const text = fs.readFileSync(file, "utf8");
    const given = option("--script-score");
    if (given !== undefined && !(Number(given) >= 0 && Number(given) <= 100)) throw new Error(`--script-score needs a number from 0 to 100, got "${given}"`);
    const scored = given === undefined ? scoreProse(text) : { score: Number(given), groups: [] };
    console.log(runTally({ file, text, voteFiles, rubricFile: option("--rubric") ?? DEFAULT_RUBRIC, scriptScore: scored.score, scriptGroups: scored.groups, json: args.includes("--json") }));
  } catch (error) {
    console.error(`judge-tally: ${error.message}`);
    process.exit(2);
  }
}
