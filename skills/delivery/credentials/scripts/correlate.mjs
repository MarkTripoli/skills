#!/usr/bin/env node
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const envFile = name => name === '.env' || name.startsWith('.env.');
const placeholder = value => !value || /^(?:changeme|change_me|example|placeholder|your[_ -].*|<.*>|\$\{.*\}|\*+|x+)$/i.test(value.trim()) || /^(?:xxx+|todo|none|null)$/i.test(value.trim());
function assertRootPath(root) {
  const current = fs.lstatSync(root.path);
  const held = fs.fstatSync(root.fd);
  const gitMetadata = fs.lstatSync(root.gitMetadataPath);
  const heldGitMetadata = fs.fstatSync(root.gitFd);
  if (current.isSymbolicLink() || !current.isDirectory() || current.dev !== root.stat.dev || current.ino !== root.stat.ino || held.dev !== root.stat.dev || held.ino !== root.stat.ino || gitMetadata.isSymbolicLink() || !gitMetadata.isDirectory() || gitMetadata.dev !== root.gitMetadataStat.dev || gitMetadata.ino !== root.gitMetadataStat.ino || heldGitMetadata.dev !== root.gitMetadataStat.dev || heldGitMetadata.ino !== root.gitMetadataStat.ino) {
    throw new Error('repository root or Git metadata changed');
  }
}
function gitFromRoot(root, args, {binary = false} = {}) {
  assertRootPath(root);
  const env = {...process.env, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1'};
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE']) delete env[key];
  const helper = fileURLToPath(new URL('./git-from-root.py', import.meta.url));
  const result = spawnSync('python3', [helper, '--git', root.snapshotPath, ...args], {
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    encoding: binary ? null : 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'ignore', root.fd, root.gitFd],
    env,
  });
  assertRootPath(root);
  if (result.error || result.status !== 0 || (binary ? !Buffer.isBuffer(result.stdout) : typeof result.stdout !== 'string')) throw new Error('repository Git operation failed');
  return result.stdout;
}
function createGitSnapshot(root) {
  const helper = fileURLToPath(new URL('./git-from-root.py', import.meta.url));
  const snapshotPath = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-correlation-git-'));
  const env = {...process.env};
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE']) delete env[key];
  try {
    const result = spawnSync('python3', [helper, '--snapshot', snapshotPath], {
      cwd: path.dirname(fileURLToPath(import.meta.url)),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
      stdio: ['ignore', 'ignore', 'ignore', root.fd, root.gitFd],
      env,
    });
    assertRootPath(root);
    if (result.error || result.status !== 0) throw new Error('repository metadata snapshot failed');
    root.snapshotPath = snapshotPath;
  } catch (error) {
    fs.rmSync(snapshotPath, {recursive: true, force: true});
    throw error;
  }
}
function chargeScanBudget(budget, {files = 0, bytes = 0, work = 0} = {}) {
  budget.files += files;
  budget.bytes += bytes;
  budget.work += work;
  if (budget.files > MAX_ROOT_FILES || budget.bytes > MAX_ROOT_BYTES || budget.work > MAX_ROOT_WORK) {
    throw new Error('repository scan limit exceeded');
  }
}
function verifiedObject(root, oid, type, objectFormat, budget) {
  const bytes = gitFromRoot(root, ['cat-file', type, oid], {binary: true});
  chargeScanBudget(budget, {bytes: bytes.length, work: 1});
  const actual = createHash(objectFormat).update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== oid) throw new Error('unsafe object');
  return bytes;
}
function* parseEnv(bytes, budget) {
  const text = bytes.toString('utf8');
  let start = 0;
  let lineNumber = 0;
  while (start <= text.length) {
    const lineEnd = text.indexOf('\n', start);
    let line = text.slice(start, lineEnd === -1 ? text.length : lineEnd);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    lineNumber++;
    chargeScanBudget(budget, {work: 1});
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) {
      let value = match[2].trim();
      const quote = value[0];
      if (quote === '"' || quote === "'") {
        let end = 1;
        while (end < value.length) {
          if (value[end] === '\\') { end += 2; continue; }
          if (value[end] === quote) break;
          end++;
        }
        if (end >= value.length || !/^(?:\s+#.*)?$/.test(value.slice(end + 1))) continue;
        value = value.slice(1, end).trim();
      } else {
        value = value.replace(/\s+#.*$/, '').trim();
      }
      if (!placeholder(value)) yield {value, line: lineNumber};
    }
    if (lineEnd === -1) break;
    start = lineEnd + 1;
  }
}

function pathRedactionMarker(values) {
  const used = new Set();
  for (const value of values) {
    for (const char of value) {
      const code = char.codePointAt(0);
      if (code >= 0xe000 && code <= 0xf8ff) used.add(code);
    }
  }
  for (let code = 0xe000; code <= 0xf8ff; code++) {
    if (!used.has(code)) return String.fromCodePoint(code);
  }
  throw new Error('repository scan limit exceeded');
}
function safeIgnoredBytes(root, name, budget) {
  const parts = name.split('/');
  if (path.posix.isAbsolute(name) || parts.length > 128 || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\')) || Buffer.byteLength(name, 'utf8') > 4096) throw new Error('unsafe path');
  assertRootPath(root);
  const helper = fileURLToPath(new URL('./read-ignored.py', import.meta.url));
  chargeScanBudget(budget, {work: 1});
  const result = spawnSync('python3', [helper], {
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    input: Buffer.from(name, 'utf8'),
    encoding: null,
    maxBuffer: MAX_IGNORED_BYTES + 1024,
    timeout: 10_000,
    stdio: ['pipe', 'pipe', 'ignore', root.fd],
  });
  assertRootPath(root);
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length > MAX_IGNORED_BYTES) throw new Error('safe ignored read failed');
  chargeScanBudget(budget, {bytes: result.stdout.length});
  return result.stdout;
}
const MAX_ENV_FILE_BYTES = 1024 * 1024;
const MAX_IGNORED_BYTES = MAX_ENV_FILE_BYTES;
const MAX_ROOT_FILES = 4096;
const MAX_ROOT_BYTES = 32 * 1024 * 1024;
const MAX_ROOT_WORK = 20_000;
const MAX_TREE_DEPTH = 128;
function* treeEntries(tree, oidBytes) {
  let offset = 0;
  while (offset < tree.length) {
    const modeEnd = tree.indexOf(0x20, offset);
    if (modeEnd < 0) throw new Error('unsafe object');
    const nameEnd = tree.indexOf(0, modeEnd + 1);
    if (nameEnd < 0) throw new Error('unsafe object');
    const oidEnd = nameEnd + 1 + oidBytes;
    if (oidEnd > tree.length) throw new Error('unsafe object');
    const nameBytes = tree.subarray(modeEnd + 1, nameEnd);
    const name = nameBytes.toString('utf8');
    const mode = tree.subarray(offset, modeEnd).toString('ascii');
    if (!name || name === '.' || name === '..' || name.includes('/') || !Buffer.from(name, 'utf8').equals(nameBytes) || !['40000', '100644', '100755', '120000', '160000'].includes(mode)) throw new Error('unsafe object');
    yield {mode, name, oid: tree.subarray(nameEnd + 1, oidEnd).toString('hex')};
    offset = oidEnd;
  }
}
function* trackedEnvFiles(root, budget) {
  const commit = verifiedObject(root, root.head, 'commit', root.objectFormat, budget).toString('utf8');
  const treeOid = commit.match(/^tree ([0-9a-f]+)$/m)?.[1];
  if (!treeOid) throw new Error('unsafe object');
  const oidBytes = root.objectFormat === 'sha1' ? 20 : 32;
  function* visit(oid, prefix, depth) {
    if (depth > MAX_TREE_DEPTH) throw new Error('unsafe object');
    const tree = verifiedObject(root, oid, 'tree', root.objectFormat, budget);
    for (const entry of treeEntries(tree, oidBytes)) {
      chargeScanBudget(budget, {work: 1});
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.mode === '40000') {
        yield* visit(entry.oid, relative, depth + 1);
      } else if (envFile(path.posix.basename(entry.name))) {
        if (entry.mode === '120000') throw new Error('unsafe path');
        if (entry.mode === '100644' || entry.mode === '100755') {
          chargeScanBudget(budget, {files: 1});
          const bytes = verifiedObject(root, entry.oid, 'blob', root.objectFormat, budget);
          if (bytes.length > MAX_ENV_FILE_BYTES) throw new Error('repository scan limit exceeded');
          yield {name: relative, bytes};
        }
      }
    }
  }
  yield* visit(treeOid, '', 0);
}
function* inputFiles(root, includeIgnored, budget) {
  assertRootPath(root);
  yield* trackedEnvFiles(root, budget);
  if (includeIgnored) {
    assertRootPath(root);
    const ignored = gitFromRoot(root, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard'], {binary: true});
    chargeScanBudget(budget, {bytes: ignored.length, work: 1});
    assertRootPath(root);
    let start = 0;
    while (start < ignored.length) {
      const end = ignored.indexOf(0, start);
      if (end < 0) throw new Error('unsafe path');
      const bytes = ignored.subarray(start, end);
      const name = bytes.toString('utf8');
      if (!Buffer.from(name, 'utf8').equals(bytes)) throw new Error('unsafe path');
      chargeScanBudget(budget, {work: 1});
      if (envFile(path.posix.basename(name))) {
        chargeScanBudget(budget, {files: 1});
        const contents = safeIgnoredBytes(root, name, budget);
        yield {name, bytes: contents};
      }
      start = end + 1;
    }
  }
}
export function correlate(repositories, {includeIgnored = false, ownerAuthorized = false} = {}) {
  if (!Array.isArray(repositories) || repositories.length < 2) throw new Error('select at least two repositories');
  if (includeIgnored && !ownerAuthorized) throw new Error('ignored-file inclusion requires owner authorization');
  const roots = [];
  try {
    for (const selected of repositories) {
      const real = fs.realpathSync(selected);
      const stat = fs.lstatSync(real);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('repository root must be a directory');
      const fd = fs.openSync(real, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | (fs.constants.O_NOFOLLOW ?? 0));
      const openedRoot = fs.fstatSync(fd);
      if (openedRoot.dev !== stat.dev || openedRoot.ino !== stat.ino) { fs.closeSync(fd); throw new Error('repository root changed'); }
      const gitMetadataPath = path.join(real, '.git');
      let gitMetadataStat;
      try {
        gitMetadataStat = fs.lstatSync(gitMetadataPath);
      } catch {
        fs.closeSync(fd);
        throw new Error('selected path is not the repository root');
      }
      if (gitMetadataStat.isSymbolicLink() || !gitMetadataStat.isDirectory()) { fs.closeSync(fd); throw new Error('unsupported repository metadata'); }
      let gitFd;
      try {
        gitFd = fs.openSync(gitMetadataPath, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | (fs.constants.O_NOFOLLOW ?? 0));
      } catch {
        fs.closeSync(fd);
        throw new Error('repository Git metadata changed');
      }
      const openedGitMetadata = fs.fstatSync(gitFd);
      if (openedGitMetadata.dev !== gitMetadataStat.dev || openedGitMetadata.ino !== gitMetadataStat.ino) {
        fs.closeSync(fd);
        fs.closeSync(gitFd);
        throw new Error('repository Git metadata changed');
      }
      const root = {path: real, stat, fd, gitMetadataPath, gitMetadataStat, gitFd, commonStat: openedGitMetadata};
      roots.push(root);
      createGitSnapshot(root);
      root.head = gitFromRoot(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
      root.objectFormat = gitFromRoot(root, ['rev-parse', '--show-object-format']).trim();
      if (!/^[0-9a-f]+$/.test(root.head) || !['sha1', 'sha256'].includes(root.objectFormat)) throw new Error('repository identity unavailable');
      assertRootPath(root);
    }
    if (new Set(roots.map(item => item.path)).size !== roots.length) throw new Error('duplicate repository roots');
    if (new Set(roots.map(item => `${item.commonStat.dev}:${item.commonStat.ino}`)).size !== roots.length) throw new Error('shared repository identity');
    const seen = new Map();
    const budgets = roots.map(() => ({files: 0, bytes: 0, work: 0}));
    for (const [repo, root] of roots.entries()) {
      const budget = budgets[repo];
      for (const file of inputFiles(root, includeIgnored, budget)) {
        const rel = path.posix.normalize(file.name);
        if (rel === '.' || rel === '..' || rel.startsWith('../') || path.posix.isAbsolute(rel)) throw new Error('unsafe path');
        for (const entry of parseEnv(file.bytes, budget)) {
          let repos = seen.get(entry.value);
          if (!repos) seen.set(entry.value, repos = new Map());
          let occurrences = repos.get(repo);
          if (!occurrences) repos.set(repo, occurrences = []);
          occurrences.push({repo_index: repo, path: rel, line: entry.line});
        }
      }
    }
    const redactionValues = [...seen.keys()].sort((a, b) => b.length - a.length);
    let pathMarker;
    const findings = [];
    for (const occurrences of seen.values()) {
      if (occurrences.size < 2) continue;
      const locations = [];
      for (const occurrence of [...occurrences.values()].flat()) {
        let safePath = occurrence.path;
        let pathRedacted = false;
        for (const secret of redactionValues) {
          chargeScanBudget(budgets[occurrence.repo_index], {work: 1});
          if (secret.length > safePath.length) continue;
          if (safePath.includes(secret)) {
            pathMarker ??= pathRedactionMarker(redactionValues);
            safePath = safePath.split(secret).join(pathMarker);
            pathRedacted = true;
          }
        }
        const location = {repo_index: occurrence.repo_index, path: safePath, line: occurrence.line};
        if (pathRedacted) location.path_redacted = true;
        locations.push(location);
      }
      findings.push({group_id: randomUUID(), locations});
    }
    return {schema_version: 1, findings};
  } finally {
    for (const root of roots) {
      if (root.snapshotPath) fs.rmSync(root.snapshotPath, {recursive: true, force: true});
      fs.closeSync(root.fd);
      fs.closeSync(root.gitFd);
    }
  }
}
function cli(args) {
  let includeIgnored = false, ownerAuthorized = false;
  const repositories = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--include-ignored') includeIgnored = true;
    else if (args[i] === '--owner-authorized') ownerAuthorized = true;
    else if (args[i] === '--repo' && args[i + 1]) repositories.push(path.resolve(args[++i]));
    else throw new Error('invalid arguments');
  }
  return correlate(repositories, {includeIgnored, ownerAuthorized});
}
const invoked = (() => { try { return process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; }})();
if (invoked) {
  try { console.log(JSON.stringify(cli(process.argv.slice(2)))); }
  catch { console.error('credential correlation failed; check repository selection and authorization'); process.exitCode = 2; }
}
