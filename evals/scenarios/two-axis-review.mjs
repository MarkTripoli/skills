import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, failures, section } from "../lib.mjs";

// `main` holds CONTRIBUTING.md (no `var` in src/) and docs/digest-spec.md (at most 10 entries). Setup commits
// `src/digest.mjs` on `feature/digest` with one seeded breach of each axis: it declares with `var` and never caps
// the digest at 10. The reply must report the `var` breach under `## Standards` and the missing cap under `## Spec`,
// keep the two apart, and leave the repository untouched.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const DIGEST = `// Returns the digest lines for \`entries\`, newest first.
export function digest(entries) {
  var sorted = [...entries].sort((a, b) => b.at - a.at);
  return sorted.map((e) => e.channel + ": " + e.message);
}
`;

function setup({ repo }) {
  git(repo, "checkout", "-q", "-b", "feature/digest");
  fs.writeFileSync(path.join(repo, "src", "digest.mjs"), DIGEST);
  git(repo, "add", "src/digest.mjs");
  git(repo, "commit", "-q", "-m", "feat: add digest");
  return { head: git(repo, "rev-parse", "HEAD") };
}

function check({ live, repo, answer, setup: seeded }) {
  const standards = section(answer ?? "", "## Standards");
  const spec = section(answer ?? "", "## Spec");
  const out = [
    expect.present("two-axis-review: ## Standards heading", standards),
    expect.present("two-axis-review: ## Spec heading", spec),
    expect.matches("two-axis-review: Standards reports the var breach", standards, /\bvar\b/),
    expect.matches("two-axis-review: Spec reports the missing 10-entry cap", spec, /\b10\b|at most|cap|limit/i),
    expect.excludes("two-axis-review: the var breach stays out of Spec", spec, /`var`|\bvar\b declar/),
  ];
  if (live) {
    if (git(repo, "status", "--porcelain")) out.push("two-axis-review: the review left the repository dirty");
    if (git(repo, "rev-parse", "HEAD") !== seeded.head) out.push("two-axis-review: HEAD moved; the review commits nothing");
  }
  return failures(out);
}

export default {
  slug: "two-axis-review",
  title: "Review the digest branch on both axes",
  workflow: "oneshot",
  fixtures: ["two-axis-review"],
  request: "Add `notifyctl digest` as specified in docs/digest-spec.md.",
  phases: [
    {
      skill: "two-axis-review",
      terminal: true,
      setup,
      request: "Review `feature/digest` since `main` against the spec in `docs/digest-spec.md` and our standards. There is no issue tracker here. Do not edit any file.",
      check,
    },
  ],
};
