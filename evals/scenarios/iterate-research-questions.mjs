// /iterate-research-questions on a seeded, role-tagged questions artifact. The feedback adds a test question and a question
// built on a false premise ("why the log is rewritten on every append"). What it catches: a revision that keeps the leading
// wording, drops role tags, appends to Known limits instead of replacing them, or writes a new artifact.
// Terminal phase: the seeded artifact is saved as an immutable successor.

import { expect, failures, section } from "../lib.mjs";
import { currentArtifact, revisionProblems, seed } from "../iterate-grade.mjs";

const FILE = "artifacts/research/questions/0001.md";
const Q1 = "How does `notifyctl send` resolve a channel name to a module, and which checks run before delivery?";
const Q2 = "Where do the channel modules, their configuration, and their tests live?";

const SEED = `---
type: research-questions
summary: "Neutral query plan for how notifyctl resolves a channel, delivers a message, and records the result today."
status: complete
---

# Research Questions

## Research Goal

Describe how notifyctl resolves a channel, delivers a message, and records the result today.

## Questions

1. ${Q1} (analyze)
2. ${Q2} (locate)

### Known limits

- Seeded limit marker: an earlier pass kept question 1 by its own reading.

## Key Context Pointers

- Filepaths / directories: \`src/cli.mjs\`, \`src/channels/\`

## Research Boundaries

- Focus on current repository behavior, existing tests, and existing conventions.
- Do not answer what should be built.
- Do not propose a design or implementation.
`;

export default {
  slug: "notifyctl-delivery-questions",
  title: "Document how notifyctl delivers and records a notification",
  workflow: "full",
  request: "Document how notifyctl sends a notification and records the result.",
  phases: [
    {
      skill: "iterate-research-questions",
      terminal: true,
      template: "create-research-questions/references/research_questions_template.md",
      setup: seed({ [FILE]: SEED }),
      request: `Feedback on ${FILE}: also ask which tests cover the channel registry, and why the delivery log is rewritten on every append.\n\nRun /iterate-research-questions @${FILE}.`,
      check: (ctx) => {
        const text = currentArtifact(ctx, "research-questions")?.text ?? "";
        const block = section(text, "## Questions") ?? "";
        const questions = block.split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
        const untagged = questions.filter((q) => !/\((?:locate|analyze|pattern|web|none)\)\.?\s*$/.test(q));
        const leading = questions.filter((q) => /\b(?:should|how would we|why)\b/i.test(q));
        return failures(
          revisionProblems("iterate-research-questions", ctx, { file: FILE, type: "research-questions", seedText: SEED, next: "create-research" }),
          expect.atLeast("iterate-research-questions: original questions plus the added ones", questions.length, 4),
          questions.length > 8 ? `iterate-research-questions: ${questions.length} questions, expected at most 8` : null,
          untagged.map((q) => `iterate-research-questions: question without a role tag: ${q.slice(0, 90)}`),
          leading.map((q) => `iterate-research-questions: leading wording (should / how would we / why): ${q.slice(0, 90)}`),
          expect.includes("iterate-research-questions: unchanged question 1 kept verbatim", text, Q1),
          expect.includes("iterate-research-questions: unchanged question 2 kept verbatim", text, Q2),
          expect.present("iterate-research-questions: a new question asks about the tests that cover the channel registry", questions.find((q) => /test/i.test(q) && /registry|loadChannel|channels\/index|channel/i.test(q) && q !== Q2)),
          expect.present("iterate-research-questions: a new question asks how the delivery log is written", questions.find((q) => /\b(?:log|append|appendLog|store)\b/i.test(q))),
          expect.includes("iterate-research-questions: Key Context Pointers keep the existing pointer", section(text, "## Key Context Pointers") ?? "", "src/cli.mjs"),
          /Seeded limit marker/.test(text) ? "iterate-research-questions: the previous run's Known limits item was kept; the list is replaced, not appended to" : null,
          expect.present("iterate-research-questions: Known limits section still present", section(text, "### Known limits")),
        );
      },
    },
  ],
};
