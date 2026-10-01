import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = async name => import(fs.existsSync(path.join(here, 'references', name)) ? path.join(here, 'references', name) : path.join(here, '../../../shared', name));
const { readArtifactIndex, indexFileExists, observeArtifacts, validateArtifactSemantics, sourceRevision } = await shared('task-artifacts.mjs');
const { captureDestination, validateRecordedText } = await shared('publication-proof.mjs');

export const REPAIR_LIMIT = 3;
export const REVIEW_ROUND_LIMIT = 3;
const uiKinds = new Set(['web', 'ios', 'android']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const rootFile = (taskDir, name) => path.join(path.resolve(taskDir), name);
function fail(message) { throw new Error(message); }
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { fail(`${path.basename(file)}: ${error.message}`); }
}
function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(tmp, file);
  return value;
}
function loadState(taskDir) {
  const state = readJson(rootFile(taskDir, '.delivery-state.json'));
  if (!state) return effectiveRepairs(taskDir, { schema: 'delivery-state/v1', repairs: { limit: REPAIR_LIMIT, used: 0, attempts: {}, blocked: null } });
  if (state.schema !== 'delivery-state/v1' || !Number.isInteger(state.repairs?.limit) || state.repairs.limit < 0 || !Number.isInteger(state.repairs.used) || state.repairs.used < 0 || state.repairs.used > state.repairs.limit + (state.repairs.extension || 0)) fail('Invalid durable delivery state; do not reset repair allowance');
  return effectiveRepairs(taskDir, state);
}
// The owner extends the repair allowance with a `repair-extension +N` line in task.md `## Decisions`; each is applied once and clears a stop.
function repairExtension(taskDir) {
  const file = rootFile(taskDir, 'task.md');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  return [...section(text, 'Decisions').matchAll(/repair-extension\s*\+?(\d+)/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
}
function effectiveRepairs(taskDir, state) {
  const granted = repairExtension(taskDir), applied = state.repairs.extension || 0;
  const repairs = { ...state.repairs, extension: Math.max(granted, applied) };
  if (granted > applied) repairs.blocked = null;
  return { ...state, repairs };
}
const allowance = repairs => repairs.limit + (repairs.extension || 0);
const saveState = (taskDir, value) => saveJson(rootFile(taskDir, '.delivery-state.json'), value);
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim(); }
export { sourceRevision };

function metadata(text) {
  const match = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) fail('Artifact requires YAML frontmatter');
  const result = {};
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i].match(/^([a-z_][a-z0-9_-]*):\s*(.*)$/i);
    if (!row) continue;
    const [, key, scalar] = row;
    if (Object.hasOwn(result, key)) fail(`Duplicate artifact metadata ${key}`);
    let value = scalar.trim();
    if (/^[>|][-+]?$/.test(value)) {
      const body = [];
      while (i + 1 < lines.length && /^(?:\s|$)/.test(lines[i + 1])) body.push(lines[++i].trim());
      value = body.join(value.startsWith('>') ? ' ' : '\n').trim();
    } else if (value.startsWith('"')) value = JSON.parse(value);
    else if (value.startsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
    result[key] = value;
  }
  return result;
}
export function section(text, title) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start < 0) return '';
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}
// Table cells split on unescaped pipes only, so a GFM `\|` inside a cell cannot shift the columns after it.
export const tableRows = text => text.split('\n').filter(line => line.trim().startsWith('|')).map(line => line.trim().split(/(?<!\\)\|/).slice(1, -1).map(cell => cell.trim()));
const verdictRows = (text, heading) => {
  const rows = tableRows(section(text, heading)).map(row => row.map(cell => cell.toLowerCase()));
  const header = rows.shift();
  if (!header?.includes('verdict')) return null;
  return rows.filter(row => row.length && !row.every(cell => /^:?-+:?$/.test(cell))).map(row => ({ verdict: row[header.indexOf('verdict')], required: row[header.indexOf('required')] !== 'no' }));
};
export function validateDeliveryArtifact({ file, type, status, text, summary }) {
  if (!nonempty(type) || !nonempty(summary)) fail(`${file}: type, summary and artifact body are required`);
  validateArtifactSemantics(type, status ?? null, text, file);
}
export function readDeliveryArtifacts(taskDir, problems, unproven = {}) {
  const observed = observeArtifacts(taskDir, problems, unproven);
  for (const artifact of Object.values(observed.latest)) artifact.metadata = artifact.type === 'pr-description' ? { type: artifact.type, summary: artifact.summary } : metadata(artifact.text);
  return observed;
}

