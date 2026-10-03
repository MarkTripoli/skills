// /iterate-structure-outline on a seeded three-step outline whose Step 1 is already built (checked boxes). The feedback splits Step 2.
// What it catches: finished work unchecked or dropped, step headings left unnumbered or out of order after the split, the Phase
// Checklist not matching the headings, a step without an automated check, a new artifact, a change log, a reply that is not the
// review template pointing at /implement-outline.
// Terminal phase: the seeded outline is saved as an immutable successor. The Jira reconciliation path (a newer jira-refinement artifact) is not covered.

import { expect, failures, section } from "../lib.mjs";
import { currentArtifact, revisionProblems, seed } from "../iterate-grade.mjs";

const FILE = "artifacts/planning/structure/0001.md";

const SEED = `---
task: list-by-channel-outline
type: structure-outline
summary: "Orders the work to filter notifyctl list by channel into three steps: the filter, then the flag and output changes, then the docs. Step 1 is built."
repo: notifyctl
branch: main
sha: 0000000
---

# Outline: filter the delivery list by channel

The list command keeps only the deliveries of the named channel. The filter lands first, then the user-facing flag and output, then the documentation.

## Desired End State

- \`notifyctl list --channel email\` prints only email deliveries.
- \`notifyctl list --json\` prints the same entries as a JSON array.

## Phase Checklist

- [x] Step 1: Filter function
- [ ] Step 2: Flag and output
- [ ] Step 3: Documentation

---

## Step 1: Filter function

A pure function keeps the entries of one channel; it is independently useful and tested.

### Change Outline

\`\`\`text
src/
  list.mjs        + filterByChannel(entries, channel)
tests/
  list.test.mjs   + covers filterByChannel
\`\`\`

### Validation

#### Automated Verification

- [x] \`node --test tests/list.test.mjs\`

human-gated: false

---

## Step 2: Flag and output

The \`list\` command gains \`--channel\` and \`--json\`; both change how \`list\` prints, so one step carries both.

### Change Outline

\`\`\`text
src/
  cli.mjs         ~ parse --channel and --json, call filterByChannel, print text or JSON
tests/
  cli.test.mjs    + covers both flags
\`\`\`

### Validation

#### Automated Verification

- [ ] \`node --test tests/cli.test.mjs\`

human-gated: false

---

## Step 3: Documentation

The README describes both flags.

### Change Outline

\`\`\`text
README.md         ~ list section documents --channel and --json
\`\`\`

### Validation

#### Automated Verification

- [ ] \`grep -n -e '--channel' -e '--json' README.md\`

human-gated: false

---

## Open Questions

- None.

## Human Review

### Review targets

- Step boundaries and which step owns which flag.

### Verify

- [ ] Every step can be verified without the one after it.

### Known limits

- None.
`;

const stepHeadings = (text) => [...text.matchAll(/^## (?:Step|Phase) (\d+)\b[^\n]*/gm)].map((m) => ({ n: Number(m[1]), line: m[0], index: m.index }));

export default {
  slug: "list-by-channel-outline",
  title: "Filter the notifyctl delivery list by channel",
  workflow: "lean",
  request: "Let an operator list only the deliveries of one channel, as JSON when asked.",
  phases: [
    {
      skill: "iterate-structure-outline",
      terminal: true,
      template: "structure_outline_template.md",
      setup: seed({ [FILE]: SEED }),
      request: `Feedback on ${FILE}: split Step 2 into two steps, one for the \`--channel\` filter and one for the \`--json\` output. Leave Step 1 as it is.\n\nRun /iterate-structure-outline @${FILE}.`,
      check: (ctx) => {
        const text = currentArtifact(ctx, "structure-outline")?.text ?? "";
        const steps = stepHeadings(text);
        const checklist = (section(text, "## Phase Checklist") ?? "").split("\n").filter((l) => /^- \[[ x]\] /.test(l));
        const first = (section(text, steps[0]?.line ?? "## Step 1: Filter function") ?? "");
        const sections = steps.map((s) => ({ ...s, body: section(text, s.line) ?? "" }));
        return failures(
          revisionProblems("iterate-structure-outline", ctx, { file: FILE, type: "structure-outline", seedText: SEED, next: "implement-outline" }),
          expect.atLeast("iterate-structure-outline: Step 2 became two steps", steps.length, 4),
          steps.length > 5 ? `iterate-structure-outline: ${steps.length} steps, expected the one split (4)` : null,
          steps.some((s, i) => s.n !== i + 1) ? `iterate-structure-outline: step headings are not numbered 1..N in order: ${steps.map((s) => s.n).join(", ")}` : null,
          checklist.length === steps.length ? null : `iterate-structure-outline: Phase Checklist has ${checklist.length} items for ${steps.length} step headings`,
          expect.matches("iterate-structure-outline: finished Step 1 stays checked in the checklist", checklist[0] ?? "", /^- \[x\] /),
          expect.matches("iterate-structure-outline: finished Step 1 keeps its checked verification", first, /- \[x\] `node --test tests\/list\.test\.mjs`/),
          sections.filter((s) => !/^#### Automated Verification\s*\n+\s*- \[[ x]\] \S/m.test(s.body)).map((s) => `iterate-structure-outline: ${s.line} has no automated verification command`),
          expect.present("iterate-structure-outline: a step among 2-3 is about the --channel filter", steps.find((x) => x.n >= 2 && x.n <= 3 && /channel|filter/i.test(x.line))),
          expect.present("iterate-structure-outline: a step among 2-3 is about the --json output", steps.find((x) => x.n >= 2 && x.n <= 3 && /json|output/i.test(x.line))),
          expect.matches("iterate-structure-outline: the documentation step follows the split", text, /^## (?:Step|Phase) 4\b[^\n]*doc/im),
        );
      },
    },
  ],
};
