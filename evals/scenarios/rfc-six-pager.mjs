import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";
import { BODY, checkRfc } from "../../skills/writing/rfc-six-pager/scripts/check-rfc.mjs";
import { readQuestions, report, sheet, tally } from "../../skills/writing/rfc-six-pager/scripts/comprehension.mjs";

// The fixture is a chat thread and a metrics table about a nightly export that times out. The thread carries the faults
// a six-pager removes and three traps: a retry count the decider later changed (3, then 5), a size claim nobody can
// back with a number ("lots of customers"), and a measurement that does not exist yet (the backfill duration).
// Graded on the format (section order, six-page word limit, the Decision recommendation, the Options table, the risk table), on
// the source numbers and the decider's decisions surviving, and on the two missing facts not being invented and appearing as
// questions in Open questions. No document connector exists here, so the Markdown working copy is the deliverable.
// A second session then answers the decider's questions from the RFC alone, and the grade checks its answers.
export const FILE = "rfc.md";
export const ANSWERS = "comprehension-answers.json";
// One reader answers, so no answer needs a second reader's agreement, and a pattern can miss a right answer worded in a
// way the scenario did not foresee. The limit is therefore lower than the skill's own 90%.
const ONE_READER_LIMIT = 75;

// A phase in which a session that did not write the RFC and has not seen the sources answers `questions` from it.
// The questions reach the reader only in this phase, so the writer never sees them.
export function comprehensionPhase(file, questions) {
  readQuestions({ questions });
  return {
    skill: "rfc-six-pager",
    terminal: true,
    request: [
      `Be one reader of the comprehension test for \`${file}\` at the repository root. Do only "The reader's task" of the skill's comprehension test reference, with these questions:`,
      "",
      sheet(questions).trim(),
      "",
      `Write the JSON to \`${ANSWERS}\` at the repository root. Read no file under \`docs/\`, start no child worker, change no other file, and do not commit.`,
    ].join("\n"),
    check({ live, repo }) {
      if (!live) return [];
      const answers = path.join(repo, ANSWERS);
      if (!fs.existsSync(answers)) return [`rfc-six-pager: ${ANSWERS} was not written`];
      try {
        const result = tally(fs.readFileSync(path.join(repo, file), "utf8"), questions, [JSON.parse(fs.readFileSync(answers, "utf8"))], ONE_READER_LIMIT);
        return result.pass ? [] : [`rfc-six-pager: ${report(file, result).split("\n").join("\n      ")}`];
      } catch (error) {
        return [`rfc-six-pager: the comprehension answers could not be counted: ${error.message}`];
      }
    },
  };
}

// What the decider would ask, from the thread and the metrics. Numbers are compared with their commas removed.
const QUESTIONS = [
  { id: 1, ask: "Who decides, and on what date?", expect: ["Dana", "December 4|2026-12-04|Dec\\.? 4"] },
  { id: 2, ask: "How many export runs failed, out of how many, and how many of the failures were timeouts?", expect: ["412", "9870", "388"] },
  { id: 3, ask: "How many times is a failed part of an export retried, and when does the customer get an email?", expect: ["\\b(5|five)\\b", "last|final|all (5 |five )?retries"] },
  { id: 4, ask: "Why is moving reportd to a larger machine rejected?", expect: ["11 min|two quarters|2 quarters|3800|doubl"] },
  { id: 5, ask: "Why is raising the gateway timeout rejected?", expect: ["200|restart"] },
  { id: 6, ask: "What does the proposal cost a month?", expect: ["2300|2440|140"] },
  { id: 7, ask: "What does doing nothing cost?", expect: ["ticket|25 min"] },
  { id: 8, ask: "What question is open about the checkpoint table backfill?", expect: ["backfill", "duration|how long|minutes|hours"] },
];

