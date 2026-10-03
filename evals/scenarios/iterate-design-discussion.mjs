// /iterate-design-discussion on a seeded design discussion with two open questions. The user's message decides only one of them.
// What it catches: a question moved to Resolved without a user decision, a stale or malformed Execution DAG, a change log,
// a new artifact instead of an edit as an immutable successor, a reply that is not the review template pointing back at the iterate skill.
// Terminal phase: the seeded artifact is saved as an immutable successor, so the runner's new-artifact handoff checks do not apply.

import { expect, failures, section } from "../lib.mjs";
import { dagProblems, entries, currentArtifact, revisionProblems, seed } from "../iterate-grade.mjs";

const FILE = "artifacts/design/discussion/0001.md";

const SEED = `---
task: webhook-channel-design
type: design-discussion
summary: "Adds a webhook channel to notifyctl that posts a notification as JSON to a configured URL. Fixes the JSON payload shape; leaves where the URL secret lives and whether a failed post is retried open for the owner."
repo: notifyctl
branch: main
sha: 0000000
---

### Summary of change request

Operators want \`notifyctl send --channel webhook\` to post the notification to a chat or incident tool as JSON, so they do not read the outbox by hand.

### Current State

- \`notifyctl send\` resolves a channel module by name and calls its \`deliver()\`; only \`console\` and \`email\` exist.
- Every delivery, whatever its channel, is appended to \`outbox/log.json\`.

### Desired End State

- An operator can send a notification to a webhook URL and see \`delivered\` or \`failed\` in \`notifyctl list\`.
- A failed post is visible in the log, not silent.

### What we're not doing

- Signing payloads or verifying the receiver's certificate pinning.
- Batching several notifications into one post.

### Proposed End State Architecture

A new channel module \`src/channels/webhook.mjs\` exports \`name\` and \`deliver({ to, message, config })\` like the others; \`to\` is a label, the URL comes from configuration.

\`\`\`text
send --channel webhook
  loadChannel("webhook")
  webhook.deliver
    post JSON { to, message }
    return { id, status }
\`\`\`

### Design Questions

#### Secret placement

Where does the webhook URL, which embeds a secret token, live?

- Option A: the \`NOTIFYCTL_WEBHOOK_URL\` environment variable; nothing secret is written to disk.
- Option B: a \`url\` key under \`channels.webhook\` in \`notifyctl.config.json\`, which is committed to the repository.

Recommendation: Option A, because the config file is committed and the URL is a credential.

#### Retry on failed delivery

What happens when the receiver answers with a 5xx or does not answer?

- Option A: no retry; the log records \`failed\`.
- Option B: retry up to three times with a one second pause, then record \`failed\`.

Recommendation: Option A for the first release, because a retry loop inside a CLI call hides slow receivers from the operator.

### Resolved Design Questions

#### Payload format

JSON object with \`to\` and \`message\` - the email channel already treats those two fields as the contract - \`src/channels/email.mjs:8\`.

Form-encoded bodies were not chosen: receivers in the team's tools all accept JSON.

### Patterns to follow

#### Channel module shape

A channel exports \`name\` and \`deliver\` and returns \`{ id, status }\` - \`src/channels/console.mjs:3-8\`.

### Execution DAG

The chain is the \`full\` workflow; the design discussion and the plan pause for approval.

\`\`\`mermaid
flowchart TD
  rq["create-research-questions"] --> research["create-research"]
  research --> design["create-design-discussion<br/>gate: plan"]
  design --> plan["create-plan<br/>gate: plan"]
  plan --> baseline["record-evidence --baseline"]
  baseline --> impl["implement-plan"]
  impl --> verify["verify-implementation"]
  verify --> review["review loop"]
  review --> evidence["record-evidence"]
  evidence --> iterate["iterate-evidence"]
  iterate --> pr["describe-pr"]
\`\`\`

## Human Review

### Review targets

- The two open decisions and their recommendations.

### Verify

- [ ] Both open decisions are answered before \`/create-plan\` runs.

### Known limits

- None.
`;

export default {
  slug: "webhook-channel-design",
  title: "Add a webhook channel to notifyctl",
  workflow: "full",
  request: "Add a `webhook` channel to notifyctl that posts a notification as JSON to a configured URL.",
  phases: [
    {
      skill: "iterate-design-discussion",
      terminal: true,
      template: "design_discussion_template.md",
      setup: seed({ [FILE]: SEED }),
      request: `Feedback on ${FILE}: go with option A for the secret placement. That is the only decision I am making now.\n\nRun /iterate-design-discussion @${FILE}.`,
      check: (ctx) => {
        const text = currentArtifact(ctx, "design-discussion")?.text ?? "";
        const open = entries(text, "### Design Questions");
        const resolved = entries(text, "### Resolved Design Questions");
        const secret = resolved.find((e) => /secret|webhook url|placement|environment/i.test(e.title));
        const retry = open.find((e) => /retr/i.test(e.title));
        return failures(
          revisionProblems("iterate-design-discussion", ctx, { file: FILE, type: "design-discussion", seedText: SEED, next: "iterate-design-discussion" }),
          expect.present("iterate-design-discussion: the decided question moved to Resolved Design Questions", secret),
          secret ? expect.matches("iterate-design-discussion: resolved entry records option A (the environment variable)", secret.text, /environment variable|NOTIFYCTL_WEBHOOK_URL/) : null,
          secret ? expect.matches("iterate-design-discussion: resolved entry names the rejected alternative (the config file)", secret.text, /config/i) : null,
          secret ? expect.atLeast("iterate-design-discussion: resolved entry carries a rationale, not one word", secret.text.length, 120) : null,
          open.some((e) => /secret placement/i.test(e.title)) ? "iterate-design-discussion: the decided question is still under Design Questions" : null,
          expect.present("iterate-design-discussion: the undecided retry question stays under Design Questions", retry),
          retry ? expect.matches("iterate-design-discussion: the retry question keeps a recommendation", retry.text, /recommend/i) : null,
          resolved.some((e) => /retr/i.test(e.title)) ? "iterate-design-discussion: the retry question was moved to Resolved without a user decision" : null,
          expect.matches("iterate-design-discussion: the earlier resolved decision is kept", section(text, "### Resolved Design Questions") ?? "", /Payload format/),
          dagProblems("iterate-design-discussion", text, [/create-plan/, /implement-plan/, /describe-pr/]),
        );
      },
    },
  ],
};
