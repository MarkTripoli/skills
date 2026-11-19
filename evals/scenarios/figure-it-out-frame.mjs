import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, failures } from "../lib.mjs";

// Asked to stop after designing the workflow: the run must produce a falsifiable done-predicate, a quantified
// scope, a rigor level and a phase list, start the decision log, and change no source file.
function check({ live, repo, answer }) {
  if (!live) return [];
  const log = path.join(repo, "decision-log.md");
  const changed = execFileSync("git", ["status", "--porcelain", "--", "src"], { cwd: repo, encoding: "utf8" }).trim();
  return failures(
    fs.existsSync(log) ? null : "figure-it-out: decision-log.md was not started",
    expect.matches("figure-it-out: done is a checkable predicate", answer, /`[^`]+`/),
    expect.matches("figure-it-out: states the rigor level", answer, /rigor/i),
    expect.matches("figure-it-out: baseline before the work", answer, /baseline/i),
    changed ? `figure-it-out: changed source before the design was reviewed: ${changed}` : null,
  );
}

export default {
  slug: "figure-it-out-frame",
  title: "Design a playbook for replacing the retry helper everywhere",
  workflow: "oneshot",
  fixtures: ["teach"],
  request: "Figure out how to replace withRetry with a queue-based sender across the codebase.",
  phases: [{ skill: "figure-it-out", terminal: true, request: "/figure-it-out replacing `withRetry` in src/retry.mjs with a queue-based sender. Stop after phases A and B: write the framing and the phase list in your reply, start the decision log at decision-log.md in the repository root, and change no source file.", check }],
};
