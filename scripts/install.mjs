#!/usr/bin/env node
// Installs independent skills and worker definitions, with an optional Atomic delivery workflow.
// Runs from a checkout (`node scripts/install.mjs`) or GitHub (`npx github:MarkTripoli/skills`).
//
// Usage: npx github:MarkTripoli/skills [target...] [--skill <name>...] [--project] [--dry-run] [--yes] [--atomic] [--uninstall] [--list]
//   target   claude-code | codex | oh-my-pi | pi | portable | all   (interactive when omitted)
//   --skill, -s    install one named skill; repeat for more (`*` selects all)
//   --project      install into the current project instead of the home directory
//   --dry-run      print what would change and stop
//   --yes          skip menus and confirmation; use detected runtimes and every skill when unspecified
//   --atomic       also install the Atomic workflow and the full canonical skill collection
//   --uninstall    remove what an earlier install put in place (same targets, skills, and scope)
//   --list         print the skills in the collection and stop
// Exit 0 on success, 1 on error, 2 on usage error, cancellation, or declined confirmation.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { fileURLToPath } from "node:url";
import { repoRoot } from "./lib/build.mjs";
import { scanSkills } from "./lib/layout.mjs";
import { apply, buildTrees, updateConfigBlock } from './lib/install-apply.mjs';
import { atomicDestination, describe, destinations, detectTargets, parseArgs, plan, promptSelections, resolveSkillNames } from './lib/install-plan.mjs';

export { apply, atomicDestination, buildTrees, destinations, detectTargets, parseArgs, plan, promptSelections, resolveSkillNames, updateConfigBlock };

async function main(argv) {
  const args = parseArgs(argv);
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
  const usage = "usage: npx github:MarkTripoli/skills [claude-code|codex|oh-my-pi|pi|portable|all ...] [--skill <name> ...] [--project] [--dry-run] [--yes] [--atomic] [--uninstall] [--list]";
  if (args.help) {
    console.log(usage);
    return 0;
  }
  if (args.errors.length) {
    console.error(args.errors.join("\n"));
    console.error(usage);
    return 2;
  }
  const home = os.homedir();
  const cwd = process.cwd();
  const catalog = scanSkills(path.join(repoRoot, "skills")).skills;
  if (args.list) {
    for (const skill of catalog) console.log(`${skill.name}${skill.group ? ` (${skill.group})` : ""}`);
    return 0;
  }

  const interactive = !args.yes && process.stdin.isTTY;
  if (interactive) prompts.intro(`skills ${version}`);
  let selection;
  try {
    selection = await promptSelections(args, catalog);
  } catch (error) {
    console.error(error.message);
    console.error(usage);
    return 2;
  }
  if (selection === null) {
    prompts.cancel("Nothing changed.");
    return 2;
  }
  const { targets, skillNames } = selection;
  let planned;
  try {
    planned = plan({ targets, skillNames, project: args.project, atomic: args.atomic, cwd, home, env: process.env });
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  const targetSuffix = args.targets.length ? "" : interactive ? " (selected)" : " (found on PATH)";
  console.log(`skills ${version} from ${repoRoot}`);
  console.log(`${args.uninstall ? "Uninstall" : "Install"} for ${targets.join(", ")}${targetSuffix}, ${args.project ? `project scope (${cwd})` : "home directory"}:`);
  for (const step of planned.steps) console.log(`  ${describe(step, home)}`);
  for (const note of planned.notes) console.log(`  note: ${note}`);
  if (args.dryRun) {
    if (interactive) prompts.outro("Dry run complete. Nothing changed.");
    return 0;
  }
  if (!args.yes) {
    if (!process.stdin.isTTY) {
      console.error("no terminal to confirm on; pass --yes to proceed or --dry-run to look");
      return 2;
    }
    const proceed = await prompts.confirm({ message: args.uninstall ? "Remove these files?" : "Proceed with this install?", initialValue: true });
    if (prompts.isCancel(proceed) || !proceed) {
      prompts.cancel("Nothing changed.");
      return 2;
    }
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "skills-install-"));
  try {
    const built = args.uninstall ? new Map() : buildTrees(planned, work);
    for (const line of apply(planned, { built, uninstall: args.uninstall, home })) console.log(`  ${line}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  if (!args.uninstall) {
    if (args.atomic) console.log("Done. Open Atomic to run the delivery workflow. Skills remain usable independently (docs/cheatsheet.md).");
    else console.log("Done. Start a new session; run a skill as /<name> (Codex: $<name>) for a task directory.");
    if (targets.includes("codex")) console.log("Codex: skills are invoked as $<name>.");
  }
  return 0;
}

// npm runs the bin through a symlink under node_modules/.bin, so compare real paths.
const invoked = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : null;
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
