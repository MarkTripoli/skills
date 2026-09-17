#!/usr/bin/env node
// Installs the collection for coding agents: runtime-adapted skills, worker definitions, and optional Archon
// delivery packs. Runs from a checkout (`node scripts/install.mjs`) or GitHub (`npx github:MarkTripoli/skills`).
//
// Usage: npx github:MarkTripoli/skills [target...] [--skill <name>...] [--project] [--dry-run] [--yes] [--no-packs] [--uninstall] [--list]
//   target   claude-code | codex | oh-my-pi | pi | portable | all   (interactive when omitted)
//   --skill, -s    install one named skill; repeat for more (`*` selects all)
//   --project      install into the current project (./.claude, ./.agents, ./.omp, ./.pi, ./.archon) instead of the home directory
//   --dry-run      print what would change and stop
//   --yes          skip menus and confirmation; use detected runtimes and every skill when unspecified
//   --no-packs     skip the Archon workflow packs (and the ~/.agents/skills copy they read)
//   --uninstall    remove what an earlier install put in place (same targets, skills, and scope)
//   --list         print the skills in the collection and stop
// Exit 0 on success, 1 on error, 2 on usage error, cancellation, or declined confirmation.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { fileURLToPath } from "node:url";
import { buildRuntime, RUNTIMES, repoRoot } from "./lib/build.mjs";
import { scanSkills } from "./lib/layout.mjs";

const TARGETS = [...RUNTIMES, "portable"];
const TARGET_LABEL = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "oh-my-pi": "Oh My Pi",
  pi: "Pi",
  portable: "Portable",
};
const BINARY = { "claude-code": "claude", codex: "codex", "oh-my-pi": "omp", pi: "pi" };
const MARK_BEGIN = "# >>> MarkTripoli/skills workers (managed by the installer; edits inside are overwritten)";
const MARK_END = "# <<< MarkTripoli/skills workers";

export function parseArgs(argv) {
  const out = { targets: [], skillNames: [], all: false, project: false, dryRun: false, yes: false, packs: true, uninstall: false, list: false, help: false, errors: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") out.project = true;
    else if (arg === "--global") out.project = false;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--yes" || arg === "-y") out.yes = true;
    else if (arg === "--no-packs" || arg === "--no-pack") out.packs = false;
    else if (arg === "--uninstall") out.uninstall = true;
    else if (arg === "--list") out.list = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--skill" || arg === "-s") {
      const name = argv[index + 1];
      if (!name || name.startsWith("-")) out.errors.push(`${arg} requires a skill name`);
      else {
        out.skillNames.push(name);
        index += 1;
      }
    } else if (arg.startsWith("--skill=")) {
      const name = arg.slice("--skill=".length);
      if (name) out.skillNames.push(name);
      else out.errors.push("--skill requires a skill name");
    } else if (arg === "all") {
      out.all = true;
      out.targets.push(...TARGETS.filter((target) => target !== "portable"));
    } else if (TARGETS.includes(arg)) out.targets.push(arg);
    else out.errors.push(`unknown argument "${arg}"; targets are ${TARGETS.join(", ")} or all`);
  }
  out.targets = [...new Set(out.targets)];
  out.skillNames = [...new Set(out.skillNames)];
  return out;
}

function onPath(binary, env = process.env) {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const names = process.platform === "win32" ? [binary, `${binary}.cmd`, `${binary}.exe`] : [binary];
  return dirs.some((dir) => names.some((name) => fs.existsSync(path.join(dir, name))));
}

export function detectTargets(env = process.env) {
  const found = RUNTIMES.filter((runtime) => onPath(BINARY[runtime], env));
  return found.length ? found : ["portable"];
}

