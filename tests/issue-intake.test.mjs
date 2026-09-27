import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { intake } from '../skills/delivery/issue-intake/issue-intake.mjs';

const cliPath = fileURLToPath(new URL('../skills/delivery/issue-intake/issue-intake.mjs', import.meta.url));
const issue = { number: 7, title: 'Fix the widget', body: 'Request body', state: 'OPEN', labels: [{ name: 'ready' }], url: 'https://github.com/acme/app/issues/7' };
function setup(t, rows = [issue], prs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-intake-'));
  const taskRoot = path.join(root, 'tasks'); fs.mkdirSync(taskRoot);
  const stateFile = path.join(root, 'claims.json');
  const gh = path.join(root, 'gh-mock.mjs');
  const ghLog = path.join(root, 'gh.jsonl');
  fs.writeFileSync(gh, `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst args = process.argv.slice(2);\nif (process.env.GH_LOG) fs.appendFileSync(process.env.GH_LOG, JSON.stringify(args)+'\\n');\nprocess.stdout.write(JSON.stringify(args[0] === 'issue' ? ${JSON.stringify(rows)} : ${JSON.stringify(prs)}));\n`);
  fs.chmodSync(gh, 0o755);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GH_BIN: gh, GH_LOG: ghLog };
  const runCli = (args = []) => spawnSync(process.execPath, [cliPath, '--repo=acme/app', `--task-root=${taskRoot}`, `--state=${stateFile}`, ...args], { encoding: 'utf8', env });
  const runHandoff = (args = []) => {
    const log = path.join(root, 'handoff.json');
    const handoff = path.join(root, 'handoff.mjs');
    fs.writeFileSync(handoff, `#!/usr/bin/env node\nimport fs from 'node:fs'; fs.writeFileSync(process.env.HANDOFF_LOG, JSON.stringify(process.argv.slice(2)));\n`);
    fs.chmodSync(handoff, 0o755);
    const result = spawnSync(process.execPath, [cliPath, '--repo=acme/app', `--task-root=${taskRoot}`, `--state=${stateFile}`, '--execute', `--handoff=${handoff}`, ...args], { encoding: 'utf8', env: { ...env, HANDOFF_LOG: log } });
    return { ...result, log };
  };
  return { root, taskRoot, stateFile, ghLog, env, runCli, runHandoff };
}
function stateWith(claims) { return { schema: 2, claims }; }
function argsLog(file) { return fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)); }

test('dry-run remains read-only, applies server label filter, and paginates beyond 100', t => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ ...issue, number: i + 1, title: `Issue ${i + 1}` }));
  const f = setup(t, rows);
  const result = f.runCli(['--label=ready']);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).find(row => row.issue === 101).status, 'eligible');
  assert(argsLog(f.ghLog)[0].includes('--label'));
  assert(argsLog(f.ghLog)[0].includes('ready'));
  assert.deepEqual(fs.readdirSync(f.taskRoot), []);
});

test('truncated queue and PR listings fail closed', t => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ ...issue, number: i + 1 }));
  const queue = setup(t, rows).runCli();
  assert.notEqual(queue.status, 0);
  assert.match(queue.stderr, /incomplete queue coverage/);
  const prs = Array.from({ length: 1000 }, (_, i) => ({ number: i + 1, title: '', body: '', url: '' }));
  const pullRequests = setup(t, [issue], prs).runCli();
  assert.notEqual(pullRequests.status, 0);
  assert.match(pullRequests.stderr, /incomplete duplicate coverage/);
});

test('empty queue and server-returned label mismatch allocate nothing', t => {
  const empty = setup(t, []);
  assert.deepEqual(JSON.parse(empty.runCli().stdout), []);
  const mismatch = setup(t, [{ ...issue, labels: [{ name: 'blocked' }] }]);
  assert.equal(JSON.parse(mismatch.runCli(['--label=ready']).stdout)[0].status, 'ineligible');
  assert.deepEqual(fs.readdirSync(mismatch.taskRoot), []);
});

test('failed handoff leaves a durable unknown receipt and never relaunches', t => {
  const f = setup(t);
  const failing = path.join(f.root, 'fail.sh');
  fs.writeFileSync(failing, '#!/bin/sh\nexit 1\n'); fs.chmodSync(failing, 0o755);
  const first = spawnSync(process.execPath, [cliPath, '--repo=acme/app', `--task-root=${f.taskRoot}`, `--state=${f.stateFile}`, '--execute', `--handoff=${failing}`], { encoding: 'utf8', env: f.env });
  assert.equal(JSON.parse(first.stdout)[0].status, 'handoff-unknown');
  const before = fs.readFileSync(f.stateFile, 'utf8');
  const second = f.runHandoff();
  assert.equal(JSON.parse(second.stdout)[0].status, 'handoff-unknown');
  assert.equal(fs.readFileSync(f.stateFile, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(f.taskRoot), []);
});

test('schema-one claims fail closed instead of guessing repository ownership', t => {
  const f = setup(t);
  fs.writeFileSync(f.stateFile, JSON.stringify({ schema: 1, claims: [{ issue: 7, status: 'complete' }] }));
  const result = f.runCli();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manual migration required/);
});

