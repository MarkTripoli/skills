import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";
import { overstated, pageCheck, pagesDirectory, readerText, replyProblems, repoProblems, setup as seedChange } from "./explain.mjs";

// A persona someone added in Markdown, not code, and installed: setup writes personas/support.md into the run's installed
// skill before the session starts, as a reinstall from the skills repository would. The page must come out with exactly its sections, in its order, none
// of its words to avoid, within its limits (the pinned check holds all of that), and still carry the measured numbers.
export const SUPPORT = `# Support

Support agents who answer customer questions about the change.

## What they want to see

- What a customer will notice, before and now.
- What did not change and what was not measured, so they can answer honestly.

## Tone

- Plain words a customer would use. No code, file names or commit hashes outside the evidence footer.

## Numbers

- Round to one decimal place.
- When the evidence lacks a value, drop that row and name the gap under Not shown.

## Words to avoid

- commit
- JSON
- append

## Sections

1. top
2. headline-number
3. before-and-now
4. limits
5. about-evidence

## Limits

- Table rows: at most 2
- Pictures and videos: at most 0
`;

function setup({ repo, taskDir, skillsDir }) {
  fs.writeFileSync(path.join(skillsDir, "explain", "personas", "support.md"), SUPPORT);
  return seedChange({ repo, taskDir });
}

function supportCheck(ctx) {
  const { live, repo, taskDir, answer, skillsDir, setup: seeded } = ctx;
  const file = path.join(pagesDirectory(ctx), "support.html");
  const html = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const text = readerText(html);
  const shown = [...(html ?? "").matchAll(/data-section="([a-z-]+)"/g)].map((m) => m[1]);
  const stated = overstated([text]);
  return failures(
    html === null ? "pages: support.html missing" : pageCheck(skillsDir, file),
    expect.matches("support: built for the support persona", html ?? "", /data-persona="support"/),
    shown.join(",") === "top,headline-number,before-and-now,limits,about-evidence" ? null : `support: sections ${shown.join(", ")}, not the persona's top, headline-number, before-and-now, limits, about-evidence`,
    expect.matches("support: a measured number", text, /91\.5|36\.6/),
    expect.matches("support: untested Windows named", text, /Windows/),
    stated.length ? `support: the PR's unmeasured 10x claim stated as fact: "${stated[0].trim().slice(0, 160)}"` : null,
    ...replyProblems(answer),
    ...repoProblems(live, repo, seeded),
  );
}

export default {
  slug: "jsonl-log",
  title: "Keep notifyctl send fast as the delivery log grows",
  workflow: "oneshot",
  fixtures: ["explain"],
  request: "`notifyctl send` slows down as `outbox/log.json` grows, because every send rewrites the whole log. Make a send cost the same on a large log, and keep existing logs readable by `list`.",
  phases: [
    {
      skill: "explain",
      terminal: true,
      setup,
      request: [
        "The change is delivered and its evidence is recorded in this task directory. Build the support page for it.",
        "Record no new evidence and change no code. There is no pull request host and no publishing tool here.",
      ].join("\n"),
      check: supportCheck,
    },
  ],
};
