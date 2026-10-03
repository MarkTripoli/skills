// An approved PRD already exists outside the repository (a Notion export). The user wants it in this
// collection's PRD form. Two fresh sessions. `task.md` says "convert" and names the export; nothing
// tells the skill to skip its interview or where the chain continues, so both the conversion mode and
// the handoffs must come from the skills' own rules. gather-sources must digest the export, record the
// unreachable live page as unreachable (not as fetched), and hand off to create-prd; create-prd must
// convert in one pass, state every requirement as an obligation with a pointer into the export beside
// it, leave what the export does not state as `Not stated` plus a Verify decision instead of inventing
// or deciding it, write no mockup, and hand off to create-tdd.

import fs from "node:fs";
import { expect, failures, section, sentences } from "../lib.mjs";

const SOURCE = "docs/external/billing-alerts-prd.md";
const LIVE_PAGE = "https://notion.example.invalid/billing-alerts";
const VERBATIM = "Account owners receive one digest per day at 09:00 in the account's time zone.";
// Alternatives the export never mentions; any of them in Alternative Solutions Considered is invention.
const INVENTED_ALTERNATIVES = /weekly|monthly|in-app|banner|slack|push notification|dashboard|webhook|SMS digest|phone/i;
// The export's open question, in any of the ways a model writes it.
const SEVEN_DAY = /\b(seven|7)[- ]?days?\b|next week|upcoming invoices|\bdue (within|in|soon)\b|not yet overdue/i;
// The wider pattern for the Known limits check only: it also names the open item as
// "upcoming-invoice inclusion", which the decided and Verify-box checks do not select.
const SEVEN_DAY_LIMIT = new RegExp(`${SEVEN_DAY.source}|upcoming[- ]invoice inclusion`, "i");
// A hedge that marks a sentence as recording an open question rather than a decision.
const HEDGE = /whether|open question|no decision|not decided|undecided|not stated|leaves? open|TBD|see Verify/i;
// A whole sentence that only says the item is open: a subject drawn from a closed list of nouns,
// determiners and prepositions (no verb, modal or negation), `remain(s)/is/are`, then `unresolved` or
// `an open decision`. With that list no second clause or decision verb can fit in the sentence.
const OPEN_WORD = "(?:performance|and|upcoming|invoices?|including|due|within|the|next|seven|7|days?|inclusion|window|question)";
const OPEN_ITEM = new RegExp(`^(?:#+\\s*)?${OPEN_WORD}(?:[ -]${OPEN_WORD})*\\s+(?:remains?|is|are)\\s+(?:unresolved|an open decision)(?:,\\s*not an approved requirement)?\\.?$`, "i");
// An OPEN_ITEM sentence is excused only when every other sentence of its paragraph is also quiet: another
// OPEN_ITEM sentence, or a SOURCE_POINTER sentence (a `Source:` line made only of an export link or file, an
// export section name and line numbers). An OPEN_ITEM heading is excused only when its own section also holds
// an OPEN_ITEM sentence that names a seven-day term. HEDGE counts neither as quiet nor for a heading, because
// a HEDGE sentence can carry a decision. The excuse looks only inside the paragraph or section: a deciding
// paragraph that names no seven-day term is never selected, which is the base check's sentence-unit limit
// (origin/main also accepts "Whether to include upcoming invoices is an open question." followed by a
// paragraph "This PRD includes them."). The paragraph verdict is computed once per paragraph.
const EXPORT_LINK = String.raw`\((?:[^)\s#]*\/)?billing-alerts-prd\.md(?:#[^)\s]*)?\)`;
const SOURCE_DOC = String.raw`(?:\[Billing Alerts Digest\]${EXPORT_LINK}|(?:[\w./-]*\/)?billing-alerts-prd\.md|Billing Alerts Digest)`;
const SOURCE_SECTION = "(?:Overview|Problem|Goals and success metrics|Requirements|Non-goals|Open questions)";
const SOURCE_LINES = String.raw`(?:lines?\s*\d+(?:[-–]\d+)?(?:\s*(?:and|,)\s*\d+)*|:\d+(?:-\d+)?)`;
const SOURCE_POINTER = new RegExp(String.raw`^\[?Source:\s*(?:${SOURCE_DOC},?\s*)?(?:${SOURCE_SECTION},?\s*)?${SOURCE_LINES}(?:\]${EXPORT_LINK})?\.?$`);
const quiet = (sentence) => OPEN_ITEM.test(sentence.trim()) || SOURCE_POINTER.test(sentence.trim());
const unexcused = (text) => text.split(/\n(?=#+\s)/).flatMap((section) => {
  const paragraphs = section.split(/\n\s*\n/).map((paragraph) => sentences(paragraph, /./));
  const bodyOpen = paragraphs.flat().some((sentence) => !sentence.startsWith("#") && SEVEN_DAY.test(sentence) && OPEN_ITEM.test(sentence.trim()));
  return paragraphs.flatMap((all) => {
    const allQuiet = all.every(quiet);
    return all.filter((sentence) => SEVEN_DAY.test(sentence) && !HEDGE.test(sentence) && !(OPEN_ITEM.test(sentence.trim()) && allQuiet && (!sentence.startsWith("#") || bodyOpen)));
  });
});
// A pointer into the export beside a statement: a line, item, or requirement number, the export's
// file, title, or section.
const POINTER = /\b(line|item|requirement)s?\s*\d+|(?<=\W):\d+\b|billing-alerts-prd\.md|Billing Alerts Digest|"Requirements"|## Requirements/gi;
// A made-up target for "fast": a number with a duration unit, in digits or words.
const DURATION = /\b\d+(\.\d+)?\s?(ms|milliseconds?|s|secs?|seconds?|mins?|minutes?|hours?)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|sixty)\s+(second|minute|hour)s?\b/i;

