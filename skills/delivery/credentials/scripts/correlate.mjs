#!/usr/bin/env node
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const envFile = name => name === '.env' || name.startsWith('.env.');
const placeholder = value => !value || /^(?:changeme|change_me|example|placeholder|your[_ -].*|<.*>|\$\{.*\}|\*+|x+)$/i.test(value.trim()) || /^(?:xxx+|todo|none|null)$/i.test(value.trim());
function git(args, cwd, binary = false) {
  const env = {...process.env, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1'};
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE']) delete env[key];
  return execFileSync('git', args, {cwd, encoding: binary ? null : 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], env});
}
function gitAt(common, args, binary = false) {
  return git(['--git-dir', common, ...args], undefined, binary);
}
function gitFromRoot(root, args) {
  assertRootPath(root);
  const env = {...process.env, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1'};
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE']) delete env[key];
  const helper = fileURLToPath(new URL('./git-from-root.py', import.meta.url));
  const result = spawnSync('python3', [helper, ...args], {
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore', root.fd],
    env,
  });
  assertRootPath(root);
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') throw new Error('repository Git operation failed');
  return result.stdout;
}
function verifiedObject(common, oid, type, objectFormat) {
  const bytes = gitAt(common, ['cat-file', type, oid], true);
  const actual = createHash(objectFormat).update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== oid) throw new Error('unsafe object');
  return bytes;
}
function parseEnv(text) {
  const entries = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    value = value.trim();
    if (!placeholder(value)) entries.push({value, line: index + 1});
  }
  return entries;
}
function safeIgnoredBytes(root, name) {
  const parts = name.split('/');
  if (path.posix.isAbsolute(name) || parts.length > 128 || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\'))) throw new Error('unsafe path');
  assertRoot(root);
  const helper = fileURLToPath(new URL('./read-ignored.py', import.meta.url));
  const result = spawnSync('python3', [helper, name], {
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    encoding: null,
    maxBuffer: MAX_IGNORED_BYTES + 1024,
    stdio: ['ignore', 'pipe', 'ignore', root.fd],
  });
  assertRoot(root);
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length > MAX_IGNORED_BYTES) throw new Error('safe ignored read failed');
  return result.stdout.toString('utf8');
}
const MAX_IGNORED_BYTES = 1024 * 1024;
const MAX_TREE_DEPTH = 128;
const MAX_TREE_ENTRIES = 200_000;
function treeEntries(tree, oidBytes) {
  const entries = [];
  let offset = 0;
  while (offset < tree.length) {
    const modeEnd = tree.indexOf(0x20, offset);
    const nameEnd = tree.indexOf(0, modeEnd + 1);
    const oidEnd = nameEnd + 1 + oidBytes;
    if (modeEnd < 0 || nameEnd < 0 || oidEnd > tree.length) throw new Error('unsafe object');
    const nameBytes = tree.subarray(modeEnd + 1, nameEnd);
    const name = nameBytes.toString('utf8');
    const mode = tree.subarray(offset, modeEnd).toString('ascii');
    if (!name || name === '.' || name === '..' || name.includes('/') || !Buffer.from(name, 'utf8').equals(nameBytes) || !['40000', '100644', '100755', '120000', '160000'].includes(mode)) throw new Error('unsafe object');
    entries.push({mode, name, oid: tree.subarray(nameEnd + 1, oidEnd).toString('hex')});
    offset = oidEnd;
  }
  return entries;
}
function trackedEnvFiles(root) {
  const commit = verifiedObject(root.common, root.head, 'commit', root.objectFormat).toString('utf8');
  const treeOid = commit.match(/^tree ([0-9a-f]+)$/m)?.[1];
  if (!treeOid) throw new Error('unsafe object');
  const oidBytes = root.objectFormat === 'sha1' ? 20 : 32;
  const files = [];
  let entryCount = 0;
  function visit(oid, prefix, depth) {
    if (depth > MAX_TREE_DEPTH) throw new Error('unsafe object');
    const tree = verifiedObject(root.common, oid, 'tree', root.objectFormat);
    for (const entry of treeEntries(tree, oidBytes)) {
      if (++entryCount > MAX_TREE_ENTRIES) throw new Error('unsafe object');
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.mode === '40000') {
        visit(entry.oid, relative, depth + 1);
      } else if (envFile(path.posix.basename(entry.name))) {
        if (entry.mode === '120000') throw new Error('unsafe path');
        if (entry.mode === '100644' || entry.mode === '100755') {
          const bytes = verifiedObject(root.common, entry.oid, 'blob', root.objectFormat).toString('utf8');
          files.push({name: relative, bytes});
        }
      }
    }
  }
  visit(treeOid, '', 0);
  return files;
}
function assertRoot(root) {
  assertRootPath(root);
  const common = fs.realpathSync(root.common);
  const commonStat = fs.statSync(common);
  if (common !== root.common || commonStat.dev !== root.commonStat.dev || commonStat.ino !== root.commonStat.ino) throw new Error('repository identity changed');
}
function inputFiles(root, includeIgnored) {
  assertRoot(root);
  const files = trackedEnvFiles(root);
  if (includeIgnored) {
    assertRoot(root);
    const ignored = gitFromRoot(root, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard']).split('\0').filter(Boolean);
    assertRoot(root);
    for (const name of ignored) {
      if (!envFile(path.posix.basename(name))) continue;
      const bytes = safeIgnoredBytes(root, name);
      if (bytes !== null) files.push({name, bytes});
    }
  }
  return files;
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
      const root = {path: real, stat, fd};
      roots.push(root);
      const gitRoot = fs.realpathSync(gitFromRoot(root, ['rev-parse', '--show-toplevel']).trim());
      if (gitRoot !== real) throw new Error('selected path is not the repository root');
      root.common = fs.realpathSync(gitFromRoot(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim());
      root.commonStat = fs.statSync(root.common);
      root.head = gitFromRoot(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
      root.objectFormat = gitFromRoot(root, ['rev-parse', '--show-object-format']).trim();
      if (!/^[0-9a-f]+$/.test(root.head) || !['sha1', 'sha256'].includes(root.objectFormat)) throw new Error('repository identity unavailable');
      assertRoot(root);
    }
    if (new Set(roots.map(item => item.path)).size !== roots.length) throw new Error('duplicate repository roots');
    if (new Set(roots.map(item => item.common)).size !== roots.length) throw new Error('shared repository identity');
    const seen = new Map();
    for (const [repo, root] of roots.entries()) {
      for (const file of inputFiles(root, includeIgnored)) {
        const rel = path.posix.normalize(file.name);
        if (rel === '.' || rel === '..' || rel.startsWith('../') || path.posix.isAbsolute(rel)) throw new Error('unsafe path');
        for (const entry of parseEnv(file.bytes)) {
          let repos = seen.get(entry.value);
          if (!repos) seen.set(entry.value, repos = new Map());
          let occurrences = repos.get(repo);
          if (!occurrences) repos.set(repo, occurrences = []);
          occurrences.push({repo_index: repo, path: rel, line: entry.line});
        }
      }
    }
    const findings = [];
    for (const occurrences of seen.values()) {
      if (occurrences.size < 2) continue;
      findings.push({group_id: randomUUID(), locations: [...occurrences.values()].flat()});
    }
    return {schema_version: 1, findings};
  } finally {
    for (const root of roots) fs.closeSync(root.fd);
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
