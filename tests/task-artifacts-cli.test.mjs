import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../shared/task-artifacts.mjs', import.meta.url));

function fixture(t, slug = 'portable-artifacts') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-artifacts-cli-'));
  const taskDir = path.join(root, slug);
  fs.mkdirSync(taskDir);
  fs.writeFileSync(path.join(taskDir, 'task.md'), `---\nslug: ${slug}\n---\nTask.\n`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, taskDir };
}

function cli(args, options = {}) {
  const result = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', ...options });
  return { ...result, json: result.status === 0 ? JSON.parse(result.stdout) : null };
}

function artifact(type, summary) {
  return `---\ntype: ${type}\nsummary: ${JSON.stringify(summary)}\n---\n# Artifact\n\nBody.\n`;
}

function writeAllocation(taskDir, allocation, text) {
  const file = path.join(taskDir, allocation.writePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function concurrentRecord(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [helper, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', value => { stdout += value; });
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

test('CLI initializes, allocates, records, and returns current semantic artifacts', t => {
  const { taskDir } = fixture(t);

  const initialized = cli(['init', taskDir]);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(initialized.json.generation, 0);
  assert.deepEqual(initialized.json.artifactSeries, {});

  const allocated = cli(['allocate', taskDir, 'research', 'primary']);
  assert.equal(allocated.status, 0, allocated.stderr);
  assert.equal(allocated.json.path, 'artifacts/research/primary/0001.md');
  assert.match(allocated.json.writePath, /^\.artifact-staging\/[a-f0-9-]+\.md$/);
  assert.equal(allocated.json.generation, 0);
  const artifactFile = writeAllocation(taskDir, allocated.json, artifact('research', 'Portable research'));

  const recorded = cli(['record', taskDir, 'research', 'primary', 'research', artifactFile]);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(recorded.json.id, 'research.primary.0001');
  assert.equal(recorded.json.summary, 'Portable research');
  assert.equal(fs.readFileSync(path.join(taskDir, recorded.json.path), 'utf8'), artifact('research', 'Portable research'));
  assert.equal(fs.existsSync(artifactFile), false);

  const current = cli(['current', taskDir, 'research']);
  assert.equal(current.status, 0, current.stderr);
  assert.deepEqual(current.json, recorded.json);
  assert.equal(JSON.parse(fs.readFileSync(path.join(taskDir, 'index.json'), 'utf8')).generation, 1);
});

test('CLI root resolves the portable repository task-root directive', t => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- skills:task-root=delivery/tasks -->\n');

  const result = cli(['root', root]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.json, { absoluteRoot: path.join(root, 'delivery', 'tasks'), relativeRoot: 'delivery/tasks' });
});

test('init fails closed without repairing an invalid existing index', t => {
  const { taskDir } = fixture(t, 'invalid-index');
  const file = path.join(taskDir, 'index.json');
  fs.writeFileSync(file, '{"broken":true}\n');

  const result = cli(['init', taskDir]);

  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"broken":true}\n');
});

test('concurrent allocations stage unique bytes and stale record cannot replace the winner', async t => {
  const { taskDir } = fixture(t, 'concurrent-artifacts');
  assert.equal(cli(['init', taskDir]).status, 0);
  const allocationA = cli(['allocate', taskDir, 'research', 'primary']).json;
  const allocationB = cli(['allocate', taskDir, 'research', 'primary']).json;
  assert.equal(allocationA.path, allocationB.path);
  assert.notEqual(allocationA.writePath, allocationB.writePath);
  const textA = artifact('research', 'Writer A research');
  const textB = artifact('research', 'Writer B research');
  const fileA = writeAllocation(taskDir, allocationA, textA);
  const fileB = writeAllocation(taskDir, allocationB, textB);

  const winner = await concurrentRecord(['record', taskDir, 'research', 'primary', 'research', fileA]);
  const stale = await concurrentRecord(['record', taskDir, 'research', 'primary', 'research', fileB]);

  assert.equal(winner.status, 0, winner.stderr);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /stale|generation|reservation/i);
  const index = JSON.parse(fs.readFileSync(path.join(taskDir, 'index.json'), 'utf8'));
  assert.equal(index.generation, 1);
  assert.equal(index.artifactSeries['research.primary'].iterations[0].summary, 'Writer A research');
  assert.equal(fs.readFileSync(path.join(taskDir, allocationA.path), 'utf8'), textA);
  assert.equal(fs.readFileSync(fileB, 'utf8'), textB);
});

test('record uses strict scalar frontmatter and permits unknown types only with explicit safe semantics', t => {
  const { taskDir } = fixture(t, 'explicit-semantics');
  assert.equal(cli(['init', taskDir]).status, 0);
  const known = cli(['allocate', taskDir, 'review', 'code']).json;
  const knownFile = writeAllocation(taskDir, known, artifact('research', 'Wrong known mapping'));
  const mismatch = cli(['record', taskDir, 'review', 'code', 'research', knownFile]);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /research\.primary/i);

  const explicit = cli(['allocate', taskDir, 'custom', 'report']).json;
  const explicitFile = writeAllocation(taskDir, explicit, artifact('custom-report', 'Explicit custom report'));
  assert.equal(cli(['record', taskDir, 'custom', 'report', 'custom-report', explicitFile]).status, 0);

  const next = cli(['allocate', taskDir, 'custom', 'report']).json;
  const invalidFile = writeAllocation(taskDir, next, '---\ntype: custom-report\nsummary: [not, scalar]\n---\nBody.\n');
  const invalid = cli(['record', taskDir, 'custom', 'report', 'custom-report', invalidFile]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /scalar|summary/i);
  assert.ok(invalid.stderr.length < 1000);
});

test('record rejects passed verification without required evidence before index mutation', t => {
  const { taskDir } = fixture(t, 'semantic-validation');
  assert.equal(cli(['init', taskDir]).status, 0);
  const allocation = cli(['allocate', taskDir, 'review', 'verification']).json;
  const file = writeAllocation(taskDir, allocation, '---\ntype: verification\nsummary: Missing evidence\nstatus: passed\n---\n# Verification\n\nNo verdict table.\n');

  const result = cli(['record', taskDir, 'review', 'verification', 'verification', file]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /verdict table|evidence/i);
  assert.equal(JSON.parse(fs.readFileSync(path.join(taskDir, 'index.json'), 'utf8')).generation, 0);
  assert.equal(fs.existsSync(path.join(taskDir, allocation.path)), false);
});

test('record handles PR descriptions without frontmatter', t => {
  const { taskDir } = fixture(t, 'pr-artifacts');
  assert.equal(cli(['init', taskDir]).status, 0);
  const allocation = cli(['allocate', taskDir, 'pull-request', 'description']).json;
  const file = writeAllocation(taskDir, allocation, '# PR\n\n## Purpose\n\nShip portable indexing.\n\n## Change outline\n\n- Add helper.\n');

  const result = cli(['record', taskDir, 'pull-request', 'description', 'pr-description', file]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.summary, 'Ship portable indexing.');
});
