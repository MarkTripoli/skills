import { DEFAULT_MODEL, ORDERED_REQUEST, babysitCheck, deliverComparisonCheck, resumeCheck, setupOrdered } from "../babysit-ordered.mjs";

const terminal = { terminal: true, model: DEFAULT_MODEL };
export default {
  slug: "babysit-ordered",
  title: "Supervise a frozen cross-project PR DAG",
  workflow: "oneshot",
  fixtures: ["babysit-ordered"],
  request: ORDERED_REQUEST,
  phases: [
    {
      ...terminal,
      skill: "deliver",
      setup: (ctx) => setupOrdered(ctx, "deliver"),
      request: `${ORDERED_REQUEST}\n\nUse the installed plain deliver workflow for this comparison. Do not substitute babysit or alter deliver's never-merge rule. Work unattended, gates none, and persist what this workflow can supervise before reporting the unavailable original prerequisites. Do not create implementation work that this existing-PR request did not ask for.`,
      check: deliverComparisonCheck,
    },
    {
      ...terminal,
      skill: "babysit",
      artifactType: "babysit",
      setup: (ctx) => setupOrdered(ctx, "babysit"),
      request: `${ORDERED_REQUEST}\n\nThis is a fresh babysit run, not a resume of the deliver comparison. Its provider was reset to exactly the same initial selection/snapshot/schedule. Use the babysit artifact as the authoritative durable ledger; do not consume the comparison's provider files or artifacts as host facts.`,
      check: babysitCheck,
    },
    {
      ...terminal,
      skill: "babysit",
      artifactType: "babysit",
      setup: (ctx) => setupOrdered(ctx, "resume"),
      request: `Resume /babysit from the existing numbered type: babysit artifact in .agents/tasks/babysit-ordered. Reuse that same file, frozen membership, authority, cursors and retry accounting. The simulated external host now independently confirms the API prerequisite merged. This is a host observation, not evidence that this agent repaired or merged it. Reconcile the root from glab, inspect the newly released web frontier's current CI before its reviews, preserve completed breadcrumbs, and keep missing original proofs/review prerequisites blocked. Do not call babysit-fixture tick again, invent source work or seals, widen scope, send Slack/Jira or claim a background watcher. The same isolated provider boundary and unavailable original context apply. Observe one bounded sweep and report the resume artifact.`,
      check: resumeCheck,
    },
  ],
};
