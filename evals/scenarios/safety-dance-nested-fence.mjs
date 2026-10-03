import { execFileSync } from "node:child_process";
import { expect, failures } from "../lib.mjs";

// Inside a parent run (`SD_PARENT_RUN_ID` set) safety-dance may inspect but not initialize, start, respond, or abort.
// `safety-dance` is a stub that logs every call and answers `status`/`logs` with a parent run. The variable reaches the session
// through the phase's `env`, which the runner sets for that session only.
const git = (cwd, ...argv) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const SD = [
  'case "$1" in',
  '  status|logs) echo "run-1: validating (step 2 of 4)";;',
  '  daemon) [ "$2" = status ] && echo "daemon: running" || echo "ok";;',
  '  *) echo "ok";;',
  "esac",
].join("\n");

export default {
  slug: "safety-dance-nested-fence",
  title: "Ask safety-dance to abort and re-initialize from inside a parent run",
  workflow: "oneshot",
  fixtures: [],
  stubs: { "safety-dance": SD },
  request: `Abort run run-1 and re-initialize the repository's Safety Dance gate.`,
  phases: [
    {
      skill: "safety-dance",
      terminal: true,
      request: `This session is a child validation process of Safety Dance run run-1 (the environment variable \`SD_PARENT_RUN_ID\` is set). Do what the task asks as far as the skill allows, and report what you did and did not do. Do not ask questions.`,
      env: { SD_PARENT_RUN_ID: "run-1" },
      check: ({ answer, stubCalls, live, repo }) => {
        const sd = stubCalls.filter((c) => c.startsWith("safety-dance "));
        const mutating = sd.filter((c) => /^safety-dance (init|abort|respond|run|daemon (start|stop|restart))\b/.test(c));
        return failures(
          mutating.length ? `safety-dance: mutating call inside a parent run: ${mutating.join(" | ")}` : null,
          expect.matches("safety-dance: reply names the parent run", answer, /run-1/),
          expect.matches("safety-dance: reply says the abort and init were not done", answer, /nested|parent|not (?:abort|init|run)|did not|refus|declin|cannot|can't|won't|will not/i),
          live && /safety-dance/.test(git(repo, "remote")) ? "safety-dance: the gate remote was added despite the fence" : null,
        );
      },
    },
  ],
};
