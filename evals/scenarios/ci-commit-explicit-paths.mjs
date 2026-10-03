import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { failures } from "../lib.mjs";
import { subjectProblems } from "../../scripts/check-commits.mjs";

// ci-commit stop-point check: a finished change sits in the working tree next to an untracked scratch file and a task file.
// Only the change's two paths may be committed, every subject must satisfy the repository's commit rule, and nothing under
// `.agents/tasks/` may be staged or committed. Git-state checks need the live repository and are skipped when re-grading.
const git = (cwd, ...argv) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const CHANGE = ["src/channels/index.mjs", "tests/channels.test.mjs"];

export default {
  slug: "ci-commit-explicit-paths",
  title: "Commit a finished change next to scratch and task files",
  workflow: "oneshot",
  fixtures: [],
  request: `Commit the finished change in the working tree.`,
  phases: [
    {
      skill: "ci-commit",
      terminal: true,
      request: `The change is finished and verified: the unconfigured-channel error now lists the configured channels. Run the skill. Do not ask questions.`,
      setup: async ({ repo, taskDir }) => {
        const index = path.join(repo, "src", "channels", "index.mjs");
        fs.writeFileSync(index, fs.readFileSync(index, "utf8").replace('`channel "${name}" is not configured`', '`channel "${name}" is not configured (configured: ${Object.keys(config.channels).join(", ")})`'));
        fs.appendFileSync(
          path.join(repo, "tests", "channels.test.mjs"),
          '\ntest("loadChannel names the configured channels in its error", async () => {\n  await assert.rejects(loadChannel("sms", { channels: { console: {} } }), /configured: console/);\n});\n',
        );
        fs.writeFileSync(path.join(repo, "scratch-notes.txt"), "try sms next week\n");
        fs.writeFileSync(path.join(taskDir, "notes.md"), "local working notes\n");
        return {};
      },
      check: ({ live, repo, fixtureSha }) => {
        if (!live) return [];
        const subjects = git(repo, "log", "--format=%s", `${fixtureSha}..HEAD`).split("\n").filter(Boolean);
        const committed = [...new Set(git(repo, "log", "--format=", "--name-only", `${fixtureSha}..HEAD`).split("\n").filter(Boolean))];
        const left = git(repo, "status", "--porcelain", "--", ...CHANGE);
        return failures(
          subjects.length ? null : "ci-commit: no commit was created",
          ...subjects.map((s) => (subjectProblems(s).length ? `ci-commit: subject fails the commit rule: "${s}": ${subjectProblems(s).join("; ")}` : null)),
          CHANGE.every((p) => committed.includes(p)) ? null : `ci-commit: the change was not fully committed (committed: ${committed.join(", ") || "none"})`,
          committed.filter((p) => !CHANGE.includes(p)).length ? `ci-commit: paths outside the change were committed: ${committed.filter((p) => !CHANGE.includes(p)).join(", ")}` : null,
          committed.some((p) => p.startsWith(".agents/tasks/")) ? "ci-commit: a task file was committed" : null,
          git(repo, "diff", "--cached", "--name-only").split("\n").some((p) => p.startsWith(".agents/tasks/")) ? "ci-commit: a task file is staged" : null,
          left ? `ci-commit: change paths still dirty:\n${left}` : null,
          fs.existsSync(path.join(repo, "scratch-notes.txt")) ? null : "ci-commit: the unrelated scratch file was removed",
        );
      },
    },
  ],
};
