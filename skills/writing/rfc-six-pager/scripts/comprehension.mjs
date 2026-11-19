#!/usr/bin/env node
// The comprehension test of ../references/comprehension_test.md. Questions written from the sources before drafting
// are answered by fresh readers from the RFC alone; this script checks each answer against the facts it must hold.
// Usage:
//   node comprehension.mjs <rfc.md> --questions <questions.json> --sheet [<out.txt>]
//     Writes the readers' sheet (the questions without their facts) and lists each fact that is not in the RFC.
//   node comprehension.mjs <rfc.md> --questions <questions.json> --answers <answers.json>... [--json]
//     Counts the readers' answers. Exits 0 on pass, 1 on fail, 2 on a usage or file error.
// questions.json: {"questions": [{"id": 1, "ask": "<question>", "expect": ["<regex>", ...]}]}. Every pattern must
// match, case-insensitively, for an answer to be right. Write alternatives inside one pattern: "Dec(ember)? 4|2026-12-04".
// answers.json: {"answers": [{"id": 1, "answer": "<at most 30 words, or 'not in the RFC'>"}]}.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The share of questions that more than half of the readers must answer right.
export const LIMIT = 90;

// Markdown and number formatting differ between the RFC, the sources and the readers; compare without them.
export function normalize(text) {
  return text
    .replace(/[*_`]/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

function patterns(q) {
  if (!Array.isArray(q.expect) || !q.expect.length) throw new Error(`question ${q.id} has no "expect" patterns; give each fact the answer must hold`);
  return q.expect.map((p) => {
    try { return new RegExp(p, "i"); } catch (error) { throw new Error(`question ${q.id}: "${p}" is not a valid pattern: ${error.message}`); }
  });
}

export function readQuestions(data) {
  const list = data?.questions;
  if (!Array.isArray(list) || !list.length) throw new Error('the questions file has no "questions" list');
  const ids = new Set();
  for (const q of list) {
    if (q.id === undefined || !q.ask) throw new Error('every question needs an "id" and an "ask"');
    if (ids.has(q.id)) throw new Error(`question id ${q.id} is used twice`);
    ids.add(q.id);
    patterns(q);
  }
  return list;
}

// The text the readers get: the questions, numbered, with no facts.
export function sheet(questions) {
  return questions.map((q) => `${q.id}. ${q.ask}`).join("\n") + "\n";
}

// The facts the RFC does not state at all: [{ id, ask, missing: [pattern] }].
export function missingFacts(text, questions) {
  const body = normalize(text);
  return questions
    .map((q) => ({ id: q.id, ask: q.ask, missing: q.expect.filter((p, i) => !patterns(q)[i].test(body)) }))
    .filter((q) => q.missing.length);
}

// { pass, readers, right, total, share, missing, wrong: [{ id, ask, answers, absent }] }
export function tally(text, questions, answerSets, limit = LIMIT) {
  if (!answerSets.length) throw new Error("no answers file given");
  const sets = answerSets.map((data, i) => {
    const list = data?.answers;
    if (!Array.isArray(list)) throw new Error(`answers file ${i + 1} has no "answers" list`);
    const byId = new Map(list.map((a) => [String(a.id), String(a.answer ?? "")]));
    const covered = questions.filter((q) => byId.has(String(q.id))).length;
    if (covered < questions.length) throw new Error(`answers file ${i + 1} answers ${covered} of ${questions.length} questions; a reader answers every question, writing "not in the RFC" where it does not say`);
    return byId;
  });
  const need = Math.floor(sets.length / 2) + 1;
  const wrong = [];
  let right = 0;
  for (const q of questions) {
    const res = patterns(q);
    const answers = sets.map((s) => s.get(String(q.id)));
    const ok = answers.filter((a) => res.every((re) => re.test(normalize(a)))).length;
    if (ok >= need) right++;
    else wrong.push({ id: q.id, ask: q.ask, answers, expect: q.expect });
  }
  const missing = missingFacts(text, questions);
  const share = (100 * right) / questions.length;
  return { pass: share >= limit, readers: sets.length, right, total: questions.length, share, limit, wrong, missing };
}

export function report(file, r) {
  const out = [];
  out.push(`comprehension: ${r.pass ? "pass" : "fail"} (readers: ${r.readers})`);
  out.push(`answered right: ${r.right} of ${r.total}, ${r.share.toFixed(0)}% (limit ${r.limit}%)`);
  out.push(`facts the RFC does not state: ${r.missing.length}`);
  if (r.missing.length) {
    out.push("", "Write these into the RFC, where the reader needs them:");
    for (const m of r.missing) out.push(`${file}: question ${m.id}, "${m.ask}": no text matches ${m.missing.map((p) => `/${p}/`).join(", ")}`);
  }
  const buried = r.wrong.filter((w) => !r.missing.some((m) => m.id === w.id));
  if (buried.length) {
    out.push("", "The RFC states these, but readers did not get them; make the sentence that answers each easier to find and to read:");
    for (const w of buried) {
      out.push(`${file}: question ${w.id}, "${w.ask}" (needs ${w.expect.map((p) => `/${p}/`).join(", ")})`);
      w.answers.forEach((a, i) => out.push(`    reader ${i + 1}: ${a}`));
    }
  }
  return out.join("\n");
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const usage = "Usage: node comprehension.mjs <rfc.md> --questions <questions.json> --sheet [<out.txt>]\n       node comprehension.mjs <rfc.md> --questions <questions.json> --answers <answers.json>... [--json]";
  const fail = (message) => { console.error(`comprehension: ${message}\n${usage}`); process.exit(2); };
  const read = (f) => { if (!f || !fs.existsSync(f)) fail(f ? `no file at ${f}` : "a path is missing"); return fs.readFileSync(f, "utf8"); };
  const file = args[0];
  const q = args.indexOf("--questions");
  if (!file || file.startsWith("--") || q < 0) fail("give the RFC and --questions");
  try {
    const text = read(file);
    const questions = readQuestions(JSON.parse(read(args[q + 1])));
    const s = args.indexOf("--sheet");
    if (s >= 0) {
      const out = args[s + 1] && !args[s + 1].startsWith("--") ? args[s + 1] : null;
      if (out) fs.writeFileSync(out, sheet(questions)); else process.stdout.write(sheet(questions));
      const missing = missingFacts(text, questions);
      const log = out ? console.log : console.error;
      if (out) log(`${out}: ${questions.length} questions`);
      for (const m of missing) log(`${file}: question ${m.id}, "${m.ask}": the RFC does not state /${m.missing.join("/, /")}/`);
      process.exit(0);
    }
    const a = args.indexOf("--answers");
    if (a < 0) fail("give --sheet or --answers");
    const files = args.slice(a + 1).filter((x) => !x.startsWith("--"));
    const r = tally(text, questions, files.map((f) => JSON.parse(read(f))));
    console.log(args.includes("--json") ? JSON.stringify(r, null, 2) : report(file, r));
    process.exit(r.pass ? 0 : 1);
  } catch (error) {
    fail(error.message);
  }
}