// EARS requirements name an actor and response, with a condition when behavior is conditional.
export function earsProblems(details) {
  return sentences(details, /\bshall\b/i).flatMap((sentence) => {
    const text = sentence.replace(/[`*_]/g, "").replace(/^\s*(?:-\s*|\d+[.)]\s*)?(?:[A-Z]+-\d+:\s*)?/, "").trim();
    const ubiquitous = /^(?:the\s+[^,]+|notifyctl|system)\s+shall\s+\S/i.test(text);
    const conditional = /^(?:WHEN|WHILE|WHERE|IF)\s+.+,\s+(?:THEN\s+)?(?:the\s+)?[^,]+\s+shall\s+\S/i.test(text);
    return ubiquitous || conditional ? [] : [`prd: requirement is not an actor/response EARS sentence: "${sentence.slice(0, 120)}"`];
  });
}

export default {
  slug: "billing-alerts-digest",
  title: "Convert the Billing Alerts Digest PRD",
  workflow: "prd",
  fixtures: ["convert-prd"],
  request: `Convert the approved Billing Alerts Digest PRD into our PRD form. The Notion export is at ${SOURCE}; the live page is ${LIVE_PAGE}.`,
  phases: [
    {
      skill: "gather-sources",
      request: `Gather the sources for this task: the PRD export at ${SOURCE} and its live page ${LIVE_PAGE}.`,
      artifactType: "sources",
      template: "sources_template.md",
      next: "create-prd",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        const sources = section(text, "## Sources");
        const unreachable = section(text, "## Unreachable", { body: true });
        return failures(
          expect.includes("sources: source location", text, SOURCE),
          expect.includes("sources: verbatim requirement excerpt", text, VERBATIM),
          expect.matches("sources: success metric excerpt", text, /40% open rate/),
          expect.matches("sources: unreachable live page listed under Unreachable", unreachable, /notion\.example\.invalid/),
          expect.excludes("sources: Unreachable is not None", unreachable, /^None\.?$/m),
          expect.excludes("sources: live page not recorded as a fetched source", sources, /^- (Location|Fetched):[^\n]*notion\.example\.invalid/m),
        );
      },
    },
    {
      skill: "create-prd",
      artifactType: "design-prd",
      template: "prd_template.md",
      next: "create-tdd",
      handoffNamesArtifact: true,
      check: ({ artifact, answer, taskDir }) => {
        const text = artifact?.text ?? "";
        const details = section(text, "### Solution Details");
        // One obligation per "shall" sentence. Each obligation block (a `####` block, or a bullet or
        // paragraph when the section has no sub-headings) must carry a pointer into the export.
        const obligations = sentences(details, /\bshall\b/);
        const blocks = /^#### /m.test(details ?? "") ? (details ?? "").split(/^#### /m).slice(1) : (details ?? "").split(/\n(?=- )|\n\s*\n/);
        const uncited = blocks.filter((b) => /\bshall\b/.test(b) && !new RegExp(POINTER.source, "i").test(b));
        const digest = obligations.find((o) => /09:00/.test(o)) ?? "";
        // Pointers stripped, so `line 27` or `:22` is not mistaken for a made-up number.
        const detailsWithoutPointers = (details ?? "").replace(POINTER, "");
        const alternatives = section(text, "### Alternative Solutions Considered");
        const productSections = [section(text, "### Proposed Solution"), details].filter(Boolean).join("\n\n");
        const verify = section(text, "### Verify", { last: true }) ?? "";
        const limits = section(text, "### Known limits", { last: true }) ?? "";
        const mockups = fs.readdirSync(taskDir, { recursive: true }).filter((f) => String(f).endsWith(".html"));
        // The open question may be named in a product section only as open.
        const sevenDayDecided = unexcused(productSections);
        return failures(
          // Every requirement mapped to an obligation, each cited to the export.
          expect.filled("prd: Problem to Solve", section(text, "### Problem to Solve")),
          expect.matches("prd: open-rate metric carried over", section(text, "### Success Measures") ?? "", /40%/),
          expect.matches("prd: ticket-reduction metric carried over", section(text, "### Success Measures") ?? "", /half|50%|214/),
          expect.atLeast("prd: obligations stated with shall", obligations.length, 6),
          earsProblems(details),
          uncited.length ? `prd: ${uncited.length} obligation block(s) without a pointer into the export, e.g. "${uncited[0].trim().slice(0, 100)}"` : null,
          expect.matches("prd: daily digest obligation names the actor and the time", digest, /notifyctl|system|digest|owner/i),
          expect.matches("prd: daily digest obligation carries the time zone", digest, /time zone/),
          expect.matches("prd: retry-next-day rule carried over", details ?? "", /next day/i),
          expect.matches("prd: SMS non-goal in Out of Scope", section(text, "### Out of Scope") ?? "", /SMS/),
          expect.matches("prd: suspension-policy non-goal in Out of Scope", section(text, "### Out of Scope") ?? "", /suspension policy/i),
          // What the source leaves open stays open: not decided, not invented.
          expect.matches("prd: alternatives not stated by the source", alternatives, /not stated/i),
          expect.excludes("prd: no alternative list invented", alternatives, /^- /m),
          expect.excludes("prd: no alternative invented", alternatives, INVENTED_ALTERNATIVES),
          sevenDayDecided.length ? `prd: the seven-day question reads as decided: "${sevenDayDecided[0].slice(0, 120)}"` : null,
          expect.matches("prd: vague 'fast' requirement carried over as a blank", details, /\bfast\b/i),
          expect.excludes("prd: no made-up duration target for 'fast'", detailsWithoutPointers, DURATION),
          expect.matches("prd: Verify box decides the 'fast' target", verify, /- \[ \][^\n]*fast/i),
          expect.matches("prd: Verify box decides the seven-day question", verify, new RegExp(`- \\[ \\][^\\n]*(${SEVEN_DAY.source})`, "i")),
          expect.matches("prd: 'fast' named as a known limit", limits, /fast|\bspeed requirement\b/i),
          expect.matches("prd: open question named as a known limit", limits, SEVEN_DAY_LIMIT),
          mockups.length ? `prd: conversion wrote mockups: ${mockups.join(", ")}` : null,
        );
      },
    },
  ],
};
