import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateInstructionSize } from '../scripts/lib/validate-instruction-size.mjs';

function fixture(t, text) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'instruction-caps-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'instructions.md'), text);
  const failures = [];
  return { root, failures, fail: (file, line, message) => failures.push({ file, line, message }), caps: { 'instructions.md': 3 } };
}
test('source instruction caps accept the boundary and reject regrowth with the offending file', t => {
  const input = fixture(t, 'one\t two\n three\n');
  validateInstructionSize(input);
  assert.deepEqual(input.failures, []);
  fs.appendFileSync(path.join(input.root, 'instructions.md'), 'four');
  validateInstructionSize(input);
  assert.deepEqual(input.failures.map(({ file }) => file), ['instructions.md']);
  assert.match(input.failures[0].message, /4 words exceeds its cap of 3/);
});
test('runtime adapter additions are not counted against canonical instruction caps', t => {
  const input = fixture(t, 'one two three four');
  validateInstructionSize({ ...input, generated: true });
  assert.deepEqual(input.failures, []);
});
test('a missing capped source fails instead of silently bypassing the ratchet', t => {
  const input = fixture(t, '');
  fs.unlinkSync(path.join(input.root, 'instructions.md'));
  validateInstructionSize(input);
  assert.deepEqual(input.failures, [{ file: 'instructions.md', line: 0, message: 'capped instruction file missing' }]);
});
