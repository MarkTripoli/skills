import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { childrenFor, childWave, ensureTask, prepareChild, revision } from '../atomic/lib/workspace.mjs';
import { initTaskArtifacts, recordArtifact, reserveArtifactIteration } from '../shared/task-artifacts.mjs';

function runGit(cwd, args, optional = false) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) { if (optional) return null; throw error; }
}

function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-workspace-storage-'));
  runGit(root, ['init', '-b', 'main']);
  runGit(root, ['config', 'user.email', 'atomic-test@example.invalid']);
  runGit(root, ['config', 'user.name', 'Atomic Test']);
  fs.writeFileSync(path.join(root, 'README.md'), 'test\n');
  runGit(root, ['add', 'README.md']);
  runGit(root, ['commit', '-m', 'initial']);
  t.after(() => {
    for (const worktree of runGit(root, ['worktree', 'list', '--porcelain'], true)?.matchAll(/^worktree (.+)$/gm) ?? []) {
      if (path.resolve(worktree[1]) !== path.resolve(root)) runGit(root, ['worktree', 'remove', '--force', worktree[1]], true);
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function taskDocument({ slug, workflow = 'oneshot', parent = null, request = 'Task request' }) {
  return `---\nslug: ${JSON.stringify(slug)}\nworkflow: ${JSON.stringify(workflow)}\n${parent ? `parent: ${JSON.stringify(parent)}\n` : ''}---\n${request}\n`;
}

test('explicit task_dir bypasses repository task-root discovery and reports its effective root', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- skills:task-root=one -->\n<!-- skills:task-root=two -->\n');
  const taskRoot = path.join(root, 'explicit', 'tasks');
  const taskDir = path.join(taskRoot, 'existing-task');
  fs.mkdirSync(path.join(root, '.agents', 'skills'), { recursive: true });
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'task.md'), taskDocument({ slug: 'existing-task', request: 'Existing task' }));

  const task = ensureTask({ task_dir: taskDir }, root, 'explicit-run', 'full');

  assert.equal(task.taskDir, fs.realpathSync(taskDir));
  assert.equal(task.taskRoot, fs.realpathSync(taskRoot));
  assert.equal(task.taskRootRelative, 'explicit/tasks');
  assert.equal(task.skillsDir, path.join(fs.realpathSync(root), '.agents', 'skills'));
  assert.equal(fs.existsSync(path.join(taskDir, 'index.json')), false);
});

test('ensureTask creates a new task under the source repository configured root', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- skills:task-root=delivery/tasks -->\n');
  runGit(root, ['add', 'AGENTS.md']);
  runGit(root, ['commit', '-m', 'configure task storage']);

  const task = ensureTask({ request: 'Create configured task' }, root, `configured-${Date.now()}`, 'oneshot');

  assert.equal(task.taskDir, path.join(task.cwd, 'delivery', 'tasks', task.slug));
  assert.equal(task.taskRoot, path.join(task.cwd, 'delivery', 'tasks'));
  assert.equal(task.taskRootRelative, 'delivery/tasks');
  assert.equal(fs.existsSync(path.join(task.taskDir, 'task.md')), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(task.taskDir, 'index.json'), 'utf8')), {
    $schema: 'skills.task-index/v1',
    schemaVersion: 1,
    task: task.slug,
    generation: 0,
    artifactSeries: {},
  });
  assert.equal(fs.existsSync(path.join(task.cwd, 'AGENTS.md')), true);
  const before = revision(task.cwd, task.taskRootRelative);
  fs.writeFileSync(path.join(task.taskDir, '01-research.md'), 'artifact write\n');
  assert.equal(revision(task.cwd, task.taskRootRelative), before);
});

test('prepareChild mirrors the parent effective root and childrenFor keeps sibling discovery', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '<!-- skills:task-root=delivery/tasks -->\n');
  runGit(root, ['add', 'CLAUDE.md']);
  runGit(root, ['commit', '-m', 'configure child task storage']);
  const parent = ensureTask({ request: 'Deliver epic children' }, root, `epic-${Date.now()}`, 'epic');
  const childDir = path.join(parent.taskRoot, 'child-one');
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(path.join(childDir, 'task.md'), taskDocument({ slug: 'child-one', parent: parent.slug, request: 'Implement child' }));

  const [child] = childrenFor(parent);
  const prepared = prepareChild(parent, child);

  assert.equal(child.taskDir, childDir);
  assert.equal(prepared, path.join(os.homedir(), '.agents', 'worktrees', path.basename(parent.cwd), child.slug, 'delivery', 'tasks', child.slug));
  assert.equal(fs.existsSync(path.join(prepared, 'task.md')), true);
  assert.equal(fs.existsSync(path.join(prepared, 'index.json')), false);
});