const bodyText = (text) => {
  const start = text.search(new RegExp(`^## +${BODY[0]}\\s*$`, "mi"));
  const end = text.search(/^## +(?:FAQ|Appendix|Review record)\b/mi);
  return start < 0 ? text : text.slice(start, end < 0 ? undefined : end);
};

function check({ live, repo }) {
  // A re-grade has only the recorded answer, not the repository the model wrote into.
  if (!live) return [];
  const file = path.join(repo, FILE);
  if (!fs.existsSync(file)) return [`rfc-six-pager: ${FILE} was not written`];
  const text = fs.readFileSync(file, "utf8");
  const body = bodyText(text);
  const openQuestions = (text.match(/^## +Open questions\s*$([\s\S]*?)(?=^## |(?![\s\S]))/im) || ["", ""])[1];
  const intro = body.slice(0, Math.max(0, body.search(/^## +Problem and goals\s*$/mi)));
  return failures(
    ...checkRfc(text).map((p) => `rfc-six-pager: ${FILE}:${p.line}: ${p.rule}: ${p.message}`),
    expect.matches("rfc-six-pager: the Decision section states the recommendation", intro, /\b(?:will|recommend\w*|propos\w*)\b/i),
    expect.excludes("rfc-six-pager: the Decision section makes no request", intro, /\bwe (?:ask|request)\b|\bask(?:s|ed)? you\b|\bapprov(?:e|al)\b|\bplease\b/i),
    expect.matches("rfc-six-pager: the decision date", text, /December 4, 2026|2026-12-04/),
    expect.matches("rfc-six-pager: the failure count with its base", body, /\b412\b[\s\S]*9,870|9,870[\s\S]*\b412\b/),
    expect.matches("rfc-six-pager: the timeout share of the failures", body, /\b388\b/),
    expect.matches("rfc-six-pager: the decider's retry count", body, /\b(?:5|five)\s+(?:times|retries|attempts)|retr(?:y|ies)[^.\n]{0,40}\b(?:5|five)\b/i),
    expect.excludes("rfc-six-pager: the superseded retry count", body, /\b(?:3|three)\s+(?:times|retries)\b|retr(?:y|ies) (?:a failed chunk )?(?:3|three)\b/i),
    expect.matches("rfc-six-pager: doing nothing is an alternative", body, /do(?:ing)? nothing|status quo|no change|keep(?:ing)? the current|unchanged/i),
    expect.matches("rfc-six-pager: the larger machine is an alternative", body, /larger machine|bigger machine|scale (?:up|vertically)|vertical/i),
    expect.matches("rfc-six-pager: the cost of the proposal", text, /\$2,300|\$2,440/),
    expect.excludes("rfc-six-pager: the unbacked size claim", text, /lots of customers|many customers/i),
    expect.excludes("rfc-six-pager: the account count is not invented", text, /\b\d[\d,]*\s+(?:distinct\s+|different\s+)?(?:accounts|customers)\b/i),
    expect.matches("rfc-six-pager: how many accounts complained is a question in Open questions", openQuestions, /accounts?[^\n]*\?|how many[^\n]*(?:accounts|customers)/i),
    expect.excludes("rfc-six-pager: the backfill duration is not invented", text, /backfill[^.\n]{0,120}\b\d+\s*(?:minutes?|mins?|hours?|hrs?|days?)\b/i),
    expect.matches("rfc-six-pager: how long the backfill takes is a question in Open questions", openQuestions, /backfill[^\n]*\?|how long[^\n]*\?/i),
    expect.matches("rfc-six-pager: the RFC lists the sources its claims cite", text, /^## Sources\s*\n(?:\s*\n)*\s*(?:1[.)]|\[1\])\s+\S/m),
  );
}

export default {
  slug: "reportd-export-rfc",
  title: "Draft a six-pager RFC from a thread and a metrics table",
  workflow: "oneshot",
  fixtures: ["rfc-six-pager"],
  request: "Write an RFC in the six-pager format for the reportd export decision. docs/thread.md holds the discussion and the decider's decisions, and docs/metrics.md holds the numbers.",
  phases: [
    {
      skill: "rfc-six-pager",
      terminal: true,
      request: [
        "Write an RFC in the six-pager format for the reportd export decision. `docs/thread.md` holds the discussion and the decider's decisions, and `docs/metrics.md` holds the numbers.",
        `Write the RFC to \`${FILE}\` at the repository root. There is no document connector here, so that file is the deliverable. The thread is the only source of answers, so ask no questions. Do not commit.`,
      ].join("\n"),
      check,
    },
    comprehensionPhase(FILE, QUESTIONS),
  ],
};
