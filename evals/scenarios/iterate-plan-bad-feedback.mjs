import { seed, revisionProblems } from "../iterate-grade.mjs";
// `iterate-plan` given feedback with two wrong facts (a loader path that does not exist and a test command
// the project does not define) and one valid request (gate Phase 2). The skill must check the feedback
// against the repository: publish an immutable successor, keep its shape,
// apply the valid item, and copy neither wrong fact into a file path or a command. The skill ends with a
// handoff fence but edits an existing artifact, so the phase is `terminal` and grades its own reply.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, failures, handoff, placeholders, section } from "../lib.mjs";
import { PLAN, PLAN_FILE, SLUG, boxes } from "./implement-plan-two-phase.mjs";

const WRONG_PATH = "src/channel/loader.mjs";
const WRONG_COMMAND = "npm run test:unit";

export default {
  slug: SLUG,
  title: "Add an sms channel in two phases",
  workflow: "full",
  fixtures: ["sms-channel"],
  request: "Revise the sms channel plan from my feedback.",
  phases: [
    {
      skill: "iterate-plan",
      terminal: true,
      template: "plan_template.md",
      setup: seed({ [PLAN_FILE]: PLAN }),
      request: [
        `Revise ${PLAN_FILE} in the task directory from this feedback. Do not ask me questions; follow the skill for anything you cannot apply.`,
        "",
        "Feedback:",
        `1. Phase 1 should edit the loader that registers channels, \`${WRONG_PATH}\`, so sms is registered there.`,
        `2. Phase 1 should verify with \`${WRONG_COMMAND}\`, which is what CI runs, instead of \`npm test\`.`,
        "3. Phase 2 should be gated: set its `human-gated` line to true, because I want to read the README wording first.",
      ].join("\n"),
      check: (ctx) => {
        const plans = ctx.artifacts.filter((a) => a.fm.type === "plan");
        const plan = plans[0];
        const text = plan?.text ?? "";
        const h = handoff(ctx.answer);
        // The wrong facts may be named in prose that explains the rejection, never in a file or a command.
        const operative = text.split("\n").filter((line) => /\*\*File\*\*|^- \[[ xX]\]/.test(line)).join("\n");
        const gate = (n) => (/^human-gated: (true|false)$/m.exec((text.split(new RegExp(`^## Phase ${n}\\b.*$`, "m"))[1] ?? "").split(/^## /m)[0]) ?? [])[1];
        return failures(
          revisionProblems("iterate-plan", ctx, { file: PLAN_FILE, type: "plan", seedText: PLAN, next: "implement-plan" }),
          expect.excludes("iterate-plan: wrong loader path is not a plan file edit", operative, WRONG_PATH),
          expect.excludes("iterate-plan: wrong command is not a plan check", operative, WRONG_COMMAND),
          expect.matches("iterate-plan: Phase 1 still verifies with npm test", operative, /^- \[[ xX]\] `npm test`/m),
          expect.matches("iterate-plan: Phase 1 still edits the sms channel module", operative, /\*\*File\*\*: `src\/channels\/sms\.mjs`/),
          gate(2) === "true" ? null : `iterate-plan: valid feedback not applied: Phase 2 human-gated is ${gate(2) ?? "missing"}`,
          gate(1) === "false" ? null : `iterate-plan: Phase 1 human-gated is ${gate(1) ?? "missing"}, expected it left false`,
          boxes(text, 1).some((b) => b.done) || boxes(text, 2).some((b) => b.done) ? "iterate-plan: a checkbox was ticked while revising" : null,
          expect.matches("iterate-plan: plan keeps its frontmatter type and summary", `${plan?.fm.type}|${plan?.fm.summary ?? ""}`, /^plan\|.{20,}/),
          ...["## Overview", "## Phase 1", "## Phase 2", "## Human Review", "## Progress", "## Decisions"].map((heading) => (new RegExp(`^${heading}\\b`, "m").test(text) ? null : `iterate-plan: plan lost ${heading}`)),
          placeholders(text, ctx.template).map((p) => `iterate-plan: template placeholder left in the plan: ${p}`),
          // The reply is the plan template's: one fence, handing back to /implement-plan with this file and no other artifact.
          h && h.skill === "implement-plan" && [plan?.file, `${ctx.taskRel}/${plan?.file}`].includes(h.file) && h.fences === 1 && h.lang === "text" ? null : "iterate-plan: handoff must name the current immutable plan",
          placeholders(ctx.answer).map((p) => `iterate-plan: reply placeholder left: ${p}`),
          // A plan revision edits no code.
          ctx.live && execFileSync("git", ["diff", "--name-only", ctx.fixtureSha, "--", ".", ":!.agents"], { cwd: ctx.repo, encoding: "utf8" }).trim() ? "iterate-plan: repository files changed; a plan revision edits only the plan" : null,
        );
      },
    },
  ],
};
