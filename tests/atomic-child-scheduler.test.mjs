import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { childBatches, childCompletionSnapshot, childJoinSummary, joinChildren } from '../atomic/lib/child-scheduler.mjs';
import { observeArtifacts } from '../atomic/lib/artifacts.mjs';
import { revision, saveRecord } from '../atomic/lib/workspace.mjs';

const child = (slug, write_paths, depends_on = []) => ({ slug, write_paths, depends_on });

test('test fixture concurrency batches independent children together', () => {
  const children = [child('api', ['src/api']), child('ui', ['src/ui'])];

  assert.deepEqual(childBatches(['api', 'ui'], children, 2), [['api', 'ui']]);
  assert.deepEqual(childBatches(['api', 'ui'], children), [['api'], ['ui']]);
});

test('dependency and overlapping path ownership serialize children', () => {
  const children = [
    child('base', ['src/shared'], []),
    child('dependent', ['src/other'], ['base']),
    child('overlap', ['src/shared/handler.ts']),
    child('independent', ['docs/guide']),
  ];

  assert.deepEqual(childBatches(['base', 'dependent', 'overlap', 'independent'], children, 2), [
    ['base', 'independent'],
    ['dependent', 'overlap'],
  ]);
});

test('unknown ownership serializes children conservatively', () => {
  const children = [child('known', ['src/known']), { slug: 'unknown', depends_on: [] }];

  assert.deepEqual(childBatches(['known', 'unknown'], children, 2), [['known'], ['unknown']]);
});

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function joinedFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-child-join-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'Child Join Test');
  const taskRoot = path.join(root, '.agents', 'tasks');
  const parentDir = path.join(taskRoot, 'epic');
  fs.mkdirSync(parentDir, { recursive: true });
  fs.writeFileSync(path.join(parentDir, 'task.md'), 'Epic\n');
  const children = ['api', 'ui'].map(slug => {
    const taskDir = path.join(taskRoot, slug);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'task.md'), `Child ${slug}\n`);
    return { slug, taskDir, write_paths: [`src/${slug}`] };
  });
  git(root, 'add', '.agents');
  git(root, 'commit', '-m', 'Create epic tasks');
  const baseHead = git(root, 'rev-parse', 'HEAD');
  t.after(() => {
    for (const slug of ['api', 'ui']) git(root, 'worktree', 'remove', '--force', path.join(root, `worktree-${slug}`));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const records = new Map();
  for (const child of children) {
    const worktree = path.join(root, `worktree-${child.slug}`);
    git(root, 'worktree', 'add', '-b', child.slug, worktree, 'main');
    const childDir = path.join(worktree, '.agents', 'tasks', child.slug);
    fs.writeFileSync(path.join(childDir, '01-code-review.md'), '---\ntype: code-review\nstatus: clean\nsummary: Review clean\n---\n# Review\n\n## Critical and Required Findings\n\nNone.\n');
    fs.writeFileSync(path.join(childDir, '02-evidence.md'), '---\ntype: evidence\nstatus: passed\nsummary: Evidence captured\n---\n# Evidence\n\nCaptured behavior.\n');
    fs.writeFileSync(path.join(childDir, 'pr-description.md'), `## Purpose\n\nDeliver ${child.slug}.\n\n## Change outline\n\n- Implement ${child.slug}.\n`);
    fs.mkdirSync(path.join(worktree, 'src'));
    fs.writeFileSync(path.join(worktree, 'src', `${child.slug}.js`), `export const ${child.slug} = true;\n`);
    git(worktree, 'add', '.agents', 'src');
    git(worktree, 'commit', '-m', `Finish ${child.slug}`);
    const observation = observeArtifacts(childDir);
    const codeRevision = revision(worktree, '.agents/tasks');
    const proof = childCompletionSnapshot({
      ...observation, revision: codeRevision, generation: 1, approvals: {},
      proofs: Object.fromEntries(['code-review', 'evidence', 'pr-description'].map(type => [
        type, { hash: observation.latest[type].hash, revision: codeRevision, generation: 1 },
      ])),
    }, { cwd: worktree, taskDir: childDir }, 'none');
    records.set(child.slug, { childDir, baseHead, result: { status: 'completed', outputs: { status: 'completed', completion: proof } } });
  }
  const task = { cwd: root, taskDir: parentDir, taskRootRelative: '.agents/tasks', runId: 'join-fixture' };
  for (const [slug, record] of records) saveRecord(task, `child-${slug}`, record);
  return { root, task, children, records };
}

test('squash-equivalent child commits join only when source and indexed proof match the parent', t => {
  const {root, task, children, records} = joinedFixture(t);
  git(root, 'cherry-pick', 'api');
  git(root, 'cherry-pick', 'ui');
  assert.equal(joinChildren(task, children, records).complete, true);
  fs.writeFileSync(path.join(root, 'src', 'ui.js'), 'export const ui = false;\n');
  git(root, 'add', 'src/ui.js');
  git(root, 'commit', '-m', 'Change merged UI behavior');
  const stale = joinChildren(task, children, records);
  assert.equal(stale.complete, false);
  assert.match(stale.children[1].reasons.join(' '), /source differs from the completed child/);
});

test('a missing child fork revision cannot certify a squash merge', t => {
  const {root, task, children, records} = joinedFixture(t);
  git(root, 'cherry-pick', 'api');
  git(root, 'cherry-pick', 'ui');
  records.set('ui', {...records.get('ui'), baseHead: null});
  const joined = joinChildren(task, children, records);
  assert.equal(joined.complete, false);
  assert.match(joined.children[1].reasons.join(' '), /lacks its fork revision/);
});

test('two successful native child runs join only after each merge, retaining isolated fixture worktrees', t => {
  const { root, task, children, records } = joinedFixture(t);
  assert.deepEqual(joinChildren(task, children, records).children.map(outcome => outcome.complete), [false, false]);
  git(root, 'merge', '--no-ff', '-m', 'Merge api', 'api');
  assert.deepEqual(joinChildren(task, children, records).children.map(outcome => outcome.complete), [true, false]);
  git(root, 'merge', '--no-ff', '-m', 'Merge ui', 'ui');
  const joined = joinChildren(task, children, records);
  assert.equal(joined.complete, true);
  assert.deepEqual(joined.children.map(outcome => outcome.slug), ['api', 'ui']);
  assert.equal(joinChildren(task, children).complete, true);
});

test('failed sibling holds whole wave without claiming the successful sibling delivered', t => {
  const { root, task, children, records } = joinedFixture(t);
  git(root, 'merge', '--no-ff', '-m', 'Merge api', 'api');
  git(root, 'merge', '--no-ff', '-m', 'Merge ui', 'ui');
  records.set('ui', { ...records.get('ui'), result: { status: 'blocked', outputs: { status: 'blocked' } } });
  saveRecord(task, 'child-ui', records.get('ui'));
  const joined = joinChildren(task, children, records);
  assert.equal(joined.complete, false);
  assert.deepEqual(joined.children.map(outcome => outcome.complete), [true, false]);
  assert.match(childJoinSummary(joined), /api: proof and merge verified; whole wave held/);
  assert.match(childJoinSummary(joined), /ui: native child run did not complete/);
  assert.equal(joinChildren(task, children).complete, false);
});

test('stale child artifact or approval hash blocks join despite committed merge', t => {
  const { root, task, children, records } = joinedFixture(t);
  git(root, 'merge', '--no-ff', '-m', 'Merge api', 'api');
  git(root, 'merge', '--no-ff', '-m', 'Merge ui', 'ui');
  fs.appendFileSync(path.join(records.get('ui').childDir, 'pr-description.md'), '\nUnapproved replacement.\n');
  const stale = joinChildren(task, children, records);
  assert.equal(stale.complete, false);
  assert.match(stale.children[1].reasons.join(' '), /pr-description artifact is stale/);
  const proof = records.get('api').result.outputs.completion;
  proof.gates = 'pr';
  assert.match(joinChildren(task, children, records).children[0].reasons.join(' '), /pr-description approval is missing/);
});

test('without comparable live spend provenance production scheduling stays at one', () => {
  const children = [child('api', ['src/api']), child('ui', ['src/ui'])];
  assert.deepEqual(childBatches(['api', 'ui'], children), [['api'], ['ui']]);
});
