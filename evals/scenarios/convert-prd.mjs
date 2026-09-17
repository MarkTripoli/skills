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
// A hedge that marks a sentence as recording an open question rather than a decision.
const HEDGE = /whether|open question|no decision|not decided|undecided|not stated|leaves? open|TBD|see Verify/i;
// A pointer into the export beside a statement: a line, item, or requirement number, the export's
// file, title, or section.
const POINTER = /\b(line|item|requirement)s?\s*\d+|(?<=\W):\d+\b|billing-alerts-prd\.md|Billing Alerts Digest|"Requirements"|## Requirements/gi;
// A made-up target for "fast": a number with a duration unit, in digits or words.
const DURATION = /\b\d+(\.\d+)?\s?(ms|milliseconds?|s|secs?|seconds?|mins?|minutes?|hours?)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|sixty)\s+(second|minute|hour)s?\b/i;

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
      commit: "docs(task): sources artifact",
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
      commit: "docs(task): prd artifact",
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
        const sevenDayDecided = sentences(productSections, SEVEN_DAY).filter((s) => !HEDGE.test(s));
        return failures(
          // One pass: the reply is the final answer, not an interview turn.
          expect.includes("reply: ended at the final answer", answer, "The PRD is ready for review."),
          expect.excludes("reply: no interview options offered", answer, /Option [ABC]\b/),
          // Every requirement mapped to an obligation, each cited to the export.
          expect.filled("prd: Problem to Solve", section(text, "### Problem to Solve")),
          expect.matches("prd: open-rate metric carried over", section(text, "### Success Measures") ?? "", /40%/),
          expect.matches("prd: ticket-reduction metric carried over", section(text, "### Success Measures") ?? "", /half|50%|214/),
          expect.atLeast("prd: obligations stated with shall", obligations.length, 6),
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
          expect.matches("prd: 'fast' named as a known limit", limits, /fast/i),
          expect.matches("prd: open question named as a known limit", limits, SEVEN_DAY),
          mockups.length ? `prd: conversion wrote mockups: ${mockups.join(", ")}` : null,
        );
      },
    },
  ],
};
