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
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'issue-intake-')));
  const taskRoot = path.join(root, 'tasks'); fs.mkdirSync(taskRoot);
  const stateFile = path.join(root, 'claims.json');
  const gh = path.join(root, 'gh-mock.mjs');
  const ghLog = path.join(root, 'gh.jsonl');
  fs.writeFileSync(gh, `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst args = process.argv.slice(2);\nif (process.env.GH_LOG) fs.appendFileSync(process.env.GH_LOG, JSON.stringify(args)+'\\n');\nprocess.stdout.write(JSON.stringify(args[0] === 'issue' ? ${JSON.stringify(rows)} : ${JSON.stringify(prs)}));\n`);
  fs.chmodSync(gh, 0o755);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GH_BIN: gh, GH_LOG: ghLog };
  const runCli = (args = [], repo = 'acme/app') => spawnSync(process.execPath, [cliPath, `--repo=${repo}`, `--task-root=${taskRoot}`, `--state=${stateFile}`, ...args], { encoding: 'utf8', env });
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
function worktrees(f) {
  const target = path.join(f.root, 'target');
  const sibling = path.join(f.root, 'sibling');
  fs.mkdirSync(target);
  assert.equal(spawnSync('git', ['init', '-q', target]).status, 0);
  fs.writeFileSync(path.join(target, '.gitignore'), '.agents/tasks/\n');
  assert.equal(spawnSync('git', ['-C', target, 'add', '.gitignore']).status, 0);
  assert.equal(spawnSync('git', ['-C', target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture']).status, 0);
  assert.equal(spawnSync('git', ['-C', target, 'worktree', 'add', '--detach', '-q', sibling]).status, 0);
  return { target, sibling, taskRoot: path.join(target, '.agents/tasks') };
}

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

test('bounded GH responses larger than the spawn default remain readable', t => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ ...issue, number: i + 1, body: 'x'.repeat(50_000) }));
  const f = setup(t, rows);
  const result = f.runCli(['--label=ready']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).find(row => row.issue === 25).status, 'eligible');
});

test('installed skill command resolves its sibling script from a separate target checkout', t => {
  const f = setup(t);
  const installed = path.join(f.root, 'installed', 'issue-intake');
  const target = path.join(f.root, 'target');
  fs.mkdirSync(installed, { recursive: true });
  fs.mkdirSync(target);
  fs.copyFileSync(cliPath, path.join(installed, 'issue-intake.mjs'));
  const skillFile = path.join(installed, 'SKILL.md');
  fs.copyFileSync(fileURLToPath(new URL('../skills/delivery/issue-intake/SKILL.md', import.meta.url)), skillFile);
  assert.equal(spawnSync('git', ['init', '-q', target]).status, 0);
  const result = spawnSync('sh', ['-c', 'node "$(dirname "$SKILL_FILE")/issue-intake.mjs" "$@"', 'sh', '--repo=acme/app', `--task-root=${f.taskRoot}`, `--state=${f.stateFile}`, '--label=ready'], {
    cwd: target, env: { ...f.env, SKILL_FILE: skillFile }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout)[0].status, 'eligible');
  assert.deepEqual(fs.readdirSync(target).filter(name => name !== '.git'), []);
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
  const f = setup(t, [issue, { ...issue, number: 8 }, { ...issue, number: 9 }]);
  const failing = path.join(f.root, 'fail.sh');
  fs.writeFileSync(failing, '#!/bin/sh\nexit 1\n'); fs.chmodSync(failing, 0o755);
  const first = spawnSync(process.execPath, [cliPath, '--repo=acme/app', `--task-root=${f.taskRoot}`, `--state=${f.stateFile}`, '--execute', `--handoff=${failing}`], { encoding: 'utf8', env: f.env });
  assert.deepEqual(JSON.parse(first.stdout).map(row => [row.issue, row.status, row.blockedBy]), [[7, 'handoff-unknown', undefined], [8, 'blocked-not-attempted', 7], [9, 'blocked-not-attempted', 7]]);
  const before = fs.readFileSync(f.stateFile, 'utf8');
  const second = f.runHandoff();
  assert.deepEqual(JSON.parse(second.stdout).map(row => row.status), ['handoff-unknown', 'blocked-not-attempted', 'blocked-not-attempted']);
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
  fs.writeFileSync(path.join(f.taskRoot, 'existing', 'task.md'), '---\nrepository: acme/app\nissue: 7\n---\n');
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
  fs.writeFileSync(task, '---\nslug: body-only\nrepository: acme/app # canonical repository\nissue: 7 # linked ticket\n---\nBody.\n');
  assert.equal(JSON.parse(f.runCli().stdout)[0].status, 'duplicate-task');
  const execute = f.runHandoff();
  assert.equal(JSON.parse(execute.stdout)[0].status, 'duplicate-task');
  assert.equal(fs.existsSync(execute.log), false);
  fs.writeFileSync(task, '---\nslug: body-only\nrepository: "acme/#app" # quoted hash is data\nissue: 7\n---\nBody.\n');
  assert.equal(JSON.parse(f.runCli().stdout)[0].status, 'eligible');
  assert.equal(JSON.parse(f.runCli([], 'acme/#app').stdout)[0].status, 'duplicate-task');
});
test('shared task roots and PR bodies stay scoped to canonical repository identity', t => {
  const externalPrs = [{ number: 4, title: 'External references', body: 'other/repo#7 and https://github.com/other/repo/issues/7 and https://github.com/other/acme/app#7', url: '' }];
  const f = setup(t, [issue], externalPrs);
  const dir = path.join(f.taskRoot, 'other-repo-task'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'task.md'), '---\nrepository: other/repo\nissue: 7\n---\n');
  assert.equal(JSON.parse(f.runCli().stdout)[0].status, 'eligible');

  const targetPrs = [{ number: 5, title: 'Target reference', body: 'See acme/app#7', url: '' }];
  const target = setup(t, [issue], targetPrs);
  assert.equal(JSON.parse(target.runCli().stdout)[0].status, 'existing-pr');
});

