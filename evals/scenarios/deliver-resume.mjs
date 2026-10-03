import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { deliverCheck, git } from "../deliver-grade.mjs";
import { readSessions } from "../sessions.mjs";
import { disposeIsolatedEnv, failures, isolatedEnv } from "../lib.mjs";

// The command after `unblock check:`: the backticked span whole (a dot inside it belongs to the command), else the rest of the line.
const unblockCommand = (taskText) => {
  const status = taskText.split(/^## Status\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const found = /unblock check:\s*`([^`\n]+)`/i.exec(status) ?? /unblock check:\s*([^`\n]+?)`?\.?\s*$/im.exec(status);
  return found?.[1].replace(/\s+/g, " ").trim() ?? null;
};
// What the stop says is missing, before `unblock check:`. The same command may stand when the run reran it and still found the
// prerequisite unmet: `git remote -v lists a GitLab remote` stays right after a local-path `origin` appears, and the prerequisite
// then moves from "no remote" to "origin is not a host".
// A bare command that passes now cannot name a prerequisite still unmet, so the same command stands only when the stop states a condition after it.
const conditioned = (taskText) => /\S/.test((/unblock check:\s*`[^`\n]+`([^\n]*)/i.exec(taskText.split(/^## Status\s*$/m)[1]?.split(/^## /m)[0] ?? "")?.[1] ?? "").replace(/[\s.;,]/g, ""));
const prerequisite = (taskText) => (taskText.split(/^## Status\s*$/m)[1]?.split(/^## /m)[0] ?? "").split(/unblock check:/i)[0].replace(/\s+/g, " ").trim();
const bashCommands = (s) => s.calls.filter((c) => c.name === "bash").map((c) => String(c.args.command ?? "").replace(/\s+/g, " "));

// The first run's check, run the way the run itself ran: Slack out of reach, nothing of the operator's credentials added.
const runInIsolation = (command, repo) => {
  const env = isolatedEnv(process.env);
  try {
    return spawnSync("sh", ["-c", command], { cwd: repo, env, stdio: "ignore", timeout: 60_000 }).status;
  } finally {
    disposeIsolatedEnv(env);
  }
};

// What a resumed `/deliver <task-dir>` must show: it reran the unblock check the first run recorded, it read the task's status through the
// contract, it built nothing again (no commit in its sessions, HEAD where the first run left it), and its stop moved on: the `## Status`
// unblock check is a different one, or the same check with a stated condition and a prerequisite that now says what is still missing, and in a live run the old one passes now that the remote exists.
export function resumeProblems({ live, before, sessionDir, setup, repo, taskDir }) {
  const previous = before.find((f) => f.file === "task.md")?.text ?? "";
  const command = unblockCommand(previous);
  const currentText = taskDir && fs.existsSync(path.join(taskDir, "task.md")) ? fs.readFileSync(path.join(taskDir, "task.md"), "utf8") : "";
  const current = taskDir && fs.existsSync(path.join(taskDir, "task.md")) ? unblockCommand(fs.readFileSync(path.join(taskDir, "task.md"), "utf8")) : null;
  const sessions = sessionDir ? readSessions(sessionDir) : [];
  const commands = sessions.flatMap(bashCommands);
  const oldCheck = live && command && repo ? runInIsolation(command, repo) : null;
  return failures(
    command ? null : "resume: the first run's ## Status recorded no unblock check command to rerun",
    command && !commands.some((c) => c.includes(command)) ? `resume: no session reran the recorded unblock check \`${command}\`` : null,
    commands.some((c) => /contract\.mjs\s+status\b/.test(c)) ? null : "resume: no session ran `contract.mjs status`",
    commands.some((c) => /\bgit\b[^;&|]*\bcommit\b/.test(c)) ? "resume: a session ran git commit; the resumed run had nothing left to build" : null,
    live && setup?.head && git(repo, "rev-parse", "HEAD") !== setup.head ? "resume: HEAD moved; the resumed run rebuilt or amended finished work" : null,
    current ? null : "resume: the resumed ## Status records no unblock check command",
    command && current && command === current && (prerequisite(previous) === prerequisite(currentText) || !conditioned(currentText)) ? `resume: the stop did not move on; ## Status still carries the unblock check \`${command}\`` : null,
    oldCheck !== null && oldCheck !== 0 ? `resume: the first run's unblock check \`${command}\` still fails (exit ${oldCheck}) after the remote was added, so the scenario cannot show the stop moving on; rerun` : null,
  );
}

const PHASE = {
  skill: "deliver",
  terminal: true,
  model: "anthropic/claude-opus-5-5",
};
const NO_SLACK = "Use no Slack: start no Slack run and post nothing to Slack. The model profile is `.agents/model-candidates.json`.";
const changed = ["src/retry.mjs", "src/timeout.mjs"];

// Two plan phases, then a resume. The first run builds both fixes (each slice review binds its own commit, the final reviews bind
// HEAD) and stops `blocked` on the missing remote. The runner then gives the repository a local bare `origin`, and `/deliver <task-dir>`
// must rerun the recorded unblock check, see it pass and stop at the next prerequisite, the missing PR host, without rebuilding.
export default {
  slug: "deliver-resume",
  title: "Fix the retry cap and the timeout clamp",
  workflow: "oneshot",
  fixtures: ["deliver-two-bugs"],
  request: `Two independent defects, and \`npm test\` fails:
- \`backoffDelay\` in \`src/retry.mjs\` ignores its cap: it should double \`baseMs\` per attempt and never exceed \`maxMs\`.
- \`clampTimeout\` in \`src/timeout.mjs\` returns the wrong bound: it should keep \`ms\` between \`minMs\` and \`maxMs\` inclusive.

Acceptance criteria:
- \`npm test\` passes, including the tests in \`tests/retry.test.mjs\` and \`tests/timeout.test.mjs\`.
- The fixes change only \`src/retry.mjs\` and \`src/timeout.mjs\`.
- Plan one phase per defect, so each has its own commit and review.`,
  phases: [
    {
      ...PHASE,
      request: [
        "Run /deliver for this task unattended: gates none, do not ask me anything. This repository is already open on its task branch; do not open another worktree. It has no remote and no pull request host, so stop at publish if nothing else blocks.",
        NO_SLACK,
        "Write a short plan artifact before building, and let a builder subagent and separate reviewer subagents do the work, per the skill.",
        "The independent plan checkpoint must bind the current indexed plan through reviewed_artifact and reviewed_artifact_sha256.",
      ].join("\n"),
      check: deliverCheck({ changed, minPhases: 2 }),
    },
    {
      ...PHASE,
      // The owner's action between the runs: a local bare repository as `origin`, with the task branch pushed to it.
      setup: ({ repo }) => {
        const bare = fs.mkdtempSync(path.join(os.tmpdir(), "skills-eval-origin-"));
        execFileSync("git", ["init", "-q", "--bare", bare]);
        git(repo, "remote", "add", "origin", bare);
        git(repo, "push", "-q", "origin", "main");
        return { head: git(repo, "rev-parse", "HEAD"), bare };
      },
      request: [
        "Resume this task with `/deliver .agents/tasks/deliver-resume`, unattended: gates none, do not ask me anything. This repository is already open on its task branch; do not open another worktree. No pull request host is configured for it.",
        NO_SLACK,
      ].join("\n"),
      check: (ctx) => failures(deliverCheck({ changed, minPhases: 2, stopAt: "host", sessions: false })(ctx), resumeProblems(ctx)),
    },
  ],
};
