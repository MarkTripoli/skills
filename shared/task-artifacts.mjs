#!/usr/bin/env node
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { resolveTaskRoot } from './task-root.mjs';

export { DEFAULT_TASK_ROOT, normalizeTaskRoot, parseTaskRootDirectives, resolveTaskRoot } from './task-root.mjs';

export const TASK_INDEX_SCHEMA = 'skills.task-index/v1'; export const TASK_INDEX_VERSION = 1;
export const ARTIFACT_SERIES = Object.freeze({
  sources: ['research', 'sources'], 'research-questions': ['research', 'questions'], research: ['research', 'primary'], 'design-discussion': ['design', 'discussion'],
  'design-prd': ['design', 'prd'], 'design-tdd': ['design', 'tdd'], 'structure-outline': ['planning', 'structure'], plan: ['planning', 'plan'],
  'epic-plan': ['planning', 'epic'], 'epic-delivery': ['delivery', 'epic'], reproduction: ['debugging', 'reproduction'], fix: ['implementation', 'fix'],
  implementation: ['implementation', 'receipt'], verification: ['review', 'verification'], 'app-test': ['review', 'browser'], 'code-review': ['review', 'code'],
  'code-review-fixes': ['review', 'fixes'], 'pr-description': ['pull-request', 'description'], 'pr-review': ['pull-request', 'review'], evidence: ['evidence', 'recording'],
  'execution-plan': ['orchestration', 'execution'], commit: ['delivery', 'commit'], 'evidence-iteration': ['evidence', 'iteration'],
  'comment-review': ['review', 'comments'],
});

const semanticName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; const digestPattern = /^[a-f0-9]{64}$/;
const rootKeys = new Set(['$schema', 'schemaVersion', 'task', 'generation', 'artifactSeries']); const seriesKeys = new Set(['current', 'iterations']);
const iterationKeys = new Set(['id', 'iteration', 'path', 'sha256', 'type', 'status', 'summary', 'supersedes']); const artifactStatuses = Object.freeze({ reproduction: ['reproduced', 'not-reproduced'], verification: ['passed', 'failed', 'blocked'], 'code-review': ['clean', 'findings', 'blocked'], 'app-test': ['passed', 'failed', 'blocked'], 'pr-review': ['approved', 'pending', 'blocked'], 'evidence-iteration': ['in-progress', 'passed', 'blocked', 'failed'] });

function object(value, label) { if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(`Artifact index ${label} must be an object`); return value; }
function keys(value, allowed, label) {
  const unknown = Object.keys(value).find(key => !allowed.has(key)); if (unknown !== undefined) throw new Error(`Artifact index ${label} has unknown key ${unknown}`);
}
function text(value, label) { if (typeof value !== 'string' || !value.trim()) throw new Error(`Artifact index ${label} must be a non-empty string`); }
function validateArtifactStatus(type, status, file) {
  const allowed = artifactStatuses[type]; if (allowed && !allowed.includes(status)) throw new Error(`${file}: invalid ${type} status ${status}`);
  if (!allowed && Object.hasOwn(ARTIFACT_SERIES, type) && status !== null) throw new Error(`${file}: ${type} status must be null`);
}
function validateRecord(record, identity, position, identities, paths) {
  object(record, `${identity} iteration ${position + 1}`); keys(record, iterationKeys, `${identity} iteration ${position + 1}`);
  const [kind, variant] = identity.split('.'); const iteration = position + 1;
  const suffix = String(iteration).padStart(4, '0'); const expectedId = `${identity}.${suffix}`;
  const expectedPath = `artifacts/${kind}/${variant}/${suffix}.md`;
  if (record.iteration !== iteration) throw new Error(`Artifact index ${identity} iterations must be contiguous positive integers`);
  if (record.id !== expectedId) throw new Error(`Artifact index iteration id must be ${expectedId}`);
  if (record.path !== expectedPath || path.isAbsolute(record.path) || record.path.includes('\0') || record.path.split('/').includes('..')) throw new Error(`Artifact index iteration path must be ${expectedPath}`);
  if (identities.has(record.id) || paths.has(record.path)) throw new Error(`Artifact index iteration ${record.id} or path is duplicated`);
  identities.add(record.id); paths.add(record.path); if (!digestPattern.test(record.sha256)) throw new Error(`Artifact index ${record.id} requires a lowercase SHA-256 digest`);
  text(record.type, `${record.id} type`); text(record.summary, `${record.id} summary`);
  const canonical = ARTIFACT_SERIES[record.type]; if (canonical && identity !== canonical.join('.')) throw new Error(`Artifact type ${record.type} requires semantic series ${canonical.join('.')}`);
  if (record.status !== null && typeof record.status !== 'string') throw new Error(`Artifact index ${record.id} status must be a string or null`);
  validateArtifactStatus(record.type, record.status, `Artifact index ${record.id}`);
  if (position === 0 && record.supersedes !== undefined) throw new Error(`Artifact index ${record.id} supersedes cannot reference an earlier iteration`);
  if (position > 0 && record.supersedes !== `${identity}.${String(position).padStart(4, '0')}`) throw new Error(`Artifact index ${record.id} supersedes must reference the preceding iteration`);
}

