import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeTaskRoot, parseTaskRootDirectives, resolveTaskRoot } from '../atomic/lib/task-storage.mjs';

function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-task-storage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function directive(value) {
  return `<!-- skills:task-root=${value} -->\n`;
}

test('resolveTaskRoot defaults to .agents/tasks without a root directive', t => {
  const root = repository(t);

  const result = resolveTaskRoot(root);

  assert.deepEqual(result, {
    absoluteRoot: path.join(root, '.agents', 'tasks'),
    relativeRoot: '.agents/tasks',
  });
});

for (const source of ['AGENTS.md', 'CLAUDE.md']) {
  test(`resolveTaskRoot reads the repository-root ${source} directive`, t => {
    const root = repository(t);
    fs.writeFileSync(path.join(root, source), directive('delivery/tasks'));

    const result = resolveTaskRoot(root);

    assert.deepEqual(result, {
      absoluteRoot: path.join(root, 'delivery', 'tasks'),
      relativeRoot: 'delivery/tasks',
    });
  });
}

test('resolveTaskRoot accepts matching AGENTS.md and CLAUDE.md directives', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), directive('delivery/tasks'));
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), directive('delivery/tasks'));

  assert.equal(resolveTaskRoot(root).relativeRoot, 'delivery/tasks');
});

test('resolveTaskRoot rejects disagreement and names both instruction sources', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), directive('agents/tasks'));
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), directive('claude/tasks'));

  assert.throws(
    () => resolveTaskRoot(root),
    error => /AGENTS\.md/.test(error.message) && /CLAUDE\.md/.test(error.message),
  );
});

test('resolveTaskRoot rejects duplicate directives and names their source', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), `${directive('delivery/tasks')}${directive('delivery/tasks')}`);

  assert.throws(() => resolveTaskRoot(root), /multiple.*AGENTS\.md/i);
});

test('parseTaskRootDirectives ignores non-exact and nested-looking directives', () => {
  const contents = [
    '<!--skills:task-root=ignored/no-space -->',
    '<!-- skills:task-root=accepted/tasks -->',
    '<!-- skills:task-root =ignored/space -->',
  ].join('\n');

  assert.deepEqual(parseTaskRootDirectives(contents), ['accepted/tasks']);
});

const invalidRoots = [
  ['', /empty/i],
  ['.', /segment/i],
  ['tasks/./nested', /segment/i],
  ['tasks/../outside', /segment/i],
  ['tasks//nested', /segment/i],
  ['/absolute/tasks', /absolute/i],
  ['C:\\tasks', /backslash/i],
  ['~/tasks', /home|~/i],
  ['$TASK_ROOT/tasks', /environment/i],
  ['${TASK_ROOT}/tasks', /environment/i],
  ['%TASK_ROOT%/tasks', /environment/i],
  ['%2e%2e/tasks', /escape/i],
  ['tasks\0nested', /NUL/i],
  ['.git', /reserved/i],
  ['.git/tasks', /reserved/i],
  ['.agents/skills', /reserved/i],
  ['.agents/skills/tasks', /reserved/i],
  ['.atomic-delivery', /reserved/i],
  ['.atomic-delivery/tasks', /reserved/i],
  ['Delivery/tasks', /portable/i],
  ['delivery/TaskRoot', /portable/i],
  ['delivery tasks', /portable/i],
  ['delivery/tasks ', /portable/i],
  ['delivery:tasks', /portable/i],
  ['délivery/tasks', /portable/i],
  ['delivery/@tasks', /portable/i],
  ['delivery/tasks!', /portable/i],
];

for (const [value, expected] of invalidRoots) {
  test(`normalizeTaskRoot rejects ${JSON.stringify(value)}`, () => {
    assert.throws(() => normalizeTaskRoot(value, 'AGENTS.md'), expected);
  });
}

test('normalizeTaskRoot accepts lowercase portable path segments', () => {
  assert.equal(normalizeTaskRoot('.agents/tasks'), '.agents/tasks');
  assert.equal(normalizeTaskRoot('delivery_v1/task-root.2'), 'delivery_v1/task-root.2');
});

test('resolveTaskRoot rejects symlinked repository instruction files', t => {
  const root = repository(t);
  const target = path.join(root, 'instructions.md');
  fs.writeFileSync(target, directive('delivery/tasks'));
  fs.symlinkSync(target, path.join(root, 'AGENTS.md'));

  assert.throws(
    () => resolveTaskRoot(root),
    error => /symlink/i.test(error.message) && /AGENTS\.md/.test(error.message),
  );
});

test('resolveTaskRoot rejects dangling repository instruction symlinks', t => {
  const root = repository(t);
  fs.symlinkSync(path.join(root, 'missing.md'), path.join(root, 'AGENTS.md'));

  assert.throws(
    () => resolveTaskRoot(root),
    error => /symlink/i.test(error.message) && /AGENTS\.md/.test(error.message),
  );
});

test('resolveTaskRoot rejects symlinked existing task-root components', t => {
  const root = repository(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-task-storage-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, 'delivery'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), directive('delivery/tasks'));

  assert.throws(
    () => resolveTaskRoot(root),
    error => /symlink/i.test(error.message) && /delivery/.test(error.message),
  );
});

test('resolveTaskRoot rejects dangling task-root component symlinks', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), directive('delivery/tasks'));
  fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'delivery'));

  assert.throws(
    () => resolveTaskRoot(root),
    error => /symlink/i.test(error.message) && /delivery/.test(error.message),
  );
});
