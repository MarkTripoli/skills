import { expect, failures } from "../lib.mjs";

// The fixture adds `src/batch.mjs`, whose loop stops at `items.length - 1` and so drops the last batch when
// the final item starts a new batch. The reply must show a reproduction and name that loop bound as the root
// cause before it proposes any fix.

function check({ answer }) {
  const text = answer ?? "";
  const repro = text.search(/reproduc|repro\b|red\b|fails?\b/i);
  const cause = text.search(/length\s*-\s*1|off-by-one|loop (?:bound|condition)/i);
  const fix = text.search(/start\s*<\s*items\.length\s*;/);
  return failures(
    expect.matches("diagnosing-bugs: runs a command or test that reproduces", text, /node\b|npm test|node --test/),
    repro < 0 ? "diagnosing-bugs: no reproduction stated" : null,
    cause < 0 ? "diagnosing-bugs: root cause (the length - 1 bound) not named" : null,
    fix < 0 ? "diagnosing-bugs: no fix proposed" : null,
    repro >= 0 && cause >= 0 && fix >= 0 && !(repro < fix && cause < fix) ? "diagnosing-bugs: the fix comes before the reproduction or root cause" : null,
  );
}

export default {
  slug: "diagnosing-bugs-off-by-one",
  title: "Diagnose dropped notifications in bulk sends",
  workflow: "oneshot",
  fixtures: ["diagnosing-bugs"],
  request: "Bulk sends sometimes drop the last notification.",
  phases: [
    {
      skill: "diagnosing-bugs",
      terminal: true,
      request: "Diagnose this: `batches(items, size)` in `src/batch.mjs` sometimes loses the last notification, for example 5 items in batches of 2. Find the root cause and propose a fix; do not commit.",
      check,
    },
  ],
};
