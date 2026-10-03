import { expect, failures } from "../lib.mjs";

// Outside Herdr (`HERDR_ENV` unset) herd-next prints the skipped answer and opens nothing.
// `herdr` is a stub that logs and fails; the grader asserts it is never called. The runner may itself be inside Herdr, so the
// phase's `unsetEnv` removes every `HERDR_*` variable from that session's environment.
export default {
  slug: "herd-next-outside-herdr",
  title: "Hand off to the next skill from a session that is not inside Herdr",
  workflow: "oneshot",
  fixtures: [],
  stubs: { herdr: 'echo "herdr: not available" >&2; exit 1' },
  request: `Open the next skill's pane for the research phase that just finished.`,
  phases: [
    {
      skill: "herd-next",
      terminal: true,
      request: `The research phase just finished and its reply ended with this command fence:\n\n\`\`\`text\n/create-design-discussion @02-research.md\n\`\`\`\n\nRun the skill. Do not ask questions.`,
      unsetEnv: /^HERDR_/,
      check: ({ answer, stubCalls }) =>
        failures(
          stubCalls.some((c) => c.startsWith("herdr ")) ? `herd-next: herdr was invoked outside Herdr: ${stubCalls.filter((c) => c.startsWith("herdr ")).join(" | ")}` : null,
          expect.matches("herd-next: reply gives the reason not inside Herdr", answer, /not inside herdr/i),
          expect.matches("herd-next: reply says no pane was opened", answer, /no pane was opened|nothing changed/i),
        ),
    },
  ],
};