test('exact PR reference blocks task recovery; nearby issue number does not match', t => {
  const f = setup(t, [issue], [{ number: 8, title: 'Other', body: 'Fixes #70', url: '' }, { number: 9, title: 'Fix', body: 'Fixes #7', url: '' }]);
  fs.mkdirSync(path.join(f.taskRoot, 'existing'));
  fs.writeFileSync(path.join(f.taskRoot, 'existing', 'task.md'), '---\nissue: 7\n---\n');
  const result = f.runCli(['--execute', '--handoff=unused']);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout)[0].status, 'existing-pr');
  assert.equal(fs.existsSync(f.stateFile), false);
});

test('issue lookup recognizes only task frontmatter, not body text', t => {
  const f = setup(t);
  const dir = path.join(f.taskRoot, 'body-only'); fs.mkdirSync(dir);
  const task = path.join(dir, 'task.md');
  fs.writeFileSync(task, '---\nslug: body-only\n---\nRequest mentions issue: 7\n');
  assert.equal(JSON.parse(f.runCli().stdout)[0].status, 'eligible');
  fs.writeFileSync(task, '---\nslug: body-only\nissue: 7\n---\nBody.\n');
  assert.equal(JSON.parse(f.runCli().stdout)[0].status, 'duplicate-task');
});

test('successful handoff stores repository-scoped receipt without creating task on checkout', t => {
  const f = setup(t);
  fs.writeFileSync(f.stateFile, JSON.stringify(stateWith([{ key: 'other/repo#7', repo: 'other/repo', issue: 7, status: 'complete' }])));
  const result = f.runHandoff(['--cost-report=rough estimate']);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout)[0].status, 'handed-off');
  assert.deepEqual(fs.readdirSync(f.taskRoot), []);
  const handed = JSON.parse(fs.readFileSync(result.log, 'utf8'));
  assert(handed.some(arg => arg.startsWith('--intake-key=')));
  assert(handed.some(arg => arg.includes('Issue #7: Fix the widget')));
  const state = JSON.parse(fs.readFileSync(f.stateFile, 'utf8'));
  assert.equal(state.claims.find(row => row.key === 'acme/app#7').costNote.verified, false);
});

test('dispatch intent survives crash and is never handed off a second time automatically', t => {
  const f = setup(t);
  const id = 'sha256-id';
  const receipt = path.join(f.root, 'issue-intake-receipts', `${id}.json`);
  fs.mkdirSync(path.dirname(receipt));
  fs.writeFileSync(receipt, JSON.stringify({ idempotencyKey: id, status: 'dispatching' }));
  fs.writeFileSync(f.stateFile, JSON.stringify(stateWith([{ key: 'acme/app#7', repo: 'acme/app', issue: 7, status: 'dispatching', idempotencyKey: id, receipt }])));
  const result = f.runHandoff();
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout)[0].status, 'handoff-unknown');
  assert.equal(fs.existsSync(result.log), false);
});

test('accepted durable receipt repairs completion after state-write crash', t => {
  const f = setup(t);
  const id = 'stable-id';
  const receipt = path.join(f.root, 'issue-intake-receipts', `${id}.json`);
  fs.mkdirSync(path.dirname(receipt));
  fs.writeFileSync(receipt, JSON.stringify({ idempotencyKey: id, repo: 'acme/app', issue: 7, status: 'accepted' }));
  fs.writeFileSync(f.stateFile, JSON.stringify(stateWith([{ key: 'acme/app#7', repo: 'acme/app', issue: 7, status: 'dispatching', idempotencyKey: id, receipt }])));
  const result = f.runHandoff();
  assert.equal(JSON.parse(result.stdout)[0].status, 'handed-off-recovered');
  assert.equal(fs.existsSync(result.log), false);
});

test('concurrent execution blocks even after lease age when owner process lives', t => {
  const f = setup(t);
  const options = { repo: 'acme/app', taskRoot: f.taskRoot, stateFile: f.stateFile, dryRun: false, staleMs: 0, handoff: 'fake', runGh: args => JSON.stringify(args[0] === 'issue' ? [issue] : []), runCommand: () => {
    assert.throws(() => intake({ ...options, runCommand: () => {} }), /already running/);
  } };
  const result = intake(options);
  assert.equal(result[0].status, 'handed-off');
});

test('dead owner lock is reclaimed, while unknown dispatch is not repeated', t => {
  const f = setup(t);
  const lock = `${f.stateFile}.lock`; fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: Number.MAX_SAFE_INTEGER, token: 'dead' }));
  const result = f.runHandoff();
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout)[0].status, 'handed-off');
});

test('unsafe task root and ambiguous execution flags fail before state creation', t => {
  const f = setup(t);
  const unsafe = spawnSync(process.execPath, [cliPath, '--repo=acme/app', `--task-root=${path.join(process.cwd(), 'README.md')}`, `--state=${f.stateFile}`], { encoding: 'utf8', env: f.env });
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /not ignored/);
  assert.notEqual(f.runCli(['--execute=false']).status, 0);
  assert.notEqual(f.runCli(['--execute']).status, 0);
  assert.equal(fs.existsSync(f.stateFile), false);
});
