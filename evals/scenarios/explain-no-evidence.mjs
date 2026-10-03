import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";
import { pagesDirectory, repoProblems, setup as seedChange } from "./explain.mjs";

// The change is committed, but the task holds only the PR description and its "roughly 10x" claim: no receipt,
// captured output or measurement. The skill stops before writing any page, says what is missing and points at
// /record-evidence; it never builds a page from prose claims alone.
function setup({ repo, taskDir }) {
  const seeded = seedChange({ repo, taskDir });
  for (const name of fs.readdirSync(taskDir)) {
    if (/^\d+-evidence/.test(name) || name === "evidence") fs.rmSync(path.join(taskDir, name), { recursive: true, force: true });
  }
  return seeded;
}

function stopCheck(ctx) {
  const { live, repo, taskDir, answer, setup: seeded } = ctx;
  const pages = pagesDirectory(ctx);
  const written = fs.existsSync(pages) ? fs.readdirSync(pages).filter((f) => /\.(html|md)$/.test(f)) : [];
  return failures(
    written.length ? `pages: wrote ${written.join(", ")} with no evidence of the change` : null,
    expect.matches("reply: points at /record-evidence", answer, /record-evidence/),
    expect.matches("reply: says the evidence is missing", answer, /\b(?:no|missing|without|lacks?)\b[^.\n]{0,80}\b(?:evidence|recording|measure|captur)/i),
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
        "The change is delivered. Build the executive page and the Slack message for it.",
        "Record no new evidence and change no code. There is no pull request host and no publishing tool here.",
      ].join("\n"),
      check: stopCheck,
    },
  ],
};
