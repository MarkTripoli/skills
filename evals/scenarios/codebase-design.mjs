import { execFileSync } from "node:child_process";
import { expect, failures } from "../lib.mjs";

// The fixture adds `src/notifier.mjs`, a shallow module that forwards every call to `loadChannel` unchanged.
// A survey must name it as a deepening candidate (it fails the deletion test) and change no file.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function setup({ repo }) {
  return { head: git(repo, "rev-parse", "HEAD") };
}

function check({ live, repo, answer, setup: seeded }) {
  const out = [
    expect.matches("codebase-design: names the pass-through module", answer, /notifier(?:\.mjs)?/),
    expect.matches("codebase-design: calls it shallow or a pass-through", answer, /shallow|pass-?through|deletion test|forwards/i),
  ];
  if (live) {
    const dirty = git(repo, "status", "--porcelain");
    if (dirty) out.push(`codebase-design: the survey changed files: ${dirty.split("\n").join(", ")}`);
    if (git(repo, "rev-parse", "HEAD") !== seeded.head) out.push("codebase-design: HEAD moved; a survey commits nothing");
  }
  return failures(out);
}

export default {
  slug: "codebase-design-survey",
  title: "Survey notifyctl for deepening opportunities",
  workflow: "oneshot",
  fixtures: ["codebase-design"],
  request: "Find refactoring opportunities in notifyctl.",
  phases: [
    {
      skill: "codebase-design",
      terminal: true,
      setup,
      request: "Improve the codebase architecture of `src/`: survey it for deepening opportunities and give me the ranked list. Text reply only, no HTML report. Change no files.",
      check,
    },
  ],
};
