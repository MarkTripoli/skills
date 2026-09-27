import test from 'node:test';
import assert from 'node:assert/strict';
import { childBatches } from '../atomic/lib/child-scheduler.mjs';

const child = (slug, write_paths, depends_on = []) => ({ slug, write_paths, depends_on });

test('test fixture concurrency batches independent children together', () => {
  const children = [child('api', ['src/api']), child('ui', ['src/ui'])];

  assert.deepEqual(childBatches(['api', 'ui'], children, 2), [['api', 'ui']]);
  assert.deepEqual(childBatches(['api', 'ui'], children), [['api'], ['ui']]);
});

test('dependency and overlapping path ownership serialize children', () => {
  const children = [
    child('base', ['src/shared'], []),
    child('dependent', ['src/other'], ['base']),
    child('overlap', ['src/shared/handler.ts']),
    child('independent', ['docs/guide']),
  ];

  assert.deepEqual(childBatches(['base', 'dependent', 'overlap', 'independent'], children, 2), [
    ['base', 'independent'],
    ['dependent', 'overlap'],
  ]);
});

test('unknown ownership serializes children conservatively', () => {
  const children = [child('known', ['src/known']), { slug: 'unknown', depends_on: [] }];

  assert.deepEqual(childBatches(['known', 'unknown'], children, 2), [['known'], ['unknown']]);
});
