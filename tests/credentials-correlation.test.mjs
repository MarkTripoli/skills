import {spawnSync} from 'node:child_process';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {correlate} from '../skills/delivery/credentials/scripts/correlate.mjs';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/fixtures/shared.env');
function repo(root, name, files) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  for (const [file, value] of Object.entries(files)) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, value);
  }
  requireGit(dir);
  return dir;
}
function requireGit(dir) {
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'add', '-f', '.env*']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'fixture@example.invalid']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Credential Fixture']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'fixture']);
}
function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-correlation-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

test('correlates equal values only across distinct repositories without leaking them', t => {
  const root = temp(t);
  const contents = fs.readFileSync(fixture, 'utf8');
  const a = repo(root, 'one', {'.env.local': contents});
  const b = repo(root, 'two', {'.env.production': contents});
  const report = correlate([a, b]);
  assert.equal(report.findings.length, 1);
  assert.match(report.findings[0].group_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(report.findings[0].locations, [
    {repo_index: 0, path: '.env.local', line: 1},
    {repo_index: 1, path: '.env.production', line: 1},
  ]);
  assert.equal(JSON.stringify(report).includes('fixture-shared-token-7Qp'), false);
  assert.equal(JSON.stringify(report).includes('API_TOKEN'), false);
});

test('does not report duplicates confined to one repository', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'A=private-repeat\nB=private-repeat\n'});
  const b = repo(root, 'two', {'.env': 'C=other-value\n'});
  assert.deepEqual(correlate([a, b]).findings, []);
});

test('ignores placeholders and gates ignored files on explicit authorization', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'A=changeme\nB=example\n'});
  const b = repo(root, 'two', {'.env': 'C=changeme\nD=example\n'});
  assert.deepEqual(correlate([a, b]).findings, []);
  const ignoredA = path.join(a, '.env.secret');
  const ignoredB = path.join(b, '.env.secret');
  fs.writeFileSync(ignoredA, 'TOKEN=ignored-secret-value\n');
  fs.writeFileSync(ignoredB, 'TOKEN=ignored-secret-value\n');
  for (const dir of [a, b]) fs.writeFileSync(path.join(dir, '.gitignore'), '.env.secret\n');
  assert.throws(() => correlate([a, b], {includeIgnored: true}), /owner authorization/);
  assert.deepEqual(correlate([a, b]).findings, []);
  const report = correlate([a, b], {includeIgnored: true, ownerAuthorized: true});
  assert.equal(report.findings.length, 1);
  assert.equal(JSON.stringify(report).includes('ignored-secret-value'), false);
});

test('rejects duplicate roots and symlinks escaping a selected repository', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'TOKEN=not-reported-alone\n'});
  assert.throws(() => correlate([a, a]), /duplicate repository roots/);
  const outside = path.join(root, 'outside.env');
  fs.writeFileSync(outside, 'TOKEN=outside\n');
  fs.symlinkSync(outside, path.join(a, '.env.external'));
  execFileSync('git', ['-C', a, 'add', '-f', '.env.external']);
  execFileSync('git', ['-C', a, 'commit', '-qm', 'symlink fixture']);
  const b = repo(root, 'two', {'.env': 'TOKEN=not-reported-alone\n'});
  assert.throws(() => correlate([a, b]), /unsafe path/);
});

test('rejects repository subdirectories and linked worktrees as separate selections', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'TOKEN=worktree-fixture\n', 'nested/.env': 'TOKEN=nested-fixture\n'});
  const b = repo(root, 'two', {'.env': 'TOKEN=other-fixture\n'});
  assert.throws(() => correlate([path.join(a, 'nested'), b]), /not the repository root/);
  const linked = path.join(root, 'one-linked');
  execFileSync('git', ['-C', a, 'worktree', 'add', '--detach', linked, 'HEAD']);
  assert.throws(() => correlate([a, linked]), /shared repository identity/);
});

test('reads only the pinned directory when its pathname is rebound before helper open', t => {
  const root = temp(t);
  const original = path.join(root, 'original');
  const outside = path.join(root, 'outside');
  const held = path.join(root, 'held');
  fs.mkdirSync(original);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(original, '.env.ignored'), 'TOKEN=descriptor-bound-fixture\n');
  fs.writeFileSync(path.join(outside, '.env.ignored'), 'TOKEN=outside-race-fixture\n');
  const rootFd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/scripts/read-ignored.py');
  fs.renameSync(original, held);
  fs.symlinkSync(outside, original);
  let result;
  try {
    result = spawnSync('python3', [helper, '.env.ignored'], {
      cwd: path.dirname(helper),
      encoding: null,
      maxBuffer: 1024 * 1024 + 1024,
      stdio: ['ignore', 'pipe', 'ignore', rootFd],
    });
  } finally {
    fs.unlinkSync(original);
    fs.renameSync(held, original);
    fs.closeSync(rootFd);
  }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString('utf8'), 'TOKEN=descriptor-bound-fixture\n');
  assert.equal(result.stdout.toString('utf8').includes('outside-race-fixture'), false);
});