test('prepareChild initializes an empty index only when the source child is indexed', t => {
  const root = repository(t);
  const parent = ensureTask({ request: 'Deliver indexed children' }, root, `indexed-epic-${Date.now()}`, 'epic');
  const childDir = path.join(parent.taskRoot, 'indexed-child');
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(path.join(childDir, 'task.md'), taskDocument({ slug: 'indexed-child', parent: parent.slug, request: 'Implement indexed child' }));
  initTaskArtifacts(childDir);
  const artifact = path.join(childDir, reserveArtifactIteration(childDir, 'research', 'primary').writePath);
  fs.writeFileSync(artifact, '---\ntype: research\nsummary: Source-only evidence\n---\n# Research\n\nDo not copy this evidence.\n');
  recordArtifact(childDir, 'research', 'primary', 'research', artifact);

  const prepared = prepareChild(parent, childrenFor(parent)[0]);
  const preparedIndex = JSON.parse(fs.readFileSync(path.join(prepared, 'index.json'), 'utf8'));

  assert.equal(preparedIndex.task, 'indexed-child');
  assert.equal(preparedIndex.generation, 0);
  assert.deepEqual(preparedIndex.artifactSeries, {});
  assert.equal(fs.existsSync(path.join(prepared, 'artifacts')), false);
});

test('childWave accepts committed indexed PR evidence and ignores uncommitted replacements', t => {
  const root = repository(t);
  const taskRoot = path.join(root, '.agents', 'tasks');
  const parentDir = path.join(taskRoot, 'parent');
  const childDir = path.join(taskRoot, 'indexed-child');
  fs.mkdirSync(parentDir, { recursive: true });
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(path.join(parentDir, 'task.md'), taskDocument({ slug: 'parent', workflow: 'epic' }));
  fs.writeFileSync(path.join(childDir, 'task.md'), taskDocument({ slug: 'indexed-child', parent: 'parent' }));
  initTaskArtifacts(childDir);
  const staging = path.join(childDir, reserveArtifactIteration(childDir, 'pull-request', 'description').writePath);
  fs.writeFileSync(staging, '# PR\n\n## Purpose\n\nCommitted purpose.\n\n## Change outline\n\n- Committed outline.\n');
  const record = recordArtifact(childDir, 'pull-request', 'description', 'pr-description', staging);
  const description = path.join(childDir, record.path);
  runGit(root, ['add', '.agents']);
  runGit(root, ['commit', '-m', 'merge indexed child evidence']);
  fs.writeFileSync(description, '# PR\n\nUncommitted invalid replacement.\n');
  const task = { cwd: root, taskDir: parentDir, slug: 'parent' };

  assert.deepEqual(childWave(task, childrenFor(task)), { done: ['indexed-child'], started: [], ready: [], blocked: [] });
});

