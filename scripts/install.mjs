#!/usr/bin/env node
// Installs the collection for the coding agents on this machine: skills with the runtime's notes, worker
// definitions, and the Archon delivery packs (native and Oh My Pi flavors). Dependency-free; runs from a checkout
// (`node scripts/install.mjs`) or straight from GitHub (`npx github:MarkTripoli/skills`).
//
// Usage: npx github:MarkTripoli/skills [target...] [--project] [--dry-run] [--yes] [--no-packs] [--uninstall] [--list]
//   target   claude-code | codex | oh-my-pi | pi | portable | all   (default: every runtime found on PATH, else portable)
//   --project      install into the current project (./.claude, ./.agents, ./.omp, ./.pi, ./.archon) instead of the home directory
//   --dry-run      print what would change and stop
//   --yes          do not ask for confirmation
//   --no-packs     skip the Archon workflow packs (and the ~/.agents/skills copy they read)
//   --uninstall    remove what an earlier install put in place (same targets and scope)
//   --list         print the skills in the collection and stop
// Exit 0 on success, 1 on error, 2 on usage error or a declined confirmation.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { buildRuntime, RUNTIMES, repoRoot } from "./lib/build.mjs";
import { scanSkills } from "./lib/layout.mjs";

const TARGETS = [...RUNTIMES, "portable"];
const BINARY = { "claude-code": "claude", codex: "codex", "oh-my-pi": "omp", pi: "pi" };
const MARK_BEGIN = "# >>> MarkTripoli/skills workers (managed by the installer; edits inside are overwritten)";
const MARK_END = "# <<< MarkTripoli/skills workers";

function parseArgs(argv) {
  const out = { targets: [], all: false, project: false, dryRun: false, yes: false, packs: true, uninstall: false, list: false, help: false, errors: [] };
  for (const arg of argv) {
    if (arg === "--project") out.project = true;
    else if (arg === "--global") out.project = false;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--yes" || arg === "-y") out.yes = true;
    else if (arg === "--no-packs" || arg === "--no-pack") out.packs = false;
    else if (arg === "--uninstall") out.uninstall = true;
    else if (arg === "--list") out.list = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "all") {
      out.all = true;
      out.targets.push(...TARGETS.filter((t) => t !== "portable"));
    }
    else if (TARGETS.includes(arg)) out.targets.push(arg);
    else out.errors.push(`unknown argument "${arg}"; targets are ${TARGETS.join(", ")} or all`);
  }
  out.targets = [...new Set(out.targets)];
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
  const names = skills.map((s) => s.name);
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
    if (dest.agents) steps.push({ target, kind: "agents", to: dest.agents, names: names.filter((n) => n.startsWith("agent-")), format: target === "codex" ? "toml" : "md" });
    else if (target === "codex" && project) notes.push("codex: worker definitions and their config.toml block are user-level; run without --project to install them");
    if (dest.config) steps.push({ target, kind: "config", to: dest.config });
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
        const block = uninstall ? null : fs.readFileSync(path.join(tree, "config.snippet.toml"), "utf8");
        const updated = updateConfigBlock(existing, block);
        if (uninstall && updated.trim() === "") fs.rmSync(step.to, { force: true });
        else {
          fs.mkdirSync(path.dirname(step.to), { recursive: true });
          fs.writeFileSync(step.to, updated);
        }
        done.push(`${uninstall ? "removed the workers block from" : "updated the workers block in"} ${short(step.to, home)}`);
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

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return /^(y|yes|)$/i.test(answer.trim());
}

async function main(argv) {
  const args = parseArgs(argv);
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
  const usage = "usage: npx github:MarkTripoli/skills [claude-code|codex|oh-my-pi|pi|portable|all ...] [--project] [--dry-run] [--yes] [--no-packs] [--uninstall] [--list]";
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
  if (args.list) {
    for (const skill of scanSkills(path.join(repoRoot, "skills")).skills) console.log(`${skill.name}${skill.group ? ` (${skill.group})` : ""}`);
    return 0;
  }
  const targets = args.targets.length ? args.targets : detectTargets();
  const detected = args.targets.length ? "" : " (found on PATH)";
  // Uninstalling one named runtime leaves the packs and the ~/.agents/skills copy they read in place; every
  // detected runtime, or `all`, removes them too.
  const packs = args.packs && (!args.uninstall || !args.targets.length || args.all);
  const planned = plan({ targets, project: args.project, packs, uninstall: args.uninstall, cwd, home, env: process.env });

  console.log(`skills ${version} from ${repoRoot}`);
  console.log(`${args.uninstall ? "Uninstall" : "Install"} for ${targets.join(", ")}${detected}, ${args.project ? `project scope (${cwd})` : "home directory"}:`);
  for (const step of planned.steps) console.log(`  ${describe(step, home)}`);
  for (const note of planned.notes) console.log(`  note: ${note}`);
  if (args.dryRun) return 0;
  if (!args.yes) {
    if (!process.stdin.isTTY) {
      console.error("no terminal to confirm on; pass --yes to proceed or --dry-run to look");
      return 2;
    }
    if (!(await confirm(`${args.uninstall ? "Remove" : "Proceed"}? [Y/n] `))) {
      console.log("nothing changed");
      return 2;
    }
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "skills-install-"));
  try {
    const built = new Map();
    const canonical = (dest) => {
      fs.mkdirSync(path.join(dest, "skills"), { recursive: true });
      for (const skill of scanSkills(path.join(repoRoot, "skills")).skills) fs.cpSync(skill.dir, path.join(dest, "skills", skill.name), { recursive: true, filter: noDsStore });
    };
    for (const target of new Set(planned.steps.map((s) => s.target))) {
      const dest = path.join(work, target);
      if (target === "portable" || target === "packs") canonical(dest);
      else buildRuntime(target, dest);
      built.set(target, dest);
    }
    for (const line of apply(planned, { built, uninstall: args.uninstall, home })) console.log(`  ${line}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  if (!args.uninstall) {
    if (args.packs) console.log("Done. With Archon installed, `archon workflow list` shows the delivery packs; `archon workflow run delivery-bugfix --branch <name> \"<report>\"` runs one (docs/cheatsheet.md).");
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
