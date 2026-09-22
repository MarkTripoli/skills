import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { digest, frontmatter, validateChildren } from './artifacts.mjs';
import { initTaskArtifacts, readArtifactIndex } from './artifact-index.mjs';
import { DEFAULT_TASK_ROOT, normalizeTaskRoot, resolveTaskRoot } from './task-storage.mjs';
import { committedChildCompletion } from './child-evidence.mjs';
import { taskRootAtBase } from './workspace-base.mjs';
import { expandPath, resolveSkillsDir } from './skill-storage.mjs';

export { expandPath } from './skill-storage.mjs';
export function git(cwd, args, optional = false, raw = false) {
  try {
    const output = execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return raw ? output : output.trim();
  }
  catch (error) { if (optional) return null; throw new Error(`git ${args.join(' ')} in ${cwd}: ${String(error.stderr || error.message).trim()}`); }
}
export function saveRecord(task, name, value) {
  const run = String(task.runId).replace(/[^A-Za-z0-9._-]/g, '_');
  const record = String(name).replace(/[^A-Za-z0-9._-]/g, '_');
  const dir = path.join(task.taskDir, '.atomic-delivery', run);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record}.json`);
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
  return file;
}

const safe = value => String(value).replace(/[^A-Za-z0-9._-]/g, '_');
const repoRelative = (root, target) => path.relative(root, target).split(path.sep).join('/');
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`Invalid workspace ownership record ${file}: ${error.message}`); }
}
function worktrees(root) {
  const lines = git(root, ['worktree', 'list', '--porcelain'], true)?.split('\n') || [];
  const result = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('worktree ')) { if (current) result.push(current); current = { path: line.slice(9) }; }
    else if (line.startsWith('branch ') && current) current.branch = line.slice(7).replace(/^refs\/heads\//, '');
  }
  if (current) result.push(current);
  return result;
}
function expectedMarker(markerFile, expected) {
  const prior = readJson(markerFile);
  if (prior) {
    for (const key of ['runId', 'root', 'target', 'branch', 'base', 'slug', 'taskDir', 'mode']) if (prior[key] !== expected[key]) throw new Error(`Workspace ownership mismatch for ${expected.target}; refusing to claim a preexisting run`);
    return prior;
  }
  writeJson(markerFile, { ...expected, phase: 'reserved', created: new Date().toISOString() });
  return expected;
}
function ownedWorktree(root, target, branch) {
  const found = worktrees(root).find(item => path.resolve(item.path) === path.resolve(target));
  return found && (!found.branch || found.branch === branch) ? found : null;
}

export function ensureTask(inputs, invocation, runId, mode) {
  let cwd = path.resolve(invocation);
  let taskDir;
  let slug;
  if (inputs.task_dir) {
    taskDir = fs.realpathSync(path.resolve(cwd, expandPath(inputs.task_dir)));
    const parsed = frontmatter(fs.readFileSync(path.join(taskDir, 'task.md'), 'utf8'), 'task.md');
    slug = parsed.metadata.slug;
    if (typeof slug !== 'string' || !slug.trim()) throw new Error('Existing task.md has no slug');
    cwd = git(taskDir, ['rev-parse', '--show-toplevel'], true) || cwd;
    const branch = git(cwd, ['branch', '--show-current'], true);
    if (inputs.branch && branch !== inputs.branch) throw new Error(`Supplied task_dir belongs to branch ${branch}; refusing to switch it to ${inputs.branch}`);
    const recordedMode = typeof parsed.metadata.workflow === 'string' && parsed.metadata.workflow !== 'auto' ? parsed.metadata.workflow : mode;
    const taskRoot = path.dirname(taskDir);
    return { cwd, taskDir, taskRoot, taskRootRelative: repoRelative(cwd, taskRoot), slug, request: parsed.body, runId, mode: recordedMode, skillsDir: resolveSkillsDir(inputs.skills_dir, cwd), branch: branch || null };
  }
  if (mode === 'epic-wave' || mode === 'resolve-reviews') throw new Error(`${mode} requires the existing task_dir; no new task or branch will be inferred`);
  const request = String(inputs.request);
  slug = request.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 4).join('-') || 'delivery-task';
  slug = `${slug}-${digest(String(runId)).slice(0, 8)}`;
  const root = git(cwd, ['rev-parse', '--show-toplevel'], true);
  let target = cwd;
  let branch = inputs.branch || `${['epic', 'program'].includes(mode) ? 'epic-' : ''}${slug}`;
  let base = inputs.base || null;
  let taskRootRelative = DEFAULT_TASK_ROOT;
  if (root) {
    const common = worktrees(root).find(item => path.resolve(item.path) === path.resolve(root))?.path || root;
    target = path.join(os.homedir(), '.agents', 'worktrees', path.basename(common), slug);
    base ||= git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], true) || 'main';
    taskRootRelative = taskRootAtBase(root, base, git);
  }
  const taskRoot = path.join(root ? target : cwd, ...taskRootRelative.split('/'));
  taskDir = path.join(taskRoot, slug);
  const markerFile = path.join(root || cwd, '.atomic-delivery', 'workspace', `${safe(runId)}.json`);
  if (!readJson(markerFile) && root && (fs.existsSync(target) || git(root, ['show-ref', '--verify', `refs/heads/${branch}`], true))) throw new Error(`Task worktree or branch already exists: ${target}, ${branch}; supply its task_dir to reuse it`);
  expectedMarker(markerFile, { runId: String(runId), root: root || cwd, target, branch, base, slug, taskDir, mode });
  if (root) {
    if (!ownedWorktree(root, target, branch)) {
      if (fs.existsSync(target) || git(root, ['show-ref', '--verify', `refs/heads/${branch}`], true)) throw new Error(`Reserved workspace is not the owned ${branch} worktree; refusing to claim ${target}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      git(root, ['worktree', 'add', '-b', branch, target, base]);
    }
    if (!ownedWorktree(root, target, branch)) throw new Error(`Git worktree ${target} was not created for owned branch ${branch}`);
    cwd = fs.realpathSync(target);
    const checkedOutTaskRoot = resolveTaskRoot(cwd).relativeRoot;
    if (checkedOutTaskRoot !== taskRootRelative) throw new Error(`Created worktree task root ${checkedOutTaskRoot} disagrees with selected base ${base} (${taskRootRelative})`);
    writeJson(markerFile, { ...readJson(markerFile), phase: 'worktree-added' });
  }
  fs.mkdirSync(taskDir, { recursive: true });
  const metadata = { slug, title: request.split('\n')[0], workflow: mode, created: new Date().toISOString().slice(0, 10), ...(inputs.base ? { base: inputs.base } : {}) };
  const taskFile = path.join(taskDir, 'task.md');
  const expectedTask = `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${request}\n`;
  if (fs.existsSync(taskFile)) {
    const parsed = frontmatter(fs.readFileSync(taskFile, 'utf8'), taskFile);
    if (parsed.metadata.slug !== slug || parsed.metadata.workflow !== mode || parsed.body !== request) throw new Error(`Owned task changed in ${taskDir}; refusing to overwrite it`);
  } else fs.writeFileSync(taskFile, expectedTask, { flag: 'wx' });
  initTaskArtifacts(taskDir);
  writeJson(markerFile, { ...readJson(markerFile), phase: 'task-written' });
  return { cwd, taskDir, taskRoot, taskRootRelative, slug, request, runId, mode, skillsDir: resolveSkillsDir(inputs.skills_dir, cwd), branch: git(cwd, ['branch', '--show-current'], true) || null };
}

