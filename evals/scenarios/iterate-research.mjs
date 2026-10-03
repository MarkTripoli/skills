// /iterate-research on a seeded research artifact with one wrong path citation (`src/channels/loader.mjs`, which does not exist)
// and a Testing patterns entry that wrongly says no tests were found for the delivery log. The feedback asks how the log is tested.
// What it catches: a new document with a new NN, a change log, a citation left pointing at a file that is not there, an uncited
// new claim, a recommendation slipping into a current-state document, Known limits appended to instead of replaced.
// Terminal phase: the seeded artifact is saved as an immutable successor.

import { expect, failures, paragraphs, pointers, section } from "../lib.mjs";
import { currentArtifact, revisionProblems, seed } from "../iterate-grade.mjs";

const FILE = "artifacts/research/primary/0001.md";

const SEED = `---
date: 2026-10-02T09:00:00Z
git_commit: 0000000
branch: main
repository: notifyctl
topic: "How notifyctl delivers and records a notification"
type: research
summary: "notifyctl resolves a channel module by name from its configuration, calls its deliver function, and appends the result to a JSON log."
tags: [research, codebase]
status: complete
---

# Research: How notifyctl delivers and records a notification

**Date**: 2026-10-02
**Git Commit**: 0000000
**Branch**: main
**Repository**: notifyctl

## Research Question

1. How does \`notifyctl send\` resolve a channel name to a module?
2. How does the delivery log get written, and how is that tested?

## Research Methodology

This document records current behavior only. It does not recommend implementation work, refactors, optimizations, or future changes.

The sources examined are the files under \`src/\` and \`tests/\`.

### Known limits

- Seeded limit marker: question 2 was left partial by the coverage pass.

## Summary

\`send\` loads a channel module only when the configuration names it, then appends the delivery result to \`outbox/log.json\`.

## Detailed Findings

### 1. A channel loads only when the configuration names it

\`loadChannel\` throws for a name that is not a key of \`config.channels\`, before it imports the module (\`src/channels/loader.mjs:4\`). The imported module must export \`name\` and a \`deliver\` function (\`src/channels/index.mjs:6\`).

#### Testing patterns

\`tests/channels.test.mjs:10-12\` asserts that \`loadChannel("sms", ...)\` rejects with "not configured".

### 2. The delivery log is a JSON array rewritten on every append

\`appendLog\` reads the whole array, pushes the entry, and writes the array back (\`src/store.mjs:9-15\`). \`readLog\` returns an empty array when the file is missing (\`src/store.mjs:17-19\`).

#### Testing patterns

No tests found.

## Code References

### Channel loading

- \`src/channels/index.mjs:3-8\` - the registry function; representative.

### Delivery log

- \`src/store.mjs:9-19\` - append and read; exhaustive for the log.

## Architecture Documentation

The CLI calls \`loadChannel\` first and \`appendLog\` after \`deliver\` returns; the two share no state.

## Open Questions

None.
`;

export default {
  slug: "notifyctl-delivery-research",
  title: "Document how notifyctl delivers and records a notification",
  workflow: "full",
  request: "Document how notifyctl sends a notification and records the result.",
  phases: [
    {
      skill: "iterate-research",
      terminal: true,
      template: "create-research/references/research_template.md",
      setup: seed({ [FILE]: SEED }),
      request: `Feedback on ${FILE}: also document how the delivery log is tested. The Testing patterns under finding 2 say no tests were found; check that.\n\nRun /iterate-research @${FILE}.`,
      check: (ctx) => {
        const text = currentArtifact(ctx, "research")?.text ?? "";
        const bad = pointers(text, ctx.codeRoot).filter((p) => !p.valid);
        const second = (section(text, "### 2. The delivery log is a JSON array rewritten on every append") ?? section(text, "## Detailed Findings") ?? "");
        return failures(
          revisionProblems("iterate-research", ctx, { file: FILE, type: "research", seedText: SEED, next: "create-design-discussion", named: false }),
          expect.excludes("iterate-research: the wrong citation (loader.mjs) is gone", text, "loader.mjs"),
          expect.matches("iterate-research: the registry is cited at its real file", text, /src\/channels\/index\.mjs:\d+/),
          bad.slice(0, 3).map((p) => `iterate-research: citation does not resolve in the repository: ${p.pointer}`),
          expect.excludes("iterate-research: the stale 'no tests found' line is gone", text, /no tests (?:were )?found/i),
          expect.matches(
            "iterate-research: a paragraph on the log's tests cites tests/channels.test.mjs with a line range",
            second,
            { test: (t) => paragraphs(t, /store|appendLog|readLog|log/i).some((p) => /tests\/channels\.test\.mjs:\d+/.test(p)), toString: () => "a paragraph on the delivery log that cites tests/channels.test.mjs:N" },
          ),
          expect.excludes("iterate-research: no recommendation in a current-state document", text.replace(/^This document records current behavior only\..*$/m, ""), /\b(?:recommend\w*|should|refactor\w*)\b/i),
          /Seeded limit marker/.test(text) ? "iterate-research: the previous run's Known limits item was kept; the list is replaced, not appended to" : null,
          expect.present("iterate-research: Known limits section still present", section(text, "### Known limits")),
        );
      },
    },
  ],
};
