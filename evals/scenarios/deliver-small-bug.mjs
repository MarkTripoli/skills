import { deliverCheck } from "../deliver-grade.mjs";

// One live `/deliver` session on a seeded bug. The repository has no remote, so the run must reach publish
// and stop `blocked` naming the missing PR host. The orchestrator runs on the strongest candidate, the builder
// on the economy one (the installer pins it in the worker definition from the fixture model profile), and the recorded omp sessions prove who did what.
export default {
  slug: "deliver-small-bug",
  title: "Fix the retry backoff cap",
  workflow: "oneshot",
  fixtures: ["deliver-small-bug"],
  request: `\`backoffDelay\` in \`src/retry.mjs\` ignores its cap: it should double \`baseMs\` per attempt and never exceed \`maxMs\`, and \`npm test\` fails.

Acceptance criteria:
- \`npm test\` passes, including the two tests in \`tests/retry.test.mjs\`.
- The fix changes only \`src/retry.mjs\`.`,
  phases: [
    {
      skill: "deliver",
      terminal: true,
      model: "anthropic/claude-opus-5-5",
      request: [
        "Run /deliver for this task unattended: gates none, do not ask me anything. This repository is already open on its task branch; do not open another worktree. It has no remote and no pull request host, so stop at publish if nothing else blocks.",
        "Use no Slack: start no Slack run and post nothing to Slack. The model profile is `.agents/model-candidates.json`.",
        "Write a short plan artifact before building, and let a builder subagent and separate reviewer subagents do the work, per the skill.",
        "The independent plan checkpoint must bind the current indexed plan through reviewed_artifact and reviewed_artifact_sha256.",
      ].join("\n"),
      check: deliverCheck(),
    },
  ],
};
