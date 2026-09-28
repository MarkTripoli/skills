import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { childBatches, childCompletionSnapshot, joinChildren } from '../atomic/lib/child-scheduler.mjs';
import { observeArtifacts } from '../atomic/lib/artifacts.mjs';
import { childWave, revision } from '../atomic/lib/workspace.mjs';
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
  const captureUrl = 'https://gist.githubusercontent.com/owner/0123456789abcdef0123456789abcdef/raw/1234567890abcdef0123456789abcdef01234567/api.txt';
  const commentUrl = 'https://github.com/owner/repo/pull/7#issuecomment-123';
  const body = `## Purpose\n\nPublish API behavior.\n\n## Special things to note\n\n- None.\n\n## Evidence\n\n- result: passed\n- tested: ${head}\n- current head: ${head}\n- recording: api-probe\n- capture: ${captureUrl}\n- comment: ${commentUrl}\n\n### Recorded tests\n\n| Test | Result | Capture | Cue |\n|---|---|---|---|\n| API request returns expected result | passed | primary | output line 4: observed API result |\n\n## Change outline\n\n- Implement API.\n\n## Human Review\n\n### Review targets\n\n- Inspect API behavior.\n\n### Verify\n\n- [ ] Confirm API result.\n\n### Known limits\n\n- None.\n`;
  const addProof = (type, text) => {
    const allocation = reserveArtifactIteration(childDir, 'review', 'code');
    const file = path.join(childDir, allocation.writePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    recordArtifact(childDir, allocation.kind, allocation.variant, type, allocation.writePath);
  };
  addProof('code-review', `---\ntype: code-review\nstatus: clean\nsummary: Clean review\nbase_branch: epic\nbase_sha: ${baseHead}\nhead_sha: ${head}\n---\n\n## Critical and Required Findings\n\nNone.\n`);
  // Neither the capture nor a copy of the PR body is a task artifact.
  const observation = observeArtifacts(childDir);
  const codeRevision = revision(worktree, '.agents/tasks');
  const proof = childCompletionSnapshot({
    ...observation, revision: codeRevision, generation: readArtifactIndex(childDir).generation, approvals: {},
    proofs: { 'code-review': { hash: observation.latest['code-review'].hash,
      revision: codeRevision, generation: readArtifactIndex(childDir).generation } },
    hosted: { pullRequest: 'https://github.com/owner/repo/pull/7', head, tested: head, ready: true },
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
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\ncase "$1 $2" in\n  "pr list") printf %s "$GH_LIST_JSON" ;;\n  "pr view") printf %s "$GH_PR_JSON" ;;\n  "repo view") printf %s \'{"nameWithOwner":"owner/repo"}\' ;;\n  "api --paginate") if [ "$3" = "--slurp" ] && [ "$4" = "repos/owner/repo/commits/$GH_HEAD/check-runs?per_page=100" ]; then printf %s "$GH_CHECK_PAGES"; else exit 2; fi ;;\n  "api repos/owner/repo/issues/comments/123") printf %s "$GH_COMMENT_JSON" ;;\n  *) exit 2 ;;\nesac\n');
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  const fetchStub = path.join(root, 'fetch-stub.mjs');
  fs.writeFileSync(fetchStub, `globalThis.fetch = async () => ({ ok: true, status: 200, url: '${captureUrl}', headers: new Headers({ 'content-type': 'text/plain' }), body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('Source SHA: ${head}\\nRequest: GET /api/items\\nStatus: 200\\nResponse body: observed API result')); controller.close(); } }) });\n`);
  const keys = ['PATH', 'NODE_OPTIONS', 'GH_LIST_JSON', 'GH_PR_JSON', 'GH_COMMENT_JSON', 'GH_HEAD', 'GH_CHECK_PAGES'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; });
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.NODE_OPTIONS = `--import=${fetchStub}`;
  process.env.GH_LIST_JSON = JSON.stringify([pr]);
  process.env.GH_PR_JSON = JSON.stringify({ url: pr.url, number: 7, headRefOid: head,
    baseRefName: 'epic', baseRefOid: baseHead, isDraft: false, body });
  process.env.GH_HEAD = head;
  process.env.GH_CHECK_PAGES = JSON.stringify([{ total_count: 2, check_runs: ['test', 'Conventional Commits']
    .map((name, index) => ({ id: index + 1, name, head_sha: head, status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } })) }]);
  process.env.GH_COMMENT_JSON = JSON.stringify({ id: 123, html_url: commentUrl,
    body: `- result: passed\n- tested: ${head}\n- current head: ${head}\n- recording: api-probe\n- capture: ${captureUrl}` });
  assert.deepEqual(childWave(task, [api]).done, ['api']);
  assert.equal(joinChildren(task, [api], new Map([['api', record]])).complete, true);
  process.env.GH_COMMENT_JSON = JSON.stringify({ id: 123, html_url: commentUrl, body: 'Missing capture' });
  assert.equal(joinChildren(task, [api], new Map([['api', record]])).complete, false);
  assert.throws(() => childWave(task, [api], [{ ...pr, mergeCommit: { oid: baseHead } }]), /no matching source/);
});
