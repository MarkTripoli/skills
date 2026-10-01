import { expect, failures } from "../lib.mjs";

const SOURCE = "docs/story-start.md";
const nonTestableLine = "Not independently testable — covered by the parent Story's acceptance criteria.";

export default {
  slug: "jira-story-start",
  title: "Draft testable and non-testable implementation children at Story start",
  workflow: "jira-hierarchy",
  fixtures: ["jira-hierarchy"],
  request: `Work is starting on the Story snapshot in ${SOURCE}. Draft children only; do not write to Jira.`,
  phases: [
    {
      skill: "jira-issue-hierarchy",
      request: `Read ${SOURCE} and the approved requirement it cites. Draft the two needed implementation Sub-task descriptions for review, including Jira parent, issue type, testability, and label fields. Use the skill-local body templates; do not claim the issues were created or route a child to QA. Jira writes are expressly unauthorized. Record an immutable indexed artifact of type jira-story-start in implementation.jira with status draft and a concise summary. End with exactly one text command fence: /jira-issue-hierarchy @<recorded artifact path>.`,
      artifactType: "jira-story-start",
      handoffNamesArtifact: true,
      next: "jira-issue-hierarchy",
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        const nonTestableAt = text.indexOf(nonTestableLine);
        const testableBody = nonTestableAt < 0 ? text : text.slice(0, nonTestableAt);
        const nonTestableBody = nonTestableAt < 0 ? "" : text.slice(nonTestableAt);
        return failures(
          expect.matches("Story start: both pieces of work addressed", text, /retry.{0,160}(?:idempoten|duplicate)|(?:idempoten|duplicate).{0,160}retry/i),
          expect.matches("Story start: generated client addressed", text, /generat.{0,40}client/i),
          expect.matches("Story start: Jira parent is existing Story", text, /KIT-520/),
          expect.matches("Story start: testable body begins with its acceptance criteria", testableBody, /^## Acceptance Criteria\s*\n- \[ \]/m),
          expect.matches("Story start: non-testable body begins with exact template line", nonTestableBody, /^Not independently testable — covered by the parent Story's acceptance criteria\./),
          expect.matches("Story start: non-testable child carries no_qa", nonTestableBody, /no_qa/),
          expect.excludes("Story start: testable child's labels do not include no_qa", testableBody, /^\s*(?:labels?|tags?):\s*[^\n]*no_qa/im),
          expect.excludes("Story start: no child is handed to QA", text, /(?:send|route|handoff|assign) (?:the )?(?:child|sub[- ]task) to QA/i),
          expect.matches("Story start: proposals rather than claimed Jira writes", text, /draft|propos(?:al|ed)|not created|not written/i),
        );
      },
    },
  ],
};
