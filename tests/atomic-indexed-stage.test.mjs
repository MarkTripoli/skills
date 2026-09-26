import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARTIFACT_SERIES, initTaskArtifacts } from '../shared/task-artifacts.mjs';
import { initialState, runSkill, SKILLS, stagePrompt } from '../atomic/lib/controller.mjs';
import { observeArtifacts } from '../atomic/lib/artifacts.mjs';
import { expectedArtifactIteration } from '../atomic/lib/stage-prompt.mjs';

const inputs = { verify: false, app_test: 'none', model: 'test-model', model_routing: 'fixed' };

function fixture(t, indexed) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-indexed-stage-'));
  const taskDir = path.join(cwd, 'indexed-stage');
  const skillsDir = path.join(cwd, 'skills');
  fs.mkdirSync(path.join(skillsDir, 'create-research'), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'create-research', 'SKILL.md'), '# create-research\n');
  fs.mkdirSync(path.join(skillsDir, 'route-model'), { recursive: true });
  fs.copyFileSync(path.resolve('skills/delivery/route-model/route-model.mjs'), path.join(skillsDir, 'route-model', 'route-model.mjs'));
  fs.copyFileSync(path.resolve('skills/delivery/route-model/quota.mjs'), path.join(skillsDir, 'route-model', 'quota.mjs'));
  fs.mkdirSync(taskDir);
  fs.writeFileSync(path.join(taskDir, 'task.md'), 'Research indexed stages.\n');
  if (indexed) initTaskArtifacts(taskDir);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  return { cwd, taskDir, skillsDir, runId: 'indexed-stage-run' };
}

test('indexed stage exposes the expected canonical allocation and allocation-record commands', t => {
  const task = fixture(t, true);
  const state = initialState(observeArtifacts(task.taskDir), null);

  const prompt = stagePrompt(task, 'create-research', state, inputs);
  const expected = expectedArtifactIteration(state, 'research');

  assert.deepEqual(expected, { id: 'research.primary.0001', iteration: 1, path: 'artifacts/research/primary/0001.md', kind: 'research', variant: 'primary' });
  assert.match(prompt, /task-artifacts\.mjs.*allocate/s);
  assert.match(prompt, /task-artifacts\.mjs.*record/s);
});

test('closed semantic mapping covers every Atomic output and portable auxiliary artifact', () => {
  for (const type of new Set(Object.values(SKILLS))) assert.ok(ARTIFACT_SERIES[type], `missing ${type}`);
  for (const type of ['evidence', 'execution-plan', 'commit', 'comment-review']) assert.ok(ARTIFACT_SERIES[type], `missing ${type}`);
});

test('legacy stage prompt retains the numbered filename contract', t => {
  const task = fixture(t, false);
  const state = initialState(observeArtifacts(task.taskDir), null);

  const prompt = stagePrompt(task, 'create-research', state, inputs);

  assert.match(prompt, /next numbered filename/);
  assert.doesNotMatch(prompt, /artifacts\/research\/primary\/0001\.md/);
});

test('indexed runSkill rejects an artifact written without updating the current pointer', async t => {
  const task = fixture(t, true);
  const state = initialState(observeArtifacts(task.taskDir), null);
  const ctx = {
    tool: async (_name, _args, callback) => callback(),
    task: async () => {
      const file = path.join(task.taskDir, 'artifacts', 'research', 'primary', '0001.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '---\ntype: research\nsummary: unregistered research\n---\n# Research\n\nBody.\n');
      return { sessionId: 'unregistered-stage', text: 'Done.' };
    },
  };

  await assert.rejects(() => runSkill(ctx, task, state, inputs, 'create-research', 1), /register|current|artifact/i);
});
