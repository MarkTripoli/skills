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
  const b = repo(root, 'two', {'.env': 'TOKEN=not-reported-alone\n'});
  assert.throws(() => correlate([a, b]), /unsafe path/);
});
