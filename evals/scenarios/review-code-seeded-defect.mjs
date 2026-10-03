import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, failures, handoff, section } from "../lib.mjs";

// Live `/review-code` on a one-file feature branch. The seeded variant carries one off-by-one that no
// shipped test catches (it contradicts an acceptance criterion) and one trivial style nit; the clean
// variant (review-code-clean.mjs) carries the same nit and no defect. Setup builds branch
// `feature/pagination` from `main` inside the throwaway repository. The phase is `terminal` because the
// branch commit is a change outside `.agents/`, which the non-terminal common checks refuse; the handoff
// fence, status, findings, and the `contract.mjs review` verdict are graded here instead.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const head = (slice) => `// Page \`page\` (1-based) of \`items\`, \`size\` items per page; the last page may be shorter.
export function paginate(items, page, size) {
  if (!Number.isInteger(page) || page < 1) throw new RangeError("page must be a positive integer");
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer");
  const start = (page - 1) * size;
  return items.slice(start, ${slice});
}

export function pageLabel(page, total) {
  return "Page " + page + " of " + total;
}
`;
export const SOURCE = { seeded: head("start + size - 1"), clean: head("start + size") };
export const BUG_LINE = SOURCE.seeded.split("\n").findIndex((line) => line.includes(".slice(")) + 1;

const tests = (extra) => `import assert from "node:assert/strict";
import test from "node:test";
import { pageLabel, paginate } from "../src/paginate.mjs";

test("the last page may be shorter", () => {
  assert.deepEqual(paginate([1, 2, 3], 2, 2), [3]);
});

test("a page past the end is empty", () => {
  assert.deepEqual(paginate([1, 2, 3], 3, 2), []);
});

test("a page below 1 is rejected", () => {
  assert.throws(() => paginate([1, 2, 3], 0, 2), RangeError);
});

test("a size below 1 is rejected", () => {
  assert.throws(() => paginate([1, 2, 3], 1, 0), RangeError);
});

test("a page label names the page and the total", () => {
  assert.equal(pageLabel(2, 5), "Page 2 of 5");
});
${extra}`;
export const TESTS = {
  seeded: tests(""),
  clean: tests(`
test("a full first page holds size items", () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 1, 2), [1, 2]);
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 3, 2), [5]);
});
`),
};

export const REQUEST = `Add \`paginate(items, page, size)\` in \`src/paginate.mjs\`: page \`page\` (1-based) of \`items\`, \`size\` items per page.

Acceptance criteria:
- \`paginate([1, 2, 3, 4, 5], 1, 2)\` returns \`[1, 2]\` and \`paginate([1, 2, 3, 4, 5], 3, 2)\` returns \`[5]\`.
- A page or size below 1 throws a \`RangeError\`.
- \`npm test\` passes.`;

// Builds `feature/pagination` from main with one commit; returns the commit the review must pin.
export function featureBranch(variant) {
  return ({ repo }) => {
    git(repo, "checkout", "-q", "-b", "feature/pagination");
    fs.writeFileSync(path.join(repo, "src", "paginate.mjs"), SOURCE[variant]);
    fs.writeFileSync(path.join(repo, "tests", "paginate.test.mjs"), TESTS[variant]);
    git(repo, "add", "src/paginate.mjs", "tests/paginate.test.mjs");
    git(repo, "commit", "-q", "-m", "feat: add paginate");
    return { head: git(repo, "rev-parse", "HEAD") };
  };
}

export const noPr = { glab: "echo 'no pull request for this branch' >&2; exit 1" };

// What every review of this fixture must satisfy; `expected` is `findings` or `clean`.
export function reviewCheck(expected) {
  return (ctx) => {
    const { artifact } = ctx;
    const text = artifact?.text ?? "";
    const required = section(text, "## Critical and Required Findings") ?? "";
    const crIds = [...required.matchAll(/^###\s+(CR-\S+)/gm)].map((m) => m[1]);
    const out = [
      artifact ? null : "review-code: no code-review artifact saved",
      artifact?.fm?.status === expected ? null : `review-code: status is ${JSON.stringify(artifact?.fm?.status)}, expected ${expected}`,
      expect.present("review-code: Critical and Required Findings section", section(text, "## Critical and Required Findings")),
    ];
    const h = handoff(ctx.answer);
    const next = expected === "findings" ? "fix-code-review" : "record-evidence";
    out.push(h?.skill === next ? null : `review-code: reply hands off to ${h ? `/${h.skill}` : "nothing"}, expected /${next}`);
    if (expected === "findings") {
      // One CR for the off-by-one; a second is allowed only for the test gap that let it ship (the fixture's tests cannot catch it, and
      // review-code treats an acceptance criterion no test proves as a required finding). Anything else is a false positive.
      const blocks = required.split(/^(?=###\s+CR-)/m).filter((b) => /^###\s+CR-/.test(b));
      const citesBug = (b) => new RegExp(`src/paginate\\.mjs:${BUG_LINE}\\b`).test(b);
      const bugId = blocks.find(citesBug)?.match(/^###\s+(CR-\S+)/)?.[1];
      // The test-gap finding must say it is about tests and name the bug finding it lets through, by id or by describing the full-page off-by-one.
      const testGap = (b) => /\btests?\b|coverage/i.test(b.split("\n")[0]) && !!bugId && (b.includes(bugId) || /full[- ]page|off-by-one/i.test(b));
      const extra = blocks.filter((b) => !citesBug(b) && !testGap(b));
      out.push(crIds.length >= 1 && crIds.length <= 2 && extra.length === 0 ? null : `review-code: ${crIds.length} CR- findings; expected the seeded off-by-one, plus at most its test gap`);
      const cited = [...required.matchAll(/src\/paginate\.mjs:(\d+)(?:-(\d+))?/g)].map((m) => [Number(m[1]), Number(m[2] ?? m[1])]);
      out.push(cited.some(([from, to]) => from <= BUG_LINE && BUG_LINE <= to) ? null : `review-code: no CR finding cites src/paginate.mjs line ${BUG_LINE}`);
      out.push(expect.excludes("review-code: the string-concatenation nit stays out of the blocking section", required, /pageLabel|concatenat/i));
      out.push(expect.matches("review-code: the CR finding is critical or major", required, /severity:\s*(?:critical|major)/i));
    } else {
      out.push(crIds.length === 0 ? null : `review-code: clean diff raised ${crIds.join(", ")}`);
    }
    if (ctx.live && artifact) {
      if (git(ctx.repo, "status", "--porcelain")) out.push("review-code: the reviewer left the repository dirty");
      if (git(ctx.repo, "rev-parse", "HEAD") !== ctx.setup.head) out.push("review-code: HEAD moved; a review commits nothing");
      try {
        execFileSync("node", [path.join(ctx.skillsDir, "deliver", "contract.mjs"), "review", ctx.taskDir, artifact.file], { cwd: ctx.repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch (error) {
        out.push(`review-code: contract.mjs review rejects ${artifact.file}: ${String(error.stderr || error.message).trim().split("\n")[0]}`);
      }
    }
    return failures(out);
  };
}

export default {
  slug: "review-code-seeded-defect",
  title: "Add pagination",
  workflow: "oneshot",
  fixtures: [],
  request: REQUEST,
  stubs: noPr,
  phases: [
    {
      skill: "review-code",
      terminal: true,
      artifactType: "code-review",
      setup: featureBranch("seeded"),
      request: "The change is committed on branch `feature/pagination`, cut from `main`. Review it against `main` as round 1. Do not edit product code.",
      check: reviewCheck("findings"),
    },
  ],
};
