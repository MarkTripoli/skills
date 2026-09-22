import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARTIFACT_SERIES } from '../shared/task-artifacts.mjs';
import { TASK_ARTIFACT_DISTRIBUTION } from '../scripts/lib/build.mjs';
import {
  validateConventions,
  validateDeliveryProse,
  validateDistribution,
  validateHelperDistribution,
} from '../scripts/lib/validate-task-artifacts.mjs';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function failures() {
  const found = [];
  return { found, fail: (file, line, message) => found.push({ file, line, message }) };
}

function temporaryDirectory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-artifacts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('validateConventions accepts the repository conventions and canonical artifact series', () => {
  const content = fs.readFileSync(path.join(repo, 'shared', 'CONVENTIONS.md'), 'utf8');
  const result = failures();

  validateConventions(content, result.fail, ARTIFACT_SERIES);

  assert.deepEqual(result.found, []);
});

test('validateConventions rejects a type-to-series table that differs from ARTIFACT_SERIES', () => {
  const content = fs.readFileSync(path.join(repo, 'shared', 'CONVENTIONS.md'), 'utf8')
    .replace('| `plan` | `planning.plan` |', '| `plan` | `planning.wrong` |');
  const result = failures();

  validateConventions(content, result.fail, ARTIFACT_SERIES);

  assert.ok(result.found.some(({ message }) => /ARTIFACT_SERIES/.test(message)));
});

test('validateConventions requires indexed task-root and legacy fallback guarantees', () => {
  const original = fs.readFileSync(path.join(repo, 'shared', 'CONVENTIONS.md'), 'utf8');
  const content = original
    .replace('no directive is consulted', 'a directive may also be consulted')
    .replace('fails closed rather than falling back to a directory scan', 'uses a directory scan')
    .replace('where `index.json` is genuinely absent', 'when convenient');
  const result = failures();

  validateConventions(content, result.fail, ARTIFACT_SERIES);

  assert.equal(result.found.filter(({ message }) => /must document/.test(message)).length, 3);
});

test('validateDeliveryProse rejects stale flat-storage guidance', t => {
  const root = temporaryDirectory(t);
  write(path.join(root, 'create-plan', 'SKILL.md'), 'Select the newest artifact of type plan from the task directory listing.\n');
  const result = failures();

  validateDeliveryProse(root, result.fail);

  assert.ok(result.found.some(({ message }) => /stale task-artifact guidance/.test(message)));
});

test('validateDeliveryProse allows explicit legacy in-place guidance', t => {
  const root = temporaryDirectory(t);
  write(path.join(root, 'iterate-plan', 'SKILL.md'), 'For a legacy task whose index.json is genuinely absent, revise the saved file in place.\n');
  const result = failures();

  validateDeliveryProse(root, result.fail);

  assert.deepEqual(result.found, []);
});

test('validateDistribution enforces each installation mode', () => {
  const invalid = structuredClone(TASK_ARTIFACT_DISTRIBUTION);
  invalid.runtime.required = true;
  invalid.atomic.required = false;
  const result = failures();

  validateDistribution(result.fail, invalid);

  assert.equal(result.found.length, 2);
});

test('validateHelperDistribution rejects a generated helper byte mismatch', t => {
  const root = temporaryDirectory(t);
  const skill = path.join(root, 'skills', 'create-plan');
  for (const helper of ['task-artifacts.mjs', 'task-root.mjs']) {
    write(path.join(skill, 'references', helper), fs.readFileSync(path.join(repo, 'shared', helper)));
  }
  fs.appendFileSync(path.join(skill, 'references', 'task-root.mjs'), '\n// stale copy\n');
  const result = failures();

  validateHelperDistribution({
    root,
    repoRoot: repo,
    skills: [{ name: 'create-plan', dir: skill }],
    generated: true,
    fail: result.fail,
  });

  assert.deepEqual(result.found.map(({ message }) => message), ['generated task-root.mjs must be byte-identical to shared/task-root.mjs']);
});

test('validateHelperDistribution rejects copied helpers in canonical skills', t => {
  const root = temporaryDirectory(t);
  const skill = path.join(root, 'skills', 'delivery', 'create-plan');
  write(path.join(skill, 'references', 'task-artifacts.mjs'), 'copied helper\n');
  const result = failures();

  validateHelperDistribution({
    root,
    repoRoot: repo,
    skills: [{ name: 'create-plan', dir: skill }],
    generated: false,
    fail: result.fail,
  });

  assert.deepEqual(result.found.map(({ message }) => message), ['canonical skills must not carry copied task-artifacts.mjs']);
});
