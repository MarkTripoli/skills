import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRuntime, TASK_ARTIFACT_DISTRIBUTION } from '../scripts/lib/build.mjs';
import { buildTrees, plan } from '../scripts/install.mjs';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canonical = fs.readFileSync(path.join(repo, 'shared', 'task-artifacts.mjs'), 'utf8');

test('runtime builds install the canonical artifact helper beside every selected skill', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-artifacts-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const runtime of ['claude-code', 'codex', 'oh-my-pi', 'pi']) {
    const output = path.join(root, runtime);
    buildRuntime(runtime, output, { skillNames: ['create-plan'] });
    assert.equal(fs.readFileSync(path.join(output, 'skills', 'create-plan', 'references', 'task-artifacts.mjs'), 'utf8'), canonical);
  }
});

test('portable build uses the same canonical artifact helper bytes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-artifacts-portable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const planned = plan({ targets: ['portable'], skillNames: ['create-plan'], cwd: root, home: root, env: { PATH: '' } });

  const built = buildTrees(planned, path.join(root, 'build')).get('portable');

  assert.equal(fs.readFileSync(path.join(built, 'skills', 'create-plan', 'references', 'task-artifacts.mjs'), 'utf8'), canonical);
});

test('raw and plugin skills retain an explicit safe manual fallback contract without copied helpers', () => {
  const sourceSkill = path.join(repo, 'skills', 'delivery', 'create-plan');
  const plugin = JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), 'utf8'));

  assert.equal(fs.existsSync(path.join(sourceSkill, 'references', 'task-artifacts.mjs')), false);
  assert.ok(plugin.skills.includes('./skills/delivery/create-plan'));
  assert.equal(TASK_ARTIFACT_DISTRIBUTION.canonical.mode, 'manual-index-mutation');
  assert.equal(TASK_ARTIFACT_DISTRIBUTION.plugin.mode, 'manual-index-mutation');
  assert.deepEqual(TASK_ARTIFACT_DISTRIBUTION.atomic, { mode: 'adjacent-helper', required: true });
  assert.deepEqual(TASK_ARTIFACT_DISTRIBUTION.canonical.contract, {
    schema: 'skills.task-index/v1',
    validate: 'full-existing-index-and-relative-nonsymlink-artifact-path',
    allocation: 'reserve-generation-and-next-contiguous-four-digit',
    staging: '.artifact-staging/<uuid>.md',
    reservation: '.artifact-reservations/<uuid>.json-exclusive-create',
    digest: 'sha256-exact-utf8',
    recordFields: ['id', 'iteration', 'path', 'sha256', 'type', 'status', 'summary'],
    supersedes: 'prior-current-or-omit-first',
    current: 'new-record-id',
    generationIncrement: 1,
    publish: 'exclusive-hard-link-staging-to-semantic-path',
    write: 'exclusive-sibling-temp-atomic-rename',
    rollback: 'remove-published-artifact-if-index-write-fails',
    cleanup: 'remove-staging-and-reservation-after-success',
    onConflict: 'abort',
  });
});
