import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { intake } from '../skills/delivery/issue-intake/issue-intake.mjs';

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-intake-'));
  const taskRoot = path.join(root, 'tasks');
  fs.mkdirSync(taskRoot);
  const stateFile = path.join(root, 'claims.json');
  const calls = [];
  const issues = [{ number: 7, title: 'Fix the widget', body: 'Request body', state: 'OPEN', labels: [], url: 'https://github.com/acme/app/issues/7' }];
  const runGh = args => { calls.push(args); return JSON.stringify(args[0] === 'issue' ? issues : []); };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, taskRoot, stateFile, calls, issues, runGh };
}

test('existing task and pull request make an issue a duplicate before allocation', t => {
  const fixture = setup(t);
  const dir = path.join(fixture.taskRoot, 'prior'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'task.md'), '---\nissue: 7\n---\n');
  const result = intake({ ...fixture, repo: 'acme/app', dryRun: false, handoff: ['unused'], runGh: args => JSON.stringify(args[0] === 'issue' ? fixture.issues : [{ number: 9 }]) });
  assert.equal(result[0].status, 'duplicate');
  assert.deepEqual(fs.readdirSync(fixture.taskRoot), ['prior']);
});

test('restart hands off a previously claimed task rather than allocating another', t => {
  const fixture = setup(t);
  const task = path.join(fixture.taskRoot, 'fix-the-widget-7');
  fs.mkdirSync(task);
  fs.writeFileSync(path.join(task, 'task.md'), '---\nissue: 7\n---\n');
  fs.writeFileSync(path.join(task, 'index.json'), '{}\n');
  fs.writeFileSync(fixture.stateFile, JSON.stringify({ schema: 1, claims: [{ issue: 7, status: 'claimed', task, updatedAt: 0 }] }));
  const result = intake({ ...fixture, repo: 'acme/app', dryRun: false, staleMs: 10, clock: () => 100, handoff: ['fake'], runCommand: () => {}, runGh: fixture.runGh });
  assert.equal(result[0].status, 'handed-off');
  assert.deepEqual(fs.readdirSync(fixture.taskRoot), ['fix-the-widget-7']);
});

test('empty queue returns without claim or task allocation', t => {
  const fixture = setup(t);
  const result = intake({ ...fixture, repo: 'acme/app', dryRun: false, handoff: ['unused'], runGh: () => '[]' });
  assert.deepEqual(result, []);
  assert.deepEqual(fs.readdirSync(fixture.taskRoot), []);
});

test('fresh claim blocks and stale claim is recoverable in dry run', t => {
  const fixture = setup(t);
  fs.writeFileSync(fixture.stateFile, JSON.stringify({ schema: 1, claims: [{ issue: 7, status: 'claimed', task: 'old-task', updatedAt: 95 }] }));
  const fresh = intake({ ...fixture, repo: 'acme/app', staleMs: 10, clock: () => 100, runGh: fixture.runGh });
  assert.equal(fresh[0].status, 'claimed');
  const stale = intake({ ...fixture, repo: 'acme/app', staleMs: 10, clock: () => 106, runGh: fixture.runGh });
  assert.equal(stale[0].status, 'recoverable');
});
