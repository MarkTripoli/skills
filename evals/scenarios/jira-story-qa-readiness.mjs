import { expect, failures } from "../lib.mjs";

const SOURCE = "docs/story-and-children.md";

export default {
  slug: "jira-story-qa-readiness",
  title: "Check Story readiness without promoting incomplete work",
  workflow: "jira-hierarchy",
  fixtures: ["jira-hierarchy"],
  request: `Check Story QA readiness from ${SOURCE}. This is a review-only request; do not update Jira, merge, deploy, close, or transition anything.`,
  phases: [
    {
      skill: "jira-issue-hierarchy",
      request: `Check Story QA readiness using ${SOURCE}. Report each readiness prerequisite as met, missing, or unconfirmed based only on the fixture. Do not change Jira. Record an immutable indexed artifact of type qa-readiness in review.qa with status blocked and a concise summary. End with exactly one text command fence: /jira-issue-hierarchy @<recorded artifact path>.`,
      artifactType: "qa-readiness",
      handoffNamesArtifact: true,
      next: "jira-issue-hierarchy",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        return failures(
          expect.matches("QA: assesses Story rather than treating child work as QA unit", text, /KIT-417/),
          expect.matches("QA: submitted is not treated as merged", text, /(?:not|un)merged|(?:submitted|open).{0,120}(?:not|isn't|hasn't) merged|merged.{0,120}(?:missing|unconfirmed|no evidence)/i),
          expect.matches("QA: open agent-owned child blocks readiness", text, /KIT-418|In Progress/i),
          expect.matches("QA: deployed status not inferred", text, /(?:not|un)deployed|deploy.{0,120}(?:unknown|not confirmed|no evidence|missing|unconfirmed)|no evidence.{0,120}deploy/i),
          expect.matches("QA: test data unconfirmed", text, /test data.{0,120}(?:not confirmed|missing|unknown|unconfirmed)|(?:not confirmed|missing|unknown|unconfirmed).{0,120}test data/i),
          expect.matches("QA: missing Story links reported", text, /link|spec|design/i),
          expect.matches("QA: explicitly does not declare ready", text, /not ready|blocked|missing prerequisite|not yet ready/i),
          expect.excludes("QA: does not claim transition happened", text, /(?:I|we) (?:have )?(?:transitioned|moved) (?:the )?Story to (?:Ready for QA|Ready to test)/i),
        );
      },
    },
  ],
};