export function revision(cwd, effectiveTaskRootRelative) {
  const root = git(cwd, ['rev-parse', '--show-toplevel'], true);
  if (!root) return null;
  const relativeRoot = effectiveTaskRootRelative === undefined
    ? resolveTaskRoot(root).relativeRoot
    : normalizeTaskRoot(effectiveTaskRootRelative, 'Effective task root');
  const excluded = ['.', `:(exclude)${relativeRoot}`, ':(exclude).atomic'];
  const index = git(root, ['ls-files', '-s', '--', ...excluded]);
  const diff = git(root, ['diff', '--binary', '--', ...excluded]);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...excluded]);
  const hashes = (untracked || '').split('\0').filter(Boolean).map(file => {
    const full = path.join(root, file);
    return `${file}:${digest(fs.lstatSync(full).isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full))}`;
  });
  return digest(JSON.stringify([index, diff, hashes]));
}

export function childrenFor(task) {
  const parent = path.dirname(task.taskDir);
  const children = [];
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(parent, entry.name);
    const file = path.join(dir, 'task.md');
    if (!fs.existsSync(file)) continue;
    const { metadata, body } = frontmatter(fs.readFileSync(file, 'utf8'), file);
    if (metadata.parent !== task.slug) continue;
    children.push({ slug: metadata.slug, workflow: metadata.workflow, depends_on: metadata.depends_on ?? [], request: body, taskDir: dir });
  }
  return validateChildren(children);
}
export function childWave(task, children) {
  if (!children.length) throw new Error('Epic delivery has no child tasks');
  const done = [];
  const started = [];
  const ready = [];
  const blocked = [];
  for (const child of children) {
    if (committedChildCompletion(task.cwd, child, git)) { done.push(child.slug); continue; }
    const branch = git(task.cwd, ['rev-parse', '--verify', `refs/heads/${child.slug}`], true);
    if (branch || git(task.cwd, ['show-ref', '--verify', `refs/remotes/origin/${child.slug}`], true)) started.push(child.slug);
  }
  for (const child of children) {
    if (done.includes(child.slug) || started.includes(child.slug)) continue;
    (child.depends_on.every(dep => done.includes(dep)) ? ready : blocked).push(child.slug);
  }
  return { done, started, ready, blocked };
}

