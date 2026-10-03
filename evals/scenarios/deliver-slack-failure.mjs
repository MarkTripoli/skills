// One live `/deliver` session on the seeded retry bug with Slack wanted but unreachable: the harness's isolation (lib.mjs `isolatedEnv`)
// points `SLACK_AGENT_ENV_FILE` at a file that does not exist and puts a failing `slack-coordinator` ahead of the real one, so the run
// has no coordinator and no token file. Delivery must go on without Slack: `## Decisions` in `task.md` records the failure (task_setup.md),
// the reply says Slack was skipped or unavailable without repeating the phrase `Slack thread skipped` (no skill fixes those words),
// `task.md` gains no `slack_run_id`, `slack_thread_ts` or `slack_channel`, and no `curl` call reaches slack.com (a `curl` stub logs every
// call and fails). Everything `deliverCheck` grades for the plain run (plan, builder, reviewers, blocked stop at the missing remote) still applies.
// This is the first scenario of the plan row; the mid-run coordinator outage (`run start` succeeded, then unreachable) is not covered.

import fs from "node:fs";
import path from "node:path";
import { deliverCheck } from "../deliver-grade.mjs";
import { failures, section } from "../lib.mjs";

export default {
  covers: ["agent-slack-control-plane"],
  slug: "deliver-slack-failure",
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
      // Any request to Slack over HTTP is recorded and refused; a run that follows the skill never gets that far without a token file.
      stubs: { curl: "echo 'curl is unavailable in evals' >&2; exit 7" },
      request: [
        "Run /deliver for this task unattended: gates none, do not ask me anything. This repository is already open on its task branch; do not open another worktree. It has no remote and no pull request host, so stop at publish if nothing else blocks.",
        "Slack visibility is wanted for this task: open the Slack thread as the skill describes if Slack is set up. Slack is not a delivery gate. The model profile is `.agents/model-candidates.json`.",
        "Write a short plan artifact before building, and let a builder subagent and separate reviewer subagents do the work, per the skill.",
      ].join("\n"),
      check: (ctx) => {
        const taskText = fs.existsSync(path.join(ctx.taskDir, "task.md")) ? fs.readFileSync(path.join(ctx.taskDir, "task.md"), "utf8") : "";
        const skipped = ctx.answer.match(/Slack thread skipped/gi)?.length ?? 0;
        const decisions = section(taskText, "## Decisions");
        const said = /slack[^\n]{0,120}(?:skipp|unavailable|unreachable|not (?:set up|configured|reachable)|without|failed|fail)/i.test(ctx.answer);
        const slackCalls = ctx.stubCalls.filter((call) => /slack/i.test(call));
        return failures(
          deliverCheck()(ctx),
          decisions && /slack/i.test(decisions) ? null : "deliver: task.md ## Decisions does not record the Slack failure",
          said ? null : "deliver: the reply never says Slack was skipped or unavailable",
          skipped <= 1 ? null : `deliver: the reply says "Slack thread skipped" ${skipped} times, expected at most once`,
          /^(?:slack_run_id|slack_thread_ts|slack_channel):/m.test(taskText) ? "deliver: task.md gained slack_run_id, slack_thread_ts or slack_channel although Slack was unreachable" : null,
          slackCalls.map((call) => `deliver: a Slack request was attempted: ${call.slice(0, 100)}`),
        );
      },
    },
  ],
};
