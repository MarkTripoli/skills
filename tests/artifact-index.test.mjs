import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  allocateArtifactIteration,
  observeArtifacts,
  serializeArtifactIndex,
  validateArtifactIndex,
  writeArtifactIndex,
} from '../atomic/lib/artifacts.mjs';
import { initTaskArtifacts, readArtifactIndex } from '../shared/task-artifacts.mjs';

const taskDirs = [];

afterEach(() => {
  for (const taskDir of taskDirs.splice(0)) fs.rmSync(taskDir, { recursive: true, force: true });
});

function artifactText(type, summary, status = null) {
  const statusLine = status === null ? '' : `status: ${status}\n`;
  return `---\ntype: ${type}\nsummary: ${summary}\n${statusLine}---\n# Evidence\n\nRecorded evidence.\n`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function taskFixture(slug = 'indexed-task') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-index-'));
  const taskDir = path.join(root, slug);
  fs.mkdirSync(taskDir);
  taskDirs.push(root);
  return taskDir;
}

function iteration(kind, variant, number, text, metadata = {}) {
  const suffix = String(number).padStart(4, '0');
  return {
    id: `${kind}.${variant}.${suffix}`,
    iteration: number,
    path: `artifacts/${kind}/${variant}/${suffix}.md`,
    sha256: sha256(text),
    type: metadata.type ?? kind,
    status: metadata.status ?? null,
    summary: metadata.summary ?? `${variant} ${number}`,
    ...(metadata.supersedes === undefined ? {} : { supersedes: metadata.supersedes }),
  };
}

function indexFixture(task, series) {
  return {
    $schema: 'skills.task-index/v1',
    schemaVersion: 1,
    task,
    generation: Object.values(series).reduce((total, value) => total + value.iterations.length, 0),
    artifactSeries: series,
  };
}

