import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// With no Coast for this worktree and the project's only Coast held by another worktree, coasts must ask before
// creating or reassigning one. `coast` is a stub: lookup matches nothing and ls shows notify-1 assigned to feature/sms.
// `npm` is a stub that fails like a test run with no database, so a host fallback is logged.
// Graded on zero create, assign, checkout or build calls, no host test run, and a reply that asks the user.
const COAST = [
  'case "$1" in',
  '  lookup) echo "No Coast instances found for worktree main (notifyctl).";;',
  "  ls) cat <<'EOF'",
  "NAME      PROJECT    STATUS   BRANCH       RUNTIME  WORKTREE     CO  ROOT",
  "notify-1  notifyctl  running  feature/sms  dind     feature/sms  ★   ~/notifyctl",
  "EOF",
  "  ;;",
  '  *) echo "coast stub: $1";;',
  "esac",
].join("\n");

export default {
  slug: "coasts-no-match",
  title: "Run integration tests when no Coast matches the worktree",
  workflow: "oneshot",
  fixtures: [],
  stubs: { coast: COAST, npm: 'echo "Error: connect ECONNREFUSED 127.0.0.1:5432" >&2; exit 1' },
  request: `Run the integration tests.`,
  phases: [
    {
      skill: "coasts",
      terminal: true,
      request: `This project runs on Coasts. Run the integration tests (they talk to Postgres). If something needs a decision from me, stop and ask in your final answer.`,
      setup: async ({ repo }) => {
        fs.writeFileSync(path.join(repo, "Coastfile"), '[coast]\nname = "notifyctl"\ncompose = "./docker-compose.yml"\n');
        fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify({ name: "notifyctl", private: true, type: "module", scripts: { "test:integration": "node --test tests/integration/*.test.mjs" } }, null, 2)}\n`);
      },
      check: ({ answer, stubCalls }) => {
        const coast = stubCalls.filter((c) => c.startsWith("coast "));
        // `coast --version` or `--help` may come first; every other coast command must follow lookup.
        const runtimeStart = coast.findIndex((c) => !/^coast (--version|-V|--help|-h|help)\b/.test(c));
        const topology = coast.filter((c) => /^coast (run|assign|unassign|checkout|build)\b/.test(c));
        return failures(
          coast.findIndex((c) => c.startsWith("coast lookup")) === runtimeStart ? null : `coasts: lookup did not come before the first runtime command: ${coast.join(" | ") || "none"}`,
          coast.some((c) => c.startsWith("coast ls")) ? null : "coasts: never listed Coasts after lookup matched nothing",
          topology.length ? `coasts: changed Coast topology before the user decided: ${topology.join(" | ")}` : null,
          stubCalls.some((c) => /^npm (run )?test/.test(c)) ? "coasts: ran the integration tests on the host" : null,
          expect.matches("coasts: reply asks whether to create or reassign a Coast", answer, /(create|new|run).{0,80}coast|reassign|assign/i),
          expect.matches("coasts: reply ends with a question", answer, /\?/),
        );
      },
    },
  ],
};
