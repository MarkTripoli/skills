import { seed } from "../iterate-grade.mjs";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { failures } from "../lib.mjs";

// Live `/review-artifact-comments` with a `<feedback>` block that holds two reviewer comments and no
// instruction to apply either. The skill reads, lists the items, and asks how to proceed: the plan stays
// byte-identical, the repository is untouched, and the reply asks a question. The phase is `terminal`: asking
// is a stop, not a handoff.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const FILE = "artifacts/planning/plan/0001.md";
const PLAN = `---
task: review-artifact-comments
type: plan
summary: "Retry failed notification deliveries with a per-attempt timeout."
---

# Notification Retries Plan

## Desired End State

A failed delivery is retried and then reported failed.

## Phase 1: Retry failed deliveries

- Retry failed deliveries up to 5 times with a doubling delay.
- Use a timeout of 30 seconds per attempt.

### Verify

- [ ] \`npm test\` passes.
`;

export default {
  slug: "review-artifact-comments",
  title: "Retry failed notification deliveries",
  workflow: "oneshot",
  fixtures: [],
  request: "Retry failed notification deliveries with a doubling delay and a per-attempt timeout.",
  phases: [
    {
      skill: "review-artifact-comments",
      terminal: true,
      artifactType: "comment-review",
      setup: ({ taskDir }) => {
        seed({ [FILE]: PLAN })({ taskDir });
        return {};
      },
      request: `Here is review feedback on the plan.

<feedback>
Artifact: ${FILE}

1. Targets: "Retry failed deliveries up to 5 times with a doubling delay."
   Comment: Five retries with doubling delay is a long tail for a notification; is that the intended number?

2. Targets: "Use a timeout of 30 seconds per attempt."
   Comment: Thirty seconds looks arbitrary. Where does that number come from?
</feedback>`,
      check: (ctx) => {
        const plan = fs.existsSync(path.join(ctx.taskDir, FILE)) ? fs.readFileSync(path.join(ctx.taskDir, FILE), "utf8") : null;
        const unfenced = ctx.answer.replace(/^(`{3,}|~{3,})[\s\S]*?^\1[ \t]*$/gm, "");
        const out = [
          plan === null ? `review-artifact-comments: ${FILE} is gone` : plan === PLAN ? null : `review-artifact-comments: ${FILE} was edited although no action was given`,
          /\?\s*$/m.test(unfenced) ? null : "review-artifact-comments: the reply asks no question",
          /retr/i.test(ctx.answer) && /timeout|30 s/i.test(ctx.answer) ? null : "review-artifact-comments: the reply does not cover both feedback items",
        ];
        if (ctx.live) {
          if (git(ctx.repo, "status", "--porcelain")) out.push("review-artifact-comments: repository changed; nothing was asked for");
          if (git(ctx.repo, "rev-parse", "HEAD") !== ctx.fixtureSha) out.push("review-artifact-comments: a commit was made");
        }
        return failures(out);
      },
    },
  ],
};