function writeIndexedArtifact(taskDir, record, text) {
  const file = path.join(taskDir, record.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('indexed observation keeps durable iterations and selects each series current pointer', () => {
  const taskDir = taskFixture();
  const first = artifactText('code-review', 'review one', 'findings');
  const second = artifactText('code-review', 'review two', 'blocked');
  const app = artifactText('app-test', 'browser review', 'blocked');
  const firstRecord = iteration('review', 'code', 1, first, { type: 'code-review', status: 'findings', summary: 'review one' });
  const secondRecord = iteration('review', 'code', 2, second, { type: 'code-review', status: 'blocked', summary: 'review two', supersedes: firstRecord.id });
  const appRecord = iteration('review', 'browser', 1, app, { type: 'app-test', status: 'blocked', summary: 'browser review' });
  writeIndexedArtifact(taskDir, firstRecord, first);
  writeIndexedArtifact(taskDir, secondRecord, second);
  writeIndexedArtifact(taskDir, appRecord, app);
  fs.writeFileSync(path.join(taskDir, '99-code-review-unindexed.md'), artifactText('code-review', 'must be ignored', 'blocked'));
  writeArtifactIndex(taskDir, indexFixture('indexed-task', {
    'review.code': { current: secondRecord.id, iterations: [firstRecord, secondRecord] },
    'review.browser': { current: appRecord.id, iterations: [appRecord] },
  }));

  const observed = observeArtifacts(taskDir);

  assert.equal(observed.latest['code-review'].summary, 'review two');
  assert.equal(observed.latest['app-test'].summary, 'browser review');
  assert.deepEqual(observed.artifactSeries['review.code'].iterations.map(value => value.summary), ['review one', 'review two']);
  assert.equal(observed.artifactSeries['review.code'].current.summary, 'review two');
  assert.equal(Object.keys(observed.hashes).length, 3);
  assert.equal(observed.index.task, 'indexed-task');
});

test('index helpers validate, serialize deterministically, and allocate the next semantic iteration', () => {
  const text = artifactText('research', 'initial research');
  const record = iteration('research', 'primary', 1, text, { summary: 'initial research' });
  const index = indexFixture('indexed-task', {
    'research.primary': { current: record.id, iterations: [record] },
  });

  assert.equal(validateArtifactIndex(index).artifactSeries['research.primary'].current, record.id);
  assert.equal(serializeArtifactIndex(index), `${JSON.stringify(index, null, 2)}\n`);
  assert.deepEqual(allocateArtifactIteration(index, 'research', 'primary'), {
    id: 'research.primary.0002',
    iteration: 2,
    path: 'artifacts/research/primary/0002.md',
    supersedes: 'research.primary.0001',
  });
});

test('evidence iterations use their own semantic series and closed status set', () => {
  const text = artifactText('evidence-iteration', 'active evidence loop', 'in-progress');
  const record = iteration('evidence', 'iteration', 1, text, { type: 'evidence-iteration', status: 'in-progress', summary: 'active evidence loop' });
  const index = indexFixture('indexed-task', {
    'evidence.iteration': { current: record.id, iterations: [record] },
  });

  assert.equal(validateArtifactIndex(index).artifactSeries['evidence.iteration'].current, record.id);
  assert.throws(
    () => validateArtifactIndex(indexFixture('indexed-task', {
      'evidence.iteration': { current: record.id, iterations: [{ ...record, status: 'done' }] },
    })),
    /invalid evidence-iteration status done/,
  );
});

test('index schema id uses only the canonical $schema field', () => {
  const index = indexFixture('indexed-task', {});
  assert.equal(validateArtifactIndex(index).$schema, 'skills.task-index/v1');

  const alias = { ...index, schema: index.$schema };
  delete alias.$schema;
  assert.throws(() => validateArtifactIndex(alias), /\$schema/);
});

test('index validation rejects unknown root, series, and iteration keys', () => {
  const text = artifactText('research', 'indexed research');
  const record = iteration('research', 'primary', 1, text, { summary: 'indexed research' });
  const mutations = [
    index => { index.unknown = true; },
    index => { index.artifactSeries['research.primary'].unknown = true; },
    index => { index.artifactSeries['research.primary'].iterations[0].unknown = true; },
  ];

  for (const mutate of mutations) {
    const index = indexFixture('indexed-task', { 'research.primary': { current: record.id, iterations: [{ ...record }] } });
    mutate(index);
    assert.throws(() => validateArtifactIndex(index), /unknown key/i);
  }
});

test('known artifact types validate only in their canonical semantic series', () => {
  const text = artifactText('research', 'misfiled research');
  const record = iteration('review', 'code', 1, text, { type: 'research', summary: 'misfiled research' });
  const index = indexFixture('indexed-task', {
    'review.code': { current: record.id, iterations: [record] },
  });

  assert.throws(() => validateArtifactIndex(index), /research\.primary|canonical|semantic series/i);
});

test('every iteration after the first must supersede its immediate predecessor', () => {
  const firstText = artifactText('research', 'first research');
  const secondText = artifactText('research', 'second research');
  const first = iteration('research', 'primary', 1, firstText, { summary: 'first research' });
  const second = iteration('research', 'primary', 2, secondText, { summary: 'second research' });
  const index = indexFixture('indexed-task', {
    'research.primary': { current: second.id, iterations: [first, second] },
  });

  assert.throws(() => validateArtifactIndex(index), /supersedes.*preceding/i);
});

test('indexed observation rejects current series with duplicate artifact types', () => {
  const taskDir = taskFixture('duplicate-current-type');
  const firstText = artifactText('custom-review', 'code review');
  const secondText = artifactText('custom-review', 'security review');
  const first = iteration('review', 'code', 1, firstText, { type: 'custom-review', summary: 'code review' });
  const second = iteration('review', 'security', 1, secondText, { type: 'custom-review', summary: 'security review' });
  writeIndexedArtifact(taskDir, first, firstText);
  writeIndexedArtifact(taskDir, second, secondText);
  writeArtifactIndex(taskDir, indexFixture('duplicate-current-type', {
    'review.code': { current: first.id, iterations: [first] },
    'review.security': { current: second.id, iterations: [second] },
  }));

  assert.throws(() => observeArtifacts(taskDir), /duplicate current artifact type custom-review/i);
});

test('indexed PR descriptions use indexed paths and retain the special body parser', () => {
  const taskDir = taskFixture();
  const text = '# Pull request\n\n## Purpose\n\nShip index storage.\n\n## Change outline\n\n- Add index.\n';
  const record = iteration('pull-request', 'description', 1, text, { type: 'pr-description', summary: 'Ship index storage.' });
  writeIndexedArtifact(taskDir, record, text);
  writeArtifactIndex(taskDir, indexFixture('indexed-task', {
    'pull-request.description': { current: record.id, iterations: [record] },
  }));

  assert.equal(observeArtifacts(taskDir).latest['pr-description'].summary, 'Ship index storage.');
});

test('invalid indexes fail closed without scanning unindexed legacy artifacts', () => {
  const cases = [
    ['schema', index => { index.$schema = 'skills.task-index/v2'; }, /schema/i],
    ['path', index => { index.artifactSeries['research.primary'].iterations[0].path = '../escape.md'; }, /path/i],
    ['current', index => { index.artifactSeries['research.primary'].current = 'research.primary.0002'; }, /current/i],
    ['supersedes', index => { index.artifactSeries['research.primary'].iterations[0].supersedes = 'research.primary.0000'; }, /supersedes/i],
  ];
  for (const [name, mutate, expected] of cases) {
    const taskDir = taskFixture(`invalid-${name}`);
    const text = artifactText('research', 'indexed research');
    const record = iteration('research', 'primary', 1, text, { summary: 'indexed research' });
    writeIndexedArtifact(taskDir, record, text);
    fs.writeFileSync(path.join(taskDir, '01-research.md'), artifactText('research', 'legacy fallback forbidden'));
    const index = indexFixture(`invalid-${name}`, { 'research.primary': { current: record.id, iterations: [record] } });
    mutate(index);
    fs.writeFileSync(path.join(taskDir, 'index.json'), JSON.stringify(index));

    assert.throws(() => observeArtifacts(taskDir), expected);
  }
});

test('invalid JSON, dangling files, hash mismatches, and metadata mismatches fail closed', () => {
  const malformed = taskFixture('malformed-json');
  fs.writeFileSync(path.join(malformed, 'index.json'), '{');
  assert.throws(() => observeArtifacts(malformed), /index\.json.*JSON/i);

  for (const [slug, setup, expected] of [
    ['dangling-file', () => {}, /does not exist|dangling/i],
    ['hash-mismatch', (taskDir, record, text) => { writeIndexedArtifact(taskDir, record, `${text}changed`); }, /sha-?256|hash/i],
    ['metadata-mismatch', (taskDir, record) => {
      const mismatched = artifactText('research', 'different summary');
      record.sha256 = sha256(mismatched);
      writeIndexedArtifact(taskDir, record, mismatched);
    }, /metadata|summary/i],
  ]) {
    const taskDir = taskFixture(slug);
    const text = artifactText('research', 'indexed research');
    const record = iteration('research', 'primary', 1, text, { summary: 'indexed research' });
    setup(taskDir, record, text);
    fs.writeFileSync(path.join(taskDir, 'index.json'), serializeArtifactIndex(indexFixture(slug, {
      'research.primary': { current: record.id, iterations: [record] },
    })));

    assert.throws(() => observeArtifacts(taskDir), expected);
  }
});

test('dangling index symlinks fail closed in init, read, and Atomic observation', () => {
  const taskDir = taskFixture('dangling-index-symlink');
  fs.symlinkSync(path.join(taskDir, 'missing-index.json'), path.join(taskDir, 'index.json'));

  assert.throws(() => initTaskArtifacts(taskDir), /index symlinks/i);
  assert.throws(() => readArtifactIndex(taskDir), /index symlinks/i);
  assert.throws(() => observeArtifacts(taskDir), /index symlinks/i);
  assert.equal(fs.lstatSync(path.join(taskDir, 'index.json')).isSymbolicLink(), true);
});

test('legacy scan remains unchanged, including pr-description, and deleting index restores it', () => {
  const taskDir = taskFixture('legacy-task');
  fs.writeFileSync(path.join(taskDir, '01-research.md'), artifactText('research', 'legacy first'));
  fs.writeFileSync(path.join(taskDir, '02-research.md'), artifactText('research', 'legacy current'));
  fs.writeFileSync(path.join(taskDir, 'pr-description.md'), '# PR\n\n## Purpose\n\nLegacy purpose.\n\n## Change outline\n\n- Legacy outline.\n');
  const before = observeArtifacts(taskDir);
  assert.equal(before.latest.research.summary, 'legacy current');
  assert.equal(before.latest['pr-description'].summary, 'Legacy purpose.');
  assert.deepEqual(Object.keys(before).sort(), ['hashes', 'latest']);

  writeArtifactIndex(taskDir, indexFixture('legacy-task', {}));
  assert.deepEqual(observeArtifacts(taskDir).latest, {});
  fs.rmSync(path.join(taskDir, 'index.json'));

  assert.deepEqual(observeArtifacts(taskDir), before);
});
