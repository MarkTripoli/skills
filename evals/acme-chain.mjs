// The phases the `full` and `lean` chains share when vendor documentation was gathered ahead of them:
// gather-sources, create-research-questions, create-research. What is graded is that the vendor facts
// travel by citation (a pointer to the saved document or the sources artifact beside each fact), that
// the vendor question is answered from the sources rather than sent to a web worker, and that the
// research handoff follows `workflow`, which is where the two chains part.

import { expect, failures, section } from "./lib.mjs";

export const SOURCE = "docs/external/acme-status-api.md";
export const slug = "acme-status-channel";
export const title = "Add an acme-status channel that opens an incident";
export const request = `Add an \`acme-status\` channel to notifyctl that posts a notification as an incident on our Acme Status page. The vendor API documentation is saved at ${SOURCE}.`;

// A fact with a pointer into the saved document or the sources artifact on the same line, before or
// after it, within 200 characters. Restating the fact without a pointer is not citing it.
const POINTER = "(acme-status-api\\.md|01-sources-[a-z0-9-]+\\.md|sources artifact)";
const cited = (fact) => new RegExp(`${fact}[^\\n]{0,200}${POINTER}|${POINTER}[^\\n]{0,200}${fact}`, "i");

export function researchPhases(researchNext) {
  return [
    {
      skill: "gather-sources",
      request: `Gather the sources for this task: the Acme Status API documentation at ${SOURCE}.`,
      artifactType: "sources",
      template: "sources_template.md",
      next: "create-research-questions",
      commit: "docs(task): sources artifact",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        return failures(
          expect.includes("sources: source location", text, SOURCE),
          expect.matches("sources: rate limit excerpt", text, /60 requests per minute/),
          expect.matches("sources: endpoint excerpt", text, /\/v1\/pages\/\{page_id\}\/incidents/),
          expect.matches("sources: idempotency excerpt", text, /Idempotency-Key/),
        );
      },
    },
    {
      skill: "create-research-questions",
      artifactType: "research-questions",
      template: "research_questions_template.md",
      next: "create-research",
      commit: "docs(task): research-questions artifact",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        const questions = (section(text, "## Questions") ?? "").split("\n").filter((l) => /^\d+\. /.test(l));
        const tagged = questions.filter((l) => /\((locate|analyze|pattern|web|none)\)\.?\s*$/.test(l));
        // A question about the vendor contract is answerable from the sources artifact; sending it to a
        // web worker means the sources were not read.
        const vendorToWeb = questions.filter((l) => /acme|vendor|incident|status[- ]page|429|retry-after|rate.?limit|idempotency|bearer|page_id/i.test(l) && !/since|newer|changed|version|current/i.test(l) && /\(web\)\.?\s*$/.test(l));
        return failures(
          expect.includes("questions: vendor doc among Key Context Pointers", section(text, "## Key Context Pointers") ?? "", SOURCE),
          expect.atLeast("questions: numbered questions", questions.length, 2),
          questions.length !== tagged.length ? `questions: ${questions.length - tagged.length} question(s) without a role tag` : null,
          expect.matches("questions: one asks how channels are wired today", questions.join("\n"), /channel/i),
          vendorToWeb.length ? `questions: vendor question routed to a web worker instead of the sources: ${vendorToWeb[0].slice(0, 100)}` : null,
        );
      },
    },
    {
      skill: "create-research",
      artifactType: "research",
      template: "research_template.md",
      next: researchNext,
      commit: "docs(task): research artifact",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        return failures(
          expect.matches("research: channel registry cited by path", text, /src\/channels\/index\.mjs/),
          expect.matches("research: vendor rate limit cited to the saved doc or the sources artifact", text, cited("60 requests per minute")),
          expect.matches("research: vendor endpoint cited to the saved doc or the sources artifact", text, cited("/incidents")),
          expect.matches("research: vendor error contract present", text, /429[\s\S]{0,300}Retry-After/),
        );
      },
    },
  ];
}
