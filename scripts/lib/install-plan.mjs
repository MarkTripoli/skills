import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as prompts from '@clack/prompts';
import { RUNTIMES, repoRoot, WORKER_MODEL_RUNTIMES, PINNED_WORKERS, runtimeModel } from './build.mjs';
import { scanSkills } from './layout.mjs';
import { loadCandidateProfile, normalizeCandidates } from '../../skills/delivery/route-model/route-model.mjs';
import { retiredSweep } from './install-retirement.mjs';

const TARGETS = [...RUNTIMES, 'portable'];
const TARGET_LABEL = { 'claude-code': 'Claude Code', codex: 'Codex', 'oh-my-pi': 'Oh My Pi', pi: 'Pi', portable: 'Portable' };
const SKILL_DEPENDENCIES = {
  deliver: ['route-model', 'record-evidence', 'iterate-evidence', 'jira-issue-refinement'],
  'jev-ui': ['typed-judgment', 'record-evidence'],
  'record-evidence': ['deliver'],
  'iterate-evidence': ['record-evidence', 'deliver'],
  'video-iterative-orchestration': ['agent-implementation-reviewer', 'extract-figma-visuals', 'feature-conformance', 'jira-issue-hierarchy', 'slack-coordinator', 'video-iterative-development'],
  ...Object.fromEntries(['implement-plan', 'implement-outline', 'iterate-implementation', 'fix-bug', 'reproduce-bug', 'fix-code-review', 'describe-pr'].map(name => [name, ['deliver']])),
  ...Object.fromEntries(['verify-implementation', 'review-code', 'test-app', 'resolve-pr-reviews'].map(name => [name, ['deliver', 'typed-judgment']])),
};
const BINARY = { 'claude-code': 'claude', codex: 'codex', 'oh-my-pi': 'omp', pi: 'pi' };

function dependencyClosure(names) {
  const result = new Set(names);
  const visit = name => { for (const dependency of SKILL_DEPENDENCIES[name] || []) if (!result.has(dependency)) { result.add(dependency); visit(dependency); } };
  for (const name of names) visit(name);
  return [...result];
}

export function parseArgs(argv) {
  const out = { targets: [], skillNames: [], project: false, dryRun: false, yes: false, ompPublicationHook: false, uninstall: false, list: false, help: false, errors: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project') out.project = true;
    else if (arg === '--global') out.project = false;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--omp-publication-hook') out.ompPublicationHook = true;
    else if (arg === '--uninstall') out.uninstall = true;
    else if (arg === '--list') out.list = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--skill' || arg === '-s') {
      const name = argv[index + 1];
      if (!name || name.startsWith('-')) out.errors.push(`${arg} requires a skill name`);
      else { out.skillNames.push(name); index += 1; }
    } else if (arg.startsWith('--skill=')) {
      const name = arg.slice('--skill='.length);
      if (name) out.skillNames.push(name); else out.errors.push('--skill requires a skill name');
    } else if (arg === 'all') out.targets.push(...TARGETS.filter(target => target !== 'portable'));
    else if (TARGETS.includes(arg)) out.targets.push(arg);
    else out.errors.push(`unknown argument "${arg}"; targets are ${TARGETS.join(', ')} or all`);
  }
  out.targets = [...new Set(out.targets)]; out.skillNames = [...new Set(out.skillNames)];
  return out;
}

