import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRuntime } from '../scripts/lib/build.mjs';
import { buildTrees, plan } from '../scripts/install.mjs';
import { spawnSync } from 'node:child_process';


test('installed artifact helpers run independently in runtime and portable trees', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-artifacts-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const runtime of ['claude-code', 'codex', 'oh-my-pi', 'pi', 'portable']) {
    const output = path.join(root, runtime);
    if (runtime === 'portable') {
      const planned = plan({ targets: [runtime], skillNames: ['create-plan'], cwd: root, home: root, env: { PATH: '' } });
      buildTrees(planned, root);
    } else buildRuntime(runtime, output, { skillNames: ['create-plan'] });
    const taskDir = path.join(root, 'consumer', runtime);
    fs.mkdirSync(taskDir, { recursive: true });
    const helper = path.join(output, 'skills', 'create-plan', 'references', 'task-artifacts.mjs');
    const result = spawnSync(process.execPath, [helper, 'init', taskDir], { cwd: taskDir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const index = JSON.parse(fs.readFileSync(path.join(taskDir, 'index.json'), 'utf8'));
    assert.equal(index.$schema, 'skills.task-index/v1');
    assert.equal(index.generation, 0);
    assert.deepEqual(index.artifactSeries, {});
    assert.deepEqual(JSON.parse(result.stdout), index, `${runtime}: CLI emits the initialized index`);
  }
});
