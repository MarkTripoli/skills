// /iterate-tdd on a seeded TDD with a feedback file of two independent items: a `ListFilter` type under Type Definitions and a
// `listLimit` key under Configuration. The skill resolves one change at a time and stops to ask what is next.
// What it catches: both items applied in one pass, an edit in a new file, a stale or malformed Execution DAG (it must match the
// `prd` chain and be rewritten each revision), a change log, a reply that does not ask what next.
// Terminal phase: the seeded TDD is saved as an immutable successor.

import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";
import { dagProblems, currentArtifact, revisionProblems, seed } from "../iterate-grade.mjs";

const FILE = "artifacts/design/tdd/0001.md";
const FEEDBACK = "feedback.md";

const SEED = `---
task: list-by-channel
type: design-tdd
summary: "Adds a channel filter to notifyctl list. Fixes where the flag is parsed and where the log is filtered; leaves any other filter out."
repo: notifyctl
branch: main
sha: 0000000
---

# Technical design: filter the delivery list by channel

### System Design

#### The CLI filters the log after reading it

\`list\` reads the whole log with \`readLog\` and filters in memory; the log format does not change.

\`\`\`mermaid
sequenceDiagram
    participant Operator
    participant CLI
    participant Store
    Operator->>CLI: list --channel email
    CLI->>Store: readLog
    Store-->>CLI: entries
    CLI-->>Operator: entries whose channel is email
\`\`\`

### Program Design

#### One new branch in the list command

\`\`\`text
main("list")
  readLog
  keep entries where entry.channel === flags.channel, when set
  print each kept entry
\`\`\`

### Type Definitions

The log entry keeps its shape: \`{ channel, to, status, id, at }\`.

### Configuration

No configuration changes.

### Error Handling

A channel name that matches no entry prints nothing and exits 0.

### What We're Not Doing

Filtering by status or date.

### Local Patterns

\`parseArgs\` returns a \`flags\` object keyed by the option name - \`src/cli.mjs:5-13\`.

### Engineering Work Breakdown

\`\`\`mermaid
flowchart LR
  w1["w1 filter entries in list"] --> w2["w2 test the filter"]
  w2 --> v1{{"v1 npm test"}}
\`\`\`

Critical path: w1 -> w2 -> v1

| Item | Depends on | Can run in parallel with | Proof it is done |
|---|---|---|---|
| w1 filter entries in list | - | - | \`node src/cli.mjs list --channel email\` prints only email lines |
| w2 test the filter | w1 | - | \`npm test\` passes |
| v1 npm test | w2 | - | \`npm test\` exits 0 |

### Execution DAG

The chain is the \`prd\` workflow; the PRD, this TDD and the plan pause for approval.

\`\`\`mermaid
flowchart TD
  research["create-research"] --> prd["create-prd<br/>gate: plan"]
  prd --> tdd["create-tdd<br/>gate: plan"]
  tdd --> plan["create-plan<br/>gate: plan"]
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

- Where the filter runs and what an unknown channel prints.

### Verify

- [ ] \`notifyctl list --channel email\` prints only email deliveries on a log that holds two channels.

### Known limits

- None.
`;

const FEEDBACK_TEXT = `# Feedback on ${FILE}

1. Under Type Definitions, add a \`ListFilter\` type with an optional \`channel\` string.
2. Under Configuration, say that \`notifyctl.config.json\` gains a \`listLimit\` number key that caps how many entries \`list\` prints.
`;

export default {
  slug: "list-by-channel-tdd",
  title: "Filter the notifyctl delivery list by channel",
  workflow: "prd",
  request: "Let an operator list only the deliveries of one channel.",
  phases: [
    {
      skill: "iterate-tdd",
      terminal: true,
      template: "tdd_template.md",
      setup: seed({ [FILE]: SEED, [FEEDBACK]: FEEDBACK_TEXT }),
      request: `Apply the feedback in ${FEEDBACK} (in the task directory) to ${FILE}. Run /iterate-tdd @${FILE}.`,
      check: (ctx) => {
        const text = currentArtifact(ctx, "design-tdd")?.text ?? "";
        const feedback = fs.existsSync(path.join(ctx.taskDir, FEEDBACK)) ? fs.readFileSync(path.join(ctx.taskDir, FEEDBACK), "utf8") : null;
        return failures(
          revisionProblems("iterate-tdd", ctx, { file: FILE, type: "design-tdd", seedText: SEED, next: null, also: ["iterate-tdd", "create-plan"] }),
          expect.matches("iterate-tdd: the first feedback item is applied (ListFilter type)", text, /ListFilter/),
          // One change at a time: the second independent item waits for the user's direction.
          /listLimit/.test(text) ? "iterate-tdd: the second independent feedback item (listLimit) was applied in the same pass; the skill stops after one change" : null,
          feedback === FEEDBACK_TEXT ? null : "iterate-tdd: the feedback file was changed or removed",
          ctx.answer.includes("?") || /^`{3}text\n\/(?:iterate-tdd|create-plan)\b/m.test(ctx.answer) ? null : "iterate-tdd: the reply neither asks what to work on next nor hands off",
          dagProblems("iterate-tdd", text, [/create-plan/, /implement-plan/, /iterate-evidence/, /describe-pr/]),
        );
      },
    },
  ],
};
