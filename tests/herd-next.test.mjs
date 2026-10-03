import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const script = 'skills/delivery/herd-next/references/agent_name.sh';
const shells = ['sh', 'bash', 'zsh'].filter((sh) => spawnSync(sh, ['-c', 'exit 0']).status === 0);
const nameIn = (shell, slug, phase, ...existing) => {
  try {
    return execFileSync(shell, ['-c', '. "$1"; shift; agent_name "$@"', shell, script, slug, phase, ...existing], { encoding: 'utf8' }).trim();
  } catch (error) {
    return error.status;
  }
};

// Every case runs in each installed shell and must agree.
const name = (...args) => {
  const results = shells.map((shell) => nameIn(shell, ...args));
  assert.deepEqual(new Set(results).size, 1, `shells disagree: ${shells} -> ${results}`);
  return results[0];
};

test('agent_name keeps the phase and fits 32 characters', () => {
  assert.equal(name('verbose-flag-cli', 'create-plan'), 'verbose-flag-cli-create-plan');
});

test('agent_name never exceeds 32 characters and keeps the phase suffix', () => {
  const out = name('a-very-long-task-slug-for-a-feature', 'implement-plan');
  assert.ok(out.length <= 32, out);
  assert.equal(out, 'a-very-long-task-implement-plan');
});

test('agent_name normalises characters and numbers collisions', () => {
  assert.equal(name('My Task!', 'fix-bug'), 'my-task-fix-bug');
  assert.equal(name('task', 'fix-bug', 'task-fix-bug'), 'task-fix-bug-2');
  assert.equal(name('task', 'fix-bug', 'task-fix-bug', 'task-fix-bug-2'), 'task-fix-bug-3');
});

test('a collision on a long name keeps the phase and cuts the slug', () => {
  const first = name('some-very-long-task-slug-name-here', 'create-plan');
  const second = name('some-very-long-task-slug-name-here', 'create-plan', first);
  assert.equal(second, 'some-very-long-tas-create-plan-2');
  assert.ok(second.length <= 32, second);
});

test('agent_name fails when the name does not start with a letter', () => {
  assert.equal(name('2fast', 'fix-bug'), 1);
});

test('SKILL.md and the stop hook share agent_name.sh', () => {
  for (const file of ['skills/delivery/herd-next/SKILL.md', 'skills/delivery/herd-next/references/stop_hook.sh']) {
    assert.match(fs.readFileSync(file, 'utf8'), /agent_name\.sh/);
  }
});
