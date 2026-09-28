#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const now = () => Date.now();
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr.trim()}`);
  return result.stdout;
}
function gh(args) { return run(process.env.GH_BIN || 'gh', args, { maxBuffer: 64 * 1024 * 1024 }); }
function parse(text, label) { try { return JSON.parse(text); } catch { throw new Error(`${label} returned invalid JSON`); } }
function eligible(issue, labels) {
  return issue.state === 'OPEN' && labels.every(label => issue.labels?.some(item => item.name === label));
}
function claimKey(repo, number) { return `${repo.toLowerCase()}#${number}`; }
function yamlScalar(raw) {
  const value = raw.trim();
  if (value.startsWith("'")) {
    for (let i = 1; i < value.length; i++) {
      if (value[i] !== "'") continue;
      if (value[i + 1] === "'") { i++; continue; }
      if (!/^(?:\s+#.*)?\s*$/.test(value.slice(i + 1))) return null;
      return value.slice(1, i).replace(/''/g, "'");
    }
    return null;
  }
  if (value.startsWith('"')) {
    let escaped = false;
    for (let i = 1; i < value.length; i++) {
      if (escaped) { escaped = false; continue; }
      if (value[i] === '\\') { escaped = true; continue; }
      if (value[i] !== '"') continue;
      if (!/^(?:\s+#.*)?\s*$/.test(value.slice(i + 1))) return null;
      try { return JSON.parse(value.slice(0, i + 1)); } catch { return null; }
    }
    return null;
  }
  return value.replace(/\s+#.*$/, '').trim();
}
function localTasks(roots, repo) {
  const matches = new Map();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, entry.name);
      const file = path.join(directory, 'task.md');
      if (!fs.existsSync(file)) continue;
      const frontmatter = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      if (!frontmatter) continue;
      const rawIssue = frontmatter.match(/^issue:\s*(.*)$/m)?.[1];
      const taskIssue = rawIssue === undefined ? null : yamlScalar(rawIssue);
      const rawRepo = frontmatter.match(/^repository:\s*(.*)$/m)?.[1];
      const taskRepo = rawRepo === undefined ? null : yamlScalar(rawRepo);
      if (!taskIssue || !/^\d+$/.test(taskIssue) || taskRepo?.toLowerCase() !== repo.toLowerCase()) continue;
      const number = Number(taskIssue);
      if (!Number.isSafeInteger(number)) continue;
      if (!matches.has(number)) matches.set(number, []);
      matches.get(number).push(directory);
    }
  }
  return matches;
}
function taskRoots(taskRoot, repositoryRoot) {
  if (!repositoryRoot || path.resolve(taskRoot) !== path.join(repositoryRoot, '.agents/tasks')) return [taskRoot];
  const inventory = spawnSync('git', ['-C', repositoryRoot, 'worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8' });
  if (inventory.error || inventory.status !== 0 || !inventory.stdout?.endsWith('\0\0')) throw new Error('cannot safely inventory repository worktrees');
  const common = run('git', ['-C', repositoryRoot, 'rev-parse', '--git-common-dir']).trim();
  const commonDir = fs.realpathSync(path.resolve(repositoryRoot, common));
  const roots = [];
  for (const record of inventory.stdout.slice(0, -2).split('\0\0')) {
    const fields = record.split('\0');
    if (!fields[0]?.startsWith('worktree ') || fields.some(field => field.startsWith('prunable '))) {
      throw new Error('cannot safely inventory repository worktrees');
    }
    if (fields.includes('bare')) {
      if (fields.length !== 2 || fields[1] !== 'bare') throw new Error('cannot safely inventory repository worktrees');
      continue;
    }
    if (!fields[1]?.startsWith('HEAD ')) throw new Error('cannot safely inventory repository worktrees');
    const worktree = fields[0].slice('worktree '.length);
    try {
      const actual = fs.realpathSync(worktree);
      const details = run('git', ['-C', actual, 'rev-parse', '--show-toplevel', '--git-common-dir']).trim().split('\n');
      if (details.length !== 2 || fs.realpathSync(details[0]) !== actual || fs.realpathSync(path.resolve(actual, details[1])) !== commonDir) {
        throw new Error('worktree identity mismatch');
      }
      const root = path.join(actual, '.agents/tasks');
      if (!inside(actual, resolvedPath(root))) throw new Error('task root escapes registered worktree');
      roots.push(root);
    } catch {
      throw new Error('cannot safely inventory repository worktrees');
    }
  }
  if (!roots.includes(path.resolve(taskRoot))) throw new Error('cannot safely inventory repository worktrees');
  return roots;
}
function readState(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (state.schema !== 2 || !Array.isArray(state.claims)) throw new Error('unsupported claim state; manual migration required');
    return state;
  } catch (error) { if (error.code === 'ENOENT') return { schema: 2, claims: [] }; throw error; }
}
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
}
function processIsDead(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0x7fffffff) return true;
  try { process.kill(pid, 0); return false; }
  catch (error) { return ['ESRCH', 'EINVAL', 'ERR_OUT_OF_RANGE'].includes(error.code); }
}
function releaseOwnedDirectory(directory, token) {
  const owner = path.join(directory, 'owner.json');
  const current = JSON.parse(fs.readFileSync(owner, 'utf8'));
  if (current.token !== token) throw new Error(`lock ownership changed; leaving ${directory} untouched`);
  const released = `${directory}.released-${token}`;
  fs.renameSync(directory, released);
  fs.rmSync(released, { recursive: true, force: true });
}
function withReaper(file, operation) {
  const reaper = `${file}.reaper`;
  const token = crypto.randomUUID();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.mkdirSync(reaper);
    fs.writeFileSync(path.join(reaper, 'owner.json'), JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') { try { fs.rmSync(reaper, { recursive: true, force: true }); } catch {} throw error; }
    throw new Error(`issue intake is already running (lock recovery: ${reaper})`);
  }
  try { return operation(); }
  finally { releaseOwnedDirectory(reaper, token); }
}
function inspectLock(directory, staleMs) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(directory, 'owner.json'), 'utf8'));
    return { owner, dead: processIsDead(owner.pid) };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return { owner: null, dead: Date.now() - fs.statSync(directory).mtimeMs >= staleMs };
    throw error;
  }
}
function withClaimLock(file, staleMs, operation) {
  const lock = `${file}.lock`;
  const token = crypto.randomUUID();
  withReaper(lock, () => {
    if (fs.existsSync(lock)) {
      const observed = inspectLock(lock, staleMs);
      if (!observed.dead) throw new Error(`issue intake is already running (claim lock: ${lock})`);
      const tombstone = `${lock}.stale-${token}`;
      fs.renameSync(lock, tombstone);
      const moved = inspectLock(tombstone, staleMs);
      if (moved.owner?.token !== observed.owner?.token) {
        fs.renameSync(tombstone, lock);
        throw new Error(`stale lock owner changed during takeover; left ${lock} untouched`);
      }
      fs.rmSync(tombstone, { recursive: true, force: true });
    }
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: Date.now(), token }), { flag: 'wx', mode: 0o600 });
  });
  try { return operation(); }
  finally {
    if (fs.existsSync(lock)) withReaper(lock, () => releaseOwnedDirectory(lock, token));
  }
}
function labelsArgs(labels) { return labels.flatMap(label => ['--label', label]); }
function listIssues(repo, labels, runGh) {
  const issues = parse(runGh(['issue', 'list', '--repo', repo, '--state', 'open', ...labelsArgs(labels), '--limit', '1000', '--json', 'number,title,body,state,labels,url']), 'gh issue list');
  if (issues.length >= 1000) throw new Error('issue listing reached the 1000-item limit; refusing incomplete queue coverage');
  for (const issue of issues) if (!Number.isSafeInteger(issue?.number) || issue.number <= 0) throw new Error('issue listing contains a missing or invalid positive issue number');
  return issues;
}
function listPullRequests(repo, runGh) {
  const prs = parse(runGh(['pr', 'list', '--repo', repo, '--state', 'all', '--limit', '1000', '--json', 'number,title,body,url,state']), 'gh pr list');
  if (prs.length >= 1000) throw new Error('pull request listing reached the 1000-item limit; refusing incomplete duplicate coverage');
  return prs;
}
function matchingPrs(prs, repo, number) {
  const escapedRepo = repo.split('/').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
  const reference = new RegExp(`(?:(?<![\\w./-])#${number}\\b|(?<![\\w./-])${escapedRepo}#${number}\\b|https?://github\\.com/${escapedRepo}(?:#${number}\\b|/issues/${number}\\b))`, 'i');
  return prs.filter(pr => reference.test(`${pr.title ?? ''}\n${pr.body ?? ''}\n${pr.url ?? ''}`));
}
function lookup(options) {
  const issues = listIssues(options.repo, options.labels ?? [], options.runGh ?? gh);
  const prs = issues.length ? listPullRequests(options.repo, options.runGh ?? gh) : [];
  return { issues: issues.sort((a, b) => a.number - b.number), prs };
}
function writeReceipt(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (exclusive) { fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 }); return; }
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, file);
}
function dryRun(options) {
  const { issues, prs } = lookup(options);
  const state = readState(options.stateFile);
  const tasksByIssue = localTasks(options.taskRoots, options.repo);
  return issues.map(issue => {
    const key = claimKey(options.repo, issue.number);
    const claim = state.claims.find(item => item.key === key);
    const tasks = tasksByIssue.get(issue.number) ?? [];
    const existingPr = matchingPrs(prs, options.repo, issue.number);
    if (claim?.status === 'dispatching' || claim?.status === 'handoff-unknown') return { issue: issue.number, status: 'handoff-unknown', receipt: claim.receipt };
    if (!eligible(issue, options.labels ?? [])) return { issue: issue.number, status: 'ineligible' };
    if (existingPr.length) return { issue: issue.number, status: 'existing-pr', prs: existingPr };
    if (tasks.length) return { issue: issue.number, status: 'duplicate-task', tasks };
    if (claim?.status === 'complete') return { issue: issue.number, status: 'complete', receipt: claim.receipt };
    return { issue: issue.number, status: 'eligible', idempotencyKey: claim?.idempotencyKey ?? key };
  });
}
function intakeLocked(options) {
  const { repo, taskRoots: roots, stateFile, labels = [], handoff, runGh = gh, runCommand = run, costReport = null, clock = now } = options;
  const { issues, prs } = lookup({ repo, labels, runGh });
  const state = readState(stateFile);
  let tasksByIssue = localTasks(roots, repo);
  const outcomes = [];
  let blockedBy = null;
  // A filtered queue can omit an unresolved claim after its issue closes or loses a label.
  // Reconcile persisted claims before considering any fresh handoff.
  const reconciled = new Set();
  for (const claim of state.claims.filter(item => item.repo?.toLowerCase() === repo.toLowerCase() &&
      (item.status === 'dispatching' || item.status === 'handoff-unknown')).sort((a, b) => a.issue - b.issue)) {
    const { issue: number, key } = claim;
    const idempotencyKey = claim.idempotencyKey ?? crypto.createHash('sha256').update(key).digest('hex');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(idempotencyKey)) throw new Error(`invalid idempotency key for ${key}`);
    const receipt = path.join(path.dirname(stateFile), 'issue-intake-receipts', `${idempotencyKey}.json`);
    if (claim.receipt && path.resolve(claim.receipt) !== receipt) throw new Error(`claim receipt path mismatch for ${key}`);
    let prior;
    try { prior = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch {}
    if (prior?.idempotencyKey === idempotencyKey && prior.repo?.toLowerCase() === repo.toLowerCase() && prior.issue === number && prior.status === 'accepted') {
      const completed = { ...claim, status: 'complete', receipt, ownerPid: null, updatedAt: clock() };
      state.claims = state.claims.map(item => item === claim ? completed : item);
      saveState(stateFile, state);
      outcomes.push({ issue: number, status: 'handed-off-recovered', receipt });
    } else {
      outcomes.push({ issue: number, status: 'handoff-unknown', receipt });
      if (blockedBy === null) blockedBy = number;
    }
    reconciled.add(key);
  }
  for (const issue of issues) {
    if (reconciled.has(claimKey(repo, issue.number))) continue;
    if (blockedBy !== null) { outcomes.push({ issue: issue.number, status: 'blocked-not-attempted', blockedBy }); continue; }
    const key = claimKey(repo, issue.number);
    const claim = state.claims.find(item => item.key === key);
    const idempotencyKey = claim?.idempotencyKey ?? crypto.createHash('sha256').update(key).digest('hex');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(idempotencyKey)) throw new Error(`invalid idempotency key for ${key}`);
    const receipt = path.join(path.dirname(stateFile), 'issue-intake-receipts', `${idempotencyKey}.json`);
    if (claim?.receipt && path.resolve(claim.receipt) !== receipt) throw new Error(`claim receipt path mismatch for ${key}`);
    if (claim?.status === 'dispatching' || claim?.status === 'handoff-unknown' ||
        (claim?.status !== 'complete' && fs.existsSync(receipt))) {
      let prior;
      try { prior = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch {}
      if (prior?.idempotencyKey === idempotencyKey && prior.repo?.toLowerCase() === repo.toLowerCase() && prior.issue === issue.number && prior.status === 'accepted') {
        const completed = { ...(claim ?? {}), key, repo, issue: issue.number, status: 'complete', idempotencyKey, receipt, ownerPid: null, updatedAt: clock() };
        state.claims = state.claims.filter(item => item.key !== key).concat(completed);
        saveState(stateFile, state);
        outcomes.push({ issue: issue.number, status: 'handed-off-recovered', receipt });
        continue;
      }
      outcomes.push({ issue: issue.number, status: 'handoff-unknown', receipt });
      blockedBy = issue.number;
      continue;
    }
    if (!eligible(issue, labels)) { outcomes.push({ issue: issue.number, status: 'ineligible' }); continue; }
    const relatedPrs = matchingPrs(prs, repo, issue.number);
    if (relatedPrs.length) { outcomes.push({ issue: issue.number, status: 'existing-pr', prs: relatedPrs }); continue; }
    const tasks = tasksByIssue.get(issue.number) ?? [];
    if (tasks.length) { outcomes.push({ issue: issue.number, status: 'duplicate-task', tasks }); continue; }
    if (claim?.status === 'complete') { outcomes.push({ issue: issue.number, status: 'complete', receipt }); continue; }
    const active = { key, repo, issue: issue.number, status: 'dispatching', idempotencyKey, receipt, ownerPid: process.pid, updatedAt: clock(), costNote: costReport ? { text: costReport, verified: false } : null };
    state.claims = state.claims.filter(item => item.key !== key).concat(active);
    saveState(stateFile, state);
    const request = `Issue #${issue.number}: ${issue.title}\n${issue.body || issue.title}\n\nSource: ${issue.url}`;
    const args = [`--intake-key=${idempotencyKey}`, `--receipt=${receipt}`, `--repo=${repo}`, `--issue=${issue.number}`, request];
    try {
      writeReceipt(receipt, { idempotencyKey, repo, issue: issue.number, status: 'dispatching', recordedAt: clock(), costNote: active.costNote }, true);
      runCommand(handoff, args);
    } catch (error) {
      let prior;
      try { prior = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch {}
      if (prior?.idempotencyKey === idempotencyKey && prior.repo?.toLowerCase() === repo.toLowerCase() && prior.issue === issue.number && prior.status === 'accepted') {
        active.status = 'complete'; active.ownerPid = null; active.updatedAt = clock();
        saveState(stateFile, state);
        outcomes.push({ issue: issue.number, status: 'handed-off-recovered', receipt });
        continue;
      }
      try { writeReceipt(receipt, { idempotencyKey, repo, issue: issue.number, status: 'unknown', recordedAt: clock(), error: error.message, costNote: active.costNote }); } catch {}
      active.status = 'handoff-unknown'; active.ownerPid = null; active.error = error.message; active.updatedAt = clock();
      saveState(stateFile, state);
      outcomes.push({ issue: issue.number, status: 'handoff-unknown', receipt, error: error.message });
      blockedBy = issue.number;
      continue;
    }
    writeReceipt(receipt, { idempotencyKey, repo, issue: issue.number, status: 'accepted', recordedAt: clock(), costNote: active.costNote });
    active.status = 'complete'; active.ownerPid = null; active.updatedAt = clock();
    saveState(stateFile, state);
    outcomes.push({ issue: issue.number, status: 'handed-off', receipt });
    tasksByIssue = localTasks(roots, repo);
  }
  return outcomes;
}
export function intake(options) {
  const repositoryRoot = options.repositoryRoot ?? (options.taskRoot.endsWith(`${path.sep}.agents${path.sep}tasks`) ? checkoutRoot() : null);
  const stateFile = resolvedPath(options.stateFile);
  const scoped = { ...options, stateFile, taskRoots: taskRoots(options.taskRoot, repositoryRoot) };
  if (options.dryRun !== false) return dryRun(scoped);
  return withClaimLock(stateFile, options.staleMs ?? 30 * 60_000, () => intakeLocked(scoped));
}
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function checkoutRoot(cwd = process.cwd()) {
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (git.error || git.status !== 0 || !git.stdout.trim()) throw new Error('issue intake requires a local Git checkout to validate task-root ownership');
  return fs.realpathSync(git.stdout.trim());
}
function resolvedPath(target) {
  const missing = [];
  let ancestor = target;
  while (true) {
    try {
      const entry = fs.lstatSync(ancestor);
      try { return path.join(fs.realpathSync(ancestor), ...missing.reverse()); }
      catch (error) {
        if (error.code === 'ENOENT' && entry.isSymbolicLink()) throw new Error(`dangling symbolic link: ${ancestor}`);
        throw error;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.push(path.basename(ancestor));
      ancestor = parent;
    }
  }
}
function validateLocalPaths(taskRoot, stateFile, cwd = process.cwd()) {
  const repositoryRoot = checkoutRoot(cwd);
  const canonicalState = resolvedPath(stateFile);
  const checkIgnored = (target, probe = '') => {
    if (!inside(repositoryRoot, target)) return;
    const relative = path.relative(repositoryRoot, target) + probe;
    const ignored = spawnSync('git', ['-C', repositoryRoot, 'check-ignore', '--quiet', '--no-index', '--', relative], { encoding: 'utf8' });
    if (ignored.error || ignored.status !== 0) throw new Error(`${target} is inside the checkout but is not ignored; choose an ignored or external path`);
  };
  const checkDerived = (target, probe) => {
    for (const candidate of new Set([target, resolvedPath(target)])) checkIgnored(candidate, probe);
  };
  for (const target of new Set([taskRoot, resolvedPath(taskRoot)])) {
    checkIgnored(target, fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink() ? '' : '/');
  }
  for (const target of new Set([stateFile, canonicalState])) checkIgnored(target);
  checkIgnored(path.dirname(canonicalState), '/');
  const receiptDirectory = path.join(path.dirname(canonicalState), 'issue-intake-receipts');
  for (const target of [
    `${canonicalState}.lock`,
    `${canonicalState}.lock.reaper`,
    `${canonicalState}.lock.stale-${crypto.randomUUID()}`,
    `${canonicalState}.lock.released-${crypto.randomUUID()}`,
    `${canonicalState}.lock.reaper.released-${crypto.randomUUID()}`,
  ]) checkDerived(target, '/owner.json');
  checkDerived(receiptDirectory, '/');
  return repositoryRoot;
}
function main(argv) {
  const values = Object.create(null);
  const labels = [];
  for (const arg of argv.slice(2)) {
    if (arg === '--execute') {
      if (values.execute) throw new Error('--execute must be specified once');
      values.execute = true;
      continue;
    }
    if (arg.startsWith('--execute=')) throw new Error('--execute is a flag; use --execute or omit it for dry-run');
    const match = /^--(repo|task-root|state|label|handoff|cost-report)=(.*)$/s.exec(arg);
    if (!match || !match[2].trim() || match[2].startsWith('--')) throw new Error(`invalid issue-intake argument: ${arg}`);
    const [, key, value] = match;
    if (key === 'label') { labels.push(value); continue; }
    if (values[key] !== undefined) throw new Error(`duplicate issue-intake argument: --${key}`);
    values[key] = value;
  }
  if (!values.repo || !values['task-root']) throw new Error('usage: issue-intake.mjs --repo=OWNER/REPO --task-root=PATH [--state=PATH] [--label=NAME] [--execute --handoff=COMMAND]');
  if (!/^[^\s/]+\/[^\s/]+$/.test(values.repo)) throw new Error('--repo requires OWNER/REPO');
  if (Boolean(values.execute) !== Boolean(values.handoff)) throw new Error('--execute requires --handoff, and --handoff requires --execute');
  const taskRoot = path.resolve(values['task-root']);
  const stateFile = path.resolve(values.state || path.join(os.homedir(), '.local/state/skills/issue-intake.json'));
  const repositoryRoot = validateLocalPaths(taskRoot, stateFile);
  const result = intake({ repo: values.repo, taskRoot, stateFile, repositoryRoot, labels, dryRun: !values.execute, handoff: values.handoff || null, costReport: values['cost-report'] || null });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
let invokedDirectly = false;
try {
  invokedDirectly = Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
} catch {} // Module imports may have no filesystem-backed argv[1].
if (invokedDirectly) {
  try { main(process.argv); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
