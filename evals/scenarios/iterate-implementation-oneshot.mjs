// `iterate-implementation` as the manual oneshot path: the task directory holds `task.md` only, so there is
// no plan or outline and none may be invented. The skill implements the bounded change, runs the checks,
// makes one code commit that leaves out `.agents/`, saves one implementation receipt without
// `completed_phase`, and ends on the terminal answer: one text fence, `/verify-implementation`. The phase
// is `terminal` because it changes code, which the document-phase checks forbid. The behavior is checked
// by running the built CLI in a scratch copy, not by reading the diff. Needs no hardware or service.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, failures, handoff, placeholders } from "../lib.mjs";

const CONVENTIONAL = /^(?:feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(?:\([^)]+\))?!?: \S/;

// The CLI run in a scratch directory holding only its sources and config, with an optional seeded log.
function runList(repo, entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oneshot-list-"));
  try {
    fs.cpSync(path.join(repo, "src"), path.join(dir, "src"), { recursive: true });
    fs.copyFileSync(path.join(repo, "notifyctl.config.json"), path.join(dir, "notifyctl.config.json"));
    fs.copyFileSync(path.join(repo, "package.json"), path.join(dir, "package.json"));
    if (entries) {
      fs.mkdirSync(path.join(dir, "outbox"));
      fs.writeFileSync(path.join(dir, "outbox", "log.json"), JSON.stringify(entries));
    }
    return spawnSync("node", ["src/cli.mjs", "list"], { cwd: dir, encoding: "utf8" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export default {
  slug: "empty-list-message",
  title: "Say so when the delivery log is empty",
  workflow: "oneshot",
  fixtures: [],
  request: `\`notifyctl list\` prints nothing when the delivery log is empty, which looks like a hang. Make it print \`no notifications\` instead.

Acceptance criteria:
- With no delivery log, \`node src/cli.mjs list\` prints \`no notifications\` and exits 0.
- With log entries, the output is unchanged.
- \`npm test\` passes, including a new test for the empty case in \`tests/\`.`,
  phases: [
    {
      skill: "iterate-implementation",
      terminal: true,
      request: "This is the task-only oneshot path: `task.md` is the whole brief and no plan or outline exists. Implement it, run the checks, commit the code, and finish as the skill says. Do not ask me questions.",
      check: (ctx) => {
        const receipts = ctx.artifacts.filter((a) => a.fm.type === "implementation");
        const receipt = receipts[0];
        const h = handoff(ctx.answer);
        const git = (...argv) => execFileSync("git", argv, { cwd: ctx.repo, encoding: "utf8" }).trim();
        const live = ctx.live
          ? (() => {
              const commits = git("log", "--format=%H", `${ctx.fixtureSha}..HEAD`).split("\n").filter(Boolean);
              const files = commits.length === 1 ? git("show", "--name-only", "--format=", commits[0]).split("\n").filter(Boolean) : [];
              const empty = runList(ctx.repo, null);
              const full = runList(ctx.repo, [{ at: "2026-01-01T00:00:00Z", channel: "email", to: "a@example.com", status: "queued" }]);
              const tests = spawnSync("npm", ["test", "--silent"], { cwd: ctx.repo, encoding: "utf8" });
              return [
                commits.length === 1 ? null : `iterate-implementation: ${commits.length} code commits, expected one`,
                commits.length === 1 && !CONVENTIONAL.test(git("log", "-1", "--format=%s", commits[0])) ? "iterate-implementation: the commit subject is not Conventional Commits" : null,
                files.some((f) => f.startsWith(".agents/")) ? "iterate-implementation: the commit includes task files" : null,
                files.some((f) => f.startsWith("src/")) ? null : "iterate-implementation: the commit changes nothing under src/",
                files.some((f) => f.startsWith("tests/")) ? null : "iterate-implementation: the commit adds no test",
                empty.status === 0 && /no notifications/.test(empty.stdout) ? null : `iterate-implementation: empty \`list\` exit ${empty.status}, stdout ${JSON.stringify(empty.stdout)}`,
                full.status === 0 && full.stdout === "2026-01-01T00:00:00Z email a@example.com queued\n" ? null : `iterate-implementation: \`list\` with entries changed: ${JSON.stringify(full.stdout)}`,
                tests.status === 0 ? null : `iterate-implementation: npm test fails after the commit: ${(tests.stdout + tests.stderr).slice(-300)}`,
                git("status", "--porcelain") ? "git: repository left dirty" : null,
              ];
            })()
          : [];
        return failures(
          receipts.length === 1 ? null : `iterate-implementation: ${receipts.length} implementation receipts, expected one`,
          receipt && "completed_phase" in receipt.fm ? "iterate-implementation: the receipt carries completed_phase for task-only work" : null,
          receipt && !receipt.fm.summary ? "iterate-implementation: the receipt has no summary" : null,
          ctx.artifacts.filter((a) => ["plan", "structure-outline"].includes(a.fm.type)).map((a) => `iterate-implementation: invented ${a.fm.type} artifact ${a.file}`),
          placeholders(receipt?.text ?? "", ctx.template).map((p) => `iterate-implementation: receipt placeholder left: ${p}`),
          h && h.skill === "verify-implementation" && h.fences === 1 && h.lang === "text" ? null : `iterate-implementation: expected one text fence /verify-implementation (got ${h ? `/${h.skill}, ${h.fences} fences, ${h.lang}` : "no fence"})`,
          receipt ? expect.includes("iterate-implementation: the reply links the receipt", ctx.answer, receipt.file) : null,
          /Phase \d+ automated checks/i.test(ctx.answer) ? "iterate-implementation: the reply uses the numbered-phase answer for task-only work" : null,
          placeholders(ctx.answer).map((p) => `iterate-implementation: reply placeholder left: ${p}`),
          live,
        );
      },
    },
  ],
};
