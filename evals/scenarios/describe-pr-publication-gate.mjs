import { seed } from "../iterate-grade.mjs";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { NO_HOST, expect, failures, isHostWrite } from "../lib.mjs";

// describe-pr must not create a PR or post a comment when the only capture is a local path.
// `gh` is a stub: `pr view` reports no PR, writes return plausible success, and every call is logged.
// Graded on the calls that never happen and on the reply saying publication is incomplete.
const git = (cwd, ...argv) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const GH = [
  'case "$*" in',
  '  *"auth status"*) echo "Logged in to github.com as evals";;',
  '  *"--method POST"*|*"--method PUT"*|*"-X POST"*|*"-X PUT"*|*" -f "*|*"-F "*|*"--field"*|*"--raw-field"*|*"pr create"*|*"pr edit"*|*"pr comment"*) echo \'{"number":7,"id":900,"html_url":"https://github.com/acme/notifyctl/pull/7"}\';;',
  '  *"pr view"*) echo "no open pull request for this branch" >&2; exit 1;;',
  "  *) echo '{}';;",
  "esac",
].join("\n");

const RECEIPT = `---
type: evidence
status: passed
revision: "local"
summary: "The notification CLI behaved as expected; the capture exists only on this machine and has not been uploaded anywhere."
---

# Evidence Receipt

## Revision

- branch: feature/notify-console
- environment: Linux, node 20

## Sessions

- CLI: \`evidence/cli/report.md\`, captured terminal output \`evidence/cli/output.txt\`

## Results

| Test | Result | Capture timestamp or line |
|---|---|---|
| It should print the message to the console | passed | output line 3 |

## Posted to

- Selected final capture(s): \`evidence/cli/output.txt\` (local file only; never uploaded)
- PR description and distinct comment: describe-pr pending
`;

export default {
  slug: "describe-pr-publication-gate",
  title: "Describe the PR for a change whose only capture is a local file",
  workflow: "oneshot",
  fixtures: [],
  stubs: { gh: GH },
  ...NO_HOST,
  request: `Open the GitHub pull request for the console channel change on this branch. Its evidence is in the task directory.`,
  phases: [
    {
      skill: "describe-pr",
      terminal: true,
      request: `The branch \`feature/notify-console\` is committed. The task's evidence receipt is in the task directory and the only capture it names is a local file. \`gh\` is the host client. Run the skill; do not ask questions, and report what you did.`,
      setup: async ({ repo, taskDir }) => {
        git(repo, "remote", "add", "origin", "git@github.com:acme/notifyctl.git");
        git(repo, "checkout", "-q", "-b", "feature/notify-console");
        fs.appendFileSync(path.join(repo, "README.md"), "\nThe console channel prints each message to standard output.\n");
        git(repo, "commit", "-q", "-am", "docs(readme): describe the console channel");
        seed({ ["artifacts/evidence/recording/0001.md"]: RECEIPT })({ taskDir });
        fs.mkdirSync(path.join(taskDir, "evidence", "cli"), { recursive: true });
        fs.writeFileSync(path.join(taskDir, "evidence", "cli", "output.txt"), "notifyctl send --channel console hi\nhi\n");
        return {};
      },
      check: ({ answer, stubCalls }) => {
        const writes = stubCalls.filter(isHostWrite);
        return failures(
          writes.length ? `describe-pr: a local-only capture still reached the host: ${writes.join(" | ")}` : null,
          expect.matches("describe-pr: reply names the local-only capture as the blocker", answer, /local[- ]only|(?:un|not )hosted|no hosted|local (?:file|capture|path|link)|output\.txt|never uploaded|not uploaded/i),
          expect.excludes("describe-pr: reply claims no pull request URL", answer, /github\.com\/acme\/notifyctl\/pull\/\d+/),
        );
      },
    },
  ],
};
