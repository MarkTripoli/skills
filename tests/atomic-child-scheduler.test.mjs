import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { childBatches, childCompletionSnapshot, childJoinSummary, joinChildren } from '../atomic/lib/child-scheduler.mjs';
import { observeArtifacts } from '../atomic/lib/artifacts.mjs';
import { childWave, revision, saveRecord } from '../atomic/lib/workspace.mjs';
import { initTaskArtifacts, readArtifactIndex, recordArtifact, reserveArtifactIteration } from '../shared/task-artifacts.mjs';

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

test('squash-equivalent child commits join when source and proof match a parent integration point', t => {
  const { root, task, children, records } = joinedFixture(t);
  git(root, 'cherry-pick', 'api');
  git(root, 'cherry-pick', 'ui');
  assert.equal(joinChildren(task, children, records).complete, true);
});

test('an integrated child stays complete after a dependent child changes its source file', t => {
  const { root, task, children, records } = joinedFixture(t);
  git(root, 'cherry-pick', 'api');
  const baseHead = git(root, 'rev-parse', 'HEAD');
  const uiWorktree = path.join(root, 'worktree-ui');
  git(uiWorktree, 'rebase', 'main');
  fs.writeFileSync(path.join(uiWorktree, 'src', 'api.js'), 'export const api = "extended by ui";\n');
  git(uiWorktree, 'add', 'src/api.js');
  git(uiWorktree, 'commit', '-m', 'Extend API for UI');
  const childDir = records.get('ui').childDir;
  const observation = observeArtifacts(childDir);
  const codeRevision = revision(uiWorktree, '.agents/tasks');
  const completion = childCompletionSnapshot({
    ...observation, revision: codeRevision, generation: 1, approvals: {},
    proofs: Object.fromEntries(['code-review', 'evidence', 'pr-description'].map(type => [
      type, { hash: observation.latest[type].hash, revision: codeRevision, generation: 1 },
    ])),
  }, { cwd: uiWorktree, taskDir: childDir }, 'none');
  records.set('ui', { ...records.get('ui'), baseHead, result: { status: 'completed', outputs: { status: 'completed', completion } } });
  git(root, 'cherry-pick', git(uiWorktree, 'rev-parse', 'HEAD^'));
  git(root, 'cherry-pick', 'ui');

  const joined = joinChildren(task, children, records);
  assert.equal(joined.complete, true);
  assert.deepEqual(joined.children.map(outcome => outcome.complete), [true, true]);
  assert.equal(git(root, 'show', 'HEAD:src/api.js'), 'export const api = "extended by ui";');
});

test('matching parent source without merged child proof cannot spoof integration', t => {
  const { root, task, children, records } = joinedFixture(t);
  git(root, 'cherry-pick', 'api');
  fs.copyFileSync(path.join(root, 'worktree-ui', 'src', 'ui.js'), path.join(root, 'src', 'ui.js'));
  git(root, 'add', 'src/ui.js');
  git(root, 'commit', '-m', 'Copy UI source without its completion');
  const joined = joinChildren(task, children, records);
  assert.deepEqual(joined.children.map(outcome => outcome.complete), [true, false]);
});

test('changed child branch cannot reuse its earlier completion', t => {
  const { root, task, children, records } = joinedFixture(t);
  git(root, 'cherry-pick', 'api');
  git(root, 'cherry-pick', 'ui');
  const uiWorktree = path.join(root, 'worktree-ui');
  fs.writeFileSync(path.join(uiWorktree, 'src', 'ui.js'), 'export const ui = false;\n');
  git(uiWorktree, 'add', 'src/ui.js');
  git(uiWorktree, 'commit', '-m', 'Change UI after completion');
  const joined = joinChildren(task, children, records);
  assert.equal(joined.complete, false);
  assert.match(joined.children[1].reasons.join(' '), /child code revision differs from completed run/);
});