export function validateArtifactIndex(value, expectedTask) {
  const index = object(value, 'root'); if (index.$schema !== TASK_INDEX_SCHEMA) throw new Error(`Artifact index $schema must be ${TASK_INDEX_SCHEMA}`);
  keys(index, rootKeys, 'root');
  if (index.schemaVersion !== TASK_INDEX_VERSION) throw new Error(`Artifact index schemaVersion must be ${TASK_INDEX_VERSION}`);
  if (typeof index.task !== 'string' || !semanticName.test(index.task)) throw new Error('Artifact index task must be a lowercase kebab-case slug');
  if (expectedTask !== undefined && index.task !== expectedTask) throw new Error(`Artifact index task ${index.task} does not match ${expectedTask}`);
  if (!Number.isSafeInteger(index.generation) || index.generation < 0) throw new Error('Artifact index generation must be a non-negative integer');
  const artifactSeries = object(index.artifactSeries, 'artifactSeries'); const identities = new Set(); const paths = new Set();
  for (const [identity, value] of Object.entries(artifactSeries)) {
    const parts = identity.split('.'); if (parts.length !== 2 || parts.some(part => !semanticName.test(part))) throw new Error(`Artifact index series ${identity} must use <kind>.<variant>`);
    const series = object(value, `series ${identity}`); keys(series, seriesKeys, `series ${identity}`);
    if (!Array.isArray(series.iterations) || series.iterations.length === 0) throw new Error(`Artifact index series ${identity} requires ordered iterations`);
    series.iterations.forEach((record, position) => validateRecord(record, identity, position, identities, paths));
    if (series.current !== series.iterations.at(-1).id) throw new Error(`Artifact index series ${identity} current must reference its latest iteration`);
  }
  const iterationCount = [...Object.values(artifactSeries)].reduce((total, series) => total + series.iterations.length, 0);
  if (index.generation !== iterationCount) throw new Error('Artifact index generation must equal total iteration count');
  return index;
}
export function serializeArtifactIndex(index) { validateArtifactIndex(index); return `${JSON.stringify(index, null, 2)}\n`; }
export function createArtifactIndex(task) { return { $schema: TASK_INDEX_SCHEMA, schemaVersion: TASK_INDEX_VERSION, task, generation: 0, artifactSeries: {} }; }
export function readArtifactIndex(taskDir) {
  const file = path.join(taskDir, 'index.json'); indexFileExists(file);
  try {
    const index = validateArtifactIndex(JSON.parse(fs.readFileSync(file, 'utf8')), path.basename(path.resolve(taskDir)));
    validateArtifactLedger(taskDir, index); return index;
  }
  catch (error) { if (error instanceof SyntaxError) throw new Error(`${file}: invalid JSON`); throw error; }
}
export function indexFileExists(file) {
  try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`${file}: index symlinks are not accepted`); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}
export function allocateArtifactIteration(index, kind, variant) {
  validateArtifactIndex(index);
  if (!semanticName.test(kind) || !semanticName.test(variant)) throw new Error('Artifact kind and variant must be lowercase kebab-case');
  const identity = `${kind}.${variant}`; const prior = index.artifactSeries[identity]?.iterations ?? []; const iteration = prior.length + 1;
  if (iteration > 9999) throw new Error(`Artifact series ${identity} exhausted its four-digit iteration space`);
  const suffix = String(iteration).padStart(4, '0');
  return { id: `${identity}.${suffix}`, iteration, path: `artifacts/${kind}/${variant}/${suffix}.md`, ...(prior.length ? { supersedes: prior.at(-1).id } : {}) };
}
export function writeArtifactIndex(taskDir, index) {
  validateArtifactIndex(index, path.basename(path.resolve(taskDir)));
  const target = path.join(taskDir, 'index.json');
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, serializeArtifactIndex(index), { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, target); }
  catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
}

