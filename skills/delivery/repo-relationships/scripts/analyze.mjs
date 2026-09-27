#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseDocument} from 'yaml';

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_REPOS = 32;
const skip = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.next', 'coverage']);
const git = (args, cwd) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
const safeOrigin = origin => {
  try { const url = new URL(origin.replace(/^git@([^:]+):/, 'ssh://git@$1/')); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return `${url.protocol}//${url.host}${url.pathname.replace(/\.git$/, '')}`; } catch { return null; }
};
const rel = (root, file) => path.relative(root, file).split(path.sep).join('/');
const safeLabel = value => typeof value === 'string' && value.length <= 120 && /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/.test(value) && !/(?:password|passwd|secret|token|credential|api[_-]?key)/i.test(value);
const safeSubject = value => typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\.\*|\.>)?$/.test(value) && !/(?:password|passwd|secret|token|credential|api[_-]?key|gh[pousr]_|sk-)/i.test(value);
function repoIdentity(name, root) {
  const real = fs.realpathSync(root);
  if (!fs.statSync(real).isDirectory()) throw new Error('not a directory');
  const origin = safeOrigin(git(['remote', 'get-url', 'origin'], real));
  const head = git(['rev-parse', 'HEAD'], real);
  if (!origin || !/^[a-f0-9]{40,64}$/i.test(head)) throw new Error('origin or HEAD unavailable');
  return {name, root: real, origin, head};
}
function walk(root) {
  const files = []; let bytes = 0; let incomplete = false;
  function visit(dir, depth = 0) {
    if (depth > 32) { incomplete = true; return; }
    let entries;
    try { entries = fs.readdirSync(dir, {withFileTypes: true}); } catch { incomplete = true; return; }
    for (const entry of entries) {
      if (files.length >= MAX_FILES || bytes >= MAX_TOTAL_BYTES) { incomplete = true; return; }
      if (entry.name.startsWith('.') || skip.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(file, depth + 1);
      else if (entry.isFile() && /\.(?:mjs|cjs|js|ts|tsx|jsx|yaml|yml|json)$/.test(entry.name)) {
        try { const stat = fs.statSync(file); if (stat.size > MAX_FILE_BYTES || bytes + stat.size > MAX_TOTAL_BYTES) { incomplete = true; continue; } files.push({path: rel(root, file), text: fs.readFileSync(file, 'utf8')}); bytes += stat.size; } catch { incomplete = true; }
      }
    }
  }
  visit(root); return {files, incomplete};
}
function lineAt(text, index) { return text.slice(0, index).split('\n').length; }
function codeEdges(repo, files) {
  const edges = [];
  for (const file of files) {
    for (const match of file.text.matchAll(/\.(publish|subscribe)\s*\(\s*(['"`])([A-Za-z0-9_$.*>-]{1,200})\2/g)) {
      if (safeSubject(match[3])) edges.push({kind: match[1] === 'publish' ? 'nats-publish' : 'nats-subscribe', repo: repo.name, subject: match[3], source: {path: file.path, line: lineAt(file.text, match.index)}});
    }
    if (file.path.endsWith('package.json')) {
      try {
        const data = JSON.parse(file.text), deps = {...data.dependencies, ...data.devDependencies, ...data.optionalDependencies, ...data.peerDependencies};
        if (typeof data.name === 'string' && safeLabel(data.name)) edges.push({kind: 'package-identity', repo: repo.name, package: data.name, source: {path: file.path, line: lineAt(file.text, file.text.indexOf(JSON.stringify(data.name)))}});
        for (const dependency of Object.keys(deps ?? {})) if (safeLabel(dependency)) edges.push({kind: 'package-dependency', repo: repo.name, package: dependency, source: {path: file.path, line: lineAt(file.text, file.text.indexOf(JSON.stringify(dependency)))}});
      } catch { /* malformed manifests reduce evidence, not output safety */ }
    }
    if (/\.(yaml|yml)$/.test(file.path)) {
      const doc = parseDocument(file.text, {uniqueKeys: false});
      if (doc.errors.length) continue;
      const obj = doc.toJS();
      const resources = Array.isArray(obj) ? obj : [obj];
      for (const resource of resources) {
        if (!resource || typeof resource !== 'object') continue;
        const kind = resource.kind, spec = resource.spec;
        if (!['Service', 'Deployment', 'StatefulSet', 'DaemonSet', 'Pod'].includes(kind) || !spec) continue;
        const name = String(resource.metadata?.name ?? 'unnamed');
        const selector = kind === 'Service' ? (spec.selector ?? {}) : (spec.template?.metadata?.labels ?? resource.metadata?.labels ?? {});
        if (!safeLabel(name) || !selector || typeof selector !== 'object' || Array.isArray(selector) ||
            Object.entries(selector).some(([key, value]) => !safeLabel(key) || !safeLabel(String(value)))) continue;
        const index = file.text.indexOf(`kind: ${kind}`);
        edges.push({kind: 'kubernetes-declaration', repo: repo.name, resource_kind: kind, name, selector, source: {path: file.path, line: lineAt(file.text, Math.max(index, 0))}});
      }
    }
  }
  return edges;
}
export function analyze(inputs) {
  const repositories = [], skipped = [];
  if (!Array.isArray(inputs) || inputs.length < 2 || inputs.length > MAX_REPOS) throw new Error('provide between 2 and 32 --repo NAME=PATH roots');
  const names = new Set();
  for (const input of inputs) {
    if (!input || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.name) || names.has(input.name)) throw new Error('repository names must be unique safe operator labels');
    names.add(input.name);
    try { repositories.push(repoIdentity(input.name, input.root)); } catch { skipped.push({name: input.name, coverage: 'unavailable'}); }
  }
  const evidence = [];
  for (const repo of repositories) {
    const walked = walk(repo.root), edges = codeEdges(repo, walked.files);
    for (const edge of edges) evidence.push({...edge, origin: repo.origin, head: repo.head});
    if (walked.incomplete) skipped.push({name: repo.name, coverage: 'incomplete'});
  }
  const relations = [];
  for (const pub of evidence.filter(edge => edge.kind === 'nats-publish')) for (const sub of evidence.filter(edge => edge.kind === 'nats-subscribe' && edge.subject === pub.subject && edge.repo !== pub.repo)) relations.push({kind: 'nats-subject', subject: pub.subject, from: pub, to: sub});
  for (const dep of evidence.filter(edge => edge.kind === 'package-dependency')) for (const target of evidence.filter(edge => edge.kind === 'package-identity' && edge.repo !== dep.repo && edge.package === dep.package)) relations.push({kind: 'package-dependency-match', package: dep.package, from: dep, to: target});
  const k8s = evidence.filter(edge => edge.kind === 'kubernetes-declaration');
  for (const service of k8s.filter(edge => edge.resource_kind === 'Service')) for (const workload of k8s.filter(edge => edge.resource_kind !== 'Service' && edge.repo !== service.repo)) {
    const selector = service.selector ?? {}, labels = workload.selector ?? {};
    if (Object.keys(selector).length && Object.entries(selector).every(([key, value]) => labels[key] === value)) relations.push({kind: 'kubernetes-selector-match', from: service, to: workload});
  }
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
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