// Merge base of HEAD and the task base: task.md `base:`, then the upstream, then the repository default branch, first that resolves.
function taskBaseCommit(taskDir) {
  const file = rootFile(taskDir, 'task.md');
  const declared = fs.existsSync(file) ? (() => { try { return metadata(fs.readFileSync(file, 'utf8')).base; } catch { return null; } })() : null;
  for (const candidate of [declared, '@{upstream}', 'refs/remotes/origin/HEAD'].filter(nonempty)) {
    try { return git(taskDir, ['merge-base', 'HEAD', candidate]); } catch { /* try the next candidate */ }
  }
  return null;
}
const gitHead = cwd => { try { return git(cwd, ['rev-parse', 'HEAD']); } catch { return null; } };
function sourcePaths(taskDir) {
  const repo = git(taskDir, ['rev-parse', '--show-toplevel']);
  const taskRoot = path.relative(fs.realpathSync(repo), path.dirname(fs.realpathSync(taskDir))).split(path.sep).join('/');
  if (!taskRoot || taskRoot.startsWith('..')) fail('Task directory must be inside the repository');
  return [':/', `:(exclude,top,literal)${taskRoot}`];
}
export function saveEvidencePolicy({ taskDir, policy }) {
  const state = loadState(taskDir);
  const file = rootFile(taskDir, 'evidence-policy.json');
  const limit = policy.max_repairs ?? REPAIR_LIMIT;
  if (!Number.isInteger(limit) || limit < 0 || (limit !== REPAIR_LIMIT && !nonempty(policy.repair_authorization))) fail('Nondefault repair allowance requires an explicit authorization reference and nonnegative integer limit');
  if (!Array.isArray(policy.surfaces) || !policy.surfaces.length) fail('Evidence policy requires affected surfaces');
  const ids = new Set();
  for (const surface of policy.surfaces) {
    if (!nonempty(surface.id) || ids.has(surface.id) || !['web', 'ios', 'android', 'cli', 'api', 'agent', 'docs'].includes(surface.kind) || !['existing', 'new'].includes(surface.behavior) || !nonempty(surface.target) || !nonempty(surface.expectation)) fail('Each evidence surface needs unique id, kind, behavior, target and expectation');
    if (surface.behavior === 'new' && !nonempty(surface.exemption)) fail('New behavior requires an explicit no-baseline exemption');
    ids.add(surface.id);
  }
  if (fs.existsSync(file)) {
    const previous = readJson(file);
    if (previous.max_repairs !== limit || previous.repair_authorization !== (policy.repair_authorization || null)) fail('Evidence policy repair allowance is immutable; do not reset it');
    if (JSON.stringify(previous.surfaces) === JSON.stringify(policy.surfaces)) return previous;
    if (JSON.stringify(policy.surfaces.slice(0, previous.surfaces.length)) !== JSON.stringify(previous.surfaces) || !nonempty(policy.amendment_reason)) fail('Evidence policy is immutable except by appending surfaces with an amendment_reason; existing surfaces cannot change');
    const added = policy.surfaces.slice(previous.surfaces.length).map(surface => surface.id);
    return saveJson(file, { ...previous, surfaces: policy.surfaces, amendments: [...(previous.amendments || []), { reason: policy.amendment_reason, added, at: new Date().toISOString() }] });
  }
  state.repairs.limit = limit;
  saveJson(rootFile(taskDir, '.delivery-state.json'), state);
  return saveJson(file, { schema: 'delivery-evidence-policy/v1', max_repairs: limit, repair_authorization: policy.repair_authorization || null, amendments: [], surfaces: policy.surfaces });
}
function policyFor(taskDir) {
  const file = rootFile(taskDir, 'evidence-policy.json');
  const policy = readJson(file);
  if (!policy || policy.schema !== 'delivery-evidence-policy/v1' || policy.max_repairs !== loadState(taskDir).repairs.limit || !Array.isArray(policy.surfaces) || !policy.surfaces.length) fail('Missing or invalid pre-mutation evidence policy');
  return { ...policy, hash: sha(fs.readFileSync(file)) };
}
function captureFile(taskDir, value) {
  if (!nonempty(value) || !path.isAbsolute(value)) fail('Capture path must be an absolute external scratch path');
  const file = path.resolve(value);
  const taskRoot = path.dirname(fs.realpathSync(taskDir));
  if (file === taskRoot || file.startsWith(`${taskRoot}${path.sep}`)) fail('Evidence captures must remain outside the task root');
  let cursor = path.parse(file).root;
  for (const part of file.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) fail(`Evidence symlink rejected: ${value}`);
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size === 0) fail(`Evidence capture is empty or not a file: ${value}`);
  return { path: file, bytes: stat.size, sha256: sha(fs.readFileSync(file)) };
}
function inspectCapture(taskDir, capture, surface) {
  const actual = captureFile(taskDir, capture.path);
  if (!nonempty(capture.inspection?.observed)) fail('Each capture requires an actual inspection observation');
  const samples = (capture.inspection.samples || []).map(file => captureFile(taskDir, typeof file === 'string' ? file : file.path));
  let media = null;
  if (uiKinds.has(surface.kind)) {
    if (!samples.length) fail('UI recordings require inspected frame samples');
    let probe;
    try { probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path.resolve(taskDir, capture.path)], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30_000 })); }
    catch (error) { fail(`Cannot verify UI recording with ffprobe: ${error.message}`); }
    const video = probe.streams?.find(stream => stream.codec_type === 'video');
    const duration = Number(probe.format?.duration || video?.duration);
    if (!video || !(video.width > 0) || !(video.height > 0) || !(duration > 0)) fail('UI capture has no playable nonzero-duration video');
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', path.resolve(taskDir, capture.path), '-map', '0:v:0', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
      for (const sample of samples) {
        const frames = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.resolve(taskDir, sample.path)], { encoding: 'utf8', timeout: 30_000 }));
        if (!frames.streams?.some(stream => ['png', 'mjpeg', 'webp'].includes(stream.codec_name) && stream.width > 0 && stream.height > 0)) fail('Inspection sample is not a readable frame image');
      }
    } catch (error) { fail(`Cannot decode UI recording or inspected frames: ${error.message}`); }
    media = { duration, width: video.width, height: video.height, codec: video.codec_name };
  }
  return { ...capture, ...actual, inspection: { observed: capture.inspection.observed, samples }, media };
}
const evidenceRecordFile = (taskDir, hash) => rootFile(taskDir, `.delivery-evidence/${hash}.json`);
function evidenceRecord(taskDir, artifact) { return artifact && readJson(evidenceRecordFile(taskDir, artifact.hash)); }
// A baseline is bound to its baseline_commit, not the current source, so pass revision null for it.
function checkSealed(taskDir, artifact, policy, revision) {
  const record = evidenceRecord(taskDir, artifact);
  if (!record || record.artifact_sha256 !== artifact.hash || record.policy_sha256 !== policy.hash || (revision !== null && record.revision !== revision)) fail('Evidence receipt is missing, unsealed or stale for the current revision/policy');
  for (const attachment of [...(record.attachments || []), ...(record.build_proof ? [record.build_proof] : [])]) if (captureFile(taskDir, attachment.path).sha256 !== attachment.sha256) fail('Evidence provenance attachment changed after sealing');
  for (const capture of record.captures || []) {
    const actual = captureFile(taskDir, capture.path);
    if (actual.sha256 !== capture.sha256 || actual.bytes !== capture.bytes) fail('Evidence capture changed after sealing');
    for (const sample of capture.inspection.samples) if (captureFile(taskDir, sample.path).sha256 !== sample.sha256) fail('Inspected evidence sample changed after sealing');
  }
  if (record.phase === 'evidence' && record.captures.length) {
    const valid = item => record.captures.some(c => c.path === item.capture && c.sha256 === item.sha256) && item.status === 200 && Boolean(item.checked_at);
    if (!record.hosted?.length || !record.hosted.every(valid)) fail('Evidence lacks hosted byte readback verification');
  }
  return record;
}
const hostedBytes = async (stream, limit) => {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > limit) return { bytes, sha256: null };
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
};
async function readHosted(taskDir, entry, capture) {
  let url = captureDestination(entry.url);
  if (!url) fail('Hosted capture must be a supported direct HTTPS capture URL');
  const base = { url: entry.url, capture: capture.path, sha256: capture.sha256, checked_at: new Date().toISOString() };
  for (let hop = 0; hop < 6; hop++) {
    let response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'manual' }); }
    catch { fail(`Hosted capture is unreachable: ${url.host}`); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      url = location && captureDestination(new URL(location, url).href);
      if (!url) fail('Hosted capture redirects outside supported direct hosts');
      continue;
    }
    if (response.status !== 200 || !response.body) { await response.body?.cancel(); fail(`Hosted capture readback requires HTTP 200: ${response.status}`); }
    const read = await hostedBytes(response.body, capture.bytes);
    if (read.bytes !== capture.bytes || read.sha256 !== capture.sha256) fail('Hosted capture bytes differ from the inspected local capture');
    return { ...base, resolved_url: response.url || url.href, bytes: read.bytes, status: 200, content_type: response.headers.get('content-type') };
  }
  fail('Hosted capture exceeded the supported redirect limit');
}
export async function sealEvidence({ taskDir, artifactFile, record }) {
  const problems = [];
  const observation = readDeliveryArtifacts(taskDir, problems);
  const artifact = Object.values(observation.latest).find(item => item.file === path.resolve(taskDir, artifactFile));
  if (!artifact || !['evidence-baseline', 'evidence'].includes(artifact.type)) fail(['Seal requires the current indexed evidence or evidence-baseline receipt', ...problems.filter(problem => problem.startsWith(`${path.basename(artifactFile)}:`))].join('; '));
  const policy = policyFor(taskDir);
  const baseline = artifact.type === 'evidence-baseline';
  const head = gitHead(taskDir);
  let revision = sourceRevision(taskDir);
  let baselineCommit = null;
  if (baseline) {
    // May be captured any time, from a temporary `git worktree add <tmp> <base-sha>`.
    try { baselineCommit = git(taskDir, ['rev-parse', '--verify', `${record.baseline_commit}^{commit}`]); }
    catch { fail('A baseline requires baseline_commit: a commit of this repository'); }
    // The baseline must predate the task: an ancestor of the merge base with the task base, never a task commit.
    const base = taskBaseCommit(taskDir);
    if (!base) fail('Cannot resolve the task base (task.md base:, the upstream branch or origin/HEAD) to validate baseline_commit');
    try { git(taskDir, ['merge-base', '--is-ancestor', baselineCommit, base]); } catch { fail('baseline_commit must be an ancestor of the task base, not a commit made by this task'); }
    if (baselineCommit === head && git(taskDir, ['status', '--porcelain', '--untracked-files=no', '--', ...sourcePaths(taskDir)])) fail('A baseline at HEAD requires no tracked changes outside the task directory');
    revision = baselineCommit;
  } else if (!revision || record.revision !== revision) fail('Evidence revision must match the actual source fingerprint');
  if (!nonempty(record.build_identity)) fail('Evidence requires the exercised build identity');
  const attachments = (record.attachments || []).map(file => captureFile(taskDir, file));
  if (!attachments.length) fail('Evidence requires a captured report or manifest attachment');
  for (const attachment of attachments.filter(item => item.path.endsWith('.json'))) {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(taskDir, attachment.path), 'utf8'));
    if (manifest.source === 'test' || manifest.panes?.some(pane => pane.source === 'test')) fail('Synthetic recorder fixtures cannot be sealed as actual delivery evidence');
  }
  const buildProof = record.build_proof ? captureFile(taskDir, record.build_proof) : null;
  const required = policy.surfaces.filter(surface => !baseline || surface.behavior === 'existing');
  const results = record.results || [];
  const validResult = (result, surface) => result.surface === surface.id && (result.status === 'untested' ? nonempty(result.reason) : ['passed', 'failed'].includes(result.status) && nonempty(result.observed));
  if (results.length !== required.length || required.some(surface => results.filter(result => validResult(result, surface)).length !== 1)) fail('Every required surface needs one observed passed/failed result, or an untested result with a reason');
  const tested = required.filter(surface => results.find(result => result.surface === surface.id).status !== 'untested');
  const captures = (record.captures || []).map(capture => {
    const surface = tested.find(item => item.id === capture.surface);
    if (!surface) fail(`Capture names an unknown, exempt or untested surface: ${capture.surface}`);
    return inspectCapture(taskDir, capture, surface);
  });
  if (!baseline) {
    const changed = git(taskDir, ['diff', 'HEAD', '--name-only', '--', ...sourcePaths(taskDir)]);
    if (changed) fail('Final evidence requires committed source before capture');
    for (const capture of captures) {
      const surface = tested.find(item => item.id === capture.surface);
      const result = results.find(item => item.surface === capture.surface);
      if (!uiKinds.has(surface.kind) && result.status === 'passed') {
        const recording = surface.kind === 'cli' ? 'cli-terminal' : surface.kind === 'api' ? 'api-probe' : 'agent-session';
        if (!validateRecordedText(fs.readFileSync(capture.path, 'utf8'), head, recording)) fail('Captured output lacks the tested command, actual stdout, tested SHA or final successful outcome');
      }
    }
  }
  let prior = null;
  if (!baseline) prior = checkSealed(taskDir, observation.latest['evidence-baseline'], policy, null);
  for (const surface of tested) {
    const roles = uiKinds.has(surface.kind) ? (baseline ? ['baseline'] : surface.behavior === 'existing' ? ['after', 'composite'] : ['after']) : ['output'];
    for (const role of roles) if (!captures.some(capture => capture.surface === surface.id && capture.role === role)) fail(`Missing ${role} capture for ${surface.id}`);
    if (!baseline && uiKinds.has(surface.kind) && surface.behavior === 'existing') {
      const composite = captures.find(capture => capture.surface === surface.id && capture.role === 'composite');
      const before = prior.captures.find(capture => capture.surface === surface.id && capture.role === 'baseline');
      const after = captures.find(capture => capture.surface === surface.id && capture.role === 'after');
      if (!before) fail(`The sealed baseline has no capture for ${surface.id}; it was recorded untested`);
      if (Array.isArray(composite.sources)) composite.sources = composite.sources.map(file => captureFile(taskDir, file).path);
      if (composite.align !== false || !Array.isArray(composite.sources) || composite.sources.length !== 2 || composite.sources[0] !== before.path || composite.sources[1] !== after.path) fail('Composite must link the sealed baseline and current after capture with align:false');
      composite.source_sha256 = [before.sha256, after.sha256];
    }
  }
  const hosted = [];
  if (!baseline) {
    const entries = Array.isArray(record.hosted) ? record.hosted : record.hosted ? [record.hosted] : [];
    for (const surface of tested) {
      const role = uiKinds.has(surface.kind) ? surface.behavior === 'existing' ? 'composite' : 'after' : 'output';
      const capture = captures.find(item => item.surface === surface.id && item.role === role);
      const entry = entries.find(item => captureFile(taskDir, item.capture).path === capture.path);
      if (!entry) fail(`Missing hosted capture for ${surface.id}`);
      hosted.push(await readHosted(taskDir, entry, capture));
    }
  }
  const status = results.some(result => result.status === 'failed') ? 'failed' : 'passed';
  if (artifact.status !== status) fail('Evidence receipt status contradicts captured results');
  const untested = results.filter(result => result.status === 'untested').map(({ surface, reason }) => ({ surface, reason }));
  return saveJson(evidenceRecordFile(taskDir, artifact.hash), { schema: 'delivery-evidence/v1', phase: artifact.type, artifact_sha256: artifact.hash, policy_sha256: policy.hash, revision, ...(baseline ? { baseline_commit: baselineCommit } : {}), build_commit: baseline ? baselineCommit : head, build_identity: record.build_identity, build_proof: buildProof, attachments, results, untested, captures, hosted, baseline: prior ? { artifact_sha256: prior.artifact_sha256, revision: prior.revision } : null, status });
}
export function sealInspection({ taskDir, artifactFile, record }) {
  const problems = [];
  const latest = readDeliveryArtifacts(taskDir, problems).latest;
  const artifact = latest['evidence-iteration'];
  if (!artifact || artifact.file !== path.resolve(taskDir, artifactFile)) fail(['Inspection requires the current indexed evidence-iteration receipt', ...problems.filter(problem => problem.startsWith(`${path.basename(artifactFile)}:`))].join('; '));
  const evidence = checkSealed(taskDir, latest.evidence, policyFor(taskDir), sourceRevision(taskDir));
  if (record.revision !== evidence.revision || record.evidence_sha256 !== evidence.artifact_sha256 || !['passed', 'failed', 'blocked'].includes(record.status) || artifact.status !== record.status || !Array.isArray(record.findings)) fail('Inspection must bind the current evidence, revision and truthful verdict');
  if (record.findings.some(item => !nonempty(item.id) || !nonempty(item.observed) || !nonempty(item.expected)) || (record.status === 'passed' && (record.findings.length || evidence.status !== 'passed')) || (record.status === 'failed' && !record.findings.length)) fail('Inspection findings contradict its verdict');
  const state = loadState(taskDir);
  const ids = record.findings.map(item => item.id).sort();
  const priorInspection = evidenceRecord(taskDir, artifact);
  if (priorInspection && JSON.stringify(priorInspection.findings) === JSON.stringify(record.findings) && priorInspection.revision === record.revision && priorInspection.evidence_sha256 === record.evidence_sha256 && priorInspection.status === record.status) return priorInspection;
  if (record.status === 'failed' && state.repairs.used > 0 && state.repairs.last_findings && !state.repairs.last_findings.some(id => !ids.includes(id))) state.repairs.blocked = 'Evidence repair made no progress on the recorded findings';
  if (record.status === 'failed') state.repairs.last_findings = ids;
  saveState(taskDir, state);
  return saveJson(evidenceRecordFile(taskDir, artifact.hash), { schema: 'delivery-inspection/v1', artifact_sha256: artifact.hash, ...record });
}
export function evidenceReadiness(taskDir, latest = readDeliveryArtifacts(taskDir, []).latest, revision = sourceRevision(taskDir)) {
  const missing = [];
  const state = loadState(taskDir);
  const result = { baseline: false, evidence: false, inspection: false, missing, blocked: state.repairs.blocked || null };
  let policy;
  try { policy = policyFor(taskDir); checkSealed(taskDir, latest['evidence-baseline'], policy, null); result.baseline = true; }
  catch (error) { missing.push(error.message); return result; }
  try { checkSealed(taskDir, latest.evidence, policy, revision); result.evidence = true; }
  catch (error) { missing.push(error.message); return result; }
  const inspection = evidenceRecord(taskDir, latest['evidence-iteration']);
  if (!inspection || inspection.schema !== 'delivery-inspection/v1' || inspection.revision !== revision || inspection.evidence_sha256 !== latest.evidence.hash || inspection.artifact_sha256 !== latest['evidence-iteration']?.hash) { missing.push('Current captured evidence has not been inspected'); return result; }
  const sealed = evidenceRecord(taskDir, latest.evidence);
  if (sealed?.status !== 'passed') missing.push('Current captured evidence has failed results');
  if (sealed?.untested?.length) missing.push('Required evidence surfaces remain untested');
  result.inspection = true;
  result.inspection_status = inspection.status;
  if (inspection.status === 'failed') missing.push('Evidence inspection failed; repair the findings, then record and inspect again');
  if (inspection.status === 'blocked') result.blocked = 'Evidence inspection is blocked';
  else if (inspection.status === 'failed' && state.repairs.used >= allowance(state.repairs)) result.blocked = 'Evidence repair allowance exhausted';
  return result;
}
export function beginRepair({ taskDir, attemptId }) {
  if (!nonempty(attemptId)) fail('Repair attemptId required');
  const state = loadState(taskDir);
  if (state.repairs.attempts[attemptId]) return state.repairs.attempts[attemptId];
  if (state.repairs.blocked || state.repairs.used >= allowance(state.repairs)) fail(`${state.repairs.blocked || `Evidence repair allowance exhausted (${allowance(state.repairs)})`}; to continue the owner records \`repair-extension +N: <reason>\` in task.md ## Decisions`);
  const attempt = { revision: sourceRevision(taskDir), number: ++state.repairs.used, completed: false };
  state.repairs.attempts[attemptId] = attempt;
  saveState(taskDir, state);
  return attempt;
}
export function completeRepair({ taskDir, attemptId }) {
  const state = loadState(taskDir);
  const attempt = state.repairs.attempts[attemptId];
  if (!attempt) fail('Repair was not reserved before mutation');
  if (attempt.completed) return attempt;
  attempt.completed = true;
  attempt.after_revision = sourceRevision(taskDir);
  if (attempt.after_revision === attempt.revision) state.repairs.blocked = 'Evidence repair made no source progress';
  saveState(taskDir, state);
  return attempt;
}
export function deliveryStatus({ taskDir }) {
  const problems = [];
  const unproven = {};
  const { latest } = readDeliveryArtifacts(taskDir, problems, unproven);
  const revision = sourceRevision(taskDir);
  const artifacts = {};
  const validReviews = new Set();
  for (const [type, artifact] of Object.entries(latest)) {
    const recorded = artifact.metadata.revision || null;
    artifacts[type] = { file: path.relative(path.resolve(taskDir), artifact.file), status: artifact.status, revision: recorded, current: recorded ? recorded === revision : null };
    if (['verification', 'code-review'].includes(type)) {
      try { const reviewed = checkReview({ taskDir, file: artifact.file }); if (reviewed.status === 'approve') validReviews.add(type); }
      catch (error) { problems.push(error.message); }
    }
    const heading = { verification: 'Items', 'app-test': 'Steps' }[type];
    if (heading && artifact.status === 'passed' && verdictRows(artifact.text, heading)?.some(row => row.verdict === 'untested' && row.required)) problems.push(`${path.basename(artifact.file)}: passed with an untested required item; mark it Required: no with a reason, or grade it blocked`);
  }
  const missing = [];
  const proof = (type, passed) => artifacts[type]?.status === passed && artifacts[type].current === true && (!['verification', 'code-review'].includes(type) || validReviews.has(type));
  if (!proof('verification', 'passed')) missing.push('Current passed verification');
  if (artifacts['app-test'] && !proof('app-test', 'passed')) missing.push('Current passed app-test');
  if (!proof('code-review', 'clean')) missing.push('Current clean code review');
  missing.push('Hosted PR description');
  let evidence = { baseline: false, evidence: false, inspection: false, missing: [], blocked: null };
  let repairs = null, stop = null, untested = [], unverified = [];
  try {
    evidence = evidenceReadiness(taskDir, latest, revision);
    missing.push(...evidence.missing);
    const state = loadState(taskDir);
    repairs = { used: state.repairs.used, limit: state.repairs.limit, extension: state.repairs.extension || 0, blocked: evidence.blocked || state.repairs.blocked };
    if (evidence.inspection_status === 'blocked') stop = 'Evidence inspection is blocked: fix the prerequisite the inspection names, then record and inspect again.';
    else if (repairs.blocked) stop = `Evidence repair stopped: ${repairs.blocked}. The owner may record \`repair-extension +N: <reason>\` in task.md ## Decisions to continue.`;
    if (evidence.evidence) {
      const sealed = evidenceRecord(taskDir, latest.evidence);
      untested = sealed?.untested || [];
      if (sealed?.results?.length && sealed.results.every(result => result.status === 'untested')) problems.push('Sealed evidence tested no surface: every surface is untested. The final reviewer must judge whether that is acceptable.');
      unverified = (sealed?.hosted || []).filter(item => item.status === 'unverified').map(({ url, reason }) => ({ url, reason }));

    }
  } catch (error) { problems.push(error.message); }
  return { revision, artifacts, unproven, problems, missing, stop, evidence, untested, unverified, repairs };
}

