import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  currentArtifact,
  initTaskArtifacts,
  readArtifactIndex,
  recordArtifact,
  reserveArtifactIteration,
  validateArtifactIndex,
  writeArtifactIndex,
} from '../shared/task-artifacts.mjs';

function fixture(t, slug) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-integrity-'));
  const taskDir = path.join(root, slug);
  fs.mkdirSync(taskDir);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initTaskArtifacts(taskDir);
  return taskDir;
}

function artifact(summary) {
  return `---\ntype: research\nsummary: ${summary}\n---\n# Research\n\nEvidence.\n`;
}

function stage(taskDir, allocation, text) {
  const file = path.join(taskDir, allocation.writePath);
  fs.writeFileSync(file, text);
  return file;
}

function recordResearch(taskDir, summary) {
  const allocation = reserveArtifactIteration(taskDir, 'research', 'primary');
  return recordArtifact(taskDir, 'research', 'primary', 'research', stage(taskDir, allocation, artifact(summary)));
}

test('schema requires latest current, total generation, and a status valid for its type', () => {
  const first = artifact('First');
  const second = artifact('Second');
  const base = {
    $schema: 'skills.task-index/v1',
    schemaVersion: 1,
    task: 'schema-integrity',
    generation: 2,
    artifactSeries: {
      'research.primary': {
        current: 'research.primary.0002',
        iterations: [
          { id: 'research.primary.0001', iteration: 1, path: 'artifacts/research/primary/0001.md', sha256: crypto.createHash('sha256').update(first).digest('hex'), type: 'research', status: null, summary: 'First' },
          { id: 'research.primary.0002', iteration: 2, path: 'artifacts/research/primary/0002.md', sha256: crypto.createHash('sha256').update(second).digest('hex'), type: 'research', status: null, summary: 'Second', supersedes: 'research.primary.0001' },
        ],
      },
    },
  };

  const staleCurrent = structuredClone(base);
  staleCurrent.artifactSeries['research.primary'].current = 'research.primary.0001';
  assert.throws(() => validateArtifactIndex(staleCurrent), /current.*last|latest/i);
  assert.throws(() => validateArtifactIndex({ ...base, generation: 1 }), /generation.*iteration/i);
  const invalidStatus = structuredClone(base);
  invalidStatus.artifactSeries['research.primary'].iterations[0].status = 'unknown';
  assert.throws(() => validateArtifactIndex(invalidStatus), /status/i);
});

test('every mutating and current operation fails before using a tampered prior record', t => {
  const taskDir = fixture(t, 'tampered-ledger');
  const first = recordResearch(taskDir, 'Original');
  const pending = reserveArtifactIteration(taskDir, 'research', 'primary');
  const pendingFile = stage(taskDir, pending, artifact('Pending'));
  fs.appendFileSync(path.join(taskDir, first.path), 'tampered\n');

  assert.throws(() => initTaskArtifacts(taskDir), /sha-?256|hash/i);
  assert.throws(() => reserveArtifactIteration(taskDir, 'research', 'primary'), /sha-?256|hash/i);
  assert.throws(() => currentArtifact(taskDir, 'research'), /sha-?256|hash/i);
  assert.throws(() => recordArtifact(taskDir, 'research', 'primary', 'research', pendingFile), /sha-?256|hash/i);
  assert.equal(fs.existsSync(path.join(taskDir, pending.path)), false);
});

test('deleted records and symlinked record paths fail closed', t => {
  const deletedDir = fixture(t, 'deleted-record');
  const deleted = recordResearch(deletedDir, 'Delete me');
  fs.rmSync(path.join(deletedDir, deleted.path));
  assert.throws(() => currentArtifact(deletedDir, 'research'), /does not exist|dangling/i);

  const linkedDir = fixture(t, 'linked-record');
  const linked = recordResearch(linkedDir, 'Link me');
  const file = path.join(linkedDir, linked.path);
  const copy = path.join(linkedDir, 'copy.md');
  fs.renameSync(file, copy);
  fs.symlinkSync(copy, file);
  assert.throws(() => initTaskArtifacts(linkedDir), /symlink/i);
});

test('dead lock owners are reclaimed while live or unverifiable owners remain exclusive', t => {
  const taskDir = fixture(t, 'lock-recovery');
  const lock = path.join(taskDir, '.index.json.lock');
  const exited = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.equal(exited.status, 0);
  fs.writeFileSync(lock, `${JSON.stringify({ pid: exited.pid, token: 'dead-owner' })}\n`);

  const allocation = reserveArtifactIteration(taskDir, 'research', 'primary');
  assert.equal(allocation.iteration, 1);

  fs.writeFileSync(lock, `${JSON.stringify({ pid: process.pid, token: 'live-owner' })}\n`);
  assert.throws(() => reserveArtifactIteration(taskDir, 'research', 'primary'), /concurrent|lock|stale/i);
  assert.equal(JSON.parse(fs.readFileSync(lock, 'utf8')).token, 'live-owner');
  fs.rmSync(lock);
  fs.writeFileSync(lock, '{}\n');
  assert.throws(() => reserveArtifactIteration(taskDir, 'research', 'primary'), /concurrent|lock|owner/i);
});

test('retry finishes a matching hard-link publication but rejects conflicting target bytes', t => {
  const taskDir = fixture(t, 'publish-recovery');
  const allocation = reserveArtifactIteration(taskDir, 'research', 'primary');
  const text = artifact('Recover publication');
  const staging = stage(taskDir, allocation, text);
  const target = path.join(taskDir, allocation.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.linkSync(staging, target);

  const recovered = recordArtifact(taskDir, 'research', 'primary', 'research', staging);
  assert.equal(recovered.id, allocation.id);
  assert.equal(currentArtifact(taskDir, 'research').sha256, crypto.createHash('sha256').update(text).digest('hex'));

  const next = reserveArtifactIteration(taskDir, 'research', 'primary');
  const nextStaging = stage(taskDir, next, artifact('Expected bytes'));
  fs.writeFileSync(path.join(taskDir, next.path), artifact('Conflicting bytes'));
  assert.throws(() => recordArtifact(taskDir, 'research', 'primary', 'research', nextStaging), /conflict|exist|bytes/i);
});

test('retry after index rename returns committed record and removes matching crash state', t => {
  const taskDir = fixture(t, 'cleanup-recovery');
  const allocation = reserveArtifactIteration(taskDir, 'research', 'primary');
  const text = artifact('Committed before cleanup');
  const staging = stage(taskDir, allocation, text);
  const target = path.join(taskDir, allocation.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.linkSync(staging, target);
  const record = { id: allocation.id, iteration: 1, path: allocation.path, sha256: crypto.createHash('sha256').update(text).digest('hex'), type: 'research', status: null, summary: 'Committed before cleanup' };
  const index = readArtifactIndex(taskDir);
  index.generation = 1;
  index.artifactSeries['research.primary'] = { current: record.id, iterations: [record] };
  writeArtifactIndex(taskDir, index);

  assert.deepEqual(recordArtifact(taskDir, 'research', 'primary', 'research', staging), record);
  assert.equal(fs.existsSync(staging), false);
  assert.equal(fs.existsSync(path.join(taskDir, '.artifact-reservations', `${allocation.reservation}.json`)), false);
});