test('default ignored task root finds sibling worktree tasks before claim or handoff', t => {
  const f = setup(t);
  const { target, sibling, taskRoot } = worktrees(f);
  const task = path.join(sibling, '.agents/tasks', 'in-progress');
  fs.mkdirSync(task, { recursive: true });
  fs.writeFileSync(path.join(task, 'task.md'), '---\nrepository: acme/app\nissue: 7\n---\n');
  const args = ['--repo=acme/app', '--task-root=.agents/tasks', `--state=${f.stateFile}`];
  const launch = extra => spawnSync(process.execPath, [cliPath, ...args, ...extra], { cwd: target, env: f.env, encoding: 'utf8' });
  const dry = launch([]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(JSON.parse(dry.stdout)[0], { issue: 7, status: 'duplicate-task', tasks: [fs.realpathSync(task)] });
  const execute = launch(['--execute', '--handoff=nonexistent-handoff']);
  assert.equal(execute.status, 0, execute.stderr);
  const custom = spawnSync(process.execPath, [cliPath, '--repo=acme/app', `--task-root=${f.taskRoot}`, `--state=${f.stateFile}`], { cwd: target, env: f.env, encoding: 'utf8' });
  assert.equal(custom.status, 0, custom.stderr);
  assert.equal(JSON.parse(custom.stdout)[0].status, 'eligible');
  assert.equal(JSON.parse(execute.stdout)[0].status, 'duplicate-task');
  assert.equal(fs.existsSync(f.stateFile), false);
  assert.equal(fs.existsSync(taskRoot), false);
  fs.rmSync(task, { recursive: true });
  const unrelated = path.join(f.root, 'unrelated', '.agents/tasks', 'other');
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'task.md'), '---\nrepository: acme/app\nissue: 7\n---\n');
  const distinct = launch([]);
  assert.equal(distinct.status, 0, distinct.stderr);
  assert.equal(JSON.parse(distinct.stdout)[0].status, 'eligible');
});

