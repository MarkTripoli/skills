#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseAllDocuments} from './yaml-parser.mjs';

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_REPOS = 32;
const MAX_EVIDENCE = 10000;
const MAX_RELATIONSHIPS = 5000;
const MAX_GIT_OUTPUT = 20 * 1024 * 1024;
const MAX_RELATIONSHIP_CANDIDATES = 50000;
const MAX_SELECTOR_LABELS = 16;
const skip = new Set(['node_modules', 'vendor', 'dist', 'build', '.next', 'coverage']);
function git(args, cwd, input) {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, {
    GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '3', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'core.untrackedCache', GIT_CONFIG_VALUE_1: 'false',
    GIT_CONFIG_KEY_2: 'core.splitIndex', GIT_CONFIG_VALUE_2: 'false',
  });
  return execFileSync('git', args, {cwd, env, input, encoding: input === undefined ? 'utf8' : undefined, maxBuffer: MAX_GIT_OUTPUT, stdio: input === undefined ? ['ignore', 'pipe', 'ignore'] : ['pipe', 'pipe', 'ignore']});
}
const safeOrigin = origin => {
  if (origin.length > 512) return null;
  try { const url = new URL(origin.replace(/^git@([^:]+):/, 'ssh://git@$1/')); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return `${url.protocol}//${url.host}${url.pathname.replace(/\.git$/, '')}`; } catch { return null; }
};
const safeLabel = value => typeof value === 'string' && value.length <= 120 && /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/.test(value) && !/(?:password|passwd|secret|token|credential|api[_-]?key)/i.test(value);
const safeSubject = value => typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\.\*|\.>)?$/.test(value) && !/(?:password|passwd|secret|token|credential|api[_-]?key|gh[pousr]_|sk-)/i.test(value);
function safeYamlMappings(node, seen = new Set()) {
  if (!node || typeof node !== 'object') return true;
  if (node.constructor?.name === 'Alias') return false;
  if (seen.has(node)) return true;
  seen.add(node);
  if (!Array.isArray(node.items)) return true;
  const pairs = node.items.filter(item => item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'key'));
  if (pairs.length) {
    const normalized = new Set();
    for (const pair of pairs) {
      const key = pair.key;
      if (!key || !Object.prototype.hasOwnProperty.call(key, 'value') || typeof key.value !== 'string' ||
          (key.tag && key.tag !== 'tag:yaml.org,2002:str') || key.tag === 'tag:yaml.org,2002:merge') return false;
      const normalizedKey = String(key.value);
      if (normalized.has(normalizedKey)) return false;
      normalized.add(normalizedKey);
      if (!safeYamlMappings(key, seen) || !safeYamlMappings(pair.value, seen)) return false;
    }
    return true;
  }
  return node.items.every(item => safeYamlMappings(item, seen));
}
function repoIdentity(name, root) {
  const real = fs.realpathSync(root);
  if (!fs.statSync(real).isDirectory()) throw new Error('not a directory');
  const top = fs.realpathSync(git(['rev-parse', '--show-toplevel'], real).trim());
  if (top !== real) throw new Error('repository root must be the canonical Git toplevel');
  const common = path.resolve(real, git(['rev-parse', '--git-common-dir'], real).trim());
  const origin = safeOrigin(git(['remote', 'get-url', 'origin'], real).trim());
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}'], real).trim();
  if (!origin || !/^[a-f0-9]{40,64}$/i.test(head)) throw new Error('origin or HEAD unavailable');
  return {name, root: real, common, origin, head};
}
function headFiles(repo) {
  const tree = git(['ls-tree', '-r', '-z', '--full-tree', repo.head], repo.root);
  const blobs = []; let incomplete = false;
  for (const record of tree.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t'), [mode, type, oid] = record.slice(0, tab).split(' ');
    const name = record.slice(tab + 1), parts = record.slice(tab + 1).split('/');
    if (name.length > 512 || name.startsWith('/') || name.includes('\\') || parts.some(part => !part || part === '.' || part === '..')) { incomplete = true; continue; }
    if (type !== 'blob' || !['100644', '100755'].includes(mode) || parts.some(part => part.startsWith('.') || skip.has(part)) ||
        !/\.(?:mjs|cjs|js|ts|tsx|jsx|yaml|yml|json)$/.test(name)) continue;
    if (blobs.length >= MAX_FILES) { incomplete = true; break; }
    blobs.push({oid, name});
  }
  if (!blobs.length) return {files: [], incomplete};
  const sizes = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], repo.root, `${blobs.map(blob => blob.oid).join('\n')}\n`).toString('utf8').trim().split('\n');
  const selected = []; let bytes = 0;
  for (let index = 0; index < blobs.length; index++) {
    const size = Number(sizes[index]?.split(' ')[2]);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES || bytes + size > MAX_TOTAL_BYTES) { incomplete = true; continue; }
    selected.push({...blobs[index], size}); bytes += size;
  }
  const data = git(['cat-file', '--batch'], repo.root, `${selected.map(blob => blob.oid).join('\n')}\n`);
  const files = []; let offset = 0;
  for (const blob of selected) {
    const headerEnd = data.indexOf(10, offset);
    if (headerEnd < 0) { incomplete = true; break; }
    const header = data.subarray(offset, headerEnd).toString('ascii');
    const start = headerEnd + 1, end = start + blob.size;
    if (!header.startsWith(`${blob.oid} blob `) || end >= data.length || data[end] !== 10) { incomplete = true; break; }
    files.push({path: blob.name, text: data.subarray(start, end).toString('utf8')});
    offset = end + 1;
  }
  return {files, incomplete};
}
function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index++) if (text.charCodeAt(index) === 10) starts.push(index + 1);
  return starts;
}
function lineAt(starts, index) {
  let low = 0, high = starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle] <= index) low = middle + 1;
    else high = middle;
  }
  return low;
}
function jsonPropertyLines(text, starts) {
  const locations = new Map(), stack = [];
  const record = (parent, key, line) => {
    if (!locations.has(parent)) locations.set(parent, new Map());
    const properties = locations.get(parent);
    properties.set(key, properties.has(key) ? null : line);
  };
  for (let index = 0; index < text.length;) {
    if (text[index] === '"') {
      const start = index++;
      while (index < text.length) {
        if (text[index] === '\\') { index += 2; continue; }
        if (text[index++] === '"') break;
      }
      const end = index;
      let next = end;
      while (/\s/.test(text[next] ?? '')) next++;
      const frame = stack.at(-1);
      if (text[next] === ':' && frame?.type === '{') {
        try {
          const key = JSON.parse(text.slice(start, end));
          record(frame.owner, key, lineAt(starts, start));
          frame.pending = key;
        } catch { return null; }
      }
      continue;
    }
    const char = text[index];
    if (char === '{' || char === '[') {
      const parent = stack.at(-1), owner = parent?.type === '{' ? parent.pending : null;
      if (parent?.type === '{') parent.pending = null;
      stack.push({type: char === '{' ? '{' : '[', owner, pending: null});
    } else if (char === '}' || char === ']') stack.pop();
    else if (char === ',' && stack.at(-1)?.type === '{') stack.at(-1).pending = null;
    index++;
  }
  return locations;
}
function sourceTokens(source) {
  const tokens = [];
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (c === '/' && source[i + 1] === '*') { i += 2; while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '`') { i++; while (i < source.length) { if (source[i] === '\\') i += 2; else if (source[i++] === '`') break; } continue; }
    if (c === "'" || c === '"') {
      const start = i++, contentStart = i; let escaped = false;
      while (i < source.length && source[i] !== c) { if (source[i] === '\\') { escaped = true; i++; } i++; }
      const value = escaped ? null : source.slice(contentStart, i);
      i++;
      tokens.push({type: 'string', value, start});
      continue;
    }
    if (c === '/' && (!tokens.length || ['=', '(', '[', '{', ':', ',', ';', '!', '?', 'return', '=>'].includes(tokens.at(-1).value))) {
      i++; let inClass = false;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '[') inClass = true;
        else if (source[i] === ']') inClass = false;
        else if (source[i] === '/' && !inClass) { i++; while (/[A-Za-z]/.test(source[i] ?? '')) i++; break; }
        i++;
      }
      continue;
    }
    const start = i;
    if (/[A-Za-z_$]/.test(c)) { while (/[A-Za-z0-9_$]/.test(source[i] ?? '')) i++; tokens.push({type: 'id', value: source.slice(start, i), start}); }
    else { tokens.push({type: 'punct', value: c, start}); i++; }
  }
  return tokens;
}
function tokenScopes(tokens) {
  const scopes = new Array(tokens.length), parents = [-1], stack = [0];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value === '}' && stack.length > 1) stack.pop();
    scopes[i] = stack.at(-1);
    if (tokens[i].value === '{') {
      const child = parents.length;
      parents.push(stack.at(-1));
      stack.push(child);
    }
  }
  return {scopes, parents};
}
function natsSubjects(source, limit = MAX_EVIDENCE, starts = lineStarts(source)) {
  const tokens = sourceTokens(source), {scopes, parents} = tokenScopes(tokens);
  const connectFunctions = new Map(), namespaces = new Map(), clients = new Map(), result = [];
  let truncated = false, ambiguous = false, hasNatsBinding = false;
  const value = (i, v) => tokens[i]?.value === v;
  const register = (bindings, name, index, scope = scopes[index]) => {
    if (!name || tokens[index]?.type !== 'id') { ambiguous = true; return; }
    if (bindings.has(name) && bindings.get(name).index !== index) ambiguous = true;
    else bindings.set(name, {index, scope});
  };
  const visible = (binding, scope) => {
    while (scope >= 0) {
      if (scope === binding.scope) return true;
      scope = parents[scope];
    }
    return false;
  };
  for (let i = 0; i < tokens.length; i++) {
    if (value(i, 'import')) {
      let from = i + 1;
      while (from < tokens.length && !value(from, 'from') && tokens[from].value !== ';') from++;
      if (!value(from, 'from')) continue;
      const bindings = tokens.slice(i + 1, from);
      if (tokens[from + 1]?.value === 'nats' && bindings[0]?.value !== 'type') {
        hasNatsBinding = true;
        if (bindings[0]?.value === '*' && bindings[1]?.value === 'as' && bindings[2]?.type === 'id') register(namespaces, bindings[2].value, i + 3, 0);
        for (let j = 0; j < bindings.length; j++) {
          if (bindings[j].value !== 'connect' || bindings[j - 1]?.value === 'type') continue;
          const localOffset = bindings[j + 1]?.value === 'as' ? j + 2 : j;
          register(connectFunctions, bindings[localOffset]?.value, i + 1 + localOffset, 0);
        }
      }
    }
    if (value(i, 'require') && value(i + 1, '(') && tokens[i + 2]?.value === 'nats' && value(i + 3, ')')) {
      if (value(i - 3, 'const') && tokens[i - 2]?.type === 'id' && value(i - 1, '=')) {
        hasNatsBinding = true;
        register(namespaces, tokens[i - 2].value, i - 2);
      }
      if (value(i - 1, '=') && value(i - 2, '}')) {
        let open = i - 3;
        while (open >= 0 && !value(open, '{')) open--;
        if (value(open - 1, 'const')) {
          hasNatsBinding = true;
          for (let j = open + 1; j < i - 2; j++) {
            if (!value(j, 'connect')) continue;
            const localOffset = value(j + 1, ':') ? j + 2 : j;
            register(connectFunctions, tokens[localOffset]?.value, localOffset, scopes[open - 1]);
          }
        }
      }
    }
  }
  if (!hasNatsBinding) return {matches: result, truncated, ambiguous: false};
  const allowed = new Set([...connectFunctions.values(), ...namespaces.values()].map(binding => binding.index));
  for (let i = 0; i + 4 < tokens.length; i++) {
    if (!value(i, 'const') || tokens[i + 1]?.type !== 'id' || !value(i + 2, '=')) continue;
    const name = tokens[i + 1].value; let callee = i + 3;
    if (value(callee, 'await')) callee++;
    const functionBinding = connectFunctions.get(tokens[callee]?.value);
    const namespaceBinding = namespaces.get(tokens[callee]?.value);
    const callsImportedConnect = functionBinding && value(callee + 1, '(') ||
      namespaceBinding && value(callee + 1, '.') && value(callee + 2, 'connect') && value(callee + 3, '(');
    const isConnect = callsImportedConnect && (functionBinding ? visible(functionBinding, scopes[callee]) : visible(namespaceBinding, scopes[callee]));
    if (callsImportedConnect && !isConnect) ambiguous = true;
    if (isConnect) {
      if (clients.has(name)) ambiguous = true;
      else clients.set(name, {index: i + 1, scope: scopes[i + 1]});
    }
  }
  for (const binding of clients.values()) allowed.add(binding.index);
  const candidates = new Set([...connectFunctions.keys(), ...namespaces.keys(), ...clients.keys()]);
  const isCandidate = index => tokens[index]?.type === 'id' && candidates.has(tokens[index].value) && !allowed.has(index);
  const matchingClose = (open, left, right) => {
    let depth = 0;
    for (let index = open; index < tokens.length; index++) {
      if (value(index, left)) depth++;
      else if (value(index, right) && --depth === 0) return index;
    }
    return -1;
  };
  for (let i = 0; i < tokens.length; i++) {
    if (['const', 'let', 'var'].includes(tokens[i].value)) {
      if (isCandidate(i + 1)) ambiguous = true;
      if (value(i + 1, '{') || value(i + 1, '[')) {
        const close = matchingClose(i + 1, tokens[i + 1].value, tokens[i + 1].value === '{' ? '}' : ']');
        for (let j = i + 2; j >= 0 && j < close; j++) if (isCandidate(j)) ambiguous = true;
      }
    }
    if ((value(i, 'function') || value(i, 'class')) && isCandidate(i + 1 + Number(value(i + 1, '*')))) ambiguous = true;
    if (value(i, '(')) {
      const close = matchingClose(i, '(', ')');
      if (close < 0) continue;
      const previous = tokens[i - 1]?.value;
      const next = tokens[close + 1]?.value;
      const parameterList = next === '=>' || value(i - 1, 'function') || value(i - 1, 'catch') ||
        (next === '{' && tokens[i - 1]?.type === 'id' && !['if', 'while', 'for', 'switch', 'with'].includes(previous));
      if (parameterList) for (let j = i + 1; j < close; j++) if (isCandidate(j)) ambiguous = true;
    }
    if (isCandidate(i) && value(i + 1, '=>')) ambiguous = true;
    if (value(i, 'import')) {
      let from = i + 1;
      while (from < tokens.length && !value(from, 'from') && tokens[from].value !== ';') from++;
      if (value(from, 'from') && tokens[from + 1]?.value !== 'nats') {
        for (let j = i + 1; j < from; j++) if (isCandidate(j)) ambiguous = true;
      }
    }
  }
  if (ambiguous) return {matches: result, truncated, ambiguous: true};
  for (let i = 0; i + 5 < tokens.length; i++) {
    const client = clients.get(tokens[i].value);
    if (!client || !value(i + 1, '.') || !['publish', 'subscribe'].includes(tokens[i + 2]?.value) ||
        !value(i + 3, '(') || tokens[i + 4]?.type !== 'string' || !tokens[i + 4].value || !safeSubject(tokens[i + 4].value) ||
        ![',', ')'].includes(tokens[i + 5]?.value)) continue;
    if (!visible(client, scopes[i])) { ambiguous = true; continue; }
    if (result.length >= limit) { truncated = true; break; }
    result.push({kind: tokens[i + 2].value === 'publish' ? 'nats-publish' : 'nats-subscribe', subject: tokens[i + 4].value, line: lineAt(starts, tokens[i].start)});
  }
  if (ambiguous) return {matches: [], truncated, ambiguous: true};
  return {matches: result, truncated, ambiguous: false};
}
function codeEdges(repo, files, maxEdges = MAX_EVIDENCE) {
  const edges = [];
  let incomplete = false, truncated = false;
  const emit = edge => {
    if (edges.length >= maxEdges) { incomplete = true; truncated = true; return false; }
    edges.push(edge); return true;
  };
  for (const file of files) {
    const starts = lineStarts(file.text);
    if (/\.(?:mjs|cjs|js|jsx|ts|tsx)$/.test(file.path)) {
      const subjects = natsSubjects(file.text, Math.max(0, maxEdges - edges.length), starts);
      for (const match of subjects.matches) emit({kind: match.kind, repo: repo.name, subject: match.subject, source: {path: file.path, line: match.line}});
      if (subjects.truncated) { incomplete = true; truncated = true; }
      if (subjects.ambiguous) incomplete = true;
    }
    if (path.posix.basename(file.path) === 'package.json') {
      try {
        const data = JSON.parse(file.text), locations = jsonPropertyLines(file.text, starts);
        const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
        if (typeof data.name === 'string' && safeLabel(data.name)) {
          const line = locations?.get(null)?.get('name') ?? null;
          if (line === null) incomplete = true;
          else emit({kind: 'package-identity', repo: repo.name, package: data.name, source: {path: file.path, line}});
        }
        for (const section of sections) {
          if (data[section] === undefined) continue;
          const line = locations?.get(null)?.get(section) ?? null;
          if (!data[section] || typeof data[section] !== 'object' || Array.isArray(data[section]) || line === null) { incomplete = true; continue; }
          for (const dependency of Object.keys(data[section])) {
            if (!safeLabel(dependency)) continue;
            const dependencyLine = locations?.get(section)?.get(dependency) ?? null;
            if (dependencyLine === null) incomplete = true;
            else emit({kind: 'package-dependency', repo: repo.name, package: dependency, source: {path: file.path, line: dependencyLine}});
          }
        }
      } catch { incomplete = true; }
    }
    if (/\.(yaml|yml)$/.test(file.path)) {
      let docs;
      try { docs = parseAllDocuments(file.text, {uniqueKeys: true, logLevel: 'silent'}); } catch { incomplete = true; continue; }
      if (docs.length > 1) incomplete = true;
      for (const doc of docs) {
        if (doc.errors.length) { incomplete = true; continue; }
        try {
          if (!safeYamlMappings(doc.contents)) { incomplete = true; continue; }
          const resource = doc.toJS();
          if (!resource || typeof resource !== 'object' || Array.isArray(resource)) { incomplete = true; continue; }
          const kind = resource.kind, spec = resource.spec;
          if (!['Service', 'Deployment', 'StatefulSet', 'DaemonSet', 'Pod'].includes(kind) || !spec) { incomplete = true; continue; }
          const name = String(resource.metadata?.name ?? 'unnamed');
          const selector = kind === 'Service' ? (spec.selector ?? {}) :
            kind === 'Pod' ? (resource.metadata?.labels ?? {}) : (spec.template?.metadata?.labels ?? {});
          if (!safeLabel(name) || !selector || typeof selector !== 'object' || Array.isArray(selector) || Object.keys(selector).length > MAX_SELECTOR_LABELS ||
              Object.entries(selector).some(([key, value]) => !safeLabel(key) || !safeLabel(String(value)))) { incomplete = true; continue; }
          const kindNode = doc.get('kind', true);
          if (!kindNode?.range) { incomplete = true; continue; }
          emit({kind: 'kubernetes-declaration', repo: repo.name, resource_kind: kind, name, selector, source: {path: file.path, line: lineAt(starts, kindNode.range[0])}});
        } catch { incomplete = true; }
      }
    }
  }
  return {edges, incomplete, truncated};
}
export function analyze(inputs) {
  let repositories = [];
  const skipped = [];
  if (!Array.isArray(inputs) || inputs.length < 2 || inputs.length > MAX_REPOS) throw new Error('provide between 2 and 32 --repo NAME=PATH roots');
  const names = new Set();
  for (const input of inputs) {
    if (!input || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.name) || !safeLabel(input.name) || names.has(input.name)) throw new Error('repository names must be unique safe operator labels');
    try { repositories.push(repoIdentity(input.name, input.root)); } catch { skipped.push({name: input.name, coverage: 'unavailable'}); }
  }
  const commonCounts = new Map();
  for (const repo of repositories) commonCounts.set(repo.common, (commonCounts.get(repo.common) ?? 0) + 1);
  for (const repo of repositories) if (commonCounts.get(repo.common) > 1) skipped.push({name: repo.name, coverage: 'unavailable', reason: 'duplicate-git-common-dir'});
  repositories = repositories.filter(repo => commonCounts.get(repo.common) === 1);
  const evidence = [];
  for (const repo of repositories) {
    try {
      const snapshot = headFiles(repo);
      const analysis = codeEdges(repo, snapshot.files, MAX_EVIDENCE - evidence.length);
      for (const edge of analysis.edges) evidence.push({...edge, origin: repo.origin, head: repo.head});
      if (snapshot.incomplete || analysis.incomplete) skipped.push({name: repo.name, coverage: 'incomplete', reason: analysis.truncated ? 'evidence-limit' : 'source-not-fully-analyzable'});
    } catch { skipped.push({name: repo.name, coverage: 'unavailable', reason: 'HEAD-tree-unreadable'}); }
  }
  const relations = [];
  let relationTruncated = false;
  const addRelation = relation => {
    if (relations.length >= MAX_RELATIONSHIPS) { relationTruncated = true; return false; }
    relations.push(relation); return true;
  };
  relationSearch: {
    const pubs = new Map(), subs = new Map(), packages = new Map(), identities = new Map();
    const add = (map, key, edge) => {
      if (!map.has(key)) map.set(key, new Map());
      const byRepo = map.get(key);
      if (!byRepo.has(edge.repo)) byRepo.set(edge.repo, []);
      byRepo.get(edge.repo).push(edge);
    };
    for (const edge of evidence) {
      if (edge.kind === 'nats-publish') add(pubs, edge.subject, edge);
      if (edge.kind === 'nats-subscribe') add(subs, edge.subject, edge);
      if (edge.kind === 'package-dependency') add(packages, edge.package, edge);
      if (edge.kind === 'package-identity') add(identities, edge.package, edge);
    }
    for (const [subject, publishers] of pubs) for (const [pubRepo, pubEdges] of publishers) for (const [subRepo, subEdges] of subs.get(subject) ?? []) {
      if (pubRepo === subRepo) continue;
      for (const pub of pubEdges) for (const sub of subEdges) if (!addRelation({kind: 'nats-subject', classification: 'candidate', subject, from: pub, to: sub})) break relationSearch;
    }
    for (const [name, dependents] of packages) for (const [depRepo, depEdges] of dependents) for (const [targetRepo, targetEdges] of identities.get(name) ?? []) {
      if (depRepo === targetRepo) continue;
      for (const dep of depEdges) for (const target of targetEdges) if (!addRelation({kind: 'package-dependency-match', package: name, from: dep, to: target})) break relationSearch;
    }
    const k8s = evidence.filter(edge => edge.kind === 'kubernetes-declaration'), workloadsByLabel = new Map();
    let candidates = 0;
    for (const workload of k8s) if (workload.resource_kind !== 'Service') for (const [key, value] of Object.entries(workload.selector ?? {})) {
      const label = JSON.stringify([key, value]);
      add(workloadsByLabel, label, workload);
    }
    for (const service of k8s) if (service.resource_kind === 'Service') {
      const selector = service.selector ?? {}, entries = Object.entries(selector);
      if (!entries.length) continue;
      for (const [workloadRepo, workloads] of workloadsByLabel.get(JSON.stringify(entries[0])) ?? []) {
        if (workloadRepo === service.repo) continue;
        for (const workload of workloads) {
          if (++candidates > MAX_RELATIONSHIP_CANDIDATES) { relationTruncated = true; break relationSearch; }
          const labels = workload.selector ?? {};
          if (entries.every(([key, value]) => labels[key] === value) &&
              !addRelation({kind: 'kubernetes-selector-match', from: service, to: workload})) break relationSearch;
        }
      }
    }
  }
  if (relationTruncated) for (const repo of repositories) skipped.push({name: repo.name, coverage: 'incomplete', reason: 'relationship-limit'});
  return {schema_version: 1, repositories: repositories.map(({name, origin, head}) => ({name, origin, head})), coverage: skipped.length ? 'incomplete' : 'complete', skipped_roots: skipped, relationships: relations, evidence, security: {credentials_emitted: false, nats_auth: 'uncertain', nats_tls: 'uncertain', http_relationships_inferred: false}};
}
function main(argv) {
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--repo' || !argv[i + 1]) throw new Error('usage: analyze.mjs --repo NAME=PATH --repo NAME=PATH');
    const value = argv[++i], split = value.indexOf('=');
    if (split < 1) throw new Error('each --repo requires NAME=PATH');
    inputs.push({name: value.slice(0, split), root: path.resolve(value.slice(split + 1))});
  }
  process.stdout.write(`${JSON.stringify(analyze(inputs), null, 2)}\n`);
}
let invoked = false;
try { invoked = Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { /* imported module or unresolved entry path */ }
if (invoked) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
