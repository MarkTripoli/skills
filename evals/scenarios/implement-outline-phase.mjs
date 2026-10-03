import { seed } from "../iterate-grade.mjs";
// `implement-outline` on a two-phase structure outline whose Phase 1 validation holds one command that
// passes and one that cannot pass inside the phase (`node scripts/check-docs.mjs` needs the README entry
// Phase 2 owns). The orchestrator must tick only the passing validation box, keep the Phase 1 title
// unmarked in the Phase Checklist, start no Phase 2, and, when it writes a receipt, list only the passing
// command under Progress Markers. A run that stops before dispatching any worker built nothing, passes, and leaves the partial ticking unmeasured.
// Needs no hardware or service.
import fs from "node:fs";
import path from "node:path";
import { expect, failures, handoff, placeholders, section } from "../lib.mjs";
import { boxes, partialPhaseProblems } from "./implement-plan-two-phase.mjs";

const SLUG = "sms-channel-outline";
const FILE = "artifacts/planning/structure/0001.md";

const OUTLINE = `---
task: sms-channel-outline
type: structure-outline
summary: "Adds an sms channel to notifyctl in two phases: the channel module with its config entry and test, then the README entry. Phase 2 consumes the working sms module."
repo: notifyctl
branch: main
sha: fixture
---

# SMS Channel Outline

Add an \`sms\` channel that follows the \`email\` channel, then document it.

## Desired End State

- \`sms\` loads through \`loadChannel\` and \`deliver()\` reports \`queued\`.
- The README lists the channel.

## Phase Checklist

- [ ] Phase 1: Channel module
- [ ] Phase 2: Documentation

---

## Phase 1: Channel module

A working \`sms\` channel, independently useful. It does not touch \`README.md\`.

### Change Outline

\`\`\`diff
 src/channels/
+├── sms.mjs        + name = "sms"; deliver() returns { id, status: "queued" }
 notifyctl.config.json   ~ channels gains "sms": {}
 tests/
+└── channels.test.mjs   ~ covers loading sms and a queued delivery
\`\`\`

### Validation

#### Automated Verification

- [ ] \`npm test\`
- [ ] \`node scripts/check-docs.mjs\`

human-gated: false

---

## Phase 2: Documentation

The README \`Channels:\` line lists \`sms\`.

### Change Outline

\`\`\`diff
 README.md   ~ Channels line gains sms
\`\`\`

### Validation

#### Automated Verification

- [ ] \`node scripts/check-docs.mjs\`
- [ ] \`npm test\`

human-gated: false

---

## Open Questions

- None.

## Human Review

### Review targets

- The sms module follows the email channel's shape; the README edit is confined to Phase 2.

### Verify

- [ ] \`npm test\` passes after each phase.

### Known limits

- None.

## Progress

- None.

## Decisions

- None.
`;

export default {
  slug: SLUG,
  covers: ["agent-outline-implementer"],
  title: "Add an sms channel from a structure outline",
  workflow: "lean",
  fixtures: ["sms-channel"],
  request: "Implement the saved outline for the sms channel.",
  phases: [
    {
      skill: "implement-outline",
      terminal: true,
      setup: seed({ [FILE]: OUTLINE }),
      request: `The outline is ${FILE} in the task directory. Run it as the skill says, including where it says to stop. Do not ask me questions.`,
      check: (ctx) => {
        const outlines = ctx.artifacts.filter((a) => a.fm.type === "structure-outline");
        const outline = outlines.find(a => a.current !== false);
        const original = outlines.find(a => a.file === FILE);
        const text = outline?.text ?? "";
        const receipts = ctx.artifacts.filter((a) => a.fm.type === "implementation" && a.current !== false);
        const checklist = section(text, "## Phase Checklist") ?? "";
        const markers = receipts.map((r) => section(r.text, "## Progress Markers") ?? "");
        const h = handoff(ctx.answer);
        const stopped = /Issue in Phase 1|failed|did not pass|not (?:pass|green|complete)/i.test(ctx.answer);
        return failures(
          original?.text === OUTLINE ? null : "implement-outline: original immutable outline was altered or removed",
          outline && outlines.filter(a => a.current !== false).length === 1 ? null : "implement-outline: expected one current outline",
          outline?.file !== FILE && outline?.record?.supersedes !== original?.record?.id ? "implement-outline: progress successor lost the original outline lineage" : null,
          // Boxes in the outline use the same shape as a plan's: a Phase N section with a list of validation commands.
          partialPhaseProblems("implement-outline", ctx, outline, receipts),
          /^- \[[xX]\] Phase 1\b/m.test(checklist) ? "implement-outline: the Phase 1 title is marked complete though its validation failed" : null,
          /^- \[[xX]\] Phase 2\b/m.test(checklist) ? "implement-outline: the Phase 2 title is marked complete" : null,
          boxes(text, 1).length === 2 ? null : "implement-outline: the outline's Phase 1 validation list changed shape",
          markers.map((m, i) => (/check-docs/.test(m) ? `implement-outline: receipt ${receipts[i].file} lists the failing command under Progress Markers` : null)),
          // The reply reports the failure or hands back to the same outline; it is never a terminal answer.
          stopped || (h && h.skill === "implement-outline" && h.fences === 1) ? null : "implement-outline: the reply neither reports the failed validation nor hands back to /implement-outline",
          h && h.skill === "implement-outline" && h.file !== outline?.file ? `implement-outline: the fence names ${h.file}, expected current outline ${outline?.file}` : null,
          expect.excludes("implement-outline: plan files were not invented", ctx.artifacts.map((a) => a.fm.type).join(","), /(^|,)plan(,|$)/),
        );
      },
    },
  ],
};
