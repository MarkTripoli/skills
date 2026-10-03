import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, failures, handoff } from "../lib.mjs";

// Live `/fix-bug` from a seeded `reproduced` artifact. The fixture's committed `tests/money.test.mjs` is the
// reproduction (it fails on `main`). The fixer must make it pass by fixing `src/money.mjs` as the `## Fix`
// names, not by loosening the test's expected value or deleting it, commit only code (no `.agents/tasks/`),
// keep other callers' outputs right, and write a `fix` receipt. The phase is `terminal`: the fix commit is a
// change outside `.agents/`, which the non-terminal common checks refuse.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export default {
  slug: "fix-bug-regression",
  title: "formatCents drops the zero in single-digit cents",
  workflow: "bugfix",
  fixtures: ["fix-bug-regression"],
  request: "`formatCents(105)` returns `\"1.5\"`; it should return `\"1.05\"`.",
  phases: [
    {
      skill: "fix-bug",
      terminal: true,
      artifactType: "fix",
      request: "Fix the bug recorded in the reproduction artifact. No pull request.",
      check: (ctx) => {
        const receipt = ctx.artifacts.find((a) => a.fm.type === "fix");
        const out = [
          receipt ? null : "fix-bug: no fix receipt saved",
          receipt && !receipt.fm.summary ? "fix-bug: receipt has no summary" : null,
          expect.matches("fix-bug: receipt records the verification", receipt?.text, /npm test|node --test/),
        ];
        const h = handoff(ctx.answer);
        out.push(h?.skill === "verify-implementation" ? null : `fix-bug: reply hands off to ${h ? `/${h.skill}` : "nothing"}, expected /verify-implementation`);
        if (ctx.live) {
          const repo = ctx.repo;
          const base = ctx.fixtureSha;
          if (git(repo, "status", "--porcelain")) out.push("fix-bug: repository left dirty; the fix was not committed");
          if (git(repo, "rev-parse", "HEAD") === base) out.push("fix-bug: no fix commit was made");
          const changed = git(repo, "diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
          const stray = changed.filter((f) => f !== "src/money.mjs" && !f.startsWith("tests/"));
          if (stray.length) out.push(`fix-bug: files outside the artifact's ## Fix changed: ${stray.join(", ")}`);
          const test = path.join(repo, "tests", "money.test.mjs");
          const testText = fs.existsSync(test) ? fs.readFileSync(test, "utf8") : "";
          if (!/formatCents\(105\)[^\n]*"1\.05"/.test(testText)) out.push("fix-bug: the reproduction test no longer asserts \"1.05\" for 105 cents (deleted or loosened)");
          const removed = git(repo, "diff", "--numstat", base, "HEAD", "--", "tests").split("\n").filter(Boolean).filter((l) => l.split("\t")[1] !== "0");
          if (removed.length) out.push(`fix-bug: existing test lines removed or rewritten: ${removed.join("; ")}`);
          const ran = spawnSync("npm", ["test", "--silent"], { cwd: repo, encoding: "utf8" });
          if (ran.status !== 0) out.push("fix-bug: npm test fails after the fix");
          const probe = spawnSync("node", ["--input-type=module", "-e", `import { formatCents } from "./src/money.mjs"; console.log([105, 250, 100, 7, 0, 1999].map(formatCents).join(","))`], { cwd: repo, encoding: "utf8" });
          if (probe.stdout.trim() !== "1.05,2.50,1.00,0.07,0.00,19.99") out.push(`fix-bug: formatCents is still wrong on other inputs: ${probe.stdout.trim() || probe.stderr.trim()}`);
        }
        return failures(out);
      },
    },
  ],
};
