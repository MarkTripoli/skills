import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {addedLines, findLine} from '../skills/delivery/group-review/scripts/anchors.mjs';
import {parseTerm, remoteContext} from '../skills/delivery/group-review/scripts/host.mjs';
import {duplicatePatches, orderStack} from '../skills/delivery/group-review/scripts/stack.mjs';

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/group-review/scripts');
test('stack ordering and duplicated patches preserve request ownership', () => {
  const ordered = orderStack([{number: 11, source: 'b', target: 'a'}, {number: 10, source: 'a', target: 'main'}]);
  assert.deepEqual(ordered.map(item => [item.number, item.parent, item.depth]), [[10, null, 0], [11, 10, 1]]);
  assert.deepEqual(duplicatePatches({10: [{patchId: 'shared', commit: 'a'}, {patchId: 'unique', commit: 'b'}], 11: [{patchId: 'shared', commit: 'c'}]}), [{patch_id: 'shared', commits: [{request: 10, commit: 'a'}, {request: 11, commit: 'c'}]}]);
});
test('host context supports SSH, HTTPS and explicit GitHub Enterprise without changing repository identity', () => {
  assert.deepEqual(remoteContext('git@github.com:owner/repo.git'), {host: 'github', hostname: 'github.com', repository: 'owner/repo'});
  assert.deepEqual(remoteContext('https://github.example.test/owner/repo.git', 'github'), {host: 'github', hostname: 'github.example.test', repository: 'owner/repo'});
  assert.deepEqual(remoteContext('ssh://git@gitlab.example.test/group/sub/repo.git'), {host: 'gitlab', hostname: 'gitlab.example.test', repository: 'group/sub/repo'});
  assert.throws(() => remoteContext('https://github.com/owner/repo', 'unknown'), /unknown host/);
  assert.throws(() => remoteContext('/tmp/local-repository'), /must identify/);
  assert.throws(() => remoteContext('file:///tmp/local-repository'), /must identify/);
  assert.deepEqual(parseTerm('#42'), {number: 42});
  assert.deepEqual(parseTerm('KIT-123'), {search: 'KIT-123'});
});
test('anchor ranges exclude deletion-only hunks and preserve occurrence', () => {
  assert.deepEqual([...addedLines('@@ -0,0 +1,3 @@\n@@ -10 +12 @@\n@@ -20,2 +23,0 @@')], [1, 2, 3, 12]);
  assert.equal(findLine('\nmatch\nother\nmatch', 'match', 2), 4);
  assert.equal(findLine('nothing', 'absent'), null);
});