export function resolveSkillNames(requested, catalog) {
  const available = new Set(catalog.map((skill) => skill.name));
  if (!requested.length || requested.includes("*")) return catalog.map((skill) => skill.name);
  const unknown = requested.filter((name) => !available.has(name));
  if (unknown.length) throw new Error(`unknown skill${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  const selected = new Set(requested);
  return catalog.filter((skill) => selected.has(skill.name)).map((skill) => skill.name);
}

export async function promptSelections(args, catalog, { prompt = prompts, isTTY = process.stdin.isTTY, env = process.env } = {}) {
  let targets = args.targets.length ? args.targets : detectTargets(env);
  if (!args.yes && isTTY && !args.targets.length) {
    const detected = new Set(targets);
    const selected = await prompt.multiselect({
      message: "Which agent harnesses should receive the skills?",
      options: TARGETS.map((target) => ({
        value: target,
        label: TARGET_LABEL[target],
        hint: detected.has(target) ? "detected" : target === "portable" ? ".agents/skills" : undefined,
      })),
      initialValues: targets,
      maxItems: TARGETS.length,
      required: true,
    });
    if (prompt.isCancel(selected)) return null;
    targets = selected;
  }

  let skillNames;
  if (args.skillNames.length || args.yes || !isTTY) {
    skillNames = resolveSkillNames(args.skillNames, catalog);
  } else {
    const mode = await prompt.select({
      message: "Which skills should be installed?",
      options: [
        { value: "all", label: `All ${catalog.length} skills`, hint: "recommended for the delivery packs" },
        { value: "choose", label: "Choose specific skills" },
      ],
      initialValue: "all",
    });
    if (prompt.isCancel(mode)) return null;
    if (mode === "all") skillNames = catalog.map((skill) => skill.name);
    else {
      const selected = await prompt.autocompleteMultiselect({
        message: "Select skills to install",
        options: catalog.map((skill) => ({ value: skill.name, label: skill.name, hint: skill.group ?? "standalone" })),
        placeholder: "Type to filter skills",
        maxItems: 10,
        required: true,
      });
      if (prompt.isCancel(selected)) return null;
      skillNames = resolveSkillNames(selected, catalog);
    }
  }

  return { targets, skillNames };
}

// Where each target's files go. Paths honor CLAUDE_CONFIG_DIR and CODEX_HOME; Oh My Pi and Pi use their default
// agent directories. Codex worker definitions and their config block are user-level only.
export function destinations(target, { project, cwd = process.cwd(), home = os.homedir(), env = process.env }) {
  const claudeDir = env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude");
  const codexHome = env.CODEX_HOME ?? path.join(home, ".codex");
  switch (target) {
    case "claude-code":
      return project
        ? { skills: path.join(cwd, ".claude", "skills"), agents: path.join(cwd, ".claude", "agents") }
        : { skills: path.join(claudeDir, "skills"), agents: path.join(claudeDir, "agents") };
    case "codex":
      return project
        ? { skills: path.join(cwd, ".agents", "skills"), agents: null, config: null }
        : { skills: path.join(home, ".agents", "skills"), agents: path.join(codexHome, "agents"), config: path.join(codexHome, "config.toml") };
    case "oh-my-pi":
      return project
        ? { skills: path.join(cwd, ".omp", "skills"), agents: path.join(cwd, ".omp", "agents") }
        : { skills: path.join(home, ".omp", "agent", "skills"), agents: path.join(home, ".omp", "agent", "agents") };
    case "pi":
      return project ? { skills: path.join(cwd, ".pi", "skills") } : { skills: path.join(home, ".pi", "agent", "skills") };
    case "portable":
      return { skills: project ? path.join(cwd, ".agents", "skills") : path.join(home, ".agents", "skills") };
    default:
      throw new Error(`unknown target ${target}`);
  }
}

// The Archon packs: `~/.archon/workflows/<pack>/` (or `<cwd>/.archon/workflows/<pack>/` with --project), one
// directory per flavor. Their prompts read skills from `~/.agents/skills` (the packs' `skills_dir` input default).
// The native flavor serves the runtimes Archon drives itself; the `-omp` flavor serves Oh My Pi. Only the flavors
// the chosen targets need are installed, so the router lists one set of packs on a one-runtime machine.
export const PACKS = ["delivery", "delivery-omp"];
export const RETIRED = {
  skills: ["run-task", "start-task", "review-loop", "setup-worktree", "configure-workspaces"],
  extension: "run-task",
};
export function packFlavors(targets) {
  const flavors = [];
  if (targets.some((t) => ["claude-code", "codex", "pi", "portable"].includes(t))) flavors.push("delivery");
  if (targets.includes("oh-my-pi")) flavors.push("delivery-omp");
  return flavors;
}

export function packDestination({ project, cwd = process.cwd(), home = os.homedir() }) {
  return project ? path.join(cwd, ".archon", "workflows") : path.join(home, ".archon", "workflows");
}

// One install plan: the file operations for every target, computed before anything is written.
export function plan(options) {
  const { targets, project, packs, uninstall = false, cwd, home, env } = options;
  const { skills } = scanSkills(path.join(repoRoot, "skills"));
  const allNames = skills.map((skill) => skill.name);
  const names = resolveSkillNames(options.skillNames ?? [], skills);
  if (packs && names.length !== allNames.length) throw new Error("Archon packs require the full skill collection");
  const allWorkerNames = allNames.filter((name) => name.startsWith("agent-"));
  const workerNames = names.filter((name) => name.startsWith("agent-"));
  const steps = [];
  const notes = [];
  const skillDirsClaimed = new Map();
  const skillStep = (target) => {
    const dest = destinations(target, { project, cwd, home, env });
    const claimant = skillDirsClaimed.get(dest.skills);
    if (claimant) {
      notes.push(`${target}: skills directory ${short(dest.skills, home)} is already written by ${claimant}; skipping the ${target} copy of the skills`);
      return dest;
    }
    skillDirsClaimed.set(dest.skills, target);
    steps.push({ target, kind: "skills", from: target === "portable" ? "canonical" : `built for ${target}`, to: dest.skills, names });
    return dest;
  };
  for (const target of targets) {
    const dest = skillStep(target);
    if (dest.agents && workerNames.length) steps.push({ target, kind: "agents", to: dest.agents, names: workerNames, format: target === "codex" ? "toml" : "md" });
    else if (target === "codex" && project && workerNames.length) notes.push("codex: worker definitions and their config.toml block are user-level; run without --project to install them");
    if (dest.config && workerNames.length) steps.push({ target, kind: "config", to: dest.config, names: workerNames, complete: workerNames.length === allWorkerNames.length });
  }
  if (packs) {
    // The packs read `~/.agents/skills/<name>/SKILL.md`; make sure a copy lives there (the codex and portable
    // targets already write it at home scope).
    const portable = destinations("portable", { project: false, cwd, home, env });
    if (!skillDirsClaimed.has(portable.skills)) {
      skillDirsClaimed.set(portable.skills, "packs");
      steps.push({ target: "packs", kind: "skills", from: "canonical, read by the packs", to: portable.skills, names });
    }
    const to = packDestination({ project, cwd, home });
    if (path.resolve(to) === path.join(repoRoot, ".archon", "workflows")) notes.push("packs: this checkout already holds the packs; nothing to copy");
    else steps.push({ target: "packs", kind: "packs", to, names: packFlavors(targets) });
    if (project) notes.push("packs: project-scoped packs still read skills from ~/.agents/skills; pass --input skills_dir=<dir> to a run to read from elsewhere");
  }
  if (uninstall && !packs) {
    const portable = destinations("portable", { project: false, cwd, home, env }).skills;
    const kept = steps.filter((step) => step.kind !== "skills" || path.resolve(step.to) !== path.resolve(portable));
    if (kept.length !== steps.length) steps.splice(0, steps.length, ...kept);
    notes.push("packs: kept, so the ~/.agents/skills copy they read stays too");
  }
  if (!uninstall) {
    const skillDestinations = [...new Set(steps.filter((step) => step.kind === "skills").map((step) => step.to))];
    const paths = skillDestinations.flatMap((to) => RETIRED.skills.map((name) => path.join(to, name)));
    for (const target of targets) {
      if (target !== "oh-my-pi" && target !== "pi") continue;
      const root = project ? cwd : home;
      const extension = target === "oh-my-pi" ? ".omp" : ".pi";
      paths.push(path.join(root, extension, project ? "extensions" : path.join("agent", "extensions"), RETIRED.extension));
    }
    if (paths.length) steps.push({ target: "retired", kind: "retired", paths: [...new Set(paths)] });
  }
  if (targets.includes("codex") && !project && (targets.includes("pi") || targets.includes("oh-my-pi"))) {
    notes.push("Pi and Oh My Pi also read ~/.agents/skills, where the Codex copy lives; their own skill directories are installed too, so a skill may appear twice by name in those runtimes");
  }
  return { steps, notes, names };
}

function short(file, home) {
  return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}

function describe(step, home) {
  switch (step.kind) {
    case "skills":
      return `${step.target}: ${step.names.length} skills (${step.from}) -> ${short(step.to, home)}/<name>/`;
    case "agents":
      return `${step.target}: ${step.names.length} worker definitions -> ${short(step.to, home)}/agent-*.${step.format}`;
    case "config":
      return `${step.target}: [agents.*] block -> ${short(step.to, home)}`;
    case "packs":
      return `packs: Archon workflows ${step.names.join(", ")} -> ${short(step.to, home)}/<pack>/`;
    case "retired":
      return `remove ${step.paths.length} retired paths`;
    default:
      return JSON.stringify(step);
  }
}

const noDsStore = (src) => path.basename(src) !== ".DS_Store";

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, filter: noDsStore });
}
// Replaces or appends the managed block; removes it when `block` is null.
export function updateConfigBlock(text, block) {
  const begin = text.indexOf(MARK_BEGIN);
  const end = text.indexOf(MARK_END);
  let before = text;
  let after = "";
  if (begin !== -1 && end !== -1 && end > begin) {
    before = text.slice(0, begin);
    after = text.slice(end + MARK_END.length).replace(/^\n/, "");
  }
  if (block === null) return `${before.replace(/\n+$/, "\n")}${after}`.replace(/^\n$/, "");
  const body = `${MARK_BEGIN}\n${block.trim()}\n${MARK_END}\n`;
  const sep = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  return `${before}${sep}${body}${after}`;
}

function configBlocks(block) {
  const sections = new Map();
  let name = null;
  let lines = [];
  const commit = () => {
    if (name) sections.set(name, lines.join("\n").trim());
  };
  for (const line of block.trim().split("\n")) {
    const heading = /^\[agents\.([^\]]+)\]$/.exec(line);
    if (heading) {
      commit();
      name = heading[1];
      lines = [line];
    } else if (name) lines.push(line);
  }
  commit();
  return sections;
}

function selectedConfigBlock(text, block, names, uninstall) {
  const begin = text.indexOf(MARK_BEGIN);
  const end = text.indexOf(MARK_END);
  const managed = begin !== -1 && end > begin ? text.slice(begin + MARK_BEGIN.length, end) : "";
  const merged = configBlocks(managed);
  const incoming = configBlocks(block);
  for (const name of names) {
    if (uninstall) merged.delete(name);
    else if (incoming.has(name)) merged.set(name, incoming.get(name));
  }
  const updated = [...merged.values()].join("\n\n");
  return updateConfigBlock(text, updated || null);
}

export function apply(planned, { built, uninstall, home }) {
  const done = [];
  for (const step of planned.steps) {
    const tree = built.get(step.target);
    switch (step.kind) {
      case "skills": {
        for (const name of step.names) {
          const to = path.join(step.to, name);
          if (uninstall) fs.rmSync(to, { recursive: true, force: true });
          else copyDir(path.join(tree, "skills", name), to);
        }
        done.push(`${uninstall ? "removed" : "wrote"} ${step.names.length} skills under ${short(step.to, home)}`);
        break;
      }
      case "agents": {
        for (const name of step.names) {
          const to = path.join(step.to, `${name}.${step.format}`);
          if (uninstall) fs.rmSync(to, { force: true });
          else {
            fs.mkdirSync(step.to, { recursive: true });
            fs.copyFileSync(path.join(tree, "agents", `${name}.${step.format}`), to);
          }
        }
        done.push(`${uninstall ? "removed" : "wrote"} ${step.names.length} worker definitions under ${short(step.to, home)}`);
        break;
      }
      case "config": {
        if (uninstall && !fs.existsSync(step.to)) break;
        const existing = fs.existsSync(step.to) ? fs.readFileSync(step.to, "utf8") : "";
        const block = uninstall ? "" : fs.readFileSync(path.join(tree, "config.snippet.toml"), "utf8");
        const updated = step.complete !== false
          ? updateConfigBlock(existing, uninstall ? null : block)
          : selectedConfigBlock(existing, block, step.names, uninstall);
        if (uninstall && updated.trim() === "") fs.rmSync(step.to, { force: true });
        else {
          fs.mkdirSync(path.dirname(step.to), { recursive: true });
          fs.writeFileSync(step.to, updated);
        }
        done.push(`${uninstall ? "updated selected workers in" : "updated the workers block in"} ${short(step.to, home)}`);
        break;
      }
      case "packs": {
        if (!uninstall) {
          for (const name of PACKS.filter((name) => !step.names.includes(name))) fs.rmSync(path.join(step.to, name), { recursive: true, force: true });
        }
        for (const name of step.names) {
          const to = path.join(step.to, name);
          if (uninstall) fs.rmSync(to, { recursive: true, force: true });
          else copyDir(path.join(repoRoot, ".archon", "workflows", name), to);
        }
        done.push(`${uninstall ? "removed" : "wrote"} Archon packs ${step.names.join(", ")} under ${short(step.to, home)}`);
        break;
      }
      case "retired": {
        if (!uninstall) for (const to of step.paths) fs.rmSync(to, { recursive: true, force: true });
        done.push(`removed ${step.paths.length} retired paths`);
        break;
      }
      default:
        throw new Error(`unknown step ${step.kind}`);
    }
  }
  return done;
}

// One built tree per target the plan writes: runtimes get their flavor, `portable` and `packs` the
// canonical copy, and the `retired` removal step builds nothing (its pseudo-target is no runtime).
export function buildTrees(planned, work) {
  const built = new Map();
  const selected = new Set(planned.names);
  for (const target of new Set(planned.steps.filter((step) => step.kind !== "retired").map((step) => step.target))) {
    const dest = path.join(work, target);
    if (target === "portable" || target === "packs") {
      fs.mkdirSync(path.join(dest, "skills"), { recursive: true });
      for (const skill of scanSkills(path.join(repoRoot, "skills")).skills) {
        if (selected.has(skill.name)) fs.cpSync(skill.dir, path.join(dest, "skills", skill.name), { recursive: true, filter: noDsStore });
      }
    } else buildRuntime(target, dest, { skillNames: planned.names });
    built.set(target, dest);
  }
  return built;
}

async function main(argv) {
  const args = parseArgs(argv);
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
  const usage = "usage: npx github:MarkTripoli/skills [claude-code|codex|oh-my-pi|pi|portable|all ...] [--skill <name> ...] [--project] [--dry-run] [--yes] [--no-packs] [--uninstall] [--list]";
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
  const allSkills = skillNames.length === catalog.length;
  // Partial skill installs cannot carry the Archon packs: every pack references the complete delivery chain.
  // Uninstalling one named runtime leaves the packs and the ~/.agents/skills copy they read in place.
  const packs = args.packs && allSkills && (!args.uninstall || !args.targets.length || args.all);
  const planned = plan({ targets, skillNames, project: args.project, packs, uninstall: args.uninstall, cwd, home, env: process.env });
  if (args.packs && !allSkills) planned.notes.unshift("packs: skipped because the selected skills do not contain the complete delivery chain");

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
    const built = buildTrees(planned, work);
    for (const line of apply(planned, { built, uninstall: args.uninstall, home })) console.log(`  ${line}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  if (!args.uninstall) {
    if (packs) console.log("Done. With Archon installed, `archon workflow list` shows the delivery packs; `archon workflow run delivery-bugfix --branch <name> \"<report>\"` runs one (docs/cheatsheet.md).");
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
