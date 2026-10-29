#!/usr/bin/env node
// Explicit opt-in release updater. No scheduler is installed by this entry point.
// Usage: node scripts/nightly-update.mjs --targets codex --skill show-me [--project] [--dry-run]
// Repeat --skill or use --skill '*' deliberately. --project records the current working directory.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REMOTE = 'https://github.com/MarkTripoli/skills.git';
export const ENV_KEYS = ['PATH', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'SKILLS_MODEL_CANDIDATES_FILE'];
const BINARIES = { 'claude-code': 'claude', codex: 'codex', 'oh-my-pi': 'omp', pi: 'pi' };
const OWNER = 'marktripoli-skills-updater/v1';
export const usage = "--targets <auto|runtime list> --skill <name>... [--project] [--remote <git url>] [--state-dir <dir>] [--dry-run]";

export function stateDir(env = process.env, home = os.homedir()) {
  return path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'marktripoli-skills');
}

export function parseTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  const parts = match?.slice(1).map(Number);
  return parts?.every(Number.isSafeInteger) ? parts : null;
}
export function compareTags(a, b) {
  const left = parseTag(a); const right = parseTag(b);
  if (!left || !right) throw new Error('expected release tags vX.Y.Z');
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}
export function latestTag(output) {
  return output.split('\n').map(line => line.split('refs/tags/')[1]?.trim()).filter(tag => tag && parseTag(tag)).sort(compareTags).pop() ?? null;
}

