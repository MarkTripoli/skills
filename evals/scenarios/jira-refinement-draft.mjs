import { expect, failures, section } from "../lib.mjs";

// jira-issue-refinement, single-issue draft with Jira writes unauthorized. The issue text is supplied in the fixture and
// Jira is unreachable (an `acli` stub fails and logs every call), so the draft must come from the supplied text with source
// fields marked unverified. Graded: a `jira-refinement` artifact, a closed `Plan reconciliation` state, proposals only
// where they are marked as proposals, no invented time target, no Jira write call, and the draft-answer template.
// Known gap: the skill's main path is the Atlassian MCP (`<server>:getJiraIssue`), which the `acli`/`jira` stubs do not cover; the
// fixture text is the intended source, and an MCP call is not visible to the grader.
// The skill ends with the draft answer, not a handoff fence, so the phase is terminal and grades the reply itself.
const STATES = /^(?:pending|applied in \S.*|needs-human: \S.*|not needed)$/;
const WRITE = /\b(?:edit|update|create|transition|comment|assign|delete)\b/i;

export default {
  slug: "jira-refinement-draft",
  title: "Draft a refinement for KIT-731",
  workflow: "oneshot",
  fixtures: ["jira-refinement"],
  request: "Refine Jira issue KIT-731 before implementation. Its supplied text is in docs/issue-KIT-731.md. Do not write to Jira.",
  stubs: {
    acli: "echo 'acli: not authenticated; no Jira site is reachable from this machine' >&2\nexit 1",
    jira: "echo 'jira: not authenticated; no Jira site is reachable from this machine' >&2\nexit 1",
  },
  phases: [
    {
      skill: "jira-issue-refinement",
      terminal: true,
      artifactType: "jira-refinement",
      request: [
        "This is a /deliver preimplementation draft for KIT-731. Jira writes are expressly unauthorized, and no live Jira access is available: draft from the supplied text in docs/issue-KIT-731.md and say what could not be verified.",
        "Save the numbered `jira-refinement` artifact in the task directory from the skill's template and end with the skill's draft answer.",
      ].join("\n"),
      check: ({ artifact, answer, stubCalls }) => {
        const text = artifact?.text ?? "";
        const impact = section(text, "## Planning impact") ?? "";
        const specs = section(text, "### Functional specifications") ?? "";
        const rows = specs.split("\n").filter((r) => /^\|\s*F\d+/.test(r));
        const reconciliation = /^-\s*Plan reconciliation:\s*(.+)$/m.exec(impact)?.[1]?.trim().replace(/\.$/, "") ?? null;
        const jiraWrites = stubCalls.filter((c) => /^(?:acli|jira)\b/.test(c) && WRITE.test(c.replace(/^\S+\s+/, "")));
        return failures(
          artifact ? null : "jira-refinement: no artifact of type jira-refinement saved in the task directory",
          expect.matches("jira-refinement: frontmatter status", artifact?.fm?.status ?? "", /\S/),
          expect.matches("jira-refinement: source marked unverified, since Jira was unreachable", text, /unverified/i),
          expect.matches("jira-refinement: the supplied comment's facts are carried (email channel only)", text, /email/i),
          expect.matches("jira-refinement: the issue key is recorded", text, /KIT-731/),
          rows.length ? null : "jira-refinement: no functional specification rows (F1, F2, ...)",
          reconciliation === null ? "jira-refinement: Plan reconciliation line missing" : STATES.test(reconciliation) ? null : `jira-refinement: Plan reconciliation is "${reconciliation}", expected exactly one of the four states`,
          // A row that states a time target or an exit status is the model's own idea unless it is marked a proposal.
          ...rows.filter((r) => /\b\d+\s*(?:ms|milliseconds?|seconds?|minutes?)\b|exit (?:code|status)/i.test(r) && !/proposed/i.test(r)).map((r) => `jira-refinement: an invented target is listed as confirmed: ${r.slice(0, 120)}`),
          expect.excludes("jira-refinement: no write is claimed", text, /Jira (?:description )?(?:was|has been) (?:updated|changed|applied)|description (?:was|has been) (?:updated|applied)/i),
          expect.matches("jira-refinement: Jira write state says draft only", text, /Draft only|No Jira description changed/i),
          jiraWrites.length ? `jira: write calls were attempted: ${jiraWrites.join(" | ")}` : null,
          expect.matches("reply: draft answer names the issue and that Jira was not changed", answer, /KIT-731[\s\S]*Jira was not changed|Jira was not changed[\s\S]*KIT-731/i),
          expect.matches("reply: carries Planning impact", answer, /Planning impact:/i),
          expect.matches("reply: carries Open questions", answer, /Open questions:/i),
          expect.matches("reply: links the review artifact", answer, /Review artifact:[^\n]*\.md/i),
          expect.excludes("reply: no unfilled template field", answer, /\{(?:issue_key|artifact_link|planning_impact|open_questions)\}/),
        );
      },
    },
  ],
};
