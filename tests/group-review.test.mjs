import assert from 'node:assert/strict';
import test from 'node:test';
import {addedLines, findLine, resolveAnchors} from '../skills/delivery/group-review/scripts/anchors.mjs';
import {gitlabPosition, parseTerm} from '../skills/delivery/group-review/scripts/host.mjs';
import {pending, postAll} from '../skills/delivery/group-review/scripts/post.mjs';
import {duplicatePatches, orderStack} from '../skills/delivery/group-review/scripts/stack.mjs';

const stack = {
  host: 'gitlab',
  requests: [
    {number: 10, ref: '!10', source: 'feature-a', target: 'main', base_sha: 'b0', start_sha: 's0', head_sha: 'h10', url: 'https://example.test/mr/10'},
    {number: 11, ref: '!11', source: 'feature-b', target: 'feature-a', base_sha: 'h10', start_sha: 'h10', head_sha: 'h11', url: 'https://example.test/mr/11'},
  ],
};

test('addedLines reads new-side ranges from zero-context hunks, including single-line and pure-deletion hunks', () => {
  const diff = ['@@ -0,0 +1,3 @@', '+a', '+b', '+c', '@@ -10 +12 @@', '-x', '+y', '@@ -20,2 +23,0 @@', '-gone', '-gone'].join('\n');
  assert.deepEqual([...addedLines(diff)].sort((a, b) => a - b), [1, 2, 3, 12]);
});

test('findLine returns the requested occurrence and null when absent', () => {
  const text = 'one\nmatch here\nthree\nmatch again';
  assert.equal(findLine(text, 'match'), 2);
  assert.equal(findLine(text, 'match', 2), 4);
  assert.equal(findLine(text, 'missing'), null);
});

test('resolveAnchors rejects a line outside the request diff instead of posting a detached note', () => {
  const file = 'line 1\nconst changed = true;\nline 3\nunchanged();';
  const anchors = resolveAnchors(stack, [
    {id: 'D1', mr: '!11', path: 'app.js', pattern: 'const changed'},
    {id: 'D2', mr: 11, path: 'app.js', pattern: 'unchanged()'},
    {id: 'D3', mr: 99, path: 'app.js', pattern: 'x'},
  ], {show: () => file, diff: () => '@@ -1,0 +2 @@\n+const changed = true;'});
  assert.equal(anchors[0].line, 2);
  assert.equal(anchors[0].in_diff, true);
  assert.equal(anchors[1].line, 4);
  assert.equal(anchors[1].in_diff, false);
  assert.match(anchors[2].problem, /not in the stack/);
});

test('orderStack places a request after the request whose source branch it targets', () => {
  const ordered = orderStack([...stack.requests].reverse());
  assert.deepEqual(ordered.map(request => [request.number, request.parent, request.depth]), [[10, null, 0], [11, 10, 1]]);
});

test('duplicatePatches reports a patch carried by two requests and ignores unique patches', () => {
  const duplicates = duplicatePatches({10: [{patchId: 'p1', commit: 'c1'}, {patchId: 'p2', commit: 'c2'}], 11: [{patchId: 'p1', commit: 'c9'}]});
  assert.deepEqual(duplicates, [{patch_id: 'p1', commits: [{request: 10, commit: 'c1'}, {request: 11, commit: 'c9'}]}]);
});

test('parseTerm separates request numbers from search text', () => {
  assert.deepEqual(parseTerm('!3330'), {number: 3330});
  assert.deepEqual(parseTerm('#42'), {number: 42});
  assert.deepEqual(parseTerm('KIT-9310'), {search: 'KIT-9310'});
});

test('gitlabPosition pins the three diff SHAs and the new-side line', () => {
  assert.deepEqual(gitlabPosition(stack.requests[1], {path: 'app.js', line: 2}), {position_type: 'text', base_sha: 'h10', start_sha: 'h10', head_sha: 'h11', old_path: 'app.js', new_path: 'app.js', new_line: 2});
});

function host({heads = {}, inline = true} = {}) {
  const calls = [];
  return {
    calls,
    headSha: number => heads[number] ?? stack.requests.find(request => request.number === number).head_sha,
    post: (request, comment) => { calls.push(comment.id); return {note_id: calls.length, discussion_id: 'd', inline, url: `${request.url}#note_${calls.length}`}; },
  };
}

const comments = [
  {id: 'D1', mr: 10, path: 'a.js', line: 1, in_diff: true, body: 'one'},
  {id: 'D2', mr: 11, path: 'b.js', line: 2, in_diff: true, body: 'two'},
];

test('postAll posts only --only, records it, and skips it on the next run', () => {
  const posted = [];
  const fake = host();
  assert.equal(postAll({stack, comments, posted, only: 'D1', host: fake, save: () => {}, log: () => {}}), 0);
  assert.deepEqual(fake.calls, ['D1']);
  assert.deepEqual(pending(comments, posted).map(comment => comment.id), ['D2']);
  assert.equal(postAll({stack, comments, posted, host: fake, save: () => {}, log: () => {}}), 0);
  assert.deepEqual(fake.calls, ['D1', 'D2']);
});

test('postAll stops before posting when a request head moved since anchoring', () => {
  const fake = host({heads: {11: 'moved'}});
  const lines = [];
  assert.equal(postAll({stack, comments, posted: [], host: fake, save: () => {}, log: line => lines.push(line)}), 3);
  assert.deepEqual(fake.calls, ['D1']);
  assert.match(lines.at(-1), /head moved/);
});

test('postAll refuses unanchored comments and stops on a non-inline result', () => {
  assert.equal(postAll({stack, comments: [{...comments[0], in_diff: false}], posted: [], host: host(), save: () => {}, log: () => {}}), 1);
  const fake = host({inline: false});
  const posted = [];
  assert.equal(postAll({stack, comments, posted, host: fake, save: () => {}, log: () => {}}), 4);
  assert.deepEqual(posted, []);
});
