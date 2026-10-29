import { expect, failures } from "../lib.mjs";
import { FILE, briefProblems, readBrief, readerText } from "./product-brief.mjs";

// No source documents: the whole input is a two-sentence problem statement, as a user would type it on the command
// line. The brief must still have the full shape, and it must mark the facts it assumed, because the prompt gives no
// roles, counts or decisions. The request forbids questions, so the assumptions land in the page, not in a reply.
// The cast must come from the ward, not from either worked example in the skill.
function promptCheck({ live, repo }) {
  if (!live) return [];
  const html = readBrief(repo);
  if (html === null) return [`product-brief: ${FILE} was not written`];
  const text = readerText(html);
  return failures(
    ...briefProblems(html),
    expect.matches("product-brief: assumptions marked", text, /\bassum/i),
    expect.matches("product-brief: the shift handover problem", text, /handover|hand over|handoff/i),
    expect.excludes("product-brief: a worked example's cast copied", text, /\b(?:Noah|Ralph|Quinn|Quentin|Romeo|Iris|Devon|Hana)\b/),
  );
}

export default {
  slug: "shift-handover-brief",
  title: "Write a product brief from a one-line problem statement",
  workflow: "oneshot",
  fixtures: [],
  request: "Write a product brief for a shift handover screen.",
  phases: [
    {
      skill: "product-brief",
      terminal: true,
      request: [
        "/product-brief Night-shift nurses on a hospital ward lose track of which patients still need a medication check when the shift changes. Give the incoming nurse one place to see what is still open and to take it over.",
        `Write the brief to \`${FILE}\` at the repository root. Ask no questions. There is no publishing tool here. Do not commit.`,
      ].join("\n"),
      check: promptCheck,
    },
  ],
};
