import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import publicationGuard, { guardPublicationCall } from '../hooks/omp-publication.mjs';
import { createArtifactIndex } from '../shared/task-artifacts.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-publication-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], {cwd: root, stdio: 'ignore'});
  const task = path.join(root, 'task');
  fs.mkdirSync(task);
  fs.writeFileSync(path.join(task, 'task.md'), '# Task\n');
  fs.writeFileSync(path.join(task, 'index.json'), `${JSON.stringify(createArtifactIndex('task'))}\n`);
  return { root, task };
}

const call = command => ({ toolName: 'bash', input: { command } });

test('opted-in Bash intercept denies ready creation and allows draft hosting without claiming readiness', t => {
  const { root, task } = fixture(t);
  let callback;
  publicationGuard({ on(event, fn) { assert.equal(event, 'tool_call'); callback = fn; } });
  const scoped = command => ({toolName: 'bash', input: {command, cwd: root}});
  const original = process.env.SKILLS_PUBLICATION_TASK_DIR;
  process.env.SKILLS_PUBLICATION_TASK_DIR = task;
  t.after(() => {
    if (original === undefined) delete process.env.SKILLS_PUBLICATION_TASK_DIR;
    else process.env.SKILLS_PUBLICATION_TASK_DIR = original;
  });
  assert.match(callback(scoped('./gh pr create --title PROBE --body PROBE --base epic --head probe')).reason, /draft first/);
  assert.equal(callback(scoped('./gh pr create --draft --title PROBE --body PROBE --base epic --head probe')), undefined);
  assert.match(callback(scoped('gh pr merge 42')).reason, /unsupported PR command/);
  assert.match(callback(scoped('gh pr create --title PROBE --body \"--draft\"')).reason, /draft first/);
  assert.equal(callback(scoped('printf harmless')), undefined);
  assert.equal(guardPublicationCall(call('./gh pr create --title PROBE'), { env: {}, cwd: root }), undefined);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-publication-unrelated-'));
  t.after(() => fs.rmSync(other, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q'], {cwd: other, stdio: 'ignore'});
  assert.equal(guardPublicationCall(call('gh pr ready 42'), {env: {SKILLS_PUBLICATION_TASK_DIR: task}, cwd: other}), undefined);
});

test('existing draft ready checks merged proof result and denies incomplete or missing prerequisites', t => {
  const { root, task } = fixture(t);
  const calls = [];
  let proof = { status: 'stale', ready: false, allowed: false, reason: 'HEAD changed' };
  const run = (bin, args) => {
    calls.push({ bin, args });
    if (bin === 'git') return { status: 0, stdout: `${root}\n` };
    if (bin === 'gh') return { status: 0, stdout: '{\"number\":42,\"isDraft\":true}\n' };
    if (bin === process.execPath) return { status: 0, stdout: `${JSON.stringify(proof)}\n` };
    assert.fail(`unexpected process ${bin}`);
  };
  const options = { env: { SKILLS_PUBLICATION_TASK_DIR: task }, cwd: root, run };
  const stale = guardPublicationCall(call('./gh pr ready'), options);
  assert.match(stale.reason, /stale.*HEAD changed/);
  assert.deepEqual(calls.map(({ bin }) => bin), ['git', 'git', 'gh', process.execPath]);
  assert.match(calls[3].args[0], /publication-proof\.mjs$/);
  assert.deepEqual(calls[3].args.slice(1), [task, root, '42']);

  proof = { status: 'pass', ready: true, allowed: true, reason: 'current' };
  assert.equal(guardPublicationCall(call('./gh pr ready 42'), options), undefined);
  assert.deepEqual(calls.at(-2).args, ['pr', 'view', '42', '--json', 'number,isDraft']);

  fs.rmSync(path.join(task, 'index.json'));
  calls.length = 0;
  assert.match(guardPublicationCall(call('./gh pr ready'), options).reason, /index is missing or invalid/);
  assert.deepEqual(calls, []);
  assert.match(guardPublicationCall({ toolName: 'bash', input: {} }, options).reason, /malformed/);
  assert.equal(guardPublicationCall({ toolName: 'read', input: {} }, options), undefined);
});
