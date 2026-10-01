import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '..');
function put(root, file, text) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}
test('plugin workers resolve their canonical references and stale retired workers disappear', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-plugin-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ['scripts/sync-plugin.mjs', 'scripts/lib/build.mjs', 'scripts/lib/layout.mjs']) put(root, file, fs.readFileSync(path.join(repo, file)));
  put(root, 'package.json', JSON.stringify({ name: '@marktripoli/skills', version: '1.2.3' }));
  put(root, '.claude-plugin/plugin.json', JSON.stringify({ name: 'skills', version: '0.0.0', skills: [] }));
  put(root, 'skills/delivery/agent-builder/SKILL.md', '---\nname: agent-builder\ndescription: Build one thing.\n---\n\n[Input](references/input.md#example)\n[Neighbor](../example/SKILL.md)\n');
  put(root, 'skills/delivery/agent-builder/references/input.md', '# Input\n');
  put(root, 'skills/delivery/example/SKILL.md', '---\nname: example\ndescription: Example.\n---\n');
  put(root, 'agents/agent-first-sergent.md', 'retired generated worker\n');
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts/sync-plugin.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  const before = run('--check');
  assert.equal(before.status, 1);
  assert.equal(fs.readFileSync(path.join(root, 'agents/agent-first-sergent.md'), 'utf8'), 'retired generated worker\n');
  const sync = run();
  assert.equal(sync.status, 0, sync.stderr);
  assert.equal(fs.existsSync(path.join(root, 'agents/agent-first-sergent.md')), false);
  const worker = fs.readFileSync(path.join(root, 'agents/agent-builder.md'), 'utf8');
  for (const [, link] of worker.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)) assert.ok(fs.existsSync(path.resolve(root, 'agents', link)), link);
  const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  assert.deepEqual(plugin.skills, ['./skills/delivery/agent-builder', './skills/delivery/example']);
  assert.equal(plugin.version, '1.2.3');
  assert.equal(run('--check').status, 0);
});
