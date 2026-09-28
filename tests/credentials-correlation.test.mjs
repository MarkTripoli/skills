import {spawnSync} from 'node:child_process';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {correlate} from '../skills/delivery/credentials/scripts/correlate.mjs';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/fixtures/shared.env');
function repo(root, name, files) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  for (const [file, value] of Object.entries(files)) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, value);
  }
  requireGit(dir);
  return dir;
}
function requireGit(dir) {
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'add', '-f', '.env*']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'fixture@example.invalid']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Credential Fixture']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'fixture']);
}

function replaceHeadWithRepeatedBlobTree(dir, count, contents, prefix) {
  const oid = execFileSync('git', ['-C', dir, 'hash-object', '-w', '--stdin'], {input: contents, encoding: 'utf8'}).trim();
  const entries = Array.from({length: count}, (_, index) => `100644 blob ${oid}\t${prefix}${String(index).padStart(5, '0')}`).join('\n') + '\n';
  const tree = execFileSync('git', ['-C', dir, 'mktree'], {input: entries, encoding: 'utf8'}).trim();
  const commit = execFileSync('git', ['-C', dir, 'commit-tree', tree, '-m', 'repeated blob fixture'], {encoding: 'utf8'}).trim();
  execFileSync('git', ['-C', dir, 'update-ref', 'HEAD', commit]);
}
function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-correlation-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

test('correlates equal values only across distinct repositories without leaking them', t => {
  const root = temp(t);
  const contents = fs.readFileSync(fixture, 'utf8');
  const secret = 'fixture-shared-token-7Qp';
  const leakingPath = `.env.${secret}`;
  const a = repo(root, 'one', {[leakingPath]: contents});
  const b = repo(root, 'two', {[leakingPath]: contents});
  const report = correlate([a, b]);
  assert.equal(report.findings.length, 1);
  assert.match(report.findings[0].group_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(report.findings[0].locations, [
    {repo_index: 0, path: '.env.\uE000', line: 1, path_redacted: true},
    {repo_index: 1, path: '.env.\uE000', line: 1, path_redacted: true},
  ]);
  assert.equal(JSON.stringify(report).includes('fixture-shared-token-7Qp'), false);
  assert.equal(JSON.stringify(report).includes('API_TOKEN'), false);
});

test('does not report duplicates confined to one repository', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'A=private-repeat\nB=private-repeat\n'});
  const b = repo(root, 'two', {'.env': 'C=other-value\n'});
  assert.deepEqual(correlate([a, b]).findings, []);
});

test('ignores placeholders and gates ignored files on explicit authorization', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'A=changeme\nB=example\n'});
  const b = repo(root, 'two', {'.env': 'C=changeme\nD=example\n'});
  assert.deepEqual(correlate([a, b]).findings, []);
  const ignoredA = path.join(a, '.env.secret');
  const ignoredB = path.join(b, '.env.secret');
  fs.writeFileSync(ignoredA, 'TOKEN=ignored-secret-value\n');
  fs.writeFileSync(ignoredB, 'TOKEN=ignored-secret-value\n');
  for (const dir of [a, b]) fs.writeFileSync(path.join(dir, '.gitignore'), '.env.secret\n');
  assert.throws(() => correlate([a, b], {includeIgnored: true}), /owner authorization/);
  assert.deepEqual(correlate([a, b]).findings, []);
  const report = correlate([a, b], {includeIgnored: true, ownerAuthorized: true});
  assert.equal(report.findings.length, 1);
  assert.equal(JSON.stringify(report).includes('ignored-secret-value'), false);
});

test('rejects duplicate roots and symlinks escaping a selected repository', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'TOKEN=not-reported-alone\n'});
  assert.throws(() => correlate([a, a]), /duplicate repository roots/);
  const outside = path.join(root, 'outside.env');
  fs.writeFileSync(outside, 'TOKEN=outside\n');
  fs.symlinkSync(outside, path.join(a, '.env.external'));
  execFileSync('git', ['-C', a, 'add', '-f', '.env.external']);
  execFileSync('git', ['-C', a, 'commit', '-qm', 'symlink fixture']);
  const b = repo(root, 'two', {'.env': 'TOKEN=not-reported-alone\n'});
  assert.throws(() => correlate([a, b]), /unsafe path/);
});

