import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, failures } from "../lib.mjs";

// The fixture is a minimal collection: one skill under skills/, the shared guides (the harness copies them), and the
// checker, copied by `setup` from the run's pinned build (`ctx.dist`) so it cannot drift. The checker imports `yaml`, so setup links the pinned build's copy into the repository's `node_modules` (excluded from git) The checkout has no validate.mjs, install.mjs or
// sync-plugin.mjs, so the request tells the model to skip the registration steps that need them.
const NAME = "summarize-changelog";
const SKILL = `skills/${NAME}/SKILL.md`;

export default {
  slug: "author-skill-new",
  title: "Author a small new skill in a minimal collection",
  workflow: "oneshot",
  fixtures: ["author-skill"],
  request: `Add a skill named ${NAME} to this collection. It summarizes the entries of CHANGELOG.md since the last release into five bullets for a status update. This checkout holds only scripts/check-skill-practices.mjs: skip registration steps that need other scripts, and do not commit.`,
  phases: [
    {
      skill: "author-skill",
      terminal: true,
      setup: ({ repo, dist }) => {
        fs.mkdirSync(path.join(repo, "scripts", "lib"), { recursive: true });
        fs.copyFileSync(path.join(dist, "scripts", "check-skill-practices.mjs"), path.join(repo, "scripts", "check-skill-practices.mjs"));
        fs.copyFileSync(path.join(dist, "scripts", "lib", "layout.mjs"), path.join(repo, "scripts", "lib", "layout.mjs"));
        fs.mkdirSync(path.join(repo, "node_modules"), { recursive: true });
        fs.symlinkSync(path.join(dist, "node_modules", "yaml"), path.join(repo, "node_modules", "yaml"));
        fs.appendFileSync(path.join(repo, ".git", "info", "exclude"), "/node_modules/\n");
      },
      check: ({ live, repo, scriptsDir }) => {
        // A re-grade has only the recorded answer, not the repository the model edited.
        if (!live) return [];
        const file = path.join(repo, SKILL);
        if (!fs.existsSync(file)) return [`author-skill: ${SKILL} was not created`];
        const text = fs.readFileSync(file, "utf8");
        const line6 = fs.readFileSync(path.join(repo, "skills", "hello-notes", "SKILL.md"), "utf8").split("\n")[5];
        const run = spawnSync(process.execPath, [path.join(scriptsDir, "check-skill-practices.mjs"), "--root", repo], { cwd: repo, encoding: "utf8" });
        return failures(
          expect.matches("author-skill: frontmatter names the skill", text, new RegExp(`^---\\nname: ${NAME}\\ndescription: .+\\n---\\n`)),
          text.split("\n")[5] === line6 ? null : "author-skill: line 6 is not the shared writing-guide sentence",
          expect.matches("author-skill: description says when to use the skill", text, /^description: .*Use when /m),
          run.status === 0 ? null : `author-skill: check-skill-practices.mjs fails: ${(run.stderr || run.stdout).trim().split("\n").slice(0, 4).join(" | ")}`,
        );
      },
    },
  ],
};