test('rejects a corrupted nested Git tree before correlating its apparent blob', t => {
  const root = temp(t);
  const expected = 'TOKEN=synthetic-corrupt-tree-match\n';
  const a = repo(root, 'one', {'nested/.env': 'TOKEN=committed-original\n', '.env.reference': expected});
  const b = repo(root, 'two', {'.env': expected});
  execFileSync('git', ['-C', a, 'add', '-f', '--all']);
  execFileSync('git', ['-C', a, 'commit', '-qm', 'nested environment fixture']);
  const childTree = execFileSync('git', ['-C', a, 'rev-parse', 'HEAD:nested'], {encoding: 'utf8'}).trim();
  const replacementBlob = execFileSync('git', ['-C', a, 'rev-parse', 'HEAD:.env.reference'], {encoding: 'utf8'}).trim();
  const objectPath = path.join(a, '.git', 'objects', childTree.slice(0, 2), childTree.slice(2));
  const rawTree = zlib.inflateSync(fs.readFileSync(objectPath));
  const nameEnd = rawTree.indexOf(0);
  const replacementOid = Buffer.from(replacementBlob, 'hex');
  assert.equal(nameEnd + 1 + replacementOid.length, rawTree.length);
  replacementOid.copy(rawTree, nameEnd + 1);
  fs.chmodSync(objectPath, 0o644);
  fs.writeFileSync(objectPath, zlib.deflateSync(rawTree));
  assert.throws(() => correlate([a, b]));
});

test('correlates explicitly authorized nested ignored env files', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'TOKEN=one\n'});
  const b = repo(root, 'two', {'.env': 'TOKEN=two\n'});
  for (const dir of [a, b]) {
    fs.mkdirSync(path.join(dir, 'nested'));
    fs.writeFileSync(path.join(dir, '.gitignore'), 'nested/\n');
    fs.writeFileSync(path.join(dir, 'nested', '.env.secret'), 'TOKEN=nested-synthetic-match\n');
  }
  const report = correlate([a, b], {includeIgnored: true, ownerAuthorized: true});
  assert.equal(report.findings.length, 1);
  assert.deepEqual(report.findings[0].locations, [
    {repo_index: 0, path: 'nested/.env.secret', line: 1},
    {repo_index: 1, path: 'nested/.env.secret', line: 1},
  ]);
  assert.equal(JSON.stringify(report).includes('nested-synthetic-match'), false);
});

test('rejects an intermediate symlink while reading ignored env paths', t => {
  const root = temp(t);
  const original = path.join(root, 'original');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(original);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, '.env.secret'), 'TOKEN=outside-intermediate-fixture\n');
  fs.symlinkSync(outside, path.join(original, 'nested'));
  const rootFd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/scripts/read-ignored.py');
  let result;
  try {
    result = spawnSync('python3', [helper, 'nested/.env.secret'], {
      cwd: path.dirname(helper),
      encoding: null,
      maxBuffer: 1024 * 1024 + 1024,
      stdio: ['ignore', 'pipe', 'ignore', rootFd],
    });
  } finally {
    fs.closeSync(rootFd);
  }
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.length, 0);
});

test('fails before reading when a selected root is rebound during selection', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'TOKEN=original-root-value\n'});
  const b = repo(root, 'two', {'.env': 'TOKEN=second-repo-value\n'});
  const replacement = repo(root, 'replacement', {'.env': 'TOKEN=outside-root-value\n'});
  const moved = path.join(root, 'original-root-moved');
  const originalRealpath = fs.realpathSync;
  let swapped = false;
  fs.realpathSync = function(file, ...args) {
    if (!swapped && path.resolve(String(file)) === b) {
      swapped = true;
      fs.renameSync(a, moved);
      fs.symlinkSync(replacement, a);
    }
    return originalRealpath.call(this, file, ...args);
  };
  try {
    assert.throws(() => correlate([a, b]), /repository root changed/);
  } finally {
    fs.realpathSync = originalRealpath;
    if (fs.existsSync(a) && fs.lstatSync(a).isSymbolicLink()) fs.unlinkSync(a);
    if (fs.existsSync(moved)) fs.renameSync(moved, a);
  }
  assert.equal(swapped, true);
});
