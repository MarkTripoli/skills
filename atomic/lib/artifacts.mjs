import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDocument } from 'yaml';
import { indexFileExists, validateArtifactIndex, validateArtifactSemantics } from './artifact-index.mjs';

export {
  TASK_INDEX_SCHEMA,
  TASK_INDEX_VERSION,
  allocateArtifactIteration,
  initTaskArtifacts,
  indexFileExists,
  semanticSeries,
  serializeArtifactIndex,
  validateArtifactIndex,
  validateArtifactSemantics,
  writeArtifactIndex,
} from './artifact-index.mjs';

export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export function frontmatter(text, file = 'artifact') {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end < 2) throw new Error(`${file}: missing YAML frontmatter`);
  const doc = parseDocument(lines.slice(1, end).join('\n'), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(`${file}: ${doc.errors[0].message}`);
  const metadata = doc.toJS();
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') throw new Error(`${file}: frontmatter must be a mapping`);
  return { metadata, body: lines.slice(end + 1).join('\n').trim() };
}

export function section(text, title) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start < 0) return '';
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function readPrDescription(file, text) {
  if (!section(text, 'Purpose') || !section(text, 'Change outline')) throw new Error(`${file}: incomplete PR description`);
  return { file, type: 'pr-description', summary: section(text, 'Purpose'), status: null, text, hash: digest(text), metadata: {} };
}

export function readArtifact(file, options = {}) {
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`${file}: artifact symlinks are not accepted`);
  const text = fs.readFileSync(file, 'utf8');
  if (path.basename(file) === 'pr-description.md' || options.type === 'pr-description') return readPrDescription(file, text);
  const { metadata, body } = frontmatter(text, file);
  if (typeof metadata.type !== 'string' || typeof metadata.summary !== 'string' || !metadata.summary.trim() || !body) throw new Error(`${file}: type, summary and artifact body are required`);
  validateArtifactSemantics(metadata.type, metadata.status ?? null, body, file);
  return { file, type: metadata.type, summary: metadata.summary, status: metadata.status ?? null, text, hash: digest(text), metadata };
}

function legacyArtifacts(taskDir) {
  const latest = {};
  const hashes = {};
  const files = fs.readdirSync(taskDir).filter(name => /^\d{2,}-[a-z0-9-]+\.md$/.test(name) || name === 'pr-description.md').sort((a, b) => Number.parseInt(a) - Number.parseInt(b) || a.localeCompare(b));
  for (const name of files) {
    const artifact = readArtifact(path.join(taskDir, name));
    hashes[artifact.file] = artifact.hash;
    latest[artifact.type] = artifact;
  }
  return { latest, hashes };
}

function indexedFile(taskDir, relativePath) {
  let current = taskDir;
  for (const part of relativePath.split('/')) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) throw new Error(`${relativePath}: indexed artifact does not exist (dangling index)`);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${relativePath}: indexed artifact symlink paths are not accepted`);
  }
  return current;
}

function indexedArtifacts(taskDir, index) {
  const latest = {};
  const hashes = {};
  const artifactSeries = {};
  for (const [identity, series] of Object.entries(index.artifactSeries)) {
    const iterations = series.iterations.map(record => {
      const file = indexedFile(taskDir, record.path);
      const artifact = readArtifact(file, { type: record.type });
      if (artifact.hash !== record.sha256) throw new Error(`${record.id}: SHA-256 hash does not match indexed artifact`);
      if (artifact.type !== record.type || artifact.status !== record.status || artifact.summary !== record.summary) {
        throw new Error(`${record.id}: indexed type, status, or summary metadata does not match artifact`);
      }
      hashes[artifact.file] = artifact.hash;
      return { ...artifact, id: record.id, iteration: record.iteration, path: record.path, supersedes: record.supersedes ?? null };
    });
    const current = iterations.find(artifact => artifact.id === series.current);
    artifactSeries[identity] = { current, iterations };
    if (Object.hasOwn(latest, current.type)) throw new Error(`Artifact index has duplicate current artifact type ${current.type}`);
    latest[current.type] = current;
  }
  return { latest, hashes, index, artifactSeries };
}

export function observeArtifacts(taskDir) {
  const indexFile = path.join(taskDir, 'index.json');
  if (!indexFileExists(indexFile)) return legacyArtifacts(taskDir);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  } catch (error) {
    throw new Error(`${indexFile}: invalid JSON`, { cause: error });
  }
  const index = validateArtifactIndex(value, path.basename(path.resolve(taskDir)));
  return indexedArtifacts(taskDir, index);
}

// Only implementation checklists count. Human-review boxes and fenced examples never do.
export function planProgress(text) {
  const phases = [];
  let fence = null;
  let phase = null;
  let excludedLevel = null;
  const summary = [];
  for (const line of text.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1][0]; else if (marker[1][0] === fence) fence = null; continue; }
    if (fence) continue;
    const heading = line.match(/^(#{2,6})\s+(.+)$/);
    if (heading) {
      const depth = heading[1].length;
      if (excludedLevel !== null && depth <= excludedLevel) excludedLevel = null;
      if (/^(Human Review|Deferred human evidence|Known limits|Open Questions)\b/i.test(heading[2])) { excludedLevel = depth; if (depth === 2) phase = null; }
      const match = heading[2].match(/^(?:Phase|Step)\s+(\d+)\b/i);
      if (match && depth <= 3) { phase = { number: Number(match[1]), total: 0, remaining: 0 }; phases.push(phase); }
      else if (depth === 2) phase = null;
      continue;
    }
    if (excludedLevel !== null) continue;
    const box = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (!box) continue;
    if (phase) { phase.total++; if (box[1] === ' ') phase.remaining++; }
    else if (/^(Phase|Step)\s+\d+\b/i.test(box[2])) summary.push(box[1] !== ' ');
  }
  if (!phases.length || phases.some(phase => !phase.total)) throw new Error('Implementation source must contain numbered phases with executable checklists');
  return { phases, complete: phases.every(phase => !phase.remaining) && summary.every(Boolean), remaining: phases.reduce((n, phase) => n + phase.remaining, 0) + summary.filter(done => !done).length };
}

export function requireFresh(before, after, type, expected = null) {
  const artifact = after.latest[type];
  if (!artifact || before.hashes[artifact.file] === artifact.hash) throw new Error(`Stage did not create or revise its ${type} artifact; agent success is not evidence`);
  if (expected && (artifact.id !== expected.id || artifact.path !== expected.path || after.index?.generation <= before.index.generation)) {
    throw new Error(`Stage did not register ${expected.id} as the current ${type} artifact`);
  }
  return artifact;
}

export function validateChildren(children) {
  if (!children.length) throw new Error('Epic delivery has no child tasks');
  const names = new Set(children.map(child => child.slug));
  if (names.size !== children.length) throw new Error('Duplicate epic child slug');
  for (const child of children) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(child.slug) || !['full', 'lean', 'prd', 'oneshot', 'bugfix'].includes(child.workflow)) throw new Error(`Invalid epic child ${child.slug}`);
    if (!Array.isArray(child.depends_on) || child.depends_on.some(dep => !names.has(dep) || dep === child.slug)) throw new Error(`Invalid dependencies for ${child.slug}`);
  }
  const seen = new Set();
  const active = new Set();
  function visit(name) {
    if (active.has(name)) throw new Error('Epic child dependency cycle');
    if (seen.has(name)) return;
    active.add(name);
    for (const dep of children.find(child => child.slug === name).depends_on) visit(dep);
    active.delete(name); seen.add(name);
  }
  for (const name of names) visit(name);
  return children;
}
