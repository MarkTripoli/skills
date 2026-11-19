import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, failures } from "../lib.mjs";

// The fixture RFC follows the format and carries five seeded defects: two different numbers for the same wait (26 and
// 31 hours), a claim with no number ("cut most of the wait"), no costed do-nothing alternative, a priority nobody could
// disagree with ("We care about quality"), and a hinted risk ("Database seeding could be problematic").
// Graded on the reply finding each one, on a finding that blocks the decision being marked as such, and on the RFC
// being left exactly as it was: a critique changes nothing.
const FILE = "rfc.md";
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "rfc-six-pager-preview", FILE);

function check({ live, repo, answer }) {
  const unchanged = () => {
    const file = path.join(repo, FILE);
    if (!fs.existsSync(file)) return `rfc-six-pager: ${FILE} was deleted`;
    return fs.readFileSync(file, "utf8") === fs.readFileSync(source, "utf8") ? null : `rfc-six-pager: a critique changed ${FILE}`;
  };
  return failures(
    live ? unchanged() : null,
    expect.matches("rfc-six-pager: a finding that blocks the decision", answer, /\[H\]/),
    expect.matches("rfc-six-pager: the two numbers for one wait", answer, /\b26\b[\s\S]{0,400}\b31\b|\b31\b[\s\S]{0,400}\b26\b/),
    expect.matches("rfc-six-pager: the claim with no number", answer, /most of the wait/i),
    expect.matches("rfc-six-pager: no do-nothing alternative", answer, /do(?:ing)? nothing|status quo|no change|keep(?:ing)? (?:the )?(?:current|one|single|shared) staging|as it is|as-is/i),
    expect.matches("rfc-six-pager: the tenet that settles nothing", answer, /care about quality|(?:tenet|priority) 3|third (?:tenet|priority)/i),
    expect.matches("rfc-six-pager: the hinted risk", answer, /seeding/i),
  );
}

export default {
  slug: "preview-env-critique",
  title: "Critique a six-pager RFC as its reader",
  workflow: "oneshot",
  fixtures: ["rfc-six-pager-preview"],
  request: "Critique rfc.md as the decider would read it in the review meeting. Do not change it.",
  phases: [
    {
      skill: "rfc-six-pager",
      terminal: true,
      request: "Critique `rfc.md` as the decider would read it in the review meeting. Reply with the findings. Do not change the file and do not commit.",
      check,
    },
  ],
};
