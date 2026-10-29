import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// coasts must find the instance first, send the database-backed tests through `coast exec`, and keep lint on the host.
// The repository has a Coastfile and two scripts: `lint` (host) and `test:integration` (needs Postgres). `coast` is a stub whose
// lookup matches `notify-1`; `npm` and `npx` are stubs, so a host run of either script is logged instead of executed.
// Graded on call order and placement: lookup before any other coast command, the integration tests inside notify-1, lint never inside it,
// and no create, assign or checkout.
const COAST = [
  'case "$1" in',
  "  lookup) cat <<'EOF'",
  "Coast instances for worktree main (notifyctl):",
  "",
  "  notify-1  running  ★ checked out",
  "",
  "  SERVICE              CANONICAL       DYNAMIC",
  "  ★ api                8080            63889",
  "    postgres           5432            55681",
  "",
  "  Examples (exec starts at the workspace root where your Coastfile is, cd to your target directory first):",
  '    coast exec notify-1 -- sh -c "cd <dir> && <command>"',
  "    coast logs notify-1 --service <service>",
  "    coast ps notify-1",
  "EOF",
  "  ;;",
  '  exec) echo "# tests 3"; echo "# pass 3"; echo "# fail 0";;',
  '  ps) echo "api running"; echo "postgres running";;',
  '  *) echo "coast stub: $1";;',
  "esac",
].join("\n");
const NPM = 'case "$*" in *lint*) echo "lint: 0 problems";; *test*) echo "Error: connect ECONNREFUSED 127.0.0.1:5432" >&2; exit 1;; *) echo "npm stub: $*";; esac';

const PACKAGE = {
  name: "notifyctl",
  private: true,
  type: "module",
  scripts: { lint: "eslint src", "test:integration": "node --test tests/integration/*.test.mjs" },
};

export default {
  slug: "coasts",
  title: "Run lint and database-backed integration tests in a Coast project",
  workflow: "oneshot",
  fixtures: [],
  stubs: { coast: COAST, npm: NPM, npx: NPM },
  request: `Run the linter and the integration tests. The integration tests talk to Postgres.`,
  phases: [
    {
      skill: "coasts",
      terminal: true,
      request: `This project runs on Coasts. Run the linter and the integration tests (they talk to Postgres), then report both results. Do not ask questions.`,
      setup: async ({ repo }) => {
        fs.writeFileSync(path.join(repo, "Coastfile"), '[coast]\nname = "notifyctl"\ncompose = "./docker-compose.yml"\n');
        fs.writeFileSync(path.join(repo, "package.json"), `${JSON.stringify(PACKAGE, null, 2)}\n`);
        fs.mkdirSync(path.join(repo, "tests", "integration"), { recursive: true });
        fs.writeFileSync(path.join(repo, "tests", "integration", "accounts.test.mjs"), 'import test from "node:test";\ntest("accounts table exists", async () => {});\n');
      },
      check: ({ answer, stubCalls }) => {
        const coast = stubCalls.filter((c) => c.startsWith("coast "));
        // `coast --version` or `--help` may come first; every other coast command must follow lookup.
        const runtimeStart = coast.findIndex((c) => !/^coast (--version|-V|--help|-h|help)\b/.test(c));
        const execs = coast.filter((c) => c.startsWith("coast exec "));
        const topology = coast.filter((c) => /^coast (run|assign|unassign|checkout|build)\b/.test(c));
        const hostLint = stubCalls.some((c) => /^(npm (run )?lint|npx eslint)\b/.test(c));
        return failures(
          coast.findIndex((c) => c.startsWith("coast lookup")) === runtimeStart ? null : `coasts: lookup did not come before the first runtime command: ${coast.join(" | ") || "none"}`,
          execs.some((c) => /notify-1/.test(c) && /test:integration|tests\/integration/.test(c)) ? null : `coasts: integration tests did not run through coast exec notify-1: ${execs.join(" | ") || "no exec"}`,
          execs.some((c) => /lint|eslint/.test(c)) ? `coasts: lint ran inside the Coast: ${execs.filter((c) => /lint|eslint/.test(c)).join(" | ")}` : null,
          hostLint ? null : "coasts: lint did not run on the host",
          stubCalls.some((c) => /^npm (run )?test:integration/.test(c)) ? "coasts: integration tests ran on the host" : null,
          topology.length ? `coasts: changed Coast topology without being asked: ${topology.join(" | ")}` : null,
          expect.matches("coasts: reply reports the integration result", answer, /3 pass|pass(ed)?.*3|3 .*pass/i),
        );
      },
    },
  ],
};
