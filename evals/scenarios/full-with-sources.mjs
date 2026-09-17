// The full chain with vendor documentation gathered ahead of it. Five fresh sessions. After the shared
// research phases: the design discussion must raise the vendor-driven decisions as open questions with a
// recommendation each (deciding everything silently is wrong; the fixture has genuine open choices) and
// hand off to its iterate skill while questions remain; the plan must carry vendor facts into its phases,
// add a test, and surface the design decisions it adopted by default under Verify.

import { expect, failures, section } from "../lib.mjs";
import { SOURCE, request, researchPhases, slug, title } from "../acme-chain.mjs";

const HUMAN_REVIEW = "## Human Review";

export default {
  slug,
  title,
  workflow: "full",
  fixtures: ["full-with-sources"],
  request,
  phases: [
    ...researchPhases("create-design-discussion"),
    {
      skill: "create-design-discussion",
      artifactType: "design-discussion",
      template: "design_discussion_template.md",
      // A gate phase: with decisions open it hands off to its iterate skill and the human decides (the
      // pack's gate); with everything resolved it proceeds. The expectation follows the artifact, and
      // the check below requires that decisions are in fact open. The eval then continues to the plan
      // as an unattended run (`gates=none`) would.
      next: ({ artifact }) => (/^#### /m.test(section(artifact?.text ?? "", "### Design Questions") ?? "") ? "iterate-design-discussion" : "create-plan"),
      handoffNamesArtifact: true,
      commit: "docs(task): design-discussion artifact",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        const open = (section(text, "### Design Questions") ?? "").split(/^#### /m).slice(1);
        const openText = open.join("\n");
        return failures(
          expect.atLeast("design: open decisions raised", open.length, 1),
          // The fixture leaves these two genuinely open; deciding them silently under Resolved is wrong.
          expect.matches("design: token/secret placement is an open decision", openText, /token|secret/i),
          expect.matches("design: 429 / Retry-After handling is an open decision", openText, /429|Retry-After/),
          expect.matches("design: new channel module named", text, /acme-status\.mjs|acme_status|acmeStatus/),
          open.filter((q) => !/recommend/i.test(q)).map((q) => `design: open question without a recommendation: ${q.split("\n")[0]}`),
        );
      },
    },
    {
      skill: "create-plan",
      artifactType: "plan",
      template: "plan_template.md",
      next: "implement-plan",
      handoffNamesArtifact: true,
      commit: "docs(task): plan artifact",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        const body = text.split(HUMAN_REVIEW)[0];
        const phases = body.slice(body.search(/^## Phase 1/m));
        const verify = section(text, "### Verify", { last: true }) ?? "";
        return failures(
          expect.matches("plan: at least one phase heading", body, /^## Phase 1/m),
          expect.matches("plan: unchecked boxes inside the phases, not only under Human Review", phases, /- \[ \]/),
          expect.matches("plan: a phase edits the channel module", phases, /\*\*File\*\*: `src\/channels\/acme-status\.mjs`/),
          expect.matches("plan: a phase edits a test file", phases, /\*\*File\*\*: `tests\/[^`]*\.test\.mjs`/),
          expect.matches("plan: vendor contract reaches the phases", phases, /Idempotency-Key|Retry-After|429|Bearer/),
          expect.matches("plan: design decisions adopted without a human are surfaced for review", verify, /- \[ \][^\n]*\b(open (decision|question)s?|design (question|discussion|recommendation)s?|recommend\w*|adopted|default(ed)? to|option [ABC]|Q\d+ [ABC]|fixed options?)\b/i),
          expect.includes("plan: vendor doc still cited", text, SOURCE),
        );
      },
    },
  ],
};
