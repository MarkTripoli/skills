import { deliverCheck } from "../deliver-grade.mjs";

// The separate-session fallback of `deliver/references/model_enforcement.md`: the builder definitions carry no pinned model, so
// the orchestrator has to start the builder as its own `omp -p --model <economy>` session. The runner records every session the
// orchestrator starts through `omp` under `nested/`, and the grader needs the builder commit to come from one of them on the economy model.
export default {
  slug: "deliver-separate-builder",
  title: "Fix the retry backoff cap with a separate builder session",
  workflow: "oneshot",
  fixtures: ["deliver-small-bug"],
  pinBuilders: false,
  request: `\`backoffDelay\` in \`src/retry.mjs\` ignores its cap: it should double \`baseMs\` per attempt and never exceed \`maxMs\`, and \`npm test\` fails.

Acceptance criteria:
- \`npm test\` passes, including the two tests in \`tests/retry.test.mjs\`.
- The fix changes only \`src/retry.mjs\`.`,
  phases: [
    {
      skill: "deliver",
      terminal: true,
      nested: true,
      model: "anthropic/claude-opus-5-5",
      request: [
        "Run /deliver for this task unattended: gates none, do not ask me anything. This repository is already open on its task branch; do not open another worktree. It has no remote and no pull request host, so stop at publish if nothing else blocks.",
        "Use no Slack: start no Slack run and post nothing to Slack. The model profile is `.agents/model-candidates.json`.",
        "Write a short plan artifact before building. This repository has no pinned builder definition, so start the builder on its model per the skill's model enforcement reference; reviewers are separate reviewer subagents.",
        "The independent plan checkpoint must bind the current indexed plan through reviewed_artifact and reviewed_artifact_sha256.",
      ].join("\n"),
      check: deliverCheck({ separate: true }),
    },
  ],
};
