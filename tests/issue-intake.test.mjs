import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../skills/delivery/issue-intake/issue-intake.mjs', import.meta.url));

function cliFixture(t, issueRows, prRows = []) {
  const fixture = setup(t);
  const gh = path.join(fixture.root, 'gh-mock.mjs');
  fs.writeFileSync(gh, `#!/usr/bin/env node\nconst args = process.argv.slice(2); process.stdout.write(JSON.stringify(args[0] === 'issue' ? ${JSON.stringify(issueRows)} : ${JSON.stringify(prRows)}));\n`);
  fs.chmodSync(gh, 0o755);
  fixture.runCli = (extra = []) => spawnSync(process.execPath, [cliPath, `--repo=acme/app`, `--task-root=${fixture.taskRoot}`, `--state=${fixture.stateFile}`, ...extra], { encoding: 'utf8', env: { ...process.env, GH_BIN: gh } });
  return fixture;
}

test('mocked gh CLI boundary returns duplicate, empty, stale, and restart outcomes', t => {
  const issue = { number: 7, title: 'Fix the widget', body: 'Request body', state: 'OPEN', labels: [], url: 'https://github.com/acme/app/issues/7' };
  const duplicate = cliFixture(t, [issue], [{ number: 9 }]);
  const duplicateResult = duplicate.runCli();
  assert.equal(duplicateResult.status, 0);
  assert.equal(JSON.parse(duplicateResult.stdout)[0].status, 'duplicate');

  const empty = cliFixture(t, []);
  const emptyResult = empty.runCli();
  assert.equal(emptyResult.status, 0);
  assert.deepEqual(JSON.parse(emptyResult.stdout), []);

  const stale = cliFixture(t, [issue]);
  fs.writeFileSync(stale.stateFile, JSON.stringify({ schema: 1, claims: [{ issue: 7, status: 'claimed', task: 'old-task', updatedAt: 1 }] }));
  const staleResult = stale.runCli(['--state=' + stale.stateFile]);
  assert.equal(JSON.parse(staleResult.stdout)[0].status, 'recoverable');

  const resumed = cliFixture(t, [issue]);
  const task = path.join(resumed.taskRoot, 'fix-the-widget-7');
  const handoff = path.join(resumed.root, 'handoff');
  fs.writeFileSync(handoff, '#!/bin/sh\nexit 1\n');
  fs.chmodSync(handoff, 0o755);
  const interrupted = resumed.runCli(['--execute', `--handoff=${handoff}`]);
  assert.equal(JSON.parse(interrupted.stdout)[0].status, 'interrupted');
  const state = JSON.parse(fs.readFileSync(resumed.stateFile, 'utf8'));
  state.claims[0].updatedAt = 1;
  fs.writeFileSync(resumed.stateFile, JSON.stringify(state));
  fs.writeFileSync(handoff, '#!/bin/sh\nexit 0\n');
  const resumedResult = resumed.runCli(['--execute', `--handoff=${handoff}`]);
  assert.equal(resumedResult.status, 0);
  assert.equal(JSON.parse(resumedResult.stdout)[0].status, 'handed-off');
  assert.deepEqual(fs.readdirSync(resumed.taskRoot), ['fix-the-widget-7']);
});
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
