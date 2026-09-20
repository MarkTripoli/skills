import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../scripts/check-safety-dance-identity.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'safety-dance-identity-'));
  await mkdir(path.join(root, 'tools/safety-dance'), { recursive: true });
  const copyright = ['Copyright', ' (c) 2026 Kun Chen'].join('');
  await writeFile(path.join(root, 'tools/safety-dance/LICENSE'), ['MIT License', '', copyright, '', 'Permission is hereby granted'].join('\n'));
  return root;
}

test('accepts the legal notice and excludes task history', async () => {
  const root = await fixture();
  await mkdir(path.join(root, '.agents/tasks'), { recursive: true });
  await writeFile(path.join(root, '.agents/tasks/history.txt'), ['no', '-', 'mistakes'].join(''));
  assert.deepEqual(await scan(root), []);
  await rm(root, { recursive: true, force: true });
});

test('reports retired identity with path and line', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'bad.txt'), `safe\n${['no', '-', 'mistakes'].join('')} command\n`);
  const findings = await scan(root);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^bad\.txt:2:/);
  await rm(root, { recursive: true, force: true });
});

test('reports missing or incomplete license', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'tools/safety-dance/LICENSE'), 'not a license');
  assert.ok((await scan(root)).some(line => line.includes('missing imported MIT notice')));
  await rm(root, { recursive: true, force: true });
});
