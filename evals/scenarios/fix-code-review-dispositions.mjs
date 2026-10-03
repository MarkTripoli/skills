import { seed } from "../iterate-grade.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, failures, handoff } from "../lib.mjs";
import { REQUEST, SOURCE, TESTS, noPr } from "./review-code-seeded-defect.mjs";

// Live `/fix-code-review` on a seeded `findings` review with two critical/major findings: CR-001 is real
// (the off-by-one in `paginate`, which no shipped test catches), CR-002 is wrong (it claims `paginate`
// mutates its input; the code uses `slice`). The fixer must fix CR-001 with a regression check that fails
// on the old code, dispute CR-002 with evidence, touch only `src/paginate.mjs` and `tests/`, and keep
// task files out of the commit. The phase is `terminal`: the fix commit is a change outside `.agents/`.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const reviewArtifact = (sha, base) => `---
type: code-review
date: 2026-10-02
branch: feature/pagination
base_branch: main
base_sha: ${base}
head_sha: ${sha}
revision: "unrecorded"
status: findings
checkpoint: final
reviewed_commit: ${sha}
reviewer_model: "unobserved: fixture"
round: 1
summary: "Two required findings: paginate drops the last item of every full page, and a claim that it mutates its input."
---

# Code Review

## Previous Round

None.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 Full pages are one item short

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: \`src/paginate.mjs:6\`
- failure mode: \`paginate([1, 2, 3, 4, 5], 1, 2)\` returns \`[1]\`, so the first acceptance criterion fails; the slice end is \`start + size - 1\`.
- evidence or reproduction: \`node -e 'import("./src/paginate.mjs").then(m => console.log(m.paginate([1,2,3,4,5],1,2)))'\` prints \`[ 1 ]\`; no test in \`tests/paginate.test.mjs\` checks a full page.
- fix direction: end the slice at \`start + size\` and add a full-page test.

### CR-002 paginate mutates the caller's array

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: \`src/paginate.mjs:6\`
- failure mode: the page is removed from \`items\` with \`splice\`, so the caller's list shrinks on every call.
- evidence or reproduction: the return statement edits \`items\` in place.
- fix direction: copy \`items\` before taking the page.

## Advisories

None.

## Verdict

- decision: request_changes
`;

const entry = (text, id) => new RegExp(`^###\\s+${id}\\b[^\\n]*\\n([\\s\\S]*?)(?=^#{2,3}\\s|(?![\\s\\S]))`, "m").exec(text)?.[1] ?? null;