export function prepareChild(task, child) {
  if (!task.branch) throw new Error('Epic child delivery requires a named Git branch');
  const root = git(task.cwd, ['rev-parse', '--show-toplevel']) || task.cwd;
  const common = worktrees(root).find(item => path.resolve(item.path) === path.resolve(root))?.path || root;
  const target = path.join(os.homedir(), '.agents', 'worktrees', path.basename(common), child.slug);
  const taskRootRelative = task.taskRootRelative || repoRelative(task.cwd, path.dirname(task.taskDir));
  if (path.isAbsolute(taskRootRelative) || taskRootRelative === '..' || taskRootRelative.startsWith('../')) throw new Error(`Parent task root is outside its repository: ${path.dirname(task.taskDir)}`);
  const childTaskDir = path.join(target, ...taskRootRelative.split('/'), child.slug);
  const markerFile = path.join(task.taskDir, '.atomic-delivery', 'workspace', `child-${safe(task.runId)}-${safe(child.slug)}.json`);
  if (!readJson(markerFile) && (fs.existsSync(target) || git(root, ['show-ref', '--verify', `refs/heads/${child.slug}`], true))) throw new Error(`Child workspace or branch exists without this run's ownership: ${target}, ${child.slug}`);
  expectedMarker(markerFile, { runId: String(task.runId), root, target, branch: child.slug, base: task.branch, slug: child.slug, taskDir: childTaskDir });
  if (!ownedWorktree(root, target, child.slug)) {
    if (fs.existsSync(target) || git(root, ['show-ref', '--verify', `refs/heads/${child.slug}`], true)) throw new Error(`Child workspace or branch exists without this run's ownership: ${target}, ${child.slug}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    git(task.cwd, ['worktree', 'add', '-b', child.slug, target, task.branch]);
  }
  if (!ownedWorktree(root, target, child.slug)) throw new Error(`Child worktree ${target} was not created for owned branch ${child.slug}`);
  const dir = childTaskDir;
  fs.mkdirSync(dir, { recursive: true });
  const source = fs.readFileSync(path.join(child.taskDir, 'task.md'));
  const file = path.join(dir, 'task.md');
  if (!fs.existsSync(file)) fs.writeFileSync(file, source, { flag: 'wx' });
  else if (!fs.readFileSync(file).equals(source)) throw new Error(`Child task changed in ${dir}; refusing to overwrite it`);
  if (fs.existsSync(path.join(child.taskDir, 'index.json'))) {
    readArtifactIndex(child.taskDir);
    initTaskArtifacts(dir);
  }
  writeJson(markerFile, { ...readJson(markerFile), phase: 'task-written' });
  return dir;
}