test('rejects repository subdirectories and linked worktrees as separate selections', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'TOKEN=worktree-fixture\n', 'nested/.env': 'TOKEN=nested-fixture\n'});
  const b = repo(root, 'two', {'.env': 'TOKEN=other-fixture\n'});
  assert.throws(() => correlate([path.join(a, 'nested'), b]), /not the repository root/);
  const linked = path.join(root, 'one-linked');
  execFileSync('git', ['-C', a, 'worktree', 'add', '--detach', linked, 'HEAD']);
  assert.throws(() => correlate([a, linked]), /unsupported repository metadata/);
});

test('Git descriptor launcher resolves commits from ordinary repository metadata', t => {
  const root = temp(t);
  const original = repo(root, 'ordinary', {'.env': 'TOKEN=ordinary-repository\n'});
  const rootFd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const gitMetadataFd = fs.openSync(path.join(original, '.git'), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/scripts/git-from-root.py');
  let result;
  try {
    result = spawnSync('python3', [helper, 'rev-parse', '--verify', 'HEAD^{commit}'], {
      cwd: path.dirname(helper),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore', rootFd, gitMetadataFd],
    });
  } finally {
    fs.closeSync(rootFd);
    fs.closeSync(gitMetadataFd);
  }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), execFileSync('git', ['-C', original, 'rev-parse', '--verify', 'HEAD^{commit}'], {encoding: 'utf8'}).trim());
});
test('Git descriptor launcher stays on the original worktree during pathname rebinding', t => {
  const root = temp(t);
  const original = repo(root, 'original', {'.env': 'TOKEN=original-worktree\n'});
  const linked = path.join(root, 'linked');
  const moved = path.join(root, 'original-held');
  execFileSync('git', ['-C', original, 'worktree', 'add', '--detach', linked, 'HEAD']);
  fs.writeFileSync(path.join(linked, '.env'), 'TOKEN=linked-worktree\n');
  execFileSync('git', ['-C', linked, 'add', '.env']);
  execFileSync('git', ['-C', linked, 'commit', '-qm', 'linked worktree fixture']);
  const originalHead = execFileSync('git', ['-C', original, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const linkedHead = execFileSync('git', ['-C', linked, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  assert.notEqual(originalHead, linkedHead);
  const rootFd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const gitMetadataFd = fs.openSync(path.join(original, '.git'), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/scripts/git-from-root.py');
  let result;
  fs.renameSync(original, moved);
  fs.symlinkSync(linked, original);
  try {
    result = spawnSync('python3', [helper, 'rev-parse', 'HEAD'], {
      cwd: path.dirname(helper),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore', rootFd, gitMetadataFd],
    });
  } finally {
    fs.unlinkSync(original);
    fs.renameSync(moved, original);
    fs.closeSync(rootFd);
    fs.closeSync(gitMetadataFd);
  }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), originalHead);
});

test('Git descriptor launcher ignores a swapped .git link to another worktree', t => {
  const root = temp(t);
  const original = repo(root, 'original', {'.env': 'TOKEN=original-worktree\n'});
  const linked = path.join(root, 'linked');
  const metadata = path.join(original, '.git');
  const heldMetadata = path.join(original, '.git-held');
  execFileSync('git', ['-C', original, 'worktree', 'add', '--detach', linked, 'HEAD']);
  fs.writeFileSync(path.join(linked, '.env'), 'TOKEN=linked-worktree\n');
  execFileSync('git', ['-C', linked, 'add', '.env']);
  execFileSync('git', ['-C', linked, 'commit', '-qm', 'linked worktree fixture']);
  const originalHead = execFileSync('git', ['-C', original, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const linkedHead = execFileSync('git', ['-C', linked, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  assert.notEqual(originalHead, linkedHead);
  const linkedGitFile = fs.readFileSync(path.join(linked, '.git'), 'utf8').trim();
  const linkedGitDir = path.resolve(linked, linkedGitFile.replace(/^gitdir:\s*/, ''));
  const heldLinkedGitDir = path.join(heldMetadata, path.relative(metadata, linkedGitDir));
  const rootFd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const gitMetadataFd = fs.openSync(metadata, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/scripts/git-from-root.py');
  let result;
  fs.renameSync(metadata, heldMetadata);
  fs.symlinkSync(heldLinkedGitDir, metadata);
  try {
    result = spawnSync('python3', [helper, 'rev-parse', '--verify', 'HEAD^{commit}'], {
      cwd: path.dirname(helper),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore', rootFd, gitMetadataFd],
    });
  } finally {
    fs.unlinkSync(metadata);
    fs.renameSync(heldMetadata, metadata);
    fs.closeSync(rootFd);
    fs.closeSync(gitMetadataFd);
  }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), originalHead);
});

test('ignored listing stays on pinned metadata during a .git path swap', t => {
  const root = temp(t);
  const original = repo(root, 'original', {'.env': 'TOKEN=original-metadata\n'});
  const alternate = repo(root, 'alternate', {'.env': 'TOKEN=alternate-metadata\n'});
  const candidate = '.env.fake-metadata-swap';
  fs.writeFileSync(path.join(original, candidate), 'TOKEN=unread-swap-fixture\n');
  fs.writeFileSync(path.join(alternate, '.git', 'info', 'exclude'), `${candidate}\n`);
  const metadata = path.join(original, '.git');
  const heldMetadata = path.join(original, '.git-held');
  const rootFd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const gitMetadataFd = fs.openSync(metadata, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/scripts/git-from-root.py');
  let result;
  fs.renameSync(metadata, heldMetadata);
  fs.symlinkSync(path.join(alternate, '.git'), metadata);
  try {
    result = spawnSync('python3', [helper, '-c', 'core.excludesFile=/dev/null', 'ls-files', '-z', '--others', '--ignored', '--exclude-standard'], {
      cwd: path.dirname(helper),
      encoding: null,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore', rootFd, gitMetadataFd],
    });
  } finally {
    fs.unlinkSync(metadata);
    fs.renameSync(heldMetadata, metadata);
    fs.closeSync(rootFd);
    fs.closeSync(gitMetadataFd);
  }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, 0);
});

test('reads only the pinned directory when its pathname is rebound before helper open', t => {
  const root = temp(t);
  const original = path.join(root, 'original');
  const outside = path.join(root, 'outside');
  const held = path.join(root, 'held');
  fs.mkdirSync(original);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(original, '.env.ignored'), 'TOKEN=descriptor-bound-fixture\n');
  fs.writeFileSync(path.join(outside, '.env.ignored'), 'TOKEN=outside-race-fixture\n');
  const rootFd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/scripts/read-ignored.py');
  fs.renameSync(original, held);
  fs.symlinkSync(outside, original);
  let result;
  try {
    result = spawnSync('python3', [helper, '.env.ignored'], {
      cwd: path.dirname(helper),
      encoding: null,
      maxBuffer: 1024 * 1024 + 1024,
      stdio: ['ignore', 'pipe', 'ignore', rootFd],
    });
  } finally {
    fs.unlinkSync(original);
    fs.renameSync(held, original);
    fs.closeSync(rootFd);
  }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString('utf8'), 'TOKEN=descriptor-bound-fixture\n');
  assert.equal(result.stdout.toString('utf8').includes('outside-race-fixture'), false);
});

test('rejects a corrupted nested Git tree before correlating its apparent blob', t => {
  const root = temp(t);
  const expected = 'TOKEN=synthetic-corrupt-tree-match\n';
  const a = repo(root, 'one', {'nested/.env': 'TOKEN=committed-original\n', '.env.reference': expected});
  const b = repo(root, 'two', {'.env': expected});
  execFileSync('git', ['-C', a, 'add', '-f', '--all']);
  execFileSync('git', ['-C', a, 'commit', '-qm', 'nested environment fixture']);
  const childTree = execFileSync('git', ['-C', a, 'rev-parse', 'HEAD:nested'], {encoding: 'utf8'}).trim();
  const replacementBlob = execFileSync('git', ['-C', a, 'rev-parse', 'HEAD:.env.reference'], {encoding: 'utf8'}).trim();
  const objectPath = path.join(a, '.git', 'objects', childTree.slice(0, 2), childTree.slice(2));
  const rawTree = zlib.inflateSync(fs.readFileSync(objectPath));
  const headerEnd = rawTree.indexOf(0);
  const modeEnd = rawTree.indexOf(0x20, headerEnd + 1);
  const nameEnd = rawTree.indexOf(0, modeEnd + 1);
  assert.notEqual(headerEnd, -1);
  assert.notEqual(modeEnd, -1);
  assert.notEqual(nameEnd, -1);
  const replacementOid = Buffer.from(replacementBlob, 'hex');
  const oidOffset = nameEnd + 1;
  assert.equal(oidOffset + replacementOid.length, rawTree.length);
  replacementOid.copy(rawTree, oidOffset);
  fs.chmodSync(objectPath, 0o644);
  fs.writeFileSync(objectPath, zlib.deflateSync(rawTree));
  assert.throws(() => correlate([a, b]));
});

test('fails closed on repeated oversized blobs, cumulative bytes, and scan work', t => {
  const root = temp(t);
  const other = repo(root, 'other', {'.env': 'TOKEN=not-reported-alone\n'});
  const oversized = repo(root, 'oversized', {'.env': 'TOKEN=small\n'});
  replaceHeadWithRepeatedBlobTree(oversized, 501, Buffer.alloc(8 * 1024 * 1024, 0x41), '.env.');
  assert.throws(() => correlate([oversized, other]), /repository scan limit exceeded/);

  const cumulative = repo(root, 'cumulative', {'.env': 'TOKEN=not-reported-alone\n'});
  replaceHeadWithRepeatedBlobTree(cumulative, 33, Buffer.alloc(1024 * 1024, 0x42), '.env.');
  assert.throws(() => correlate([cumulative, other]), /repository scan limit exceeded/);

  const work = repo(root, 'work', {'.env': 'TOKEN=not-reported-alone\n'});
  replaceHeadWithRepeatedBlobTree(work, 20_001, Buffer.from('x'), 'entry-');
  assert.throws(() => correlate([work, other]), /repository scan limit exceeded/);
});

test('correlates explicitly authorized nested ignored env files', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'TOKEN=one\n'});
  const b = repo(root, 'two', {'.env': 'TOKEN=two\n'});
  for (const dir of [a, b]) {
    fs.mkdirSync(path.join(dir, 'nested'));
    fs.writeFileSync(path.join(dir, '.gitignore'), 'nested/\n');
    fs.writeFileSync(path.join(dir, 'nested', '.env.secret'), 'TOKEN=nested-synthetic-match\n');
  }
  const report = correlate([a, b], {includeIgnored: true, ownerAuthorized: true});
  assert.equal(report.findings.length, 1);
  assert.deepEqual(report.findings[0].locations, [
    {repo_index: 0, path: 'nested/.env.secret', line: 1},
    {repo_index: 1, path: 'nested/.env.secret', line: 1},
  ]);
  assert.equal(JSON.stringify(report).includes('nested-synthetic-match'), false);
});

test('rejects an intermediate symlink while reading ignored env paths', t => {
  const root = temp(t);
  const original = path.join(root, 'original');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(original);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, '.env.secret'), 'TOKEN=outside-intermediate-fixture\n');
  fs.symlinkSync(outside, path.join(original, 'nested'));
  const rootFd = fs.openSync(original, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/credentials/scripts/read-ignored.py');
  let result;
  try {
    result = spawnSync('python3', [helper, 'nested/.env.secret'], {
      cwd: path.dirname(helper),
      encoding: null,
      maxBuffer: 1024 * 1024 + 1024,
      stdio: ['ignore', 'pipe', 'ignore', rootFd],
    });
  } finally {
    fs.closeSync(rootFd);
  }
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.length, 0);
});

test('fails before reading when a selected root is rebound during selection', t => {
  const root = temp(t);
  const a = repo(root, 'one', {'.env': 'TOKEN=original-root-value\n'});
  const b = repo(root, 'two', {'.env': 'TOKEN=second-repo-value\n'});
  const replacement = repo(root, 'replacement', {'.env': 'TOKEN=outside-root-value\n'});
  const moved = path.join(root, 'original-root-moved');
  const originalRealpath = fs.realpathSync;
  let swapped = false;
  fs.realpathSync = function(file, ...args) {
    if (!swapped && path.resolve(String(file)) === b) {
      swapped = true;
      fs.renameSync(a, moved);
      fs.symlinkSync(replacement, a);
    }
    return originalRealpath.call(this, file, ...args);
  };
  try {
    assert.throws(() => correlate([a, b]));
  } finally {
    fs.realpathSync = originalRealpath;
    if (fs.existsSync(a) && fs.lstatSync(a).isSymbolicLink()) fs.unlinkSync(a);
    if (fs.existsSync(moved)) fs.renameSync(moved, a);
  }
  assert.equal(swapped, true);
});