test('childWave fails closed when committed indexed PR evidence is invalid', t => {
  const root = repository(t);
  const taskRoot = path.join(root, '.agents', 'tasks');
  const parentDir = path.join(taskRoot, 'parent');
  const childDir = path.join(taskRoot, 'indexed-child');
  fs.mkdirSync(parentDir, { recursive: true });
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(path.join(parentDir, 'task.md'), taskDocument({ slug: 'parent', workflow: 'epic' }));
  fs.writeFileSync(path.join(childDir, 'task.md'), taskDocument({ slug: 'indexed-child', parent: 'parent' }));
  initTaskArtifacts(childDir);
  const staging = path.join(childDir, reserveArtifactIteration(childDir, 'pull-request', 'description').writePath);
  fs.writeFileSync(staging, '# PR\n\n## Purpose\n\nPurpose.\n\n## Change outline\n\n- Outline.\n');
  recordArtifact(childDir, 'pull-request', 'description', 'pr-description', staging);
  const indexFile = path.join(childDir, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  index.artifactSeries['pull-request.description'].iterations[0].sha256 = '0'.repeat(64);
  fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  fs.writeFileSync(path.join(childDir, 'pr-description.md'), '# PR\n\n## Purpose\n\nLegacy.\n\n## Change outline\n\n- Must not bypass index.\n');
  runGit(root, ['add', '.agents']);
  runGit(root, ['commit', '-m', 'merge invalid indexed child evidence']);
  const task = { cwd: root, taskDir: parentDir, slug: 'parent' };

  assert.throws(() => childWave(task, childrenFor(task)), /hash|digest|indexed/i);
});

test('childWave validates every committed indexed record from git objects', t => {
  const root = repository(t);
  const taskRoot = path.join(root, '.agents', 'tasks');
  const parentDir = path.join(taskRoot, 'parent');
  const childDir = path.join(taskRoot, 'indexed-child');
  fs.mkdirSync(parentDir, { recursive: true });
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(path.join(parentDir, 'task.md'), taskDocument({ slug: 'parent', workflow: 'epic' }));
  fs.writeFileSync(path.join(childDir, 'task.md'), taskDocument({ slug: 'indexed-child', parent: 'parent' }));
  initTaskArtifacts(childDir);
  const research = path.join(childDir, reserveArtifactIteration(childDir, 'research', 'primary').writePath);
  fs.writeFileSync(research, '---\ntype: research\nsummary: Committed research\n---\n# Research\n\nEvidence.\n');
  const researchRecord = recordArtifact(childDir, 'research', 'primary', 'research', research);
  const description = path.join(childDir, reserveArtifactIteration(childDir, 'pull-request', 'description').writePath);
  fs.writeFileSync(description, '# PR\n\n## Purpose\n\nPurpose.\n\n## Change outline\n\n- Outline.\n');
  recordArtifact(childDir, 'pull-request', 'description', 'pr-description', description);
  fs.rmSync(path.join(childDir, researchRecord.path));
  runGit(root, ['add', '.agents']);
  runGit(root, ['commit', '-m', 'merge child with dangling unrelated evidence']);
  const task = { cwd: root, taskDir: parentDir, slug: 'parent' };

  assert.throws(() => childWave(task, childrenFor(task)), /missing|dangling|research/i);
});

test('childWave retains committed legacy PR description fallback when no index exists', t => {
  const root = repository(t);
  const taskRoot = path.join(root, '.agents', 'tasks');
  const parentDir = path.join(taskRoot, 'parent');
  const childDir = path.join(taskRoot, 'legacy-child');
  fs.mkdirSync(parentDir, { recursive: true });
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(path.join(parentDir, 'task.md'), taskDocument({ slug: 'parent', workflow: 'epic' }));
  fs.writeFileSync(path.join(childDir, 'task.md'), taskDocument({ slug: 'legacy-child', parent: 'parent' }));
  fs.writeFileSync(path.join(childDir, 'pr-description.md'), '# PR\n\n## Purpose\n\nLegacy purpose.\n\n## Change outline\n\n- Legacy outline.\n');
  runGit(root, ['add', '.agents']);
  runGit(root, ['commit', '-m', 'merge legacy child evidence']);
  const task = { cwd: root, taskDir: parentDir, slug: 'parent' };

  assert.deepEqual(childWave(task, childrenFor(task)), { done: ['legacy-child'], started: [], ready: [], blocked: [] });
});

test('ensureTask resolves task root and project skills from the selected base', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- skills:task-root=main/tasks -->\n');
  runGit(root, ['add', 'AGENTS.md']);
  runGit(root, ['commit', '-m', 'configure main']);
  runGit(root, ['switch', '-c', 'alternate']);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- skills:task-root=alternate/tasks -->\n');
  fs.mkdirSync(path.join(root, '.agents', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'skills', '.keep'), 'project skills\n');
  runGit(root, ['add', 'AGENTS.md', '.agents/skills/.keep']);
  runGit(root, ['commit', '-m', 'configure alternate']);
  runGit(root, ['switch', 'main']);

  const task = ensureTask({ request: 'Use alternate declarations', base: 'alternate' }, root, `alternate-${Date.now()}`, 'oneshot');

  assert.equal(task.taskRootRelative, 'alternate/tasks');
  assert.equal(task.taskDir, path.join(task.cwd, 'alternate', 'tasks', task.slug));
  assert.equal(task.skillsDir, path.join(task.cwd, '.agents', 'skills'));
});

test('revision ignores writes beneath the configured task root', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- skills:task-root=delivery/tasks -->\n');
  runGit(root, ['add', 'AGENTS.md']);
  runGit(root, ['commit', '-m', 'configure task storage']);
  const before = revision(root);
  fs.mkdirSync(path.join(root, 'delivery', 'tasks', 'example'), { recursive: true });
  fs.writeFileSync(path.join(root, 'delivery', 'tasks', 'example', 'task.md'), 'artifact write\n');

  assert.equal(revision(root), before);
});

test('revision honors an explicit legacy task root over a different repository declaration', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- skills:task-root=delivery/tasks -->\n');
  runGit(root, ['add', 'AGENTS.md']);
  runGit(root, ['commit', '-m', 'configure task storage']);
  const taskDir = path.join(root, 'legacy', 'tasks', 'existing-task');
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'task.md'), taskDocument({ slug: 'existing-task', request: 'Existing legacy task' }));
  const task = ensureTask({ task_dir: taskDir }, root, 'legacy-run', 'oneshot');
  const before = revision(task.cwd, task.taskRootRelative);

  fs.writeFileSync(path.join(task.taskDir, '01-research.md'), 'legacy artifact write\n');

  assert.equal(task.taskRootRelative, 'legacy/tasks');
  assert.equal(revision(task.cwd, task.taskRootRelative), before);
});

test('revision validates an explicit effective task root', t => {
  const root = repository(t);

  assert.throws(() => revision(root, 'Legacy/Tasks'), /portable/i);
});
