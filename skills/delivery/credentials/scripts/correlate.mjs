#!/usr/bin/env node
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const envFile = name => name === '.env' || name.startsWith('.env.');
const placeholder = value => !value || /^(?:changeme|change_me|example|placeholder|your[_ -].*|<.*>|\$\{.*\}|\*+|x+)$/i.test(value.trim()) || /^(?:xxx+|todo|none|null)$/i.test(value.trim());
function git(args, cwd) {
  return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
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
function inside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
function safeIgnoredBytes(root, name) {
  const absolute = path.resolve(root, name);
  if (!inside(root, absolute)) throw new Error('unsafe path');
  const check = () => {
    let cursor = root;
    for (const part of path.relative(root, absolute).split(path.sep)) {
      cursor = path.join(cursor, part);
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('unsafe path');
    }
    const real = fs.realpathSync(absolute);
    if (!inside(root, real)) throw new Error('unsafe path');
    return fs.lstatSync(absolute);
  };
  const before = check();
  if (!before.isFile()) return null;
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error('unsafe path');
    const bytes = fs.readFileSync(fd, 'utf8');
    const after = check();
    if (after.dev !== opened.dev || after.ino !== opened.ino) throw new Error('unsafe path');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function inputFiles(root, includeIgnored) {
  const staged = git(['ls-files', '--stage', '-z'], root).split('\0').filter(Boolean);
  const tracked = [];
  for (const record of staged) {
    const match = record.match(/^(\d{6}) ([0-9a-f]+) (\d+)\t(.+)$/s);
    if (!match || !envFile(path.posix.basename(match[4]))) continue;
    if (match[1] === '120000') throw new Error('unsafe path');
    if (match[3] !== '0') continue;
    tracked.push({name: match[4], bytes: git(['cat-file', 'blob', match[2]], root)});
  }
  const files = [...tracked];
  if (includeIgnored) {
    const ignored = git(['ls-files', '-z', '--others', '--ignored', '--exclude-standard'], root).split('\0').filter(Boolean);
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
  const roots = repositories.map(selected => {
    const real = fs.realpathSync(selected);
    if (!fs.statSync(real).isDirectory()) throw new Error('repository root must be a directory');
    const gitRoot = fs.realpathSync(git(['rev-parse', '--show-toplevel'], real).trim());
    if (gitRoot !== real) throw new Error('selected path is not the repository root');
    return {root: real, common: fs.realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], real).trim())};
  });
  if (new Set(roots.map(item => item.root)).size !== roots.length) throw new Error('duplicate repository roots');
  if (new Set(roots.map(item => item.common)).size !== roots.length) throw new Error('shared repository identity');
  const seen = new Map();
  for (const [repo, {root}] of roots.entries()) {
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
