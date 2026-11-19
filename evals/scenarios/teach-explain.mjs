import { execFileSync } from "node:child_process";
import { expect, failures } from "../lib.mjs";

// One-shot explanation of a small module: it must cite the code, give the how (backoff) and the why (4xx is
// not retried), print no framing labels, and change nothing.
function check({ live, repo, answer }) {
  if (!live) return [];
  return failures(
    expect.matches("teach: cites the source file", answer, /src\/retry\.mjs/),
    expect.matches("teach: explains the backoff", answer, /doubl|exponential|2 \*\*|twice/i),
    expect.matches("teach: explains why 4xx is not retried", answer, /4xx|client error|rejected|below 500|under 500/i),
    expect.excludes("teach: prints a framing label", answer, /TL;DR|key insight|at its core/i),
    execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim() ? "teach: changed files in the repository" : null,
  );
}

export default {
  slug: "teach-retry",
  title: "Explain how the retry helper works and why",
  workflow: "oneshot",
  fixtures: ["teach"],
  request: "Teach me how src/retry.mjs works.",
  phases: [{ skill: "teach", terminal: true, request: "/teach how src/retry.mjs works and why it is built that way. I am about to change the backoff. This is a one-shot run: nobody will answer follow-up questions.", check }],
};
