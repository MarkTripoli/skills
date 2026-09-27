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
function safeTrackedFiles(root, includeIgnored) {
  const tracked = git(['ls-files', '-z', '--cached'], root).split('\0').filter(Boolean);
  const names = new Set(tracked.filter(p => envFile(path.posix.basename(p))));
  if (includeIgnored) {
    const ignored = git(['ls-files', '-z', '--others', '--ignored', '--exclude-standard'], root).split('\0').filter(Boolean);
    for (const name of ignored) if (envFile(path.posix.basename(name))) names.add(name);
  }
  const result = [];
  for (const name of names) {
    const absolute = path.resolve(root, name);
    const rel = path.relative(root, absolute);
    if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('unsafe path');
    const real = fs.realpathSync(absolute);
    const realRel = path.relative(root, real);
    if (realRel === '..' || realRel.startsWith(`..${path.sep}`) || path.isAbsolute(realRel)) throw new Error('unsafe path');
    if (!fs.statSync(real).isFile()) continue;
    result.push({name: name.split(path.sep).join('/'), real});
  }
  return result;
}
export function correlate(repositories, {includeIgnored = false, ownerAuthorized = false} = {}) {
  if (!Array.isArray(repositories) || repositories.length < 2) throw new Error('select at least two repositories');
  if (includeIgnored && !ownerAuthorized) throw new Error('ignored-file inclusion requires owner authorization');
  const roots = repositories.map(selected => {
    const real = fs.realpathSync(selected);
    if (!fs.statSync(real).isDirectory()) throw new Error('repository root must be a directory');
    return fs.realpathSync(git(['rev-parse', '--show-toplevel'], real).trim());
  });
  if (new Set(roots).size !== roots.length) throw new Error('duplicate repository roots');
  const seen = new Map();
  for (const [repo, root] of roots.entries()) {
    for (const file of safeTrackedFiles(root, includeIgnored)) {
      const contents = fs.readFileSync(file.real, 'utf8');
      for (const entry of parseEnv(contents)) {
        let repos = seen.get(entry.value);
        if (!repos) seen.set(entry.value, repos = new Map());
        let occurrences = repos.get(repo);
        if (!occurrences) repos.set(repo, occurrences = []);
        occurrences.push({repo_index: repo, path: file.name, line: entry.line});
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
