import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// The body follows the template: a visual summary, before-and-after evidence taken from the stated behavior, and
// a merge-danger rating with a door and a blast radius.
function check({ live, repo }) {
  if (!live) return [];
  const file = path.join(repo, "pr-body.md");
  if (!fs.existsSync(file)) return ["pr: pr-body.md was not written"];
  const text = fs.readFileSync(file, "utf8");
  return failures(
    expect.matches("pr: sections in order", text, /## Summary[\s\S]*## Evidence[\s\S]*## Merge Danger/),
    expect.matches("pr: summary carries a visual", text, /## Summary[\s\S]*```[\s\S]*## Evidence/),
    expect.matches("pr: before and after", text, /\*\*Before:\*\*[\s\S]*\*\*After:\*\*/),
    expect.matches("pr: evidence uses the stated values", text, /\b5\b[\s\S]*\b15\b/),
    expect.matches("pr: door rated", text, /\*\*Door:\*\*\s*(one|two)-way/i),
    expect.matches("pr: blast radius rated", text, /\*\*Blast Radius:\*\*\s*\S+/),
  );
}

export default {
  slug: "pr-body-total",
  title: "Write the pull request body for the quantity fix",
  workflow: "oneshot",
  fixtures: ["pr"],
  request: "Write the PR body for the change described in change.md.",
  phases: [{ skill: "pr", terminal: true, request: "Write the PR body for the change described in change.md (the code is src/total.mjs) to pr-body.md in the repository root. Open no pull request.", check }],
};
