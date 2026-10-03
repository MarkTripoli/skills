import { seed } from "../iterate-grade.mjs";
// `create-epic-plan` on a research artifact for a three-layer feature (store counters, sms channel, CLI
// command). The saved epic plan is graded from its `## Children` JSON fence directly: it parses, every
// child has the template's fields within the limits `start-epic-delivery` enforces, every `depends_on`
// names a sibling, the graph has no cycle, every acceptance sentence is a single EARS obligation without
// vague terms, and every `enabler` has a sibling that consumes it. A cyclic or malformed child would
// break the next skill, which is what this scenario protects. Needs no hardware or service.
import fs from "node:fs";
import path from "node:path";
import { expect, failures, section } from "../lib.mjs";
import { checkChildren, parseChildren } from "../../skills/delivery/create-epic-plan/scripts/check-children.mjs";

const SLUG = "sms-rate-limit";

const RESEARCH = `---
task: sms-rate-limit
type: research
summary: "notifyctl has no sms channel, no per-recipient counters and no quota command. The delivery log (src/store.mjs) is the only record of past sends; the channel contract and the CLI's send/list parsing are the two seams a daily limit crosses."
repo: notifyctl
branch: main
sha: fixture
---

# Research: sms delivery with a per-recipient daily limit

## Summary

notifyctl sends through channel modules and logs each delivery. Nothing limits sends per recipient, and there is no sms channel. A daily limit touches three layers: the log store, a new channel module, and the CLI.

## Detailed Findings

### Store

- \`src/store.mjs\` keeps one JSON array of delivery entries \`{ channel, to, id, status, at }\` in \`<outbox>/log.json\`; \`appendLog\` rewrites the whole file and \`readLog\` returns \`[]\` when the file is missing.
- Nothing counts entries by recipient or by day. A count can be derived from \`readLog\` by filtering on \`to\`, \`channel\` and the UTC date of \`at\`.

### Channels

- \`src/channels/index.mjs\` loads \`src/channels/<name>.mjs\` only for a channel named in \`notifyctl.config.json\`; a module exports \`name\` and \`deliver({ to, message, config })\` returning \`{ id, status }\`.
- \`src/channels/email.mjs\` is the model to follow: it records the message and reports \`queued\`. No \`sms\` module exists, and the config has no \`sms\` entry.
- \`deliver()\` receives the channel's own config object, so \`channels.sms.dailyLimit\` would reach the module without a loader change.

### CLI

- \`src/cli.mjs\` parses \`send\` and \`list\` by pairing \`--flag value\` arguments; an unknown command throws \`unknown command\`.
- \`send\` calls \`loadChannel\`, \`deliver\`, then \`appendLog\`; there is no point where a send can be refused after the channel is chosen.
- \`tests/channels.test.mjs\` covers the loader, the email channel and the store with \`node:test\`; there is no CLI test.

## Constraints

- A limit counts sends per recipient per UTC day, read from \`channels.sms.dailyLimit\`; a missing value means no limit.
- \`send --channel sms\` past the limit is refused with a non-zero exit and a message naming the limit; sends within it behave as email does.
- \`notifyctl quota --to <recipient>\` prints the sends remaining today for sms.

## Open Questions

- None that block decomposition.
`;

// The skill's own checker owns the child rules (fields, limits, EARS, vague words, siblings, cycles, enablers); only the
// eval-only rules live here: 2 to 6 children, each prompt names a source or test file and not the epic's artifact directory,
// and the Slice Check has a row per child. Static import: the script is the skill's, not run state.
export function childrenProblems(text) {
  let children;
  try {
    children = parseChildren(text);
  } catch (error) {
    return [`epic plan: ${error.message}`];
  }
  const out = checkChildren(children).map((v) => `epic plan: ${v}`);
  if (children.length < 2 || children.length > 6) out.push(`epic plan: ${children.length} children, expected 2 to 6`);
  for (const c of children) {
    if (typeof c?.prompt !== "string") continue;
    if (!/(?:src|tests)\/[A-Za-z0-9_./-]+\.mjs/.test(c.prompt)) out.push(`epic plan: child ${JSON.stringify(c.name)} prompt names no source or test file`);
    if (/\.agents\/tasks/.test(c.prompt)) out.push(`epic plan: child ${JSON.stringify(c.name)} prompt points into the epic's artifact directory`);
  }
  if (children.every((c) => c?.slice === "enabler")) out.push("epic plan: every child is an enabler, a horizontal batch");
  const slice = section(text, "## Slice Check") ?? "";
  for (const c of children) if (typeof c?.name === "string" && !slice.includes(c.name)) out.push(`epic plan: Slice Check has no row for ${JSON.stringify(c.name)}`);
  return out;
}

export default {
  slug: SLUG,
  title: "Send sms with a per-recipient daily limit",
  workflow: "full",
  fixtures: [],
  request: `Epic: let notifyctl send sms notifications, limited per recipient per day. The daily limit comes from \`channels.sms.dailyLimit\` in \`notifyctl.config.json\`; \`notifyctl send --channel sms\` refuses a send past the limit; \`notifyctl quota --to <recipient>\` prints the sends remaining today. Research is saved in the task directory.`,
  phases: [
    {
      skill: "create-epic-plan",
      artifactType: "epic-plan",
      template: "epic_plan_template.md",
      next: "start-epic-delivery",
      handoffNamesArtifact: true,
      setup: seed({ ["artifacts/research/primary/0001.md"]: RESEARCH }),
      check: ({ artifact }) => {
        const text = artifact?.text ?? "";
        return failures(
          childrenProblems(text),
          expect.matches("epic plan: Ordering names wave 1", section(text, "## Ordering"), /Wave 1/),
          expect.matches("epic plan: workflow judgments or the helper-unavailable line present", section(text, "## Workflow judgments"), /Helper unavailable|\|/),
          expect.matches("epic plan: sizing judgments or the helper-unavailable line present", section(text, "## Sizing judgments"), /Helper unavailable|\|/),
          expect.matches("epic plan: Human Review has Verify", section(text, "## Human Review"), /### Verify/),
        );
      },
    },
  ],
};
