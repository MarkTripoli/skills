import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";
import { BODY, checkRfc } from "../../skills/writing/rfc-six-pager/scripts/check-rfc.mjs";
import { bodyWords } from "../../skills/writing/rfc-six-pager/scripts/tighten.mjs";

// The fixture is a complete, checker-clean RFC (a shared cache for CI build artifacts, about 1,900 body words) with six
// seeded faults, each in prose the checker passes: a paragraph that restates the Decision nearly word for word, a
// history paragraph nobody decides on, one claim spread over a sentence for each region, a mitigation stated without its
// effect, a paragraph in platform jargon instead of what happens to the product, and two paragraphs that give the same
// size limit in different words. The decision-critical facts (decider, date, cost, timings, limits) sit in distinct numbers.
// Graded (live only) on the RFC still passing the checker, the body falling at least 15% from the fixture, each seeded
// fault's distinctive phrase being gone, every decision-critical number and the decider surviving, the round log
// tighten-log.json holding at least one round whose last round found nothing (or the reply saying the loop stopped),
// and the reply reporting the body words before and after.
export const FILE = "rfc.md";
// Counted as the checker and the tighten script count the body, which is what the reply reports.
const BEFORE = bodyWords(fs.readFileSync(new URL("../fixtures/rfc-six-pager-tighten/rfc.md", import.meta.url), "utf8"));
const LOG = "tighten-log.json";

const between = (text, from, to) => {
  const start = text.search(new RegExp(`^## +${from}\\s*$`, "mi"));
  if (start < 0) return "";
  const end = text.slice(start + 3).search(new RegExp(`^## +${to}\\s*$`, "mi"));
  return end < 0 ? text.slice(start) : text.slice(start, start + 3 + end);
};
const words = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
// The body: from `## Decision` up to the first section after `## Open questions`, as the checker reads it.
const bodyOf = (text) => {
  const start = text.search(/^## +Decision\s*$/m);
  if (start < 0) return "";
  const end = text.slice(start + 3).search(/^## +(?:Sources|FAQ|Appendix.*|Review record)\s*$/m);
  return (end < 0 ? text.slice(start) : text.slice(start, start + 3 + end)).replace(/^```mermaid\n[\s\S]*?^```$/gm, "");
};

// One distinctive phrase for each seeded fault.
const FAULTS = [
  ["the paragraph that restates the Decision", /at a cost of \$420 a month/i],
  ["the history of how the idea came up", /came up at the March infrastructure sync|Tomas Reyes|working group met twice/i],
  ["one sentence for each region", /read from the (?:Frankfurt|Virginia|Singapore) cache bucket/i],
  ["the mitigation with no effect", /Old entries need a cleanup rule/i],
  ["the platform jargon", /rehydrates the layer graph|write-through proxy|content-addressed blobs/i],
  ["the second statement of the size limit", /Nothing above the 2 GB limit is ever written/i],
];
// What the decider needs, each in a form the rewrite may change in spacing or order.
const KEPT = [
  ["the decider", /Imani/],
  ["the decision date", /June 10, 2027/],
  ["the median today and after", /38 minutes[\s\S]*\b17\b|\b17\b[\s\S]*38 minutes/],
  ["the monthly cost", /\$420/],
  ["the weekly pipeline count", /2,100/],
  ["the share of build time repeated", /61 ?%/],
  ["the retention period", /\b14 days\b/],
  ["the size limit", /\b2 GB\b/],
  ["the read time", /\b90 ms\b/],
  ["the read timeout", /\b2 seconds\b/],
  ["the larger-runner cost", /\$1,150/],
];

function check({ live, repo, answer }) {
  // A re-grade has only the recorded answer, not the repository the model wrote into.
  if (!live) return [];
  const file = path.join(repo, FILE);
  if (!fs.existsSync(file)) return [`rfc-six-pager: ${FILE} was not written`];
  const text = fs.readFileSync(file, "utf8");
  const body = bodyOf(text);
  const after = bodyWords(text);
  const log = path.join(repo, LOG);
  const logPath = fs.existsSync(log) ? log : fs.existsSync(path.join(repo, "docs", LOG)) ? path.join(repo, "docs", LOG) : null;
  let rounds = null;
  if (logPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(logPath, "utf8"));
      rounds = Array.isArray(parsed) ? parsed : parsed.rounds;
    } catch {
      rounds = null;
    }
  }
  const last = Array.isArray(rounds) ? rounds.at(-1) : null;
  const found = last ? (Array.isArray(last.findings) ? last.findings.length : Number(last.findings)) : NaN;
  const nums = [...answer.matchAll(/\b\d{1,2},?\d{3}\b|\b\d{3,4}\b/g)].map((m) => Number(m[0].replace(",", "")));
  return failures(
    ...checkRfc(text).map((p) => `rfc-six-pager: ${FILE}:${p.line}: ${p.rule}: ${p.message}`),
    after <= BEFORE * 0.85 ? null : `rfc-six-pager: the body is ${after} words, a fall of ${Math.round((1 - after / BEFORE) * 100)}% from ${BEFORE}; at least 15% is required`,
    ...FAULTS.map(([name, re]) => expect.excludes(`rfc-six-pager: ${name} is gone from the body`, body, re)),
    ...KEPT.map(([name, re]) => expect.matches(`rfc-six-pager: ${name} survives`, text, re)),
    Array.isArray(rounds) && rounds.length >= 1 ? null : `rfc-six-pager: ${LOG} is missing or holds no round`,
    found === 0 || /\bstop(?:ped)?\b/i.test(answer) ? null : `rfc-six-pager: the last round of ${LOG} has ${Number.isNaN(found) ? "no findings count" : `${found} findings`} and the reply does not say the loop stopped`,
    nums.some((n) => Math.abs(n - BEFORE) <= 5) ? null : `rfc-six-pager: the reply does not report the body words before (${BEFORE})`,
    nums.some((n) => Math.abs(n - after) <= Math.max(5, after * 0.03)) ? null : `rfc-six-pager: the reply does not report the body words after (${after})`,
  );
}

export default {
  slug: "cache-tighten-rfc",
  title: "Tighten a long RFC without losing what the decision needs",
  workflow: "oneshot",
  fixtures: ["rfc-six-pager-tighten"],
  request: "rfc.md reads long. Tighten it: say it in fewer words without losing anything the decision needs.",
  phases: [
    {
      skill: "rfc-six-pager",
      terminal: true,
      request: [
        "`rfc.md` reads long. Tighten it: say it in fewer words without losing anything the decision needs.",
        `Edit \`${FILE}\` in place. It is the deliverable: publish nowhere. Ask no questions. Do not commit.`,
      ].join("\n"),
      check,
    },
  ],
};