test('bare-backed worktree inventory reaches sibling tasks before dispatch', t => {
  const f = setup(t);
  const seed = worktrees(f).target;
  const bare = path.join(f.root, 'bare.git');
  assert.equal(spawnSync('git', ['clone', '--bare', '-q', seed, bare]).status, 0);
  const target = path.join(f.root, 'bare-target');
  const sibling = path.join(f.root, 'bare-sibling');
  for (const checkout of [target, sibling]) {
    assert.equal(spawnSync('git', ['--git-dir', bare, 'worktree', 'add', '--detach', '-q', checkout]).status, 0);
  }
  const inventory = spawnSync('git', ['-C', target, 'worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8' });
  assert.equal(inventory.status, 0);
  assert.match(inventory.stdout, /\0bare\0\0/);
  const task = path.join(sibling, '.agents/tasks', 'in-progress');
  fs.mkdirSync(task, { recursive: true });
  fs.writeFileSync(path.join(task, 'task.md'), '---\nrepository: acme/app\nissue: 7\n---\n');
  const args = [cliPath, '--repo=acme/app', '--task-root=.agents/tasks', `--state=${f.stateFile}`];
  const launch = extra => spawnSync(process.execPath, [...args, ...extra], { cwd: target, env: f.env, encoding: 'utf8' });
  const dry = launch([]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(JSON.parse(dry.stdout)[0], { issue: 7, status: 'duplicate-task', tasks: [fs.realpathSync(task)] });
  const execute = launch(['--execute', '--handoff=nonexistent-handoff']);
  assert.equal(execute.status, 0, execute.stderr);
  assert.equal(JSON.parse(execute.stdout)[0].status, 'duplicate-task');
  assert.equal(fs.existsSync(f.stateFile), false);
});

test('uninspectable registered worktree aborts before dispatch', t => {
  const f = setup(t);
  const { target, sibling } = worktrees(f);
  fs.unlinkSync(path.join(sibling, '.git'));
  const result = spawnSync(process.execPath, [cliPath, '--repo=acme/app', '--task-root=.agents/tasks', `--state=${f.stateFile}`, '--execute', '--handoff=nonexistent-handoff'], { cwd: target, env: f.env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot safely inventory repository worktrees/);
  assert.equal(fs.existsSync(f.stateFile), false);
});

test('sibling task-root symlink outside its registered worktree aborts lookup', t => {
  const f = setup(t);
  const { target, sibling } = worktrees(f);
  fs.mkdirSync(path.join(sibling, '.agents'));
  fs.symlinkSync(f.taskRoot, path.join(sibling, '.agents/tasks'), 'dir');
  const result = spawnSync(process.execPath, [cliPath, '--repo=acme/app', '--task-root=.agents/tasks', `--state=${f.stateFile}`], { cwd: target, env: f.env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot safely inventory repository worktrees/);
  assert.equal(fs.existsSync(f.ghLog), false);
});

test('symlinked task root and uncreated state parent cannot escape into unignored checkout', t => {
  const f = setup(t);
  const { target, taskRoot } = worktrees(f);
  const unignored = path.join(target, 'unignored');
  fs.mkdirSync(unignored);
  const alias = path.join(f.root, 'alias');
  fs.symlinkSync(unignored, alias, 'dir');
  const launch = (root, state, extra = []) => spawnSync(process.execPath, [cliPath, '--repo=acme/app', `--task-root=${root}`, `--state=${state}`, ...extra], { cwd: target, env: f.env, encoding: 'utf8' });
  const taskEscape = launch(alias, f.stateFile, ['--execute', '--handoff=nonexistent-handoff']);
  assert.notEqual(taskEscape.status, 0);
  assert.match(taskEscape.stderr, /not ignored/);
  const stateEscape = launch(taskRoot, path.join(alias, 'new-parent', 'claims.json'), ['--execute', '--handoff=nonexistent-handoff']);
  assert.notEqual(stateEscape.status, 0);
  assert.match(stateEscape.stderr, /not ignored/);
  assert.equal(fs.existsSync(path.join(unignored, 'new-parent')), false);
  assert.equal(fs.existsSync(f.stateFile), false);
  assert.equal(fs.existsSync(f.ghLog), false);
  const ignoredState = path.join(taskRoot, 'claims.json');
  const safe = launch(taskRoot, ignoredState);
  assert.equal(safe.status, 0, safe.stderr);
  assert.equal(JSON.parse(safe.stdout)[0].status, 'eligible');
  assert.equal(fs.existsSync(ignoredState), false);
});

test('a state-file-only ignore does not expose derived lock and receipt artifacts', t => {
  const f = setup(t);
  const { target, taskRoot } = worktrees(f);
  const ignore = path.join(target, '.gitignore');
  const stateFile = path.join(target, 'claims.json');
  fs.writeFileSync(ignore, '.agents/tasks/\n/claims.json\n');
  const launch = (file, execute = false) => spawnSync(process.execPath, [
    cliPath, '--repo=acme/app', `--task-root=${taskRoot}`, `--state=${file}`,
    ...(execute ? ['--execute', '--handoff=nonexistent-handoff'] : []),
  ], { cwd: target, env: f.env, encoding: 'utf8' });
  const unsafe = launch(stateFile, true);
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /not ignored/);
  assert.equal(fs.existsSync(stateFile), false);
  assert.equal(fs.existsSync(`${stateFile}.lock`), false);
  assert.equal(fs.existsSync(`${stateFile}.lock.reaper`), false);
  assert.equal(fs.existsSync(path.join(target, 'issue-intake-receipts')), false);
  assert.equal(fs.existsSync(f.ghLog), false);
  fs.writeFileSync(ignore, '.agents/tasks/\n/claims.json\n/claims.json.lock/\n/issue-intake-receipts/\n');
  const exposedReaper = launch(stateFile, true);
  assert.notEqual(exposedReaper.status, 0);
  assert.match(exposedReaper.stderr, /not ignored/);
  fs.writeFileSync(ignore, '.agents/tasks/\n/claims.json\n/claims.json.lock*/\n');
  const exposedReceipts = launch(stateFile, true);
  assert.notEqual(exposedReceipts.status, 0);
  assert.match(exposedReceipts.stderr, /not ignored/);
  assert.equal(fs.existsSync(f.ghLog), false);
  assert.equal(fs.existsSync(stateFile), false);

  fs.writeFileSync(ignore, '.agents/tasks/\n/.intake/\n');
  const ignoredDirectoryState = path.join(target, '.intake', 'claims.json');
  const safe = launch(ignoredDirectoryState);
  assert.equal(safe.status, 0, safe.stderr);
  assert.equal(JSON.parse(safe.stdout)[0].status, 'eligible');
  assert.equal(fs.existsSync(ignoredDirectoryState), false);
  const external = launch(f.stateFile);
  assert.equal(external.status, 0, external.stderr);
});

test('missing and invalid issue numbers fail before dispatch', t => {
  for (const number of [undefined, 0, -3, 1.5, '7']) {
    const row = { ...issue };
    if (number === undefined) delete row.number; else row.number = number;
    const f = setup(t, [row]);
    const result = f.runHandoff();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid positive issue number/);
    assert.equal(fs.existsSync(f.stateFile), false);
    assert.deepEqual(fs.readdirSync(f.taskRoot), []);
  }
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

test('an existing state symlink shares claim, lock, and receipt identity with its target', t => {
  const f = setup(t);
  fs.writeFileSync(f.stateFile, JSON.stringify(stateWith([])));
  const alias = path.join(f.root, 'state-alias.json');
  fs.symlinkSync(f.stateFile, alias);
  const handoff = path.join(f.root, 'count-handoff');
  const count = path.join(f.root, 'handoff-count');
  fs.writeFileSync(handoff, '#!/bin/sh\nprintf x >> \"$HANDOFF_COUNT\"\n');
  fs.chmodSync(handoff, 0o755);
  const launch = state => spawnSync(process.execPath, [
    cliPath, '--repo=acme/app', `--task-root=${f.taskRoot}`, `--state=${state}`, '--execute', `--handoff=${handoff}`,
  ], { encoding: 'utf8', env: { ...f.env, HANDOFF_COUNT: count } });
  const aliased = launch(alias);
  assert.equal(aliased.status, 0, aliased.stderr);
  assert.equal(JSON.parse(aliased.stdout)[0].status, 'handed-off');
  assert.equal(fs.readFileSync(count, 'utf8'), 'x');
  assert.equal(fs.lstatSync(alias).isSymbolicLink(), true);
  const claim = JSON.parse(fs.readFileSync(f.stateFile, 'utf8')).claims[0];
  assert.equal(claim.status, 'complete');
  assert.equal(path.dirname(claim.receipt), path.join(f.root, 'issue-intake-receipts'));
  assert.equal(fs.existsSync(`${alias}.lock`), false);
  assert.equal(fs.existsSync(`${alias}.lock.reaper`), false);
  const canonical = launch(f.stateFile);
  assert.equal(canonical.status, 0, canonical.stderr);
  assert.equal(JSON.parse(canonical.stdout)[0].status, 'complete');
  assert.equal(fs.readFileSync(count, 'utf8'), 'x');
});

test('dispatch intent survives crash and is never handed off a second time automatically', t => {
  const f = setup(t, [issue, { ...issue, number: 8 }]);
  const id = 'sha256-id';
  const receipt = path.join(f.root, 'issue-intake-receipts', `${id}.json`);
  fs.mkdirSync(path.dirname(receipt));
  fs.writeFileSync(receipt, JSON.stringify({ idempotencyKey: id, status: 'dispatching' }));
  fs.writeFileSync(f.stateFile, JSON.stringify(stateWith([{ key: 'acme/app#7', repo: 'acme/app', issue: 7, status: 'dispatching', idempotencyKey: id, receipt }])));
  const result = f.runHandoff();
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).map(row => row.status), ['handoff-unknown', 'blocked-not-attempted']);
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
test('accepted receipt survives a state persistence failure after adapter success', t => {
  const f = setup(t);
  let receiptPath;
  const options = {
    repo: 'acme/app',
    taskRoot: f.taskRoot,
    stateFile: f.stateFile,
    dryRun: false,
    handoff: 'fake-adapter',
    runGh: args => JSON.stringify(args[0] === 'issue' ? [issue] : []),
    runCommand: (_command, args) => {
      receiptPath = args.find(arg => arg.startsWith('--receipt=')).slice('--receipt='.length);
      fs.unlinkSync(f.stateFile);
      fs.mkdirSync(f.stateFile);
    },
  };
  assert.throws(() => intake(options));
  const accepted = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(accepted.status, 'accepted');
  fs.rmSync(f.stateFile, { recursive: true, force: true });
  const recovered = intake({ ...options, runCommand: () => assert.fail('accepted handoff must not run again') });
  assert.equal(recovered[0].status, 'handed-off-recovered');
  assert.equal(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).status, 'accepted');
});

test('simultaneous stale-lock contenders cannot replace the new live owner lock', async t => {
  const f = setup(t);
  const lock = `${f.stateFile}.lock`; fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: Number.MAX_SAFE_INTEGER, token: 'dead-owner' }));
  const handoff = path.join(f.root, 'slow-handoff');
  const count = path.join(f.root, 'handoff-count');
  fs.writeFileSync(handoff, '#!/bin/sh\nprintf x >> \"$HANDOFF_COUNT\"\nsleep 1\n');
  fs.chmodSync(handoff, 0o755);
  const args = [cliPath, '--repo=acme/app', `--task-root=${f.taskRoot}`, `--state=${f.stateFile}`, '--execute', `--handoff=${handoff}`];
  const env = { ...f.env, HANDOFF_COUNT: count };
  const launch = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', code => resolve(code));
  });
  const codes = await Promise.all([launch(), launch()]);
  assert(codes.includes(0));
  assert(codes.every(code => code === 0 || code === 1));
  assert.equal(fs.readFileSync(count, 'utf8'), 'x');
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

test('malformed CLI tokens cannot change repository scope or reach lookup and dispatch', t => {
  const f = setup(t);
  for (const args of [
    ['execute'], ['--execute'], ['--execute=false'], ['--label'], ['--label', 'ready'],
    ['--label='], ['--label=--execute'], ['--unknown=x'], ['--repo=other/repo'],
    [`--task-root=${path.join(f.root, 'other')}`], ['--handoff=other-adapter'],
  ]) {
    const result = f.runHandoff(args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
    assert.equal(fs.existsSync(result.log), false, JSON.stringify(args));
    assert.equal(fs.existsSync(f.ghLog), false, JSON.stringify(args));
    assert.equal(fs.existsSync(f.stateFile), false, JSON.stringify(args));
  }
  assert.notEqual(f.runCli(['--handoff=other-adapter']).status, 0);
  assert.equal(fs.existsSync(f.ghLog), false);
});
