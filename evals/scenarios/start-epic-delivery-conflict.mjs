// `start-epic-delivery` on the same epic plan when one child's task directory already exists. The skill
// must stop at the conflict check with nothing created: no other child directory, no receipt, no GitLab
// call, no worktree, no commit; the existing directory stays as it was and the reply names it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NO_HOST, expect, failures, isHostWrite } from "../lib.mjs";
import { EPIC_FILE, PROMPT, SLUG, seedEpic, strayWorktrees, stubs } from "./start-epic-delivery.mjs";

const EXISTING = "add-channels-command";
const EXISTING_TASK = "---\nslug: add-channels-command\ntitle: Add channels command\nworkflow: oneshot\ncreated: 2026-01-01\n---\nStarted by hand earlier.\n";

export default {
  slug: SLUG,
  title: "Add sms delivery to notifyctl",
  workflow: "full",
  fixtures: [],
  request: "Start delivery of the approved epic plan.",
  stubs,
  ...NO_HOST,
  phases: [
    {
      skill: "start-epic-delivery",
      terminal: true,
      setup: (ctx) => {
        seedEpic(ctx);
        const dir = path.join(path.dirname(ctx.taskDir), EXISTING);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "task.md"), EXISTING_TASK);
      },
      request: PROMPT,
      check: (ctx) => {
        const tasksDir = path.dirname(ctx.taskDir);
        const dirs = ctx.live ? fs.readdirSync(tasksDir).sort() : [];
        const git = (...argv) => execFileSync("git", argv, { cwd: ctx.repo, encoding: "utf8" }).trim();
        const kept = fs.existsSync(path.join(tasksDir, EXISTING, "task.md")) ? fs.readFileSync(path.join(tasksDir, EXISTING, "task.md"), "utf8") : null;
        return failures(
          // `--grade` has no sibling task directories (taskDir is the recording's copy), so the two directory checks are live only.
          !ctx.live || JSON.stringify(dirs) === JSON.stringify([EXISTING, SLUG].sort()) ? null : `start-epic-delivery: task directories are ${dirs.join(", ")}, expected only ${[EXISTING, SLUG].sort().join(", ")}`,
          !ctx.live || kept === EXISTING_TASK ? null : "start-epic-delivery: the existing child's task.md was changed or removed",
          ctx.artifacts.some((a) => a.fm.type === "epic-delivery") ? "start-epic-delivery: a receipt was written though nothing was created" : null,
          ctx.artifacts.map((a) => a.file).includes(EPIC_FILE) ? null : "start-epic-delivery: the epic plan was removed",
          expect.includes("start-epic-delivery: the reply names the conflicting directory", ctx.answer, EXISTING),
          /\/deliver\b[^\n]*\.agents\/tasks\//.test(ctx.answer) ? "start-epic-delivery: the reply hands out child start commands despite the conflict" : null,
          ctx.stubCalls.filter(isHostWrite).map((c) => `start-epic-delivery: a GitLab write was attempted despite the conflict: ${c}`),
          ctx.live ? [
            git("diff", "--cached", "--name-only") ? "git: something is staged" : null,
            git("rev-list", "--count", `${ctx.fixtureSha}..HEAD`) === "0" ? null : "git: the run committed",
            git("status", "--porcelain") ? "git: repository left dirty" : null,
            ...strayWorktrees(ctx),
          ] : [],
        );
      },
    },
  ],
};
