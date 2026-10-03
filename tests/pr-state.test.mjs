import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve('skills/delivery/resolve-pr-reviews/scripts/pr-state.mjs');

// A stub `glab` on PATH answers `glab api` from a fixture keyed by endpoint; a null value fails with that status.
function stubbed(fixture, headShas = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-state-'));
  fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify({fixture, headShas}));
  fs.writeFileSync(path.join(dir, 'glab'), `#!/usr/bin/env node
import fs from 'node:fs';
const state = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(dir, 'fixture.json'))}, 'utf8'));
const endpoint = process.argv.slice(2).find(a => a.startsWith('projects/'));
if (endpoint === 'projects/:id/merge_requests/7' && state.headShas.length) {
  state.fixture[endpoint].sha = state.headShas.shift();
  fs.writeFileSync(${JSON.stringify(path.join(dir, 'fixture.json'))}, JSON.stringify(state));
}
const value = state.fixture[endpoint];
if (typeof value === 'number') { console.error('glab: HTTP ' + value); process.exit(1); }
console.log(JSON.stringify(value));
`, {mode: 0o755});
  return dir;
}

const pr = {iid: 7, web_url: 'https://example.test/pull/7', target_branch: 'main', sha: 'h1', diff_refs: {base_sha: 'b0'}, head_pipeline: {id: 9, status: 'success', sha: 'h1'}};
const note = (id, extra) => ({id, body: 'fix this', author: {username: 'rev'}, resolvable: true, resolved: false, ...extra});
const base = {
  'projects/:id/merge_requests': [{iid: 7}],
  'projects/:id/merge_requests/7': pr,
  'projects/:id/merge_requests/7/discussions': [
    {id: 'd1', notes: [note(1), note(2, {body: 'reply'})]},
    {id: 'd2', notes: [note(3, {resolved: true})]},
    {id: 'd3', notes: [{id: 4, body: 'system', author: {username: 'bot'}, resolvable: false, resolved: false}]},
  ],
  'projects/:id/merge_requests/7/approvals': {approved: false, approved_by: []},
  'projects/:id/merge_requests/7/approval_state': {rules: [{name: 'any', approvals_required: 1}]},
  'projects/:id/merge_requests/7/status_checks': 404,
};

function state(fixture, headShas) {
  const dir = stubbed(fixture, headShas);
  const result = spawnSync(process.execPath, [script, '--branch', 'feature'], {encoding: 'utf8', env: {...process.env, PATH: `${dir}:${process.env.PATH}`}});
  return {...result, json: result.stdout ? JSON.parse(result.stdout) : null};
}

test('reports unresolved threads, pending approval, and a matching head pipeline', () => {
  const result = state(base);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.json.unresolved.map(t => [t.discussion_id, t.note_ids]), [['d1', [1, 2]]]);
  assert.equal(result.json.approval.state, 'pending');
  assert.equal(result.json.head_pipeline.matches_head, true);
  assert.deepEqual(result.json.status_checks, []);
  assert.deepEqual(result.json.blocked, []);
});

test('exits 2 unless exactly one open PR matches the branch', () => {
  for (const found of [[], [{iid: 7}, {iid: 8}]]) {
    const result = state({...base, 'projects/:id/merge_requests': found});
    assert.equal(result.status, 2);
    assert.match(result.stderr, /exactly one open PR/);
  }
});

test('an unreadable approval endpoint is blocked, never approved', () => {
  const result = state({...base, 'projects/:id/merge_requests/7/approval_state': 403});
  assert.equal(result.status, 0);
  assert.equal(result.json.approval.state, 'blocked');
  assert.deepEqual(result.json.blocked, ['approval state unavailable']);
});

test('flags a pipeline for an older SHA and a head that moved while reading', () => {
  const stale = state({...base, 'projects/:id/merge_requests/7': {...pr, head_pipeline: {id: 9, status: 'success', sha: 'old'}}});
  assert.equal(stale.json.head_pipeline.matches_head, false);
  const moved = state(base, ['h1', 'h2']);
  assert.match(moved.json.blocked[0], /head_moved/);
});

const ep = 'projects/:id/merge_requests/7/';

test('approved with no approver is pending, never approved', () => {
  const result = state({...base, [ep + 'approvals']: {approved: true, approvals_required: 0, approved_by: []}});
  assert.equal(result.json.approval.state, 'pending');
  const real = state({...base, [ep + 'approvals']: {approved: true, approved_by: [{user: {username: 'a'}}]}});
  assert.equal(real.json.approval.state, 'approved');
});

test('401 and 404 on status checks mean none configured; 403 and other errors block', () => {
  for (const code of [401, 404]) {
    const result = state({...base, [ep + 'status_checks']: code});
    assert.deepEqual(result.json.blocked, [], String(code));
  }
  for (const code of [403, 500]) assert.deepEqual(state({...base, [ep + 'status_checks']: code}).json.blocked, ['status checks unavailable'], String(code));
});

test('a status check that has not passed is blocked', () => {
  const result = state({...base, [ep + 'status_checks']: [{name: 'sec', status: 'failed'}, {name: 'ok', status: 'passed'}]});
  assert.deepEqual(result.json.blocked, ['status check sec: failed']);
});

test('runs through a symlink and a path with a space; keeps brackets in bodies', () => {
  const dir = stubbed({...base, 'projects/:id/merge_requests/7/discussions': [{id: 'd', notes: [note(1, {body: 'use a[0][1] or [x] [y]'})]}]});
  const spaced = path.join(dir, 'sp ace');
  fs.mkdirSync(spaced);
  const link = path.join(spaced, 'link.mjs');
  fs.symlinkSync(script, link);
  const result = spawnSync(process.execPath, [link, '--branch', 'feature'], {encoding: 'utf8', env: {...process.env, PATH: `${dir}:${process.env.PATH}`}});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).unresolved[0].body, 'use a[0][1] or [x] [y]');
});