// Independent review record. Slice and plan reviews use type slice-review|plan-review|final-review with status approve|changes,
// a `## Checks` table (an Exit column; optional at the plan checkpoint) and findings `### <id> blocking|follow-up <title>` with an `Evidence:` line.
// The final checkpoint's own artifacts also qualify: `code-review` (clean=approve, findings=changes; blocking = `### CR-` findings with
// `evidence or reproduction:`) and `verification` (passed=approve, failed=changes; blocking = Items rows with verdict fail and an Observed cell).
// Every record carries checkpoint, reviewed_commit, reviewer_model, round and revision.
const nativeApprove = { 'code-review': 'clean', verification: 'passed' };
const nativeChanges = { 'code-review': 'findings', verification: 'failed' };
export function parseRecord(taskDir, name) {
  const target = path.resolve(taskDir, name);
  if (!fs.existsSync(target)) fail(`${name}: review record not found`);
  const relative = path.relative(path.resolve(taskDir), target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail('Review record must remain inside the task directory');
  let cursor = path.resolve(taskDir);
  for (const part of relative.split(path.sep)) { cursor = path.join(cursor, part); if (fs.lstatSync(cursor).isSymbolicLink()) fail('Review record symlinks are rejected'); }
  if (indexFileExists(rootFile(taskDir, 'index.json'))) {
    const index = readArtifactIndex(taskDir);
    if (!Object.values(index.artifactSeries).some(series => series.iterations.some(record => rootFile(taskDir, record.path) === target))) fail('Review record is not registered in the task index');
  }
  const text = fs.readFileSync(target, 'utf8');
  const info = metadata(text);
  validateDeliveryArtifact({ file: target, type: info.type, status: info.status, text, summary: info.summary });
  for (const key of ['type', 'summary', 'checkpoint', 'reviewed_commit', 'reviewer_model', 'round', 'revision', 'status']) if (!nonempty(info[key])) fail(`${name}: frontmatter needs ${key}`);
  if (!['slice-review', 'plan-review', 'final-review', 'code-review', 'verification'].includes(info.type)) fail(`${name}: unsupported review type ${info.type}`);
  const checkpoints = { 'plan-review': ['plan'], 'final-review': ['final'], 'code-review': ['final'], verification: ['final'] }[info.type];
  // Slice checkpoints name the assigned phase; retaining that exact label isolates its review-round history.
  if (checkpoints && !checkpoints.includes(info.checkpoint)) fail(`${name}: ${info.type} requires checkpoint ${checkpoints.join(' or ')}`);
  if (info.checkpoint === 'plan') {
    if (!nonempty(info.reviewed_artifact) || !/^[a-f0-9]{64}$/.test(info.reviewed_artifact_sha256 || '')) fail(`${name}: plan review needs reviewed_artifact and reviewed_artifact_sha256`);
    const reviewed = path.resolve(taskDir, info.reviewed_artifact);
    const relativeArtifact = path.relative(path.resolve(taskDir), reviewed);
    if (!relativeArtifact || relativeArtifact.startsWith('..') || path.isAbsolute(relativeArtifact)) fail(`${name}: reviewed artifact escapes the task`);
    if (indexFileExists(rootFile(taskDir, 'index.json'))) {
      const index = readArtifactIndex(taskDir);
      if (!Object.values(index.artifactSeries).some(series => series.iterations.some(record => rootFile(taskDir, record.path) === reviewed && record.sha256 === info.reviewed_artifact_sha256))) fail(`${name}: reviewed plan is not a digest-valid indexed artifact`);
    } else if (fs.lstatSync(reviewed).isSymbolicLink() || sha(fs.readFileSync(reviewed)) !== info.reviewed_artifact_sha256) fail(`${name}: reviewed plan bytes changed`);
  }
  const native = Object.hasOwn(nativeApprove, info.type);
  if (info.status === 'blocked' && native) fail(`${name}: a blocked ${info.type} has no verdict; clear the prerequisite it names and rerun the reviewer`);
  const status = native ? (info.status === nativeApprove[info.type] ? 'approve' : info.status === nativeChanges[info.type] ? 'changes' : null) : info.status;
  if (!['approve', 'changes'].includes(status)) fail(`${name}: status is ${info.status}; use ${native ? `${nativeApprove[info.type]} or ${nativeChanges[info.type]}` : 'approve or changes'}`);
  const round = Number(info.round);
  if (!Number.isInteger(round) || round < 1) fail(`${name}: round must be a positive integer`);
  let findings;
  if (info.type === 'code-review') {
    findings = [...section(text, 'Critical and Required Findings').matchAll(/^###\s+(CR-\S+)[^\n]*\n([\s\S]*?)(?=^###\s|(?![\s\S]))/gm)].map(([, id, body]) => ({ id, severity: 'blocking', evidence: /^[-*\s]*evidence or reproduction:[ \t]*\S/im.test(body) }));
  } else if (info.type === 'verification') {
    const rows = tableRows(section(text, 'Items'));
    const header = rows.shift()?.map(cell => cell.toLowerCase()) || [];
    const col = key => header.indexOf(key);
    const odd = rows.filter(row => !row.every(cell => /^:?-+:?$/.test(cell)) && !['pass', 'fail', 'untested'].includes(row[col('verdict')]?.toLowerCase()));
    if (odd.length) fail(`${name}: verification row ${odd.map(row => JSON.stringify(row[col('id')] || row[0])).join(', ')} has a verdict that is not pass, fail or untested`);
    findings = rows.filter(row => row[col('verdict')]?.toLowerCase() === 'fail').map(row => ({ id: row[col('id')] || row[0], severity: 'blocking', evidence: nonempty(row[col('observed')]) }));
  } else {
    findings = [...text.matchAll(/^###\s+(\S+)\s+(blocking|follow-up)\b[^\n]*\n([\s\S]*?)(?=^#{1,3}\s|(?![\s\S]))/gm)].map(([, id, severity, body]) => ({ id, severity, evidence: /^[-*\s]*evidence:[ \t]*\S/im.test(body) }));
    const checks = tableRows(section(text, 'Checks'));
    const header = checks.shift();
    const exit = header?.findIndex(cell => /^exit$/i.test(cell));
    if (status === 'approve' && exit >= 0 && checks.some(row => /^\d+$/.test(row[exit] || '') && Number(row[exit]) !== 0)) fail(`${name}: approve contradicts a failed check exit`);
    if (info.checkpoint !== 'plan' && (!header || exit < 0 || !checks.some(row => /^\d+$/.test(row[exit] || '')))) fail(`${name}: ## Checks needs a table with an Exit column and one row per command run, each with its exit code (the plan checkpoint may omit it)`);
  }
  const blocking = findings.filter(finding => finding.severity === 'blocking');
  const bare = blocking.filter(finding => !finding.evidence).map(finding => finding.id);
  if (bare.length) fail(`${name}: blocking finding ${bare.join(', ')} cites no evidence; add its evidence line or mark it follow-up`);
  if (status === 'approve' && blocking.length) fail(`${name}: status ${info.status} contradicts ${blocking.length} blocking finding${blocking.length === 1 ? '' : 's'}`);
  if (status === 'changes' && !blocking.length) fail(`${name}: status ${info.status} needs at least one blocking finding; approve, or record the blocker`);
  return { info, status, round, ids: blocking.map(finding => finding.id) };
}
export function checkReview({ taskDir, file }) {
  const name = path.relative(path.resolve(taskDir), path.resolve(taskDir, file));
  if (indexFileExists(rootFile(taskDir, 'index.json'))) {
    const index = readArtifactIndex(taskDir);
    if (!Object.values(index.artifactSeries).some(series => series.iterations.some(record => record.id === series.current && rootFile(taskDir, record.path) === path.resolve(taskDir, file)))) fail(`${name}: review must select the current indexed iteration`);
  }
  const { info, status, round, ids } = parseRecord(taskDir, name);
  if (info.checkpoint === 'plan' && indexFileExists(rootFile(taskDir, 'index.json'))) {
    const index = readArtifactIndex(taskDir);
    if (!Object.values(index.artifactSeries).some(series => series.iterations.some(record => record.id === series.current && rootFile(taskDir, record.path) === path.resolve(taskDir, info.reviewed_artifact) && record.sha256 === info.reviewed_artifact_sha256))) fail(`${name}: reviewed plan is not the current indexed artifact`);
  }
  let reviewed;
  try { reviewed = git(taskDir, ['rev-parse', '--verify', `${info.reviewed_commit}^{commit}`]); } catch { fail(`${name}: reviewed_commit ${info.reviewed_commit} is not a commit of this repository`); }
  const head = gitHead(taskDir);
  if (reviewed !== head) fail(`${name}: reviewed_commit ${info.reviewed_commit} is not HEAD (${head?.slice(0, 12)}); review the current commit`);
  if (info.revision !== sourceRevision(taskDir)) fail(`${name}: tracked files changed since the review began (revision differs); a reviewer never edits source, so restore generated files or review in a scratch worktree, then review again`);
  // The previous round is the newest valid record of the same type and checkpoint at the highest earlier round; a record that fails its own checks is skipped.
  let previous = null;
  const history = indexFileExists(rootFile(taskDir, 'index.json'))
    ? Object.values(readArtifactIndex(taskDir).artifactSeries).flatMap(series => series.iterations.map(record => record.path))
    : fs.readdirSync(taskDir).filter(entry => /^\d{2,}-[a-z0-9-]+\.md$/.test(entry));
  for (const other of history.filter(entry => entry !== name)) {
    let record;
    try { record = parseRecord(taskDir, other); } catch { continue; }
    if (record.info.checkpoint === info.checkpoint && record.info.type === info.type && record.round < round && (!previous || record.round > previous.round)) previous = record;
  }
  if (round > 1 && !previous) fail(`${name}: round ${round} has no earlier valid ${info.type} round for checkpoint ${info.checkpoint}`);
  const progress = status === 'approve' || !previous || ids.length < previous.ids.length;
  return { checkpoint: info.checkpoint, round, status, reviewer_model: info.reviewer_model, blocking: ids, previous_blocking: previous?.ids || [], progress, limit_reached: round >= REVIEW_ROUND_LIMIT && status !== 'approve' };
}

async function main(args) {
  const command = args[0];
  const arity = { revision: [2, 2], status: [2, 2], policy: [3, 3], seal: [4, 4], inspect: [4, 4], 'repair-begin': [3, 3], 'repair-complete': [3, 3], review: [3, 3] };
  if (!Object.hasOwn(arity, command)) fail(`Unknown delivery contract command ${command}`);
  const [min, max] = arity[command];
  if (args.length < min || args.length > max || args.some(value => !nonempty(value) || value.startsWith('-'))) fail(`Invalid arguments for ${command}`);
  const [, taskDir, value, extra] = args;
  if (command === 'revision') return sourceRevision(taskDir);
  if (command === 'review') return checkReview({ taskDir, file: value });
  if (command === 'status') return deliveryStatus({ taskDir });
  if (command === 'policy') return saveEvidencePolicy({ taskDir, policy: JSON.parse(fs.readFileSync(value, 'utf8')) });
  if (command === 'seal') return sealEvidence({ taskDir, artifactFile: value, record: JSON.parse(fs.readFileSync(extra, 'utf8')) });
  if (command === 'inspect') return sealInspection({ taskDir, artifactFile: value, record: JSON.parse(fs.readFileSync(extra, 'utf8')) });
  if (command === 'repair-begin') return beginRepair({ taskDir, attemptId: value });
  return completeRepair({ taskDir, attemptId: value });
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(value => console.log(JSON.stringify(value, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
