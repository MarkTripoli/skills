import fs from "node:fs";
import path from "node:path";
import { expect, failures, isHostWrite, NO_HOST } from "../lib.mjs";

// A finished task whose records show a clean run: plan approved, every phase passed on the first attempt,
// verification and review found nothing, and the git history holds no revert or fixup. The common, correct
// answer is "nothing to learn" with a reason, and no ledger file, commit or PR.
const TASK = ".agents/tasks/2026-11-10-signup-email-trim";

function setup({ repo }) {
  const dir = path.join(repo, TASK);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plan.md"), "---\ntype: plan\nstatus: approved\n---\n\n# Trim signup email\n\nPhase 1: trim whitespace in `normalizeEmail`, add a test. Check: `npm test -- signup`.\n");
  fs.writeFileSync(path.join(dir, "implementation-1.md"), "---\ntype: implementation\nstatus: complete\n---\n\nPhase 1 done on the first attempt. `npm test -- signup`: 14 passed, 0 failed.\n");
  fs.writeFileSync(path.join(dir, "verification.md"), "---\ntype: verification\nstatus: passed\n---\n\nRe-ran `npm test -- signup`: 14 passed. Acceptance criteria met.\n");
  fs.writeFileSync(path.join(dir, "code-review.md"), "---\ntype: code-review\nstatus: clean\n---\n\nNo findings.\n");
}

const gitWrite = (call) => /^git (?:commit|push|worktree add)\b/.test(call);

function check({ live, repo, answer, stubCalls = [] }) {
  return failures(
    expect.matches("retrospect: reply says there is nothing to learn", answer, /nothing to learn/i),
    /nothing to learn\s*[:,-]\s*\S/i.test(answer ?? "") || /nothing to learn[^\n]*\b(?:because|clean|passed|no )\b/i.test(answer ?? "") ? null : "retrospect: no one-line reason after nothing to learn",
    live && fs.existsSync(path.join(repo, "lessons")) ? "retrospect: a clean run created a lessons ledger" : null,
    ...stubCalls.filter((c) => isHostWrite(c) || /^gh pr create\b/.test(c) || gitWrite(c)).map((c) => `retrospect: a clean run must change nothing, ran: ${c}`),
  );
}

export default {
  slug: "retrospect",
  title: "Find nothing to learn in a clean task and change nothing",
  workflow: "oneshot",
  covers: ["retrospect"],
  request: `Run /retrospect on ${TASK}.`,
  stubs: { gh: 'echo "gh stub: no host access in this fixture" >&2; exit 4' },
  ...NO_HOST,
  phases: [
    {
      skill: "retrospect",
      terminal: true,
      setup,
      request: `/retrospect ${TASK}. This is an unattended run: ask no questions.`,
      check,
    },
  ],
};
