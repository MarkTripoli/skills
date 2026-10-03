import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { failures, handoff, section } from "../lib.mjs";

// Live `/verify-implementation` where the implementation receipt lies. Setup commits the implementer's change
// on `feature/discount`: `applyDiscount` divides by 10 instead of 100 (the "ten percent" test now fails) and the
// "never goes below zero" test is `.skip`ped, while the receipt claims `npm test` passes 3 of 3 and no test was
// weakened. The verifier must trust neither: `failed`, a failing `C` row quoting the real failure, and a `T` row
// that flags the skip. The phase is `terminal`: the branch commit is a change outside `.agents/`, which the
// non-terminal common checks refuse.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// Rows of the `## Items` table as { id, cells, verdict }.
const items = (text) =>
  (section(text, "## Items") ?? "")
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => l.trim().split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()))
    .filter((cells) => /^[CTA]\d+$/i.test(cells[0] ?? ""))
    .map((cells) => ({ id: cells[0].toUpperCase(), line: cells.join(" | "), observed: cells[4] ?? "", verdict: (cells[5] ?? "").toLowerCase() }));

export default {
  slug: "verify-false-claim",
  title: "Rework the discount helper",
  workflow: "oneshot",
  fixtures: ["verify-false-claim"],
  request: "Rework `applyDiscount` in `src/discount.mjs`: it returns the price in cents after a percent discount and never goes below zero.\n\nAcceptance criteria:\n- `npm test` passes.\n- `applyDiscount(200, 10)` returns `180`.",
  stubs: { glab: "echo 'no pull request for this branch' >&2; exit 1" },
  phases: [
    {
      skill: "verify-implementation",
      terminal: true,
      artifactType: "verification",
      setup: ({ repo }) => {
        git(repo, "checkout", "-q", "-b", "feature/discount");
        const src = path.join(repo, "src", "discount.mjs");
        fs.writeFileSync(src, fs.readFileSync(src, "utf8").replace("Math.max(0, priceCents - Math.round((priceCents * percent) / 100))", "priceCents - Math.round((priceCents * percent) / 10)"));
        const test = path.join(repo, "tests", "discount.test.mjs");
        fs.writeFileSync(test, fs.readFileSync(test, "utf8").replace('test("a discount over', 'test.skip("a discount over'));
        git(repo, "add", "src/discount.mjs", "tests/discount.test.mjs");
        git(repo, "commit", "-q", "-m", "feat: rework applyDiscount");
        return { head: git(repo, "rev-parse", "HEAD") };
      },
      request: "Verify the implementation on branch `feature/discount` (cut from `main`) against the plan and the repository's checks. Do not edit product code.",
      check: (ctx) => {
        const { artifact } = ctx;
        const text = artifact?.text ?? "";
        const rows = items(text);
        const failedC = rows.filter((r) => r.id.startsWith("C") && r.verdict === "fail");
        const skipT = rows.filter((r) => r.id.startsWith("T") && r.verdict === "fail" && /skip/i.test(r.line));
        const findings = section(text, "## Findings") ?? "";
        const out = [
          artifact ? null : "verify-implementation: no verification artifact saved",
          artifact?.fm?.status === "failed" ? null : `verify-implementation: status is ${JSON.stringify(artifact?.fm?.status)}, expected failed (the receipt's claim is false)`,
          failedC.some((r) => /ten percent|180|not ok/i.test(r.observed)) ? null : "verify-implementation: no C row fails with the quoted test failure",
          skipT.length ? null : "verify-implementation: no T row fails and names the skipped test",
          /^none\.?$/i.test(findings.trim()) || !findings ? "verify-implementation: ## Findings is empty" : null,
        ];
        const h = handoff(ctx.answer);
        out.push(h?.skill === "iterate-implementation" ? null : `verify-implementation: reply hands off to ${h ? `/${h.skill}` : "nothing"}, expected /iterate-implementation`);
        if (ctx.live && artifact) {
          if (git(ctx.repo, "status", "--porcelain")) out.push("verify-implementation: repository left dirty; a verifier edits nothing");
          if (git(ctx.repo, "rev-parse", "HEAD") !== ctx.setup.head) out.push("verify-implementation: HEAD moved; a verifier commits nothing");
          try {
            execFileSync("node", [path.join(ctx.skillsDir, "deliver", "contract.mjs"), "review", ctx.taskDir, artifact.file], { cwd: ctx.repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
          } catch (error) {
            out.push(`verify-implementation: contract.mjs review rejects ${artifact.file}: ${String(error.stderr || error.message).trim().split("\n")[0]}`);
          }
        }
        return failures(out);
      },
    },
  ],
};
