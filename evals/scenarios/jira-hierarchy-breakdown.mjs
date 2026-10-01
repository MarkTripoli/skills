import fs from "node:fs";
import { expect, failures } from "../lib.mjs";

const SOURCE = "docs/approved/mobile-checkout.md";
const linkPattern = /(?:docs\/approved\/mobile-checkout\.md|mobile-checkout\.md)(?:#[^\s)]+)?/i;

export default {
  slug: "mobile-checkout-hierarchy",
  title: "Draft Jira hierarchy for approved Mobile Checkout requirement",
  workflow: "jira-hierarchy",
  fixtures: ["jira-hierarchy"],
  request: `The Mobile Checkout requirement at ${SOURCE} is approved. Prepare a reviewable Jira breakdown draft only. Do not create or modify Jira issues.`,
  phases: [
    {
      skill: "jira-issue-hierarchy",
      request: `Break down the approved requirement in ${SOURCE}. Do not make Jira writes: return a reviewable Epic/Story proposal, using the approved text and linking each story to its source criteria. Jira writes are expressly unauthorized. Record an immutable indexed artifact of type jira-breakdown in planning.jira with status draft and a concise summary. End with exactly one text command fence: /jira-issue-hierarchy @<recorded artifact path>.`,
      artifactType: "jira-breakdown",
      handoffNamesArtifact: true,
      // This is a one-stage authoring eval, not a delivery skill chain. The runner's shared artifact
      // contract expects an operational handoff; repeat the independent skill as the review destination.
      next: "jira-issue-hierarchy",
      check: ({ artifact, codeRoot }) => {
        const text = artifact?.text ?? "";
        const source = `${codeRoot}/${SOURCE}`;
        const checks = [
          expect.atLeast("breakdown: at least one Epic and multiple atomic Stories", (text.match(/\b(?:Epic|Story)\b/gi) ?? []).length, 3),
          expect.matches("breakdown: Epic hierarchy proposed", text, /Epic/i),
          expect.atLeast("breakdown: multiple Stories", (text.match(/\bStories\b|\bStory\b/gi) ?? []).length, 2),
          expect.excludes("breakdown: no premature Sub-task proposals", text, /^#{1,4}\s+(?:KIT-\d+\s+)?Sub[- ]task\b/im),
          expect.matches("breakdown: cart review scope covered", text, /cart.{0,100}(?:total|items)|(?:total|items).{0,100}cart/i),
          expect.matches("breakdown: declined payment retry covered", text, /declin.{0,180}(?:retry|duplicate)|(?:retry|duplicate).{0,180}declin/i),
          expect.matches("breakdown: payment data constraint covered", text, /(?:card|payment).{0,120}(?:not store|do not store|never store)|(?:not store|do not store|never store).{0,120}(?:card|payment)/i),
          expect.matches("breakdown: Component field represented", text, /\bComponent\b/i),
          expect.matches("breakdown: parent field represented", text, /\bparent\b/i),
          expect.matches("breakdown: feature-prefixed Story summaries", text, /Mobile Checkout\./i),
          expect.matches("breakdown: source criteria traceable", text, linkPattern),
          expect.matches("breakdown: acceptance criteria traceable", text, /acceptance criteria/i),
          expect.matches("breakdown: out of scope faithfully retained", text, /guest checkout/i),
          expect.matches("breakdown: unresolved criteria and missing design treated explicitly", text, /design.{0,80}(not ready|not approved|none|no design)|(?:not ready|not approved|none|no design).{0,80}design/i),
          expect.matches("breakdown: no Jira writes claimed", text, /draft|propos(?:al|ed)|not created|not written/i),
          expect.present("breakdown: approved source exists in fixture", fs.existsSync(source)),
        ];
        return failures(checks);
      },
    },
  ],
};
