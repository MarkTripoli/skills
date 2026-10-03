// /iterate-prd on a seeded PRD. The feedback carries one correct change (an Out of Scope bullet) and one false claim about the code:
// that `notifyctl list` shows each delivery's message body (`src/cli.mjs` prints time, channel, recipient and status only).
// What it catches: a correction accepted without reading the named file, a PRD edited into a new file, a change log,
// a Solution Details behavior that is not one `shall` sentence, a reply that carries on to another change instead of asking what is next.
// Terminal phase: the seeded PRD is saved as an immutable successor and the skill stops to ask what is next.

import { expect, failures, section } from "../lib.mjs";
import { currentArtifact, revisionProblems, seed } from "../iterate-grade.mjs";
import { readSessions } from "../sessions.mjs";

const FILE = "artifacts/design/prd/0001.md";

const SEED = `---
task: list-by-channel
type: design-prd
summary: "Lets an operator list only the deliveries of one channel. Fixes the filter flag and its empty-result behavior; leaves any other filter and the log format for the technical design."
repo: notifyctl
branch: main
sha: 0000000
---

# Filter the delivery list by channel

### Problem to Solve

Operators who use several channels cannot find one delivery in a long list.

- \`notifyctl list\` prints every delivery since the log began: time, channel, recipient and status.
- Finding the failed webhook posts means reading past every email and console line.
- The longer the log, the more time an operator spends scanning.

### Success Measures

- An operator reaches the deliveries of one channel with one command.
- Support questions that begin "did the email go out" are answered from the list output.

### Proposed Solution

Add a \`--channel\` option to \`notifyctl list\` that keeps only the deliveries of that channel - it reuses the flag name \`send\` already has.

### Alternative Solutions Considered

- A separate \`notifyctl list-email\` command per channel - one command per channel does not scale as channels are added.

### Solution Details

#### Listing one channel

- WHEN the operator runs \`notifyctl list --channel <name>\`, the CLI shall print only the deliveries sent through that channel.
- IF no delivery was sent through the named channel, THEN the CLI shall print nothing and exit with status 0.
- WHEN the operator runs \`notifyctl list\` without \`--channel\`, the CLI shall print every delivery as it does today.

### Out of Scope

- Filtering by status or by date.

## Human Review

### Review targets

- The flag name and the empty-result behavior.

### Verify

- [ ] \`notifyctl list --channel email\` prints only email deliveries on a log that holds two channels.

### Known limits

- None.
`;

export default {
  slug: "list-by-channel",
  title: "Filter the notifyctl delivery list by channel",
  workflow: "prd",
  request: "Let an operator list only the deliveries of one channel.",
  phases: [
    {
      skill: "iterate-prd",
      terminal: true,
      template: "prd_template.md",
      setup: seed({ [FILE]: SEED }),
      request: `Feedback on ${FILE}, two items:\n1. Add to Out of Scope: filtering by recipient.\n2. Say in Problem to Solve that \`notifyctl list\` shows each delivery's message body, so operators can tell entries apart (see \`src/cli.mjs\`).\n\nRun /iterate-prd @${FILE}.`,
      check: (ctx) => {
        const text = currentArtifact(ctx, "design-prd")?.text ?? "";
        const behaviors = (section(text, "### Solution Details") ?? "").split("\n").filter((l) => /^\s*[-*] /.test(l));
        const sessions = ctx.sessionDir ? readSessions(ctx.sessionDir) : [];
        const readCli = sessions.some((s) => s.calls.some((c) => JSON.stringify(c.args).includes("cli.mjs")));
        return failures(
          revisionProblems("iterate-prd", ctx, { file: FILE, type: "design-prd", seedText: SEED, next: null, also: ["iterate-prd", "create-tdd"] }),
          expect.matches("iterate-prd: the correct item is applied (recipient filtering is out of scope)", section(text, "### Out of Scope") ?? "", /recipient/i),
          // The claim is false: `list` prints time, channel, recipient and status. A PRD that says `list` shows a message body adopted it unread.
          /(?<!not )(?<!n't )(?<!never )\b(?:shows?|prints?|displays?|includes?)\b[^.\n]{0,30}\bmessage (?:body|text)\b/i.test(section(text, "### Problem to Solve") ?? "") ? "iterate-prd: the false claim that `list` shows the message body was written into the PRD" : null,
          readCli ? null : "iterate-prd: no session read src/cli.mjs, so the claim about what `list` prints was not verified against the named file",
          behaviors.filter((l) => !/\bshall\b/.test(l)).slice(0, 3).map((l) => `iterate-prd: Solution Details behavior is not a \`shall\` sentence: ${l.trim().slice(0, 80)}`),
          ctx.answer.includes("?") || /^`{3}text\n\/(?:iterate-prd|create-tdd)\b/m.test(ctx.answer) ? null : "iterate-prd: the reply neither asks what to work on next nor hands off",
        );
      },
    },
  ],
};
