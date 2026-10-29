import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// The fixture is a bloated BA specification with status cruft, an invented requirement range and two contradictions,
// plus the request thread that holds the real ask, a field quote and the owner's decisions. The brief must keep the
// owner's decisions, carry the field quote, introduce its cast and key screens before the principles, give each principle a why,
// draw fat-marker sketches with red arrows, and number its functional specifications. No publishing tool exists here,
// so the page stays a local file.
export const FILE = "brief.html";

export const readerText = (html) =>
  (html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ");

// Shared by the prompt-only scenario (product-brief-prompt.mjs), which has no source documents.
export function briefProblems(html) {
  const text = readerText(html);
  const who = text.search(/Who['’]s who/i);
  const principles = text.search(/\bPrinciples\b/);
  const sketch = text.search(/\b(?:Seen|Done) by\b/);
  const whys = (text.match(/\bWhy\b/g) ?? []).length;
  return [
    who < 0 ? "product-brief: no Who's who cast section" : null,
    principles < 0 ? "product-brief: no Principles section" : null,
    who >= 0 && principles >= 0 && who > principles ? "product-brief: the cast comes after the principles that use it" : null,
    sketch >= 0 && principles >= 0 && sketch > principles ? "product-brief: the key screens come after the principles" : null,
    whys >= 3 ? null : `product-brief: ${whys} Why labels, expected one per principle and at least 3`,
    expect.matches("product-brief: marker wobble filter", html, /<feTurbulence[\s\S]*<feDisplacementMap/),
    expect.matches("product-brief: a viewer tag on a sketch", text, /\b(?:Seen|Done) by\b/),
    expect.matches("product-brief: numbered functional specifications", html, /FS-/),
    expect.excludes("product-brief: status cruft", text, /Draft for review|Status:|Ships after/i),
    expect.excludes("product-brief: an open questions section", text, /Open (?:questions|decisions)/i),
  ];
}

export const readBrief = (repo) => {
  const file = path.join(repo, FILE);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
};

function briefCheck({ live, repo }) {
  // A re-grade has only the recorded answer, not the repository the model wrote into.
  if (!live) return [];
  const html = readBrief(repo);
  if (html === null) return [`product-brief: ${FILE} was not written`];
  const text = readerText(html);
  return failures(
    ...briefProblems(html),
    expect.matches("product-brief: the field quote", text, /which cameras are still out/i),
    expect.matches("product-brief: one row for two items", text, /one row/i),
    expect.excludes("product-brief: invented requirement range", text, /OG-01 to OG-60/),
    expect.excludes("product-brief: Team Leads see every team", text, /Team Leads? (?:can )?sees? (?:overdue checkouts for )?every team/i),
  );
}

export default {
  slug: "overdue-gear-brief",
  title: "Distill a bloated BA specification into a product brief",
  workflow: "oneshot",
  fixtures: ["product-brief"],
  request: "Turn docs/ba-spec.md into a product brief for the engineers and coding agents who will build the Overdue panel. docs/request-thread.md holds the request and the owner's decisions.",
  phases: [
    {
      skill: "product-brief",
      terminal: true,
      request: [
        "Turn `docs/ba-spec.md` into a product brief for the engineers and coding agents who will build the Overdue panel. `docs/request-thread.md` holds the request, a field quote and the owner's decisions.",
        `Write the brief to \`${FILE}\` at the repository root. The owner's decisions in the thread are final, so ask no questions. There is no publishing tool and no prototype access here. Do not commit.`,
      ].join("\n"),
      check: briefCheck,
    },
  ],
};
