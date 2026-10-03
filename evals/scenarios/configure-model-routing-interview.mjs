import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, failures } from "../lib.mjs";

// configure-model-routing asks one question at a time, but the harness runs one non-interactive session per phase, so each
// phase's request carries every answer in the order the skill asks. Phase 1 gives a negative cost: the skill must reject it,
// report the failure, and leave the committed prior profile byte-identical with no temporary or backup file behind. Phase 2
// gives valid answers: the saved profile keeps the supplied order (not cost order), `economy` is one of the candidates,
// costs are non-negative, and nothing else is left in `.agents/`. The profile itself is read from the live repository, so
// those checks are skipped when a recording is re-graded.
const FIXTURE = new URL("../fixtures/configure-model-routing/.agents/model-candidates.json", import.meta.url);
const PRIOR = createHash("sha256").update(fs.readFileSync(FIXTURE)).digest("hex");
const ORDER = ["acme/flash", "acme/mini", "acme/pro"];
const answers = (miniCost) => [
  "1. Location: this project (`.agents/model-candidates.json`).",
  "2. Harnesses: Claude Code only; discover nothing, use the explicit IDs below.",
  `3. Model IDs, weakest to strongest: ${ORDER.join(", ")}.`,
  `4. Cost: acme/flash 2, acme/mini ${miniCost}, acme/pro 8.`,
  "5. Descriptions: acme/flash is \"quick drafts and routine edits\"; acme/mini is \"cheap builder for ordinary changes\"; acme/pro is \"planning and independent review\".",
  "6. Economy model: acme/mini.",
  "7. Routing: auto.",
].join("\n");
const profile = (repo) => path.join(repo, ".agents", "model-candidates.json");
const strays = (repo) => {
  const dir = path.join(repo, ".agents");
  return fs.readdirSync(dir).filter((f) => f !== "tasks" && f !== "model-candidates.json");
};
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export default {
  slug: "configure-model-routing-interview",
  title: "Set up a model profile",
  workflow: "oneshot",
  fixtures: ["configure-model-routing"],
  request: "Set up model routing for this project.",
  phases: [
    {
      skill: "configure-model-routing",
      terminal: true,
      request: [
        "Nobody can answer further questions in this session. These are the user's answers, in the order the skill asks them; use them as given and do not invent or correct any value:",
        answers(-1),
        "If validation rejects an answer, report which answer failed and stop.",
      ].join("\n"),
      check: ({ answer, live, repo }) =>
        failures(
          expect.matches("configure-model-routing negative cost: the reply names the rejected cost", answer, /negative|non-negative|-1|invalid cost/i),
          expect.matches("configure-model-routing negative cost: the reply reports the setup did not complete", answer, /reject|invalid|fail|not (?:saved|written|complete)|unchanged|stop/i),
          live && repo ? (sha(profile(repo)) === PRIOR ? null : "configure-model-routing negative cost: the prior profile is not byte-identical") : null,
          live && repo && strays(repo).length ? `configure-model-routing negative cost: temporary or backup files left in .agents/: ${strays(repo).join(", ")}` : null,
        ),
    },
    {
      skill: "configure-model-routing",
      terminal: true,
      request: [
        "Nobody can answer further questions in this session. These are the user's answers, in the order the skill asks them; use them as given:",
        answers(1),
        "Replace the existing project profile.",
      ].join("\n"),
      check: ({ answer, live, repo }) => {
        const problems = [expect.matches("configure-model-routing: the reply names the saved path", answer, /model-candidates\.json/), expect.matches("configure-model-routing: the reply reports the economy model", answer, /acme\/mini/)];
        if (live && repo) {
          let saved = null;
          try {
            saved = JSON.parse(fs.readFileSync(profile(repo), "utf8"));
          } catch (error) {
            problems.push(`configure-model-routing: the saved profile does not parse: ${error.message}`);
          }
          if (saved) {
            const list = saved.candidates ?? [];
            problems.push(
              JSON.stringify(list.map((c) => c.model)) === JSON.stringify(ORDER) ? null : `configure-model-routing: candidate order is ${JSON.stringify(list.map((c) => c.model))}, expected the supplied ${JSON.stringify(ORDER)}`,
              list.map((c) => c.cost).join() === "2,1,8" ? null : `configure-model-routing: costs are ${list.map((c) => c.cost).join()}, expected 2,1,8`,
              list.every((c) => typeof c.description === "string" && c.description.trim()) ? null : "configure-model-routing: a candidate has no description",
              saved.economy === "acme/mini" && ORDER.includes(saved.economy) ? null : `configure-model-routing: economy is ${JSON.stringify(saved.economy)}, expected acme/mini among the candidates`,
              saved.routing === "auto" ? null : `configure-model-routing: routing is ${JSON.stringify(saved.routing)}, expected auto`,
              sha(profile(repo)) === PRIOR ? "configure-model-routing: the prior profile was not replaced" : null,
              strays(repo).length ? `configure-model-routing: temporary or backup files left in .agents/: ${strays(repo).join(", ")}` : null,
            );
          }
        }
        return failures(problems);
      },
    },
  ],
};