function deadOwner(lock) {
  let owner; try { if (fs.lstatSync(lock).isSymbolicLink()) return null; owner = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch { return null; }
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.token !== 'string' || !owner.token) return null;
  try { process.kill(owner.pid, 0); return null; } catch (error) { return error?.code === 'ESRCH' ? owner : null; }
}
function reclaimDeadLock(lock) {
  const owner = deadOwner(lock); if (!owner) return false; const tombstone = `${lock}.stale.${crypto.randomUUID()}`;
  try {
    fs.renameSync(lock, tombstone); const moved = JSON.parse(fs.readFileSync(tombstone, 'utf8'));
    if (moved.pid !== owner.pid || moved.token !== owner.token || !deadOwner(tombstone)) throw new Error('Concurrent index lock changed during recovery');
    fs.rmSync(tombstone); return true;
  } catch (error) { fs.rmSync(tombstone, { force: true }); if (error?.code === 'ENOENT') return false; throw error; }
}
function withLock(taskDir, operation) {
  const lock = path.join(taskDir, '.index.json.lock'); const token = crypto.randomUUID(); let descriptor;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { descriptor = fs.openSync(lock, 'wx'); fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, token })}\n`); break; }
    catch (error) { if (descriptor !== undefined) { fs.closeSync(descriptor); fs.rmSync(lock, { force: true }); descriptor = undefined; } if (error?.code !== 'EEXIST' || !reclaimDeadLock(lock)) throw error?.code === 'EEXIST' ? new Error('Concurrent index update; allocation is stale') : error; }
  }
  if (descriptor === undefined) throw new Error('Concurrent index update; allocation is stale'); try { return operation(); }
  finally { fs.closeSync(descriptor); const owner = JSON.parse(fs.readFileSync(lock, 'utf8')); if (owner.token !== token) throw new Error('Index lock ownership changed'); fs.rmSync(lock); }
}
export function initTaskArtifacts(taskDir) {
  return withLock(taskDir, () => {
    const file = path.join(taskDir, 'index.json'); if (indexFileExists(file)) return readArtifactIndex(taskDir);
    const index = createArtifactIndex(path.basename(path.resolve(taskDir))); writeArtifactIndex(taskDir, index);
    return index;
  });
}
export function semanticSeries(type, kind, variant) {
  const mapped = ARTIFACT_SERIES[type]; if (mapped && (kind === undefined || (mapped[0] === kind && mapped[1] === variant))) return { kind: mapped[0], variant: mapped[1], identity: `${mapped[0]}.${mapped[1]}` };
  if (mapped) throw new Error(`Artifact type ${type} requires semantic series ${mapped.join('.')}`);
  if (!semanticName.test(kind ?? '') || !semanticName.test(variant ?? '')) throw new Error(`Unknown artifact type ${type}; supply explicit safe kind and variant`);
  return { kind, variant, identity: `${kind}.${variant}` };
}
function scalar(raw, label) {
  const value = raw.trim();
  if (!value || /^[\[\]{}|>&*!]/.test(value)) throw new Error(`${label} must be a scalar`);
  if (value.startsWith('"')) { try { const parsed = JSON.parse(value); if (typeof parsed === 'string') return parsed; } catch {} throw new Error(`${label} must be a valid quoted scalar`); }
  if (value.startsWith("'")) { if (!value.endsWith("'")) throw new Error(`${label} must be a valid quoted scalar`); return value.slice(1, -1).replace(/''/g, "'"); }
  return value;
}
function section(body, title) {
  const lines = body.split('\n'); const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line)); return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}
export function validateArtifactSemantics(type, status, body, file = 'artifact') {
  validateArtifactStatus(type, status, file);
  if (type === 'reproduction' && status === 'reproduced' && (!section(body, 'Reproduction') || !section(body, 'Cause') || !section(body, 'Fix'))) throw new Error(`${file}: reproduced requires reproduction evidence, cause and fix`);
  if (type === 'code-review' && status === 'clean') {
    const findings = section(body, 'Critical and Required Findings'); if (!findings || /^###\s+CR-/m.test(findings)) throw new Error(`${file}: clean review still contains required findings or lacks their section`);
  }
  if (!['verification', 'app-test'].includes(type) || status !== 'passed') return;
  const heading = type === 'verification' ? 'Items' : 'Steps';
  const allowed = type === 'verification' ? new Set(['pass', 'fail', 'untested']) : new Set(['pass', 'fail', 'unreachable']);
  const rows = section(body, heading).split('\n').filter(line => line.trim().startsWith('|')).map(line => line.split('|').slice(1, -1).map(cell => cell.trim().toLowerCase()));
  const header = rows.shift();
  if (!header || !header.includes('verdict')) throw new Error(`${file}: passed evidence requires a ${heading} verdict table`);
  const verdict = header.indexOf('verdict'); const actual = rows.filter(row => row.length && !row.every(cell => /^-+$/.test(cell)));
  if (!actual.length || actual.some(row => !row[verdict] || !allowed.has(row[verdict])) || actual.some(row => row[verdict] !== 'pass')) throw new Error(`${file}: passed status contradicts evidence verdicts`);
}
export function parseArtifactText(text, expectedType, file = 'artifact') {
  const body = text.replace(/\r\n/g, '\n');
  if (expectedType === 'pr-description') {
    const summary = section(body, 'Purpose'); if (!summary || !section(body, 'Change outline')) throw new Error(`${file}: incomplete PR description`);
    return { type: expectedType, summary, status: null, text };
  }
  const lines = body.split('\n'); const end = lines.indexOf('---', 1); const values = {};
  if (lines[0] !== '---' || end < 2) throw new Error(`${file}: missing frontmatter`);
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue; const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))$/.exec(line);
    if (!match) throw new Error(`${file}: frontmatter supports top-level scalar fields only`);
    if (Object.hasOwn(values, match[1])) throw new Error(`${file}: duplicate frontmatter key ${match[1]}`);
    values[match[1]] = match[2];
  }
  const type = scalar(values.type ?? '', `${file}: type`); const summary = scalar(values.summary ?? '', `${file}: summary`);
  const statusValue = values.status === undefined ? null : scalar(values.status, `${file}: status`); const status = statusValue === 'null' || statusValue === '~' ? null : statusValue;
  if (type !== expectedType) throw new Error(`${file}: artifact type ${type} does not match ${expectedType}`);
  const artifactBody = lines.slice(end + 1).join('\n').trim(); if (!artifactBody) throw new Error(`${file}: artifact body is required`);
  validateArtifactSemantics(type, status, artifactBody, file);
  return { type, summary, status, text };
}
export function readArtifactScalars(file, expectedType) {
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`${file}: artifact symlinks are not accepted`); return parseArtifactText(fs.readFileSync(file, 'utf8'), expectedType, file);
}
function safeArtifactFile(taskDir, artifactPath) {
  const root = path.resolve(taskDir); const file = path.resolve(root, artifactPath); if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Artifact task directory cannot be a symlink');
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Artifact path escapes task directory');
  let current = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    current = path.join(current, part); try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Artifact path cannot contain symlinks'); }
    catch (error) { if (error?.code === 'ENOENT') throw new Error(`${artifactPath}: indexed artifact does not exist (dangling index)`); throw error; }
  }
  return file;
}
function validateArtifactLedger(taskDir, index) {
  for (const series of Object.values(index.artifactSeries)) for (const record of series.iterations) {
    const file = safeArtifactFile(taskDir, record.path); const metadata = readArtifactScalars(file, record.type); const hash = crypto.createHash('sha256').update(metadata.text).digest('hex');
    if (hash !== record.sha256) throw new Error(`${record.id}: SHA-256 hash does not match indexed artifact`); if (metadata.type !== record.type || metadata.status !== record.status || metadata.summary !== record.summary) throw new Error(`${record.id}: indexed type, status, or summary metadata does not match artifact`);
  }
}
function ensureDirectory(taskDir, relativePath) {
  let current = path.resolve(taskDir);
  for (const part of relativePath.split('/')) {
    current = path.join(current, part); try { const stat = fs.lstatSync(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${relativePath}: artifact directory path is unsafe`); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; fs.mkdirSync(current); }
  }
  return current;
}
export function reserveArtifactIteration(taskDir, kind, variant) {
  return withLock(taskDir, () => {
    const index = readArtifactIndex(taskDir); const allocation = allocateArtifactIteration(index, kind, variant);
    const reservation = crypto.randomUUID(); const writePath = `.artifact-staging/${reservation}.md`;
    ensureDirectory(taskDir, '.artifact-staging'); ensureDirectory(taskDir, '.artifact-reservations');
    const value = { ...allocation, kind, variant, generation: index.generation, reservation, writePath };
    fs.writeFileSync(path.join(taskDir, '.artifact-reservations', `${reservation}.json`), `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
    return value;
  });
}
export function recordArtifact(taskDir, kind, variant, type, artifactPath) {
  return withLock(taskDir, () => {
    const { identity } = semanticSeries(type, kind, variant); const file = safeArtifactFile(taskDir, artifactPath); const relative = path.relative(path.resolve(taskDir), file).split(path.sep).join('/');
    const match = /^\.artifact-staging\/([a-f0-9-]+)\.md$/.exec(relative);
    if (!match) throw new Error('Artifact record requires an allocated staging write path');
    const reservationFile = safeArtifactFile(taskDir, `.artifact-reservations/${match[1]}.json`); const reservation = JSON.parse(fs.readFileSync(reservationFile, 'utf8')); const index = readArtifactIndex(taskDir);
    if (reservation.reservation !== match[1] || reservation.writePath !== relative || reservation.kind !== kind || reservation.variant !== variant) throw new Error('Stale allocation reservation or index generation');
    const metadata = readArtifactScalars(file, type); const sha256 = crypto.createHash('sha256').update(metadata.text).digest('hex');
    const committed = index.artifactSeries[identity]?.iterations.find(record => record.id === reservation.id);
    if (committed) {
      const expected = { id: reservation.id, iteration: reservation.iteration, path: reservation.path, ...(reservation.supersedes ? { supersedes: reservation.supersedes } : {}), sha256, type, status: metadata.status, summary: metadata.summary };
      const target = safeArtifactFile(taskDir, reservation.path); if (reservation.generation >= index.generation || Object.keys(committed).length !== Object.keys(expected).length || Object.entries(expected).some(([key, value]) => committed[key] !== value) || !fs.readFileSync(target).equals(fs.readFileSync(file))) throw new Error('Committed artifact conflicts with allocation reservation or staging bytes');
      fs.rmSync(file); fs.rmSync(reservationFile); return committed;
    }
    const allocation = allocateArtifactIteration(index, kind, variant); if (reservation.generation !== index.generation || reservation.id !== allocation.id || reservation.iteration !== allocation.iteration || reservation.path !== allocation.path || reservation.supersedes !== allocation.supersedes) throw new Error('Stale allocation reservation or index generation');
    const record = { ...allocation, sha256, type, status: metadata.status, summary: metadata.summary };
    const next = structuredClone(index); const prior = next.artifactSeries[identity]?.iterations ?? [];
    next.artifactSeries[identity] = { current: record.id, iterations: [...prior, record] }; next.generation += 1;
    const targetDir = ensureDirectory(taskDir, `artifacts/${kind}/${variant}`); const target = path.join(targetDir, `${String(allocation.iteration).padStart(4, '0')}.md`);
    let published = false;
    try {
      try { fs.linkSync(file, target); published = true; } catch (error) { if (error?.code !== 'EEXIST') throw error; const targetFile = safeArtifactFile(taskDir, allocation.path); if (!fs.readFileSync(targetFile).equals(fs.readFileSync(file))) throw new Error('Published artifact conflicts with reservation staging bytes'); }
      writeArtifactIndex(taskDir, next);
    } catch (error) { if (published) fs.rmSync(target); throw error; }
    fs.rmSync(file); fs.rmSync(reservationFile); return record;
  });
}
export function currentArtifact(taskDir, type) {
  const { identity } = semanticSeries(type); const index = readArtifactIndex(taskDir); const series = index.artifactSeries[identity]; return series?.iterations.find(record => record.id === series.current) ?? null;
}

function runCli(argv) {
  const [command, ...args] = argv; if (command === 'init' && args.length === 1) return initTaskArtifacts(args[0]); if (command === 'allocate' && args.length === 3) return reserveArtifactIteration(args[0], args[1], args[2]);
  if (command === 'record' && args.length === 5) return recordArtifact(args[0], args[1], args[2], args[3], args[4]); if (command === 'current' && args.length === 2) return currentArtifact(args[0], args[1]);
  if (command === 'root' && args.length === 1) return resolveTaskRoot(args[0]);
  throw new Error('Usage: task-artifacts.mjs init <task-dir> | allocate <task-dir> <kind> <variant> | record <task-dir> <kind> <variant> <type> <artifact-path> | current <task-dir> <type> | root <repo-root>');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runCli(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${String(error?.message ?? error).slice(0, 800)}\n`); process.exitCode = 1; }
}
