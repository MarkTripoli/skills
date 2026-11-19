#!/usr/bin/env node
// Supports the tighten loop in references/tighten.md: say the RFC in fewer words without losing what the decision needs.
// Usage:
//   node tighten.mjs <rfc.md> --list                  Print the body's blocks as JSON: id, section, line, words, text.
//   node tighten.mjs <rfc.md> --check <findings.json> Check a reader's findings against the RFC before applying them.
//   node tighten.mjs <rfc.md> --record <findings.json> After applying them, log the round and print `continue` or `stop: <reason>`.
// Findings are a JSON array of { "id": "P7", "verdict": "cut" | "shorter" | "plain", "why": "...", "rewrite": "...", "drops": ["..."] }.
// `rewrite` is required for "shorter" and "plain"; a "shorter" rewrite has fewer words, a "plain" one replaces platform terms. `drops` lists each number or citation the change removes on purpose.
// --check prints one `<id>: <problem>` per problem and exits 1 when any exist. The log is tighten-log.json beside the RFC.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BODY, parse, words } from "./check-rfc.mjs";

export const MIN_GAIN = 0.02;

// Each block is a paragraph, a list item, or a whole table, inside the body sections. Diagrams are skipped.
export function blocks(text) {
  const { sections } = parse(text);
  const out = [];
  for (const s of sections.filter((x) => BODY.some((b) => b.toLowerCase() === x.name.toLowerCase()))) {
    let fenced = false;
    let cur = null;
    const flush = () => { if (cur) out.push(cur); cur = null; };
    s.lines.forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; flush(); return; }
      if (fenced || !line.trim() || /^#+ /.test(line)) { flush(); return; }
      const table = /^\s*\|/.test(line);
      const item = /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
      if (cur && (item || table !== cur.table)) flush();
      if (!cur) cur = { section: s.name, line: s.start + i + 1, table, lines: [] };
      cur.lines.push(line);
    });
    flush();
  }
  return out.map((b, i) => ({ id: `P${i + 1}`, section: b.section, line: b.line, words: words(b.lines.join(" ")), text: b.lines.join("\n") }));
}

// Counted as the checker's page limit counts them: every line of the body sections except diagrams.
export const bodyWords = (text) => parse(text).sections
  .filter((s) => BODY.some((b) => b.toLowerCase() === s.name.toLowerCase()))
  .reduce((n, s) => n + words(s.lines.join("\n").replace(/^```mermaid\n[\s\S]*?^```$/gm, "")), 0);

// The numbers and citations a block holds: what a cut or a rewrite must not lose by accident.
export function facts(text) {
  const cites = [...text.matchAll(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g)].flatMap((m) => m[1].split(/\s*[,–-]\s*/).map((n) => `[${n}]`));
  const numbers = [...text.replace(/\[[\d,\s–-]+\]/g, "").matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)].map((m) => m[0].replace(/,$/, ""));
  return [...new Set([...cites, ...numbers])];
}

export function checkFindings(text, findings) {
  const problems = [];
  if (!Array.isArray(findings)) return ["findings: not a JSON array"];
  const all = blocks(text);
  const byId = new Map(all.map((b) => [b.id, b]));
  for (const f of findings) {
    const b = byId.get(f.id);
    const id = f.id ?? "?";
    if (!b) { problems.push(`${id}: no block with this id; run --list on the current RFC`); continue; }
    if (!["cut", "shorter", "plain"].includes(f.verdict)) problems.push(`${id}: verdict must be "cut", "shorter" or "plain"`);
    if (!f.why?.trim()) problems.push(`${id}: say why the decider loses nothing`);
    if (f.verdict === "shorter" || f.verdict === "plain") {
      if (!f.rewrite?.trim()) { problems.push(`${id}: a ${f.verdict} verdict needs the rewrite`); continue; }
      if (f.verdict === "shorter" && words(f.rewrite) >= b.words) problems.push(`${id}: the rewrite has ${words(f.rewrite)} words, not fewer than ${b.words}`);
    }
    const kept = f.verdict === "cut" ? [] : facts(f.rewrite ?? "");
    const rest = all.filter((x) => x.id !== b.id).map((x) => x.text).join("\n");
    const elsewhere = new Set(facts(rest));
    const drops = new Set(f.drops ?? []);
    for (const fact of facts(b.text)) {
      if (kept.includes(fact) || drops.has(fact)) continue;
      problems.push(`${id}: removes ${fact}${elsewhere.has(fact) ? ", which the body states elsewhere" : ", which the body states nowhere else"}; keep it, or list it in drops`);
    }
  }
  return problems;
}

// Decides from the log whether another round is worth running.
export function decide(log) {
  const last = log.at(-1);
  if (last.findings === 0) return "stop: the last round found nothing to cut or shorten";
  const gains = log.slice(1).map((r, i) => (log[i].bodyWords - r.bodyWords) / log[i].bodyWords);
  if (gains.length >= 2 && gains.slice(-2).every((g) => g < MIN_GAIN)) return `stop: two rounds in a row cut under ${MIN_GAIN * 100}% of the body`;
  return "continue";
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const [file, mode, findingsFile] = process.argv.slice(2);
  const usage = "Usage: node tighten.mjs <rfc.md> --list | --check <findings.json> | --record <findings.json>";
  if (!file || !fs.existsSync(file) || !["--list", "--check", "--record"].includes(mode) || (mode !== "--list" && !fs.existsSync(findingsFile ?? ""))) {
    console.error(`tighten: ${!file || !fs.existsSync(file) ? `no RFC at ${file ?? "(none)"}` : mode === "--list" || ["--check", "--record"].includes(mode) ? `no findings file at ${findingsFile ?? "(none)"}` : `unknown mode ${mode}`}\n${usage}`);
    process.exit(2);
  }
  const text = fs.readFileSync(file, "utf8");
  const logFile = path.join(path.dirname(file), "tighten-log.json");
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : [];
  if (mode === "--list") {
    console.log(JSON.stringify(blocks(text), null, 2));
    process.exit(0);
  }
  let findings;
  try { findings = JSON.parse(fs.readFileSync(findingsFile, "utf8")); } catch (err) {
    console.error(`tighten: ${findingsFile} is not JSON: ${err.message}`);
    process.exit(2);
  }
  if (mode === "--check") {
    if (!log.length) fs.writeFileSync(logFile, `${JSON.stringify([{ round: 0, findings: null, bodyWords: bodyWords(text) }], null, 2)}\n`);
    const problems = checkFindings(text, findings);
    for (const p of problems) console.log(p);
    console.log(`${file}: ${findings.length} findings, ${problems.length} problems`);
    process.exit(problems.length ? 1 : 0);
  }
  if (!log.length) {
    console.error("tighten: no log yet; run --check before applying the findings");
    process.exit(2);
  }
  log.push({ round: log.length, findings: findings.length, bodyWords: bodyWords(text) });
  fs.writeFileSync(logFile, `${JSON.stringify(log, null, 2)}\n`);
  const prev = log.at(-2).bodyWords;
  console.log(`round ${log.length - 1}: ${findings.length} findings, body ${prev} -> ${log.at(-1).bodyWords} words`);
  console.log(decide(log));
}