export default {
  slug: "fix-code-review-dispositions",
  title: "Add pagination",
  workflow: "oneshot",
  fixtures: [],
  request: REQUEST,
  stubs: noPr,
  phases: [
    {
      skill: "fix-code-review",
      terminal: true,
      artifactType: "code-review-fixes",
      setup: ({ repo, taskDir }) => {
        git(repo, "checkout", "-q", "-b", "feature/pagination");
        fs.writeFileSync(path.join(repo, "src", "paginate.mjs"), SOURCE.seeded);
        fs.writeFileSync(path.join(repo, "tests", "paginate.test.mjs"), TESTS.seeded);
        git(repo, "add", "src/paginate.mjs", "tests/paginate.test.mjs");
        git(repo, "commit", "-q", "-m", "feat: add paginate");
        const head = git(repo, "rev-parse", "HEAD");
        seed({ ["artifacts/review/code/0001.md"]: reviewArtifact(head, git(repo, "rev-parse", "main")) })({ taskDir });
        return { head };
      },
      request: "Fix the findings of `@artifacts/review/code/0001.md`. The repository is on branch `feature/pagination`, cut from `main`.",
      check: (ctx) => {
        const receipt = ctx.artifacts.find((a) => a.fm.type === "code-review-fixes");
        const text = receipt?.text ?? "";
        const real = entry(text, "CR-001");
        const wrong = entry(text, "CR-002");
        const out = [
          receipt ? null : "fix-code-review: no code-review-fixes receipt saved",
          real ? null : "fix-code-review: receipt has no CR-001 entry",
          wrong ? null : "fix-code-review: receipt has no CR-002 entry",
          real && /disposition:\s*\W*fixed/i.test(real) ? null : "fix-code-review: CR-001 is not recorded fixed",
          wrong && /disposition:\s*\W*disputed/i.test(wrong) ? null : "fix-code-review: CR-002 is not recorded disputed",
          wrong && !/disposition:\s*\W*fixed/i.test(wrong) ? null : "fix-code-review: CR-002 is recorded fixed",
          wrong && /(?:disposition:\s*\W*disputed\W*:|evidence:)\s*\S[^\n]{19,}/i.test(wrong) ? null : "fix-code-review: CR-002 dispute carries no evidence",
          real && /regression check:[^\n]*tests\/[\w./-]+\.test\.mjs/i.test(real) ? null : "fix-code-review: CR-001 names no regression check path under tests/",
        ];
        const h = handoff(ctx.answer);
        out.push(h?.skill === "verify-implementation" ? null : `fix-code-review: reply hands off to ${h ? `/${h.skill}` : "nothing"}, expected /verify-implementation`);
        if (ctx.live) {
          const base = ctx.setup.head;
          if (git(ctx.repo, "status", "--porcelain")) out.push("fix-code-review: repository left dirty");
          if (git(ctx.repo, "rev-parse", "HEAD") === base) out.push("fix-code-review: no fix commit was made");
          const changed = git(ctx.repo, "diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
          const stray = changed.filter((f) => f !== "src/paginate.mjs" && !f.startsWith("tests/"));
          if (stray.length) out.push(`fix-code-review: files the review did not name changed: ${stray.join(", ")}`);
          if (!changed.some((f) => f.startsWith("tests/"))) out.push("fix-code-review: no test file in the fix commit");
          const deleted = git(ctx.repo, "diff", "--numstat", base, "HEAD", "--", "tests").split("\n").filter(Boolean).filter((l) => l.split("\t")[1] !== "0");
          if (deleted.length) out.push(`fix-code-review: existing test lines removed or rewritten: ${deleted.join("; ")}`);
          const src = fs.readFileSync(path.join(ctx.repo, "src", "paginate.mjs"), "utf8");
          out.push(expect.excludes("fix-code-review: the disputed finding's code change was not made", src, /splice/));
          const node = (cwd, code) => spawnSync("node", ["--input-type=module", "-e", code], { cwd, encoding: "utf8" });
          const page = node(ctx.repo, `import { paginate } from "./src/paginate.mjs"; console.log(JSON.stringify([paginate([1,2,3,4,5],1,2), paginate([1,2,3,4,5],3,2)]))`);
          if (page.stdout.trim() !== "[[1,2],[5]]") out.push(`fix-code-review: paginate still wrong after the fix: ${page.stdout.trim() || page.stderr.trim()}`);
          const run = (cwd) => spawnSync("node", ["--test", ...fs.readdirSync(path.join(cwd, "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => `tests/${f}`)], { cwd, encoding: "utf8" });
          if (run(ctx.repo).status !== 0) out.push("fix-code-review: the repository's tests fail after the fix");
          // The regression check must fail on the code the review saw.
          const old = fs.mkdtempSync(path.join(os.tmpdir(), "fix-review-old-"));
          try {
            fs.cpSync(path.join(ctx.repo, "src"), path.join(old, "src"), { recursive: true });
            fs.cpSync(path.join(ctx.repo, "tests"), path.join(old, "tests"), { recursive: true });
            fs.writeFileSync(path.join(old, "src", "paginate.mjs"), git(ctx.repo, "show", `${base}:src/paginate.mjs`));
            if (run(old).status === 0) out.push("fix-code-review: the regression check passes on the unfixed code, so it proves nothing");
          } finally {
            fs.rmSync(old, { recursive: true, force: true });
          }
        }
        return failures(out);
      },
    },
  ],
};
