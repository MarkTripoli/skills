// The lean chain with the same gathered vendor documentation. Where it differs from `full` is exactly
// what is graded: the research reply hands off to `/create-structure-outline` because `task.md` says
// `workflow: lean`, and the outline (not a design discussion) carries the vendor contract into its
// steps. Four fresh sessions.

import { expect, failures, section } from "../lib.mjs";
import { SOURCE, request, researchPhases, slug, title } from "../acme-chain.mjs";

const HUMAN_REVIEW = "## Human Review";

export default {
  slug,
  title,
  workflow: "lean",
  fixtures: ["full-with-sources"],
  request,
  phases: [
    ...researchPhases("create-structure-outline"),
    {
      skill: "create-structure-outline",
      artifactType: "structure-outline",
      template: "structure_outline_template.md",
      next: "implement-outline",
      handoffNamesArtifact: true,
      commit: "docs(task): structure-outline artifact",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        const body = text.split(HUMAN_REVIEW)[0];
        // The template lays files out as trees, so a path may be split across tree lines: match the
        // file names, not the full paths.
        const steps = body.slice(Math.max(0, body.search(/^## Phase 1/m)));
        return failures(
          expect.matches("outline: at least one phase", body, /^## Phase 1/m),
          expect.matches("outline: unchecked boxes inside the phases", steps, /- \[ \]/),
          expect.matches("outline: a phase creates the channel module", steps, /acme-status\.mjs/),
          expect.matches("outline: a phase touches a test file", steps, /[a-z-]+\.test\.mjs/),
          expect.matches("outline: vendor contract reaches the steps", steps, /Idempotency-Key|Retry-After|429|Bearer/),
          expect.includes("outline: vendor doc still cited", text, SOURCE),
        );
      },
    },
  ],
};