test('historical integration does not excuse missing current committed completion evidence', t => {
  const { root, task, children, records } = joinedFixture(t);
  git(root, 'cherry-pick', 'api');
  git(root, 'cherry-pick', 'ui');
  git(root, 'rm', '.agents/tasks/ui/pr-description.md');
  git(root, 'commit', '-m', 'Remove UI completion evidence');
  const joined = joinChildren(task, children, records);
  assert.equal(joined.complete, false);
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

test('ignored child task proof joins only through its merged PR and hosted evidence', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-child-join-'));
  const worktree = path.join(root, 'child-worktree');
  git(root, 'init', '-b', 'epic');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'Hosted Child Test');
  fs.writeFileSync(path.join(root, '.gitignore'), '/.agents/tasks/\n');
  fs.writeFileSync(path.join(root, 'source.txt'), 'base\n');
  git(root, 'add', '.gitignore', 'source.txt');
  git(root, 'commit', '-m', 'Create epic');
  const baseHead = git(root, 'rev-parse', 'HEAD');
  git(root, 'worktree', 'add', '-b', 'api', worktree, 'epic');
  t.after(() => {
    git(root, 'worktree', 'remove', '--force', worktree);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const childDir = path.join(worktree, '.agents', 'tasks', 'api');
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(path.join(childDir, 'task.md'), '---\nslug: api\nworkflow: full\n---\n');
  initTaskArtifacts(childDir);
  fs.mkdirSync(path.join(worktree, 'src'));
  fs.writeFileSync(path.join(worktree, 'src', 'api.js'), 'export const api = true;\n');
  git(worktree, 'add', 'src/api.js');
  git(worktree, 'commit', '-m', 'Implement API');
  const head = git(worktree, 'rev-parse', 'HEAD');
  const captureUrl = 'https://captures.example.test/api.txt';
  const commentUrl = 'https://github.com/owner/repo/pull/7#issuecomment-123';
  const body = `## Purpose\n\nPublish API behavior.\n\n## Evidence\n\n- ${captureUrl}\n- ${commentUrl}\n\n## Change outline\n\n- Implement API.\n`;
  const addProof = (type, text) => {
    const allocation = reserveArtifactIteration(childDir, {
      'code-review': 'review', evidence: 'evidence', 'pr-description': 'pull-request',
    }[type], {
      'code-review': 'code', evidence: 'recording', 'pr-description': 'description',
    }[type]);
    const file = path.join(childDir, allocation.writePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    recordArtifact(childDir, allocation.kind, allocation.variant, type, allocation.writePath);
  };
  addProof('code-review', `---\ntype: code-review\nstatus: clean\nsummary: Clean review\nbase_branch: epic\nbase_sha: ${baseHead}\nhead_sha: ${head}\n---\n\n## Critical and Required Findings\n\nNone.\n`);
  addProof('evidence', `---\ntype: evidence\nstatus: passed\nsummary: API captured\n---\n\n## Revision\n\n- commit: ${head}\n\n## Posted to\n\n- PR description: ${captureUrl}\n- PR comment: ${commentUrl}\n`);
  addProof('pr-description', body);
  const observation = observeArtifacts(childDir);
  const codeRevision = revision(worktree, '.agents/tasks');
  const proof = childCompletionSnapshot({
    ...observation, revision: codeRevision, generation: readArtifactIndex(childDir).generation, approvals: {},
    proofs: Object.fromEntries(['code-review', 'evidence', 'pr-description'].map(type => [
      type, { hash: observation.latest[type].hash, revision: codeRevision, generation: readArtifactIndex(childDir).generation },
    ])),
  }, { cwd: worktree, taskDir: childDir }, 'none');
  const record = { childDir, baseHead, result: { status: 'completed', outputs: { status: 'completed', completion: proof } } };
  const parentDir = path.join(root, '.agents', 'tasks', 'epic');
  fs.mkdirSync(parentDir, { recursive: true });
  fs.writeFileSync(path.join(parentDir, 'task.md'), 'Epic\n');
  const task = { cwd: root, branch: 'epic', taskDir: parentDir, taskRootRelative: '.agents/tasks', runId: 'hosted-join' };
  const api = { slug: 'api', taskDir: path.join(root, '.agents', 'tasks', 'api'), depends_on: [], write_paths: ['src/api.js'] };
  assert.equal(git(root, 'ls-files', '.agents/tasks'), '');
  git(root, 'merge', '--no-ff', '-m', 'Merge API', 'api');
  const merged = git(root, 'rev-parse', 'HEAD');
  const pr = { number: 7, headRefName: 'api', headRefOid: head, baseRefName: 'epic',
    mergeCommit: { oid: merged }, mergedAt: '2026-09-27T00:00:00Z', url: 'https://github.com/owner/repo/pull/7' };
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\ncase "$1 $2" in\n  "pr list") printf %s "$GH_LIST_JSON" ;;\n  "pr view") printf %s "$GH_PR_JSON" ;;\n  "repo view") printf %s \'{"nameWithOwner":"owner/repo"}\' ;;\n  "api repos/owner/repo/issues/comments/123") printf %s "$GH_COMMENT_JSON" ;;\n  *) exit 2 ;;\nesac\n');
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  const fetchStub = path.join(root, 'fetch-stub.mjs');
  fs.writeFileSync(fetchStub, `globalThis.fetch = async () => ({ ok: true, url: '${captureUrl}' });\n`);
  const keys = ['PATH', 'NODE_OPTIONS', 'GH_LIST_JSON', 'GH_PR_JSON', 'GH_COMMENT_JSON'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; });
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.NODE_OPTIONS = `--import=${fetchStub}`;
  process.env.GH_LIST_JSON = JSON.stringify([pr]);
  process.env.GH_PR_JSON = JSON.stringify({ url: pr.url, number: 7, headRefOid: head,
    baseRefName: 'epic', baseRefOid: baseHead, isDraft: false, body });
  process.env.GH_COMMENT_JSON = JSON.stringify({ id: 123, html_url: commentUrl,
    body: `passed ${captureUrl} tested ${head} head ${head}` });
  assert.deepEqual(childWave(task, [api]).done, ['api']);
  assert.equal(joinChildren(task, [api], new Map([['api', record]])).complete, true);
  process.env.GH_COMMENT_JSON = JSON.stringify({ id: 123, html_url: commentUrl, body: 'Missing capture' });
  assert.equal(joinChildren(task, [api], new Map([['api', record]])).complete, false);
  assert.throws(() => childWave(task, [api], [{ ...pr, mergeCommit: { oid: baseHead } }]), /no matching source/);
});
