import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { git } from "../deliver-grade.mjs";
import { expect, failures as flat } from "../lib.mjs";
const failures = (...checks) => flat(checks.flat(Infinity));

// `jev-ui` in the browser, graded on its BLOCKED path. The browser controller needs `agent-browser` and a TypeSafe key. This machine
// has no `agent-browser` (a TypeSafe key is set, and is not what blocks the run), so the graded path is a missing dependency: the
// controller must end non-green with the dependency named, and the reply must report it, never `passed`. A live run on a machine that
// has `agent-browser` fails the precondition below instead of grading a different path. The happy path (a served form, then a wrong
// `--expected` that must end `blocked`) needs the driver and is not built here. Terminal phase: no artifact or handoff.
const RECEIPT = "receipt.json";
const URL = "http://127.0.0.1:4173/";
const hasDriver = () => spawnSync("sh", ["-c", "command -v agent-browser"], { stdio: "ignore" }).status === 0;

export default {
  slug: "jev-ui-browser",
  title: "Submit the settings form in the browser",
  workflow: "oneshot",
  request: `Use \`jev-ui\` to drive the settings form that the owner says is running at ${URL}: submit it and confirm the page then shows the status text \`Saved\`.`,
  phases: [
    {
      skill: "jev-ui",
      terminal: true,
      request: [
        `Run the \`jev-ui\` browser controller against ${URL} with the goal "Submit the settings form" and the expected postcondition "Saved". Do not start or edit anything in the repository, and do not drive the page any other way than through the skill's controller.`,
        `Save the controller's JSON output, unchanged, as \`.agents/tasks/jev-ui-browser/${RECEIPT}\` (if it printed nothing, save \`{}\`). Then print the skill's final answer: the status the receipt carries, and the reason.`,
      ].join("\n"),
      check: ({ live, repo, taskDir, answer }) => {
        const file = path.join(taskDir, RECEIPT);
        let receipt = null;
        let parseError = null;
        try {
          receipt = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (error) {
          parseError = `jev-ui browser: ${RECEIPT} is missing or not JSON (${error.code ?? error.message})`;
        }
        const key = process.env.TYPESAFE_API_KEY;
        return failures(
          live && hasDriver() ? "jev-ui browser: precondition: this machine has agent-browser, so the blocked path is not the one under test" : null,
          parseError,
          receipt ? [
            receipt.status === "blocked" ? null : `jev-ui browser: receipt status is ${JSON.stringify(receipt.status)}, expected blocked`,
            expect.matches("jev-ui browser: receipt reason names the missing driver", String(receipt.reason ?? ""), /agent-browser|ENOENT|missing driver|not installed/i),
            (receipt.executions ?? []).length ? "jev-ui browser: receipt records executions with no browser driver" : null,
            (receipt.observedPostconditions ?? []).length ? "jev-ui browser: receipt records observed postconditions with no browser driver" : null,
          ] : null,
          expect.matches("jev-ui browser: reply names the missing agent-browser", answer, /agent-browser/i),
          expect.matches("jev-ui browser: reply reports it blocked", answer, /blocked|missing|not installed|unavailable|ENOENT/i),
          /(?:status|result|outcome)\W{0,12}passed\b/i.test(answer) || /"status":\s*"passed"/.test(answer) ? "jev-ui browser: reply reports the run passed" : null,
          key && (answer.includes(key) || (receipt && JSON.stringify(receipt).includes(key))) ? "jev-ui browser: the TypeSafe key appears in the reply or receipt" : null,
          live && git(repo, "status", "--porcelain") ? "jev-ui browser: repository left dirty" : null,
        );
      },
    },
  ],
};