function onPath(binary, env = process.env) {
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? [binary, `${binary}.cmd`, `${binary}.exe`] : [binary];
  return dirs.some(dir => names.some(name => fs.existsSync(path.join(dir, name))));
}
export function detectTargets(env = process.env) {
  const found = RUNTIMES.filter(runtime => onPath(BINARY[runtime], env));
  return found.length ? found : ['portable'];
}
export function resolveSkillNames(requested, catalog) {
  const available = new Set(catalog.map(skill => skill.name));
  if (!requested.length || requested.includes('*')) return catalog.map(skill => skill.name);
  const unknown = requested.filter(name => !available.has(name));
  if (unknown.length) throw new Error(`unknown skill${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
  const selected = new Set(requested);
  return catalog.filter(skill => selected.has(skill.name)).map(skill => skill.name);
}
export async function promptSelections(args, catalog, { prompt = prompts, isTTY = process.stdin.isTTY, env = process.env } = {}) {
  let targets = args.targets.length ? args.targets : detectTargets(env);
  if (!args.yes && isTTY && !args.targets.length) {
    const detected = new Set(targets);
    const selected = await prompt.multiselect({ message: 'Which agent harnesses should receive the skills?', options: TARGETS.map(target => ({ value: target, label: TARGET_LABEL[target], hint: detected.has(target) ? 'detected' : target === 'portable' ? '.agents/skills' : undefined })), initialValues: targets, maxItems: TARGETS.length, required: true });
    if (prompt.isCancel(selected)) return null;
    targets = selected;
  }
  let skillNames;
  if (args.skillNames.length || args.yes || !isTTY) skillNames = resolveSkillNames(args.skillNames, catalog);
  else {
    const mode = await prompt.select({ message: 'Which skills should be installed?', options: [{ value: 'all', label: `All ${catalog.length} skills` }, { value: 'choose', label: 'Choose specific skills' }], initialValue: 'all' });
    if (prompt.isCancel(mode)) return null;
    if (mode === 'all') skillNames = catalog.map(skill => skill.name);
    else {
      const selected = await prompt.autocompleteMultiselect({ message: 'Select skills to install', options: catalog.map(skill => ({ value: skill.name, label: skill.name, hint: skill.group ?? 'standalone' })), placeholder: 'Type to filter skills', maxItems: 10, required: true });
      if (prompt.isCancel(selected)) return null;
      skillNames = resolveSkillNames(selected, catalog);
    }
  }
  return { targets, skillNames };
}

export function destinations(target, { project, cwd = process.cwd(), home = os.homedir(), env = process.env }) {
  const claudeDir = env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude');
  const codexHome = env.CODEX_HOME ?? path.join(home, '.codex');
  switch (target) {
    case 'claude-code': return project ? { skills: path.join(cwd, '.claude', 'skills'), agents: path.join(cwd, '.claude', 'agents') } : { skills: path.join(claudeDir, 'skills'), agents: path.join(claudeDir, 'agents') };
    case 'codex': return project ? { skills: path.join(cwd, '.agents', 'skills'), agents: null, config: null } : { skills: path.join(home, '.agents', 'skills'), agents: path.join(codexHome, 'agents'), config: path.join(codexHome, 'config.toml') };
    case 'oh-my-pi': return project ? { skills: path.join(cwd, '.omp', 'skills'), agents: path.join(cwd, '.omp', 'agents') } : { skills: path.join(home, '.omp', 'agent', 'skills'), agents: path.join(home, '.omp', 'agent', 'agents') };
    case 'pi': return project ? { skills: path.join(cwd, '.pi', 'skills') } : { skills: path.join(home, '.pi', 'agent', 'skills') };
    case 'portable': return { skills: project ? path.join(cwd, '.agents', 'skills') : path.join(home, '.agents', 'skills') };
    default: throw new Error(`unknown target ${target}`);
  }
}
export function plan(options) {
  const { targets, project = false, cwd = process.cwd(), home = os.homedir(), env = process.env } = options;
  const { skills } = scanSkills(path.join(repoRoot, 'skills'));
  const allNames = skills.map(skill => skill.name);
  const requestedNames = resolveSkillNames(options.skillNames ?? [], skills);
  const names = dependencyClosure(requestedNames);
  if (options.ompPublicationHook && !targets.includes('oh-my-pi')) throw new Error('--omp-publication-hook requires the oh-my-pi target');
  const allWorkerNames = allNames.filter(name => name.startsWith('agent-'));
  const workerNames = names.filter(name => name.startsWith('agent-'));
  const requestedWorkers = requestedNames.filter(name => name.startsWith('agent-'));
  const steps = []; const notes = []; const skillDirsClaimed = new Map();
  let workerModel = null;
  const pinned = targets.filter(target => WORKER_MODEL_RUNTIMES.includes(target) && destinations(target, { project, cwd, home, env }).agents);
  if (!options.uninstall && pinned.length && workerNames.some(name => PINNED_WORKERS.includes(name))) {
    if (project || env.SKILLS_MODEL_CANDIDATES_FILE) {
      try {
        const profile = loadCandidateProfile({ projectDir: cwd, env });
        if (profile.source !== 'none') {
          const economy = profile.economy.trim();
          normalizeCandidates(profile.candidates, economy);
          if (profile.routing !== undefined && !['auto', 'fixed'].includes(profile.routing)) throw new Error(`unknown routing ${JSON.stringify(profile.routing)}`);
          const ids = pinned.map(target => [target, runtimeModel(target, economy)]);
          for (const [target, id] of ids) if (!id) notes.push(`model profile ${short(profile.file, home)}: economy model ${economy} is not a ${target} model id, so ${target} builder workers are left unpinned`);
          const used = ids.filter(([, id]) => id);
          if (used.length) {
            workerModel = economy;
            notes.push(`model profile ${short(profile.file, home)}: builder workers (${PINNED_WORKERS.join(', ')}) pinned for ${used.map(([target, id]) => `${target} (${id})`).join(', ')}; rerun install after changing the profile`);
          }
        }
      } catch (error) { notes.push(`model profile ignored, builder workers left unpinned: ${error.message}`); }
    } else if (fs.existsSync(path.join(cwd, '.agents', 'model-candidates.json'))) {
      notes.push('project model profile ignored for a user-scope install, so builder workers are left unpinned; set SKILLS_MODEL_CANDIDATES_FILE to pin them');
    }
  }
  const skillStep = target => {
    const dest = destinations(target, { project, cwd, home, env }); const claimant = skillDirsClaimed.get(dest.skills);
    if (claimant) { notes.push(`${target}: skills directory ${short(dest.skills, home)} is already written by ${claimant}; skipping the ${target} copy of the skills`); return dest; }
    skillDirsClaimed.set(dest.skills, target); steps.push({ target, kind: 'skills', from: target === 'portable' ? 'canonical' : `built for ${target}`, to: dest.skills, names, removeNames: requestedNames }); return dest;
  };
  for (const target of targets) {
    const dest = skillStep(target);
    if (dest.agents && workerNames.length) steps.push({ target, kind: 'agents', to: dest.agents, names: workerNames, removeNames: requestedWorkers, format: target === 'codex' ? 'toml' : 'md' });
    else if (target === 'codex' && project && workerNames.length) notes.push('codex: worker definitions and their config.toml block are user-level; run without --project to install them');
    if (dest.config && workerNames.length) steps.push({ target, kind: 'config', to: dest.config, names: workerNames, removeNames: requestedWorkers });
  }
  if (options.ompPublicationHook) {
    const base = project ? path.join(cwd, '.omp', 'hooks') : path.join(home, '.omp', 'agent', 'hooks');
    steps.push({ target: 'oh-my-pi', kind: 'publication-hook', to: path.join(base, 'skills-publication') });
  } else if (targets.includes('oh-my-pi')) {
    notes.push('Oh My Pi publication guard is optional: pass --omp-publication-hook, then launch with --hook=<installed-path> and SKILLS_PUBLICATION_TASK_DIR=<absolute-task-dir>');
  }
  if (targets.includes('codex') && !project && (targets.includes('pi') || targets.includes('oh-my-pi'))) notes.push('Pi and Oh My Pi also read ~/.agents/skills, where the Codex copy lives; their own skill directories are installed too, so a skill may appear twice by name in those runtimes');
  const retired = retiredSweep({ project, cwd, home, env });
  if (retired.remove.length) steps.unshift({ target: 'retired', kind: 'retire', items: retired.remove, scope: { project, cwd, home, env } });
  notes.push(...retired.keep);
  return { steps, notes, names, requestedNames, workerModel };
}

export function short(file, home) { return file.startsWith(home) ? `~${file.slice(home.length)}` : file; }
export function describe(step, home) {
  switch (step.kind) {
    case 'skills': return `${step.target}: ${step.names.length} skills (${step.from}) -> ${short(step.to, home)}/<name>/`;
    case 'agents': return `${step.target}: ${step.names.length} worker definitions -> ${short(step.to, home)}/agent-*.${step.format}`;
    case 'config': return `${step.target}: [agents.*] block -> ${short(step.to, home)}`;
    case 'publication-hook': return `oh-my-pi: optional Bash publication guard -> ${short(path.join(step.to, 'hooks', 'omp-publication.mjs'), home)} (register with omp --hook=<installed-path>; set SKILLS_PUBLICATION_TASK_DIR per task; direct shell and Codex are not guarded)`;
    case 'retire': return step.items.map(item => `would remove ${item.label} ${short(item.path, home)}`).join('\n  ');
    default: return JSON.stringify(step);
  }
}