function fixture(t, hostname = 'github.com', {host = 'github', rename = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-review-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const repo = path.join(root, 'repo');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(repo); fs.mkdirSync(bin);
  const env = {...process.env, GIT_CONFIG_GLOBAL: path.join(root, 'global'), GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test', PATH: `${bin}${path.delimiter}${process.env.PATH}`};
  const git = (...args) => execFileSync('git', args, {cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init', '-b', 'main');
  const oldPath = rename ? 'old\tapp.js' : 'app.js';
  const currentPath = rename ? 'renamed app.js' : oldPath;
  const initial = '\nconst stable = 1;\n' + (rename ? 'const retained = true;\n'.repeat(8) : '');
  fs.writeFileSync(path.join(repo, oldPath), initial);
  git('add', oldPath); git('commit', '-m', 'base'); const base = git('rev-parse', 'HEAD');
  git('checkout', '-b', 'feature-a');
  if (rename) git('mv', oldPath, currentPath);
  fs.writeFileSync(path.join(repo, currentPath), `${initial}const changed = true;\n`);
  git('add', currentPath); git('commit', '-m', 'first'); const first = git('rev-parse', 'HEAD');
  git('checkout', '-b', 'feature-b');
  fs.appendFileSync(path.join(repo, currentPath), 'const second = true;\n');
  git('add', currentPath); git('commit', '-m', 'second'); const second = git('rev-parse', 'HEAD');
  const requestRefs = host === 'github' ? 'pull' : 'merge-requests';
  git('update-ref', `refs/${requestRefs}/10/head`, first); git('update-ref', `refs/${requestRefs}/11/head`, second);
  git('checkout', 'main');
  git('branch', '-D', 'feature-b'); // Simulate a fork head absent from origin's source branches.
  const remote = `https://${hostname}/owner/repo.git`;
  git('remote', 'add', 'origin', remote);
  git('config', `url.${repo}/.insteadOf`, remote);
  const requests = Object.fromEntries([[10, 'feature-a', 'main', first, base], [11, 'feature-b', 'feature-a', second, first], [12, 'closed', 'main', first, base]].map(([number, source, target, head, start]) => [number, {number, title: `Request ${number}`, state: number === 12 ? 'closed' : 'open', head: {ref: source, sha: head}, base: {ref: target, sha: start}, html_url: `https://${hostname}/owner/repo/pull/${number}`, body: 'Scoped requirement'}]));
  if (host === 'gitlab') {
    for (const [number, request] of Object.entries(requests)) requests[number] = {
      iid: request.number, title: request.title, state: request.state === 'open' ? 'opened' : request.state,
      source_branch: request.head.ref, target_branch: request.base.ref,
      diff_refs: {base_sha: request.base.sha, start_sha: request.base.sha, head_sha: request.head.sha},
      web_url: `https://${hostname}/owner/repo/-/merge_requests/${number}`, description: request.body,
    };
  }
  const fixtureFile = path.join(root, 'requests.json'); fs.writeFileSync(fixtureFile, JSON.stringify(requests));
  env.REQUESTS = fixtureFile; env.POST_LOG = path.join(root, 'posts.jsonl');
  fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const requests = JSON.parse(fs.readFileSync(process.env.REQUESTS, 'utf8'));
if (args[0] === 'pr') { console.log(JSON.stringify(Object.values(requests).map(r => ({number:r.number})))); process.exit(0); }
const endpoint = args.find(a => /^repos\\//.test(a));
const number = endpoint?.match(/pulls\\/(\\d+)/)?.[1];
if (!number || args[args.indexOf('--hostname')+1] !== '${hostname}') process.exit(7);
if (args.includes('POST')) {
 const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
 fs.appendFileSync(process.env.POST_LOG, JSON.stringify(payload)+'\\n');
 console.log(JSON.stringify({id: 100, path: process.env.NON_INLINE ? null : payload.path, line: payload.line, commit_id: payload.commit_id, html_url:'https://${hostname}/owner/repo/pull/'+number+'#discussion_r100'}));
} else { const request = requests[number]; if (process.env.MOVED) request.head.sha='f'.repeat(40); console.log(JSON.stringify(request)); }
`);
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  if (host === 'gitlab') {
    fs.writeFileSync(path.join(bin, 'glab'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const requests = JSON.parse(fs.readFileSync(process.env.REQUESTS, 'utf8'));
const endpoint = args.find(a => /^projects\\//.test(a));
if (!endpoint?.startsWith('projects/owner%2Frepo/merge_requests') || args[args.indexOf('--hostname')+1] !== '${hostname}') process.exit(7);
const number = endpoint.match(/merge_requests\\/(\\d+)/)?.[1];
if (args.includes('POST')) {
 const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
 fs.appendFileSync(process.env.POST_LOG, JSON.stringify(payload)+'\\n');
 const position = {...payload.position, ...(process.env.WRONG_OLD ? {old_path:'wrong.js'} : {})};
 console.log(JSON.stringify({id:'thread100', notes:[{id:100, type:'DiffNote', position}]}));
} else if (number) {
 const request = requests[number]; if (process.env.MOVED) request.diff_refs.head_sha='f'.repeat(40); console.log(JSON.stringify(request));
} else console.log(JSON.stringify(Object.values(requests)));
`);
    fs.chmodSync(path.join(bin, 'glab'), 0o755);
  }
  const cli = (name, args, overrides = {}) => spawnSync(process.execPath, [path.join(scripts, name), ...args], {cwd: repo, env: {...env, ...overrides}, encoding: 'utf8'});
  const stackFile = path.join(root, 'stack.json');
  const discovery = cli('stack.mjs', ['--out', stackFile, ...(host === 'github' && hostname !== 'github.com' ? ['--host', 'github'] : []), 'related']);
  assert.equal(discovery.status, 0, discovery.stderr);
  const stack = JSON.parse(fs.readFileSync(stackFile));
  return {root, env, git, cli, stack, stackFile, first, second, base, oldPath, currentPath, addedLine: initial.split('\n').length};
}

test('actual discovery CLI pins fork request refs, orders a stack and preserves checkout', t => {
  const f = fixture(t);
  assert.deepEqual(f.stack.requests.map(r => [r.number, r.parent, r.head_sha, r.base_sha]), [[10, null, f.first, f.base], [11, 10, f.second, f.first]]);
  assert.deepEqual(f.stack.excluded.map(r => [r.number, r.state]), [[12, 'closed']]);
  assert.deepEqual(f.stack.requests[1].files, ['M\tapp.js']);
  assert.equal(f.git('branch', '--show-current'), 'main');
  assert.equal(f.git('rev-parse', 'HEAD'), f.base);
});

test('anchor and posting CLIs reject unapproved, invalid and moved-head comments before writes', t => {
  const f = fixture(t, 'github.example.test');
  const commentsFile = path.join(f.root, 'comments.json');
  const anchorsFile = path.join(f.root, 'anchors.json');
  const postedFile = path.join(f.root, 'posted.json');
  fs.writeFileSync(commentsFile, JSON.stringify([{id: 'D1', mr: '#10', path: 'app.js', pattern: 'const changed', body: 'This change drops the existing contract.'}]));
  const anchorArgs = ['--stack', f.stackFile, '--in', commentsFile, '--out', anchorsFile];
  let result = f.cli('anchors.mjs', anchorArgs);
  assert.equal(result.status, 0, result.stderr);
  const anchors = JSON.parse(fs.readFileSync(anchorsFile));
  assert.equal(anchors[0].line, 3); // A leading empty line must not be trimmed by git show.
  const postArgs = ['--stack', f.stackFile, '--comments', anchorsFile, '--posted', postedFile];
  result = f.cli('post.mjs', postArgs);
  assert.equal(result.status, 2); assert.match(result.stderr, /explicit user approval/);
  result = f.cli('post.mjs', [...postArgs, '--approved'], {MOVED: '1'});
  assert.equal(result.status, 3, result.stderr); assert.match(result.stdout, /head moved/);
  assert.equal(fs.existsSync(f.env.POST_LOG), false);
  fs.writeFileSync(anchorsFile, JSON.stringify([{...anchors[0], line: 2, in_diff: true}]));
  result = f.cli('post.mjs', [...postArgs, '--approved']);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(fs.existsSync(f.env.POST_LOG), false);
  fs.writeFileSync(anchorsFile, JSON.stringify(anchors));
  result = f.cli('post.mjs', [...postArgs, '--dry-run']);
  assert.equal(result.status, 0, result.stderr); assert.equal(fs.existsSync(postedFile), false);
  result = f.cli('post.mjs', [...postArgs, '--approved', '--only', 'D1']);
  assert.equal(result.status, 0, result.stderr);
  const recorded = JSON.parse(fs.readFileSync(postedFile));
  assert.equal(recorded[0].head_sha, f.first); assert.equal(recorded[0].line, 3);
  result = f.cli('post.mjs', [...postArgs, '--approved']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(f.env.POST_LOG, 'utf8').trim().split('\n').length, 1);
  fs.writeFileSync(commentsFile, JSON.stringify([{id: 'D2', mr: 10, path: 'app.js', line: 2, body: 'Not in diff'}]));
  result = f.cli('anchors.mjs', anchorArgs);
  assert.equal(result.status, 1); assert.match(result.stdout, /outside the request diff/);
});

test('posting stops without success receipt when host returns a non-inline result', t => {
  const f = fixture(t);
  const commentsFile = path.join(f.root, 'comments.json'); const anchorsFile = path.join(f.root, 'anchors.json'); const postedFile = path.join(f.root, 'posted.json');
  fs.writeFileSync(commentsFile, JSON.stringify([{id: 'D1', mr: 10, path: 'app.js', line: 3, body: 'Missing permission boundary.'}]));
  assert.equal(f.cli('anchors.mjs', ['--stack', f.stackFile, '--in', commentsFile, '--out', anchorsFile]).status, 0);
  const result = f.cli('post.mjs', ['--stack', f.stackFile, '--comments', anchorsFile, '--posted', postedFile, '--approved'], {NON_INLINE: '1'});
  assert.equal(result.status, 4, result.stderr); assert.equal(fs.existsSync(postedFile), false);
});

for (const rename of [false, true]) {
  test(`GitLab posting CLI uses the pinned ${rename ? 'renamed' : 'normal'} path pair and denies forged positions`, t => {
    const f = fixture(t, 'gitlab.example.test', {host: 'gitlab', rename});
    const commentsFile = path.join(f.root, 'comments.json');
    const anchorsFile = path.join(f.root, 'anchors.json');
    const postedFile = path.join(f.root, 'posted.json');
    fs.writeFileSync(commentsFile, JSON.stringify([{id: 'R1', mr: '!10', path: f.currentPath, old_path: 'claimed.js', new_path: 'claimed.js', pattern: 'const changed', body: 'The added line violates the contract.'}]));
    const anchorArgs = ['--stack', f.stackFile, '--in', commentsFile, '--out', anchorsFile];
    let result = f.cli('anchors.mjs', anchorArgs);
    assert.equal(result.status, 0, result.stderr);
    const anchors = JSON.parse(fs.readFileSync(anchorsFile));
    const postArgs = ['--stack', f.stackFile, '--comments', anchorsFile, '--posted', postedFile];
    assert.deepEqual([anchors[0].old_path, anchors[0].new_path, anchors[0].line], [f.oldPath, f.currentPath, f.addedLine]);
    result = f.cli('post.mjs', postArgs);
    assert.equal(result.status, 2, result.stderr);
    result = f.cli('post.mjs', [...postArgs, '--approved'], {MOVED: '1'});
    assert.equal(result.status, 3, result.stderr);
    for (const forged of [{old_path: 'forged.js'}, {new_path: 'forged.js'}, {old_path: f.currentPath, new_path: f.oldPath}, {line: 2}, {head_sha: f.base}, {base_sha: f.first}]) {
      if (!rename && forged.old_path === f.currentPath) continue;
      fs.writeFileSync(anchorsFile, JSON.stringify([{...anchors[0], ...forged}]));
      result = f.cli('post.mjs', [...postArgs, '--approved']);
      assert.equal(result.status, 1, `${JSON.stringify(forged)}: ${result.stderr}\n${result.stdout}`);
    }
    assert.equal(fs.existsSync(f.env.POST_LOG), false);
    assert.equal(fs.existsSync(postedFile), false);
    fs.writeFileSync(anchorsFile, JSON.stringify(anchors));
    result = f.cli('post.mjs', [...postArgs, '--approved']);
    assert.equal(result.status, 0, result.stderr);
    const [payload] = fs.readFileSync(f.env.POST_LOG, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(payload, {body: anchors[0].body, position: {
      position_type: 'text', base_sha: f.base, start_sha: f.base, head_sha: f.first,
      old_path: f.oldPath, new_path: f.currentPath, new_line: f.addedLine,
    }});
    const [receipt] = JSON.parse(fs.readFileSync(postedFile));
    assert.deepEqual([receipt.note_id, receipt.discussion_id, receipt.path, receipt.line, receipt.head_sha], [100, 'thread100', f.currentPath, f.addedLine, f.first]);
    assert.equal(f.git('branch', '--show-current'), 'main');
    assert.equal(f.git('rev-parse', 'HEAD'), f.base);
    assert.equal(f.git('status', '--porcelain'), '');
  });
}

test('GitLab posting rejects a returned discussion on a different old path', t => {
  const f = fixture(t, 'gitlab.example.test', {host: 'gitlab', rename: true});
  const commentsFile = path.join(f.root, 'comments.json'); const anchorsFile = path.join(f.root, 'anchors.json'); const postedFile = path.join(f.root, 'posted.json');
  fs.writeFileSync(commentsFile, JSON.stringify([{id: 'R1', mr: 10, path: f.currentPath, pattern: 'const changed', body: 'Missing permission boundary.'}]));
  assert.equal(f.cli('anchors.mjs', ['--stack', f.stackFile, '--in', commentsFile, '--out', anchorsFile]).status, 0);
  const result = f.cli('post.mjs', ['--stack', f.stackFile, '--comments', anchorsFile, '--posted', postedFile, '--approved'], {WRONG_OLD: '1'});
  assert.equal(result.status, 4, result.stderr);
  assert.equal(fs.existsSync(postedFile), false);
});

test('GitHub renamed-file posting keeps the head-side path and RIGHT line semantics', t => {
  const f = fixture(t, 'github.com', {rename: true});
  const commentsFile = path.join(f.root, 'comments.json'); const anchorsFile = path.join(f.root, 'anchors.json'); const postedFile = path.join(f.root, 'posted.json');
  fs.writeFileSync(commentsFile, JSON.stringify([{id: 'R1', mr: 10, path: f.currentPath, pattern: 'const changed', body: 'Missing permission boundary.'}]));
  assert.equal(f.cli('anchors.mjs', ['--stack', f.stackFile, '--in', commentsFile, '--out', anchorsFile]).status, 0);
  const result = f.cli('post.mjs', ['--stack', f.stackFile, '--comments', anchorsFile, '--posted', postedFile, '--approved']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.env.POST_LOG, 'utf8')), {body: 'Missing permission boundary.', commit_id: f.first, path: f.currentPath, line: f.addedLine, side: 'RIGHT'});
});

test('indexed group records keep parallel request scopes distinct and reject tampered current artifacts', async t => {
  const {observeArtifacts} = await import('../shared/task-artifacts.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-review-index-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const dir = path.join(root, 'group-review-fixture');
  fs.mkdirSync(dir);
  const helper = path.resolve(scripts, '../../../../shared/task-artifacts.mjs');
  const command = (...args) => JSON.parse(execFileSync(process.execPath, [helper, ...args], {encoding: 'utf8'}));
  command('init', dir);
  const publish = (variant, type, summary) => {
    const allocation = command('allocate', dir, 'review', variant);
    fs.writeFileSync(path.join(dir, allocation.writePath), `---\ntype: ${type}\nstatus: findings\nsummary: \"${summary}\"\n---\n# Review\nConcrete verified findings.\n`);
    return command('record', dir, 'review', variant, type, allocation.writePath);
  };
  const first = publish('group', 'group-review', 'First consolidated review');
  const prior = fs.readFileSync(path.join(dir, first.path));
  publish('request-10', 'group-request-10-review', 'Request 10 review');
  publish('request-11', 'group-request-11-review', 'Request 11 review');
  const second = publish('group', 'group-review', 'Revised consolidated review');
  assert.equal(second.supersedes, first.id);
  assert.deepEqual(fs.readFileSync(path.join(dir, first.path)), prior);
  assert.equal(command('current', dir, 'group-review').id, second.id);
  const observed = observeArtifacts(dir);
  assert.equal(observed.latest['group-request-10-review'].summary, 'Request 10 review');
  assert.equal(observed.latest['group-request-11-review'].summary, 'Request 11 review');
  assert.equal(observed.latest['group-review'].summary, 'Revised consolidated review');
  fs.appendFileSync(path.join(dir, second.path), 'tampered');
  fs.writeFileSync(path.join(dir, '99-group-review-fallback.md'), '---\ntype: group-review\nstatus: findings\nsummary: \"Must not be selected\"\n---\n');
  assert.throws(() => observeArtifacts(dir), /digest|SHA|sha256|mismatch/i);
});
