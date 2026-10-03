import { execFileSync } from "node:child_process";
import { failures, handoff, section } from "../lib.mjs";

// Live `/reproduce-bug` on a report for a bug the repository does not have. `notifyctl send` accepts a `+` in
// `--to`; the report claims it is rejected. The reproducer must record `not-reproduced` with at least three
// distinct attempts and a `## Missing` list, write no `## Cause` or `## Fix`, hand off nowhere near `/fix-bug`,
// and leave every tracked file alone. The phase is `terminal`: a not-reproduced run ends on a question for
// the reporter, not on a handoff fence.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// Entries in a section: list items, `### Attempt` headings, or table body rows, whichever is largest.
const entries = (body) => {
  const lines = (body ?? "").split("\n");
  const list = lines.filter((l) => /^\s*(?:\d+[.)]|[-*])\s+\S/.test(l)).length;
  const headings = lines.filter((l) => /^#{3,4}\s+\S/.test(l)).length;
  const rows = lines.filter((l) => l.trim().startsWith("|") && !/^\s*\|[\s:|-]+\|\s*$/.test(l)).length - 1;
  return Math.max(list, headings, rows);
};

export default {
  slug: "reproduce-bug-not-reproduced",
  title: "Plus sign in the recipient is rejected",
  workflow: "bugfix",
  fixtures: [],
  request: `Bug report (notifyctl 0.3.0, Node 20, Linux): \`notifyctl send --channel email --to owner+billing@example.com --message "Invoice 42 is overdue"\` exits 1 with \`send needs --to\`, and no .eml file is written. The same command with \`--to owner@example.com\` works. Addresses with a plus sign are valid, so the CLI should accept this one.`,
  phases: [
    {
      skill: "reproduce-bug",
      terminal: true,
      artifactType: "reproduction",
      request: "Reproduce the bug reported in `task.md`. Edit no product code.",
      check: (ctx) => {
        const { artifact } = ctx;
        const text = artifact?.text ?? "";
        const attempted = section(text, "## Attempted");
        const missing = section(text, "## Missing");
        const out = [
          artifact ? null : "reproduce-bug: no reproduction artifact saved",
          artifact?.fm?.status === "not-reproduced" ? null : `reproduce-bug: status is ${JSON.stringify(artifact?.fm?.status)}, expected not-reproduced (the report describes no real bug)`,
          attempted === null ? "reproduce-bug: no ## Attempted section" : entries(attempted) >= 3 ? null : `reproduce-bug: ${entries(attempted)} attempts recorded, expected at least 3`,
          missing === null ? "reproduce-bug: no ## Missing section" : entries(missing) >= 1 ? null : "reproduce-bug: ## Missing lists nothing",
          /^##\s+(?:Cause|Fix)\b/m.test(text) ? "reproduce-bug: a not-reproduced artifact carries a ## Cause or ## Fix section (a guess)" : null,
        ];
        const h = handoff(ctx.answer);
        if (h?.skill === "fix-bug") out.push("reproduce-bug: reply hands off to /fix-bug although nothing reproduced");
        if (ctx.live) {
          if (git(ctx.repo, "rev-parse", "HEAD") !== ctx.fixtureSha) out.push("reproduce-bug: a commit was made; a reproducer commits no code");
          const changed = git(ctx.repo, "status", "--porcelain").split("\n").filter(Boolean);
          const product = changed.filter((l) => !l.startsWith("??") || /^\?\? src\//.test(l));
          if (product.length) out.push(`reproduce-bug: product files changed:\n${product.join("\n")}`);
        }
        return failures(out);
      },
    },
  ],
};