export function parseArgs(argv, { cwd = process.cwd(), env = process.env } = {}) {
  const out = { remote: DEFAULT_REMOTE, setting: 'auto', skillNames: [], project: false, cwd, dir: stateDir(env), env: Object.fromEntries(ENV_KEYS.filter(key => env[key] !== undefined).map(key => [key, env[key]])), dryRun: false, print: false, uninstall: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (['--remote', '--targets', '--skill', '-s', '--state-dir', '--config'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value`);
      if (arg === '--skill' || arg === '-s') out.skillNames.push(value);
      else out[({ '--remote': 'remote', '--targets': 'setting', '--state-dir': 'dir', '--config': 'config' })[arg]] = value;
    } else if (arg === '--project') out.project = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--print') out.print = true;
    else if (arg === '--uninstall') out.uninstall = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  out.dir = path.resolve(out.dir);
  return out;
}

export function normalizeSelection(options) {
  const { remote = DEFAULT_REMOTE, setting = 'auto', skillNames = [], project = false, cwd = process.cwd(), env = {} } = options;
  if (typeof remote !== 'string' || !remote.trim() || remote.startsWith('-') || /[\r\n\0]/.test(remote)) throw new Error('invalid remote');
  if (typeof setting !== 'string') throw new Error('invalid targets');
  const targets = [...new Set(setting.split(/[\s,]+/).filter(Boolean))];
  if (!targets.length || targets.some(target => !['auto', 'portable', ...Object.keys(BINARIES)].includes(target)) || (targets.includes('auto') && targets.length !== 1)) throw new Error('targets must be auto or explicit runtime names');
  if (!Array.isArray(skillNames) || !skillNames.length || skillNames.some(name => typeof name !== 'string' || !/^(?:\*|[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(name))) throw new Error("select skills explicitly with --skill <name> or --skill '*'");
  if (typeof project !== 'boolean' || typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('invalid project scope or working directory');
  if (!env || typeof env !== 'object' || Array.isArray(env) || Object.keys(env).some(key => !ENV_KEYS.includes(key) || typeof env[key] !== 'string' || /[\r\n\0]/.test(env[key]))) throw new Error('invalid updater environment');
  // Scheduled clones have a different working directory; retain the user's original path meaning.
  const savedEnv = Object.fromEntries(Object.entries(env).map(([key, value]) => [key, key === 'PATH'
    ? value.split(path.delimiter).map(entry => entry ? path.resolve(cwd, entry) : '').join(path.delimiter)
    : path.resolve(cwd, value)]));
  return { remote, setting: targets.join(','), skillNames: [...new Set(skillNames)].sort(), project, cwd, env: savedEnv };
}

export function assertNoSymlinks(file) {
  for (let cursor = path.resolve(file); ; cursor = path.dirname(cursor)) {
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) throw new Error(`symlinked updater path: ${cursor}`);
    if (cursor === path.dirname(cursor)) break;
  }
}

// Never adopt a checkout, foreign directory, or symlink as updater-owned state.
export function checkState(dir, { create = false } = {}) {
  dir = path.resolve(dir);
  assertNoSymlinks(dir);
  for (let cursor = dir; ; cursor = path.dirname(cursor)) {
    if (fs.existsSync(path.join(cursor, '.git'))) throw new Error('updater state must be outside source-controlled checkouts');
    if (cursor === path.dirname(cursor)) break;
  }
  const owner = path.join(dir, 'owner');
  if (fs.existsSync(dir)) {
    if (!fs.statSync(dir).isDirectory()) throw new Error('updater state must be a directory');
    if (fs.readdirSync(dir).length && (!fs.existsSync(owner) || fs.lstatSync(owner).isSymbolicLink() || fs.readFileSync(owner, 'utf8') !== `${OWNER}\n`)) throw new Error('refusing foreign updater state directory');
    for (const name of ['installed.json', 'config.json', 'bin', 'update.lock']) assertNoSymlinks(path.join(dir, name));
  }
  if (create) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(owner, `${OWNER}\n`, { mode: 0o600 });
  }
  return dir;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed: ${(result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim().split('\n').pop()}`);
  return result.stdout;
}

function detectedTargets(env) {
  return Object.entries(BINARIES).filter(([, binary]) => (env.PATH || '').split(path.delimiter).filter(Boolean).some(dir => [binary, ...(process.platform === 'win32' ? [`${binary}.cmd`, `${binary}.exe`] : [])].some(name => fs.existsSync(path.join(dir, name))))).map(([target]) => target);
}

export async function update(options = {}) {
  const selection = normalizeSelection(options);
  const { remote, skillNames, project, cwd } = selection;
  const env = { ...process.env, ...selection.env };
  const targets = selection.setting === 'auto' ? detectedTargets(env) : selection.setting.split(',');
  if (!targets.length) return 'skills: no agent found on PATH; skills not updated';
  if (project && !fs.statSync(cwd).isDirectory()) throw new Error(`project directory not found: ${cwd}`);
  const dir = checkState(options.dir ?? stateDir(env));
  const exec = options.exec ?? run;
  const tag = latestTag(exec('git', ['ls-remote', '--tags', '--refs', '--', remote], { env }));
  if (!tag) return 'skills: no release tag found; nothing to install';
  const fingerprint = createHash('sha256').update(JSON.stringify({ ...selection, targets })).digest('hex');
  const marker = path.join(dir, 'installed.json');
  if (options.dryRun) {
    const installed = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, 'utf8')) : null;
    if (installed?.fingerprint === fingerprint && parseTag(installed.tag) && compareTags(installed.tag, tag) >= 0) return `skills: already at ${installed.tag}`;
    return `skills: would install ${tag} for ${targets.join(', ')} (${project ? cwd : 'user scope'}; skills: ${skillNames.join(', ')})`;
  }
  checkState(dir, { create: true });
  const lock = path.join(dir, 'update.lock');
  const fd = fs.openSync(lock, 'wx', 0o600);
  let checkout;
  try {
    // A newer update may have completed after this process discovered its release tag.
    const installed = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, 'utf8')) : null;
    if (installed?.fingerprint === fingerprint && parseTag(installed.tag) && compareTags(installed.tag, tag) >= 0) return `skills: already at ${installed.tag}`;
    checkout = fs.mkdtempSync(path.join(dir, 'release-'));
    exec('git', ['clone', '--quiet', '--depth', '1', '--branch', tag, '--', remote, checkout], { env });
    exec('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: checkout, env });
    exec(process.execPath, [path.join(checkout, 'scripts', 'install.mjs'), ...targets, ...skillNames.flatMap(name => ['--skill', name]), ...(project ? ['--project'] : []), '--yes'], { cwd: project ? cwd : checkout, env });
    const pending = `${checkout}.installed.json`;
    fs.writeFileSync(pending, `${JSON.stringify({ tag, fingerprint })}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(pending, marker);
    return `skills: updated ${installed?.tag ?? 'nothing'} -> ${tag} for ${targets.join(', ')}; start a new agent session to load it`;
  } finally {
    if (checkout) fs.rmSync(checkout, { recursive: true, force: true });
    if (checkout) fs.rmSync(`${checkout}.installed.json`, { force: true });
    fs.closeSync(fd);
    fs.rmSync(lock, { force: true });
  }
}

const invoked = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : null;
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) console.log(`usage: node scripts/nightly-update.mjs ${usage} [--config <file>]`);
    else {
      if (args.print || args.uninstall) throw new Error('--print and --uninstall belong to install-updater.mjs');
      const config = args.config ? JSON.parse(fs.readFileSync(args.config, 'utf8')) : args;
      console.error(await update({ ...config, dir: args.config ? path.dirname(path.resolve(args.config)) : args.dir, dryRun: args.dryRun }));
    }
  } catch (error) {
    console.error(`skills: nightly update failed (${error.message})`);
    process.exitCode = 1;
  }
}
