#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { currentArtifact, indexFileExists, parseArtifactText, readArtifactIndex, readArtifactScalars } from './task-artifacts.mjs';
import { decidePublicationProof } from './publication-proof-policy.mjs';

function command(bin, args, cwd, { trim = true } = {}) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${bin} ${args.join(' ')} failed: ${(result.stderr || result.error?.message || '').trim()}`);
  return trim ? result.stdout.trim() : result.stdout;
}
function field(text, name) {
  const match = new RegExp(`^(?:-\\s*)?${name}:\\s*(.*?)\\s*$`, 'mi').exec(text);
  return match?.[1]?.replace(/^['"]|['"]$/g, '') ?? '';
}
function section(text, heading) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return '';
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}
const RECORDINGS = new Set(['ui-video', 'cli-terminal', 'api-probe', 'agent-session']);
const PLACEHOLDER = /(?:\{[A-Z][A-Z0-9_ ]+\}|^\s*<[^>]+>\s*$|\b(?:todo|tbd|placeholder|not recorded|example only)\b)/im;
function evidenceFields(text) {
  const fields = new Map();
  let valid = true;
  for (const line of text.split(/\r?\n/)) {
    const match = /^-\s*(result|tested|current head|recording(?: [a-z0-9]+(?:-[a-z0-9]+)*)?|capture(?: [a-z0-9]+(?:-[a-z0-9]+)*)?|comment):\s*(.*?)\s*$/i.exec(line);
    if (!match) {
      if (/^-\s*(?:recording|capture)\b/i.test(line)) valid = false;
      continue;
    }
    const key = match[1].toLowerCase();
    if (fields.has(key) || !match[2] || PLACEHOLDER.test(match[2])) valid = false;
    fields.set(key, match[2]);
  }
  const recordings = new Map();
  const captures = new Map();
  for (const [key, value] of fields) {
    if (key === 'recording' || key.startsWith('recording ')) {
      const label = key === 'recording' ? 'primary' : key.slice(10);
      if (recordings.has(label)) valid = false;
      recordings.set(label, value);
    }
    if (key === 'capture' || key.startsWith('capture ')) {
      const label = key === 'capture' ? 'primary' : key.slice(8);
      if (captures.has(label)) valid = false;
      captures.set(label, value);
    }
  }
  if (!recordings.size || recordings.size !== captures.size || [...recordings].some(([label, type]) => !RECORDINGS.has(type) || !captures.has(label))) valid = false;
  for (const url of captures.values()) if (!captureDestination(url)) valid = false;
  return { fields, recordings, captures, valid };
}
function recordedTests(evidence, captures) {
  const table = /^### Recorded tests[ \t]*\r?\n([\s\S]*?)(?=^#{2,3}[ \t]|$(?![\s\S]))/m.exec(evidence)?.[1] ?? '';
  const lines = table.trim().split('\n').map(line => line.trim());
  if (lines[0] !== '| Test | Result | Capture | Cue |' || !/^\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|$/.test(lines[1] ?? '')) return false;
  const covered = new Set();
  for (const line of lines.slice(2).filter(Boolean)) {
    if (!line.startsWith('|')) return false;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 4 || cells.some(cell => !cell || PLACEHOLDER.test(cell))) return false;
    const [name, result, label, cue] = cells;
    if (result.toLowerCase() !== 'passed' || !captures.has(label) ||
      !/(?:\b\d{1,2}:\d{2}(?::\d{2})?\b|\b(?:output\s+)?line\s*#?\d+\b|\bL\d+\b)/i.test(cue) ||
      !/\w{3,}/.test(name)) return false;
    covered.add(label);
  }
  return covered.size === captures.size;
}
function currentRecord(taskDir, type, index) {
  if (index) {
    const record = currentArtifact(taskDir, type);
    if (!record) return null;
    const file = path.join(taskDir, record.path);
    const parsed = readArtifactScalars(file, type);
    return { ...record, file, text: parsed.text, status: parsed.status };
  }
  const files = fs.readdirSync(taskDir).filter(name => /^\d{2,}-[a-z0-9-]+\.md$/.test(name) || name === 'pr-description.md')
    .sort((a, b) => Number.parseInt(a) - Number.parseInt(b) || a.localeCompare(b));
  let latest = null;
  for (const name of files) {
    const file = path.join(taskDir, name);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`${file}: artifact symlinks are not accepted`);
    const text = fs.readFileSync(file, 'utf8');
    const parsed = parseArtifactText(text, name === 'pr-description.md' ? 'pr-description' : field(text, 'type'), file);
    if (parsed.type === type) latest = { file, text: parsed.text, status: parsed.status };
  }
  return latest;
}
function captureDestination(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return null;
    const host = url.hostname.toLowerCase();
    const githubAttachment = host === 'github.com' && /^\/user-attachments\/assets\/[a-z0-9-]+$/i.test(url.pathname);
    const gitlabUpload = host === 'gitlab.com' && /\/uploads\/[a-z0-9]+\/[^/]+$/i.test(url.pathname);
    const gistRaw = host === 'gist.githubusercontent.com' && /^\/[^/]+\/[a-f0-9]+\/raw(?:\/|$)/i.test(url.pathname);
    const githubMedia = ['user-images.githubusercontent.com', 'private-user-images.githubusercontent.com',
      'objects.githubusercontent.com', 'raw.githubusercontent.com', 'github-production-user-asset-6210df.s3.amazonaws.com'].includes(host);
    return githubAttachment || gitlabUpload || gistRaw || githubMedia ? url : null;
  } catch { return null; }
}
// Full hosted objects only: a prefix cannot establish a final exit or contain a playable frame.
const TEXT_LIMIT = 8 * 1024 * 1024;
const VIDEO_LIMIT = 128 * 1024 * 1024;
function firstOutputLine(text, start, echoed = '') {
  while (start < text.length) {
    const end = text.indexOf('\n', start);
    const line = text.slice(start, end < 0 ? undefined : end).trim();
    if (line && line !== echoed && line !== `$ ${echoed}` &&
      !/^Script (?:started|done) on\b/i.test(line) && !/^[#$>%]\s+\S/.test(line)) return line;
    if (end < 0) break;
    start = end + 1;
  }
  return '';
}
function recordedText(text, sha, recording) {
  if (!text || /^\s*<(?:!doctype html|html)/i.test(text)) return false;
  const revision = /(?:^|\n)\s*(?:source sha|tested sha|tested revision|commit sha|revision)\s*:\s*([a-f0-9]{40})\b/im.exec(text)?.[1];
  const invocationPattern = recording === 'api-probe'
    ? /(?:^|\n)\s*(?:request|command|invocation|curl|focused command)\s*:\s*([^\r\n]+)/im
    : /(?:^|\n)\s*(?:focused command|command|tool invocation|invocation|request)\s*:\s*([^\r\n]+)/im;
  const scriptStart = /(?:^|\n)Script started on [^\n]+/im.exec(text);
  const prompt = /(?:^|\n)[ \t]*\$[ \t]+([^\r\n]+)/m.exec(text);
  const scripted = scriptStart && /\[COMMAND="([^"]+)"\]/i.exec(scriptStart[0])?.[1]?.trim();
  const invocation = invocationPattern.exec(text)?.[1]?.trim() ??
    (scriptStart && (scripted || prompt?.[1])?.trim());
  if (scriptStart && !scripted) {
    const commands = [...text.matchAll(/(?:^|\n)[ \t]*\$[ \t]+([^\r\n]+)/g)];
    const commandIndex = commands.findIndex(match => match[1].trim() === invocation);
    const probe = commands[commandIndex + 1];
    if (commandIndex < 0 || !probe ||
      !/^printf\s+['"]exit=%s\\n['"]\s+["']?\$\?["']?$/.test(probe[1].trim())) return false;
    const observedLines = text.slice(commands[commandIndex].index + commands[commandIndex][0].length, probe.index)
      .split(/\r?\n/).map(line => line.trim());
    const output = observedLines.find(line => line && !/^(?:exit(?: status| code)?|status|outcome)\s*:/i.test(line));
    const exit = /^\r?\n[ \t]*exit=(\d+)[ \t]*(?:\r?\n|$)/.exec(text.slice(probe.index + probe[0].length))?.[1];
    const trailer = [...text.matchAll(/(?:^|\n)Script done on [^\n]*\[COMMAND_EXIT_CODE="?([0-9]+)"?\]/gim)];
    return revision?.toLowerCase() === sha.toLowerCase() &&
      Boolean(invocation && !PLACEHOLDER.test(invocation) && /(?:\s+\S+|\w+\([^)]*\))/.test(invocation)) &&
      Boolean(output && !PLACEHOLDER.test(output)) && exit === '0' &&
      commands.slice(commandIndex + 2).every(match => match[1].trim() === 'exit') &&
      (trailer.length === 0 || (trailer.length === 1 && trailer[0][1] === '0'));
  }
  const observed = /(?:^|\n)\s*(?:(?:node[ \t]+)?stdout|test output|observed output|response(?: body)?|result output|tool output)(?:[ \t]*:[ \t]*|[ \t]*\r?\n)([^\r\n]*)/im.exec(text);
  const output = observed?.[1]?.trim() || (observed && firstOutputLine(text, observed.index + observed[0].length));
  const scriptOutput = !observed && scriptStart &&
    firstOutputLine(text, scriptStart.index + scriptStart[0].length, invocation);
  if (scripted) {
    const exits = [...text.matchAll(/(?:^|\n)Script done on [^\n]*\[COMMAND_EXIT_CODE="?([0-9]+)"?\]/gim)];
    if (exits.length !== 1 || exits[0][1] !== '0') return false;
  }
  // A preliminary success cannot override a later failed command or script trailer.
  const completionPattern = /(?:^|\n)\s*(?:exit (?:status|code)|status(?: code)?|outcome)\s*:\s*([^\r\n]+)|(?:^|\n)Script done on [^\n]*\[COMMAND_EXIT_CODE="?([0-9]+)"?\]/gim;
  let completion = false;
  for (const match of text.matchAll(completionPattern)) {
    completion = match[2] ? match[2] === '0' : /^(?:0\b|2\d\d\b|passed\b|success\b)/i.test(match[1].trim());
  }
  const actualOutput = output || scriptOutput;
  return revision?.toLowerCase() === sha.toLowerCase() &&
    Boolean(invocation && (!scripted || invocation === scripted) && !PLACEHOLDER.test(invocation) && /(?:\s+\S+|\w+\([^)]*\))/.test(invocation) &&
      !/^(?:passed|success|recorded proof)$/i.test(invocation)) &&
    completion && Boolean(actualOutput && !PLACEHOLDER.test(actualOutput) &&
      !/^(?:passed|success|recorded proof|no errors|stderr\b|exit (?:status|code)\s*:|status(?: code)?\s*:|outcome\s*:|script done on\b)/i.test(actualOutput));
}
async function captureBytes(response, limit) {
  const length = response.headers.get('content-length');
  if (!response.body || (length && (!/^\d+$/.test(length) || Number(length) > limit))) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      if (size + value.length > limit) return null;
      chunks.push(value);
      size += value.length;
    }
    return size ? Buffer.concat(chunks, size) : null;
  } finally { await reader.cancel(); }
}
async function decodableVideo(response, taskRoot) {
  let dir;
  let fd;
  let reader;
  try {
    const length = response.headers.get('content-length');
    if (!response.body || (length && (!/^\d+$/.test(length) || Number(length) > VIDEO_LIMIT))) {
      await response.body?.cancel();
      return false;
    }
    const scratch = fs.realpathSync(os.tmpdir());
    const root = fs.realpathSync(taskRoot);
    if (scratch === root || scratch.startsWith(`${root}${path.sep}`)) return false;
    dir = fs.mkdtempSync(path.join(scratch, 'publication-video-'));
    const file = path.join(dir, 'capture');
    fd = fs.openSync(file, 'w', 0o600);
    reader = response.body.getReader();
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      if (size + value.length > VIDEO_LIMIT) return false;
      for (let offset = 0; offset < value.length;) offset += fs.writeSync(fd, value, offset, value.length - offset);
      size += value.length;
    }
    if (!size) return false;
    fs.closeSync(fd);
    fd = undefined;
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'json', file],
    { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
    if (probe.error || probe.status !== 0) return false;
    const stream = JSON.parse(probe.stdout).streams?.[0];
    if (!Number.isInteger(stream?.width) || !Number.isInteger(stream?.height) ||
      stream.width < 1 || stream.height < 1 || stream.width * stream.height > 7680 * 4320) return false;
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0',
      '-frames:v', '1', '-f', 'framecrc', 'pipe:1'],
    { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
    return !decoded.error && decoded.status === 0 && /^\s*0,\s*-?\d+,\s*-?\d+,\s*\d+,\s*[1-9]\d*,\s*0x[0-9a-f]+\s*$/im.test(decoded.stdout);
  } catch { return false; }
  finally {
    if (reader) try { await reader.cancel(); } catch { /* Preserve fail-closed result and still delete scratch. */ }
    try { if (fd !== undefined) fs.closeSync(fd); }
    finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }); }
  }
}
async function readable(value, recording, sha, taskRoot) {
  let url = captureDestination(value);
  if (!url) return false;
  const video = recording === 'ui-video';
  try {
    for (let hop = 0; hop < 6; hop++) {
      const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (response.url && response.url !== url.href) {
        await response.body?.cancel();
        return false;
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) return false;
        url = captureDestination(new URL(location, url));
        if (!url) return false;
        continue;
      }
      if (response.status !== 200 || /(?:^|\/)(?:login|sign[_-]?in)(?:\/|$)/i.test(url.pathname)) {
        await response.body?.cancel();
        return false;
      }
      const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
      const textHost = url.hostname === 'gist.githubusercontent.com' && url.pathname.includes('/raw') ||
        url.hostname === 'github.com' && url.pathname.startsWith('/user-attachments/assets/');
      const validType = video
        ? ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska', 'application/octet-stream'].includes(type)
        : (type === 'text/plain' && textHost) || type === 'application/octet-stream';
      if (!validType) { await response.body?.cancel(); return false; }
      if (video) return decodableVideo(response, taskRoot);
      const bytes = await captureBytes(response, TEXT_LIMIT);
      if (!bytes) return false;
      return recordedText(new TextDecoder('utf-8', { fatal: true }).decode(bytes), sha, recording);
    }
  } catch { return false; }
  return false;
}
function commitExists(repo, value) {
  if (!/^[0-9a-f]{7,40}$/i.test(value)) return '';
  try { return command('git', ['rev-parse', '--verify', `${value}^{commit}`], repo); } catch { return ''; }
}
function onlyIndexedArtifacts(repo, taskDir, taskRoot, testedSha, headSha, index) {
  try { command('git', ['merge-base', '--is-ancestor', testedSha, headSha], repo); }
  catch { return false; }
  const root = path.relative(repo, taskRoot).split(path.sep).join('/');
  const indexed = new Set(['index.json']);
  for (const series of Object.values(index.artifactSeries)) for (const record of series.iterations) indexed.add(record.path);
  const allowed = new Set([...indexed].map(p => `${root}/${path.basename(taskDir)}/${p}`));
  const commits = command('git', ['rev-list', '--reverse', `${testedSha}..${headSha}`], repo).split('\n').filter(Boolean);
  return commits.every(commit => {
    const parents = command('git', ['rev-list', '--parents', '-n', '1', commit], repo).split(' ');
    if (parents.length !== 2) return false;
    const changed = command('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit], repo, { trim: false }).split('\0').filter(Boolean);
    return changed.length > 0 && changed.every(file => allowed.has(file));
  });
}
function sameCodeRevision(repo, task, root, index, left, right) {
  return Boolean(left && right && (left === right || (index &&
    (onlyIndexedArtifacts(repo, task, root, left, right, index) ||
      onlyIndexedArtifacts(repo, task, root, right, left, index)))));
}
function completeDescription(body) {
  const meaningful = value => Boolean(value && !PLACEHOLDER.test(value) && /[a-z]{3,}/i.test(value));
  const purpose = section(body, 'Purpose');
  const special = section(body, 'Special things to note');
  const outline = section(body, 'Change outline');
  const human = section(body, 'Human Review');
  const criteria = section(body, 'Acceptance criteria');
  return meaningful(purpose) && meaningful(special) && meaningful(outline) &&
    meaningful(human) && (!/^## Acceptance criteria\s*$/im.test(body) || meaningful(criteria)) &&
    /### Review targets\s*\n[\s\S]*?-\s+\S/im.test(human) &&
    /### Verify\s*\n[\s\S]*?-\s*\[[ x]\]\s+\S/im.test(human) &&
    /### Known limits\s*\n[\s\S]*?-\s+\S/im.test(human);
}
export async function inspect({ taskDir, repo, prNumber, draftHostCapture = false, override = '' }) {
  const task = path.resolve(taskDir); const root = path.dirname(task);
  const index = indexFileExists(path.join(task, 'index.json')) ? readArtifactIndex(task) : null;
  const review = currentRecord(task, 'code-review', index);
  const verification = currentRecord(task, 'verification', index);
  const headSha = command('git', ['rev-parse', 'HEAD'], repo);
  const taskText = fs.readFileSync(path.join(task, 'task.md'), 'utf8');
  const verificationRequired = Boolean(verification) || /verification\s*:\s*required|verification is required|required verification/i.test(taskText);
  const pr = JSON.parse(command('gh', ['pr', 'view', String(prNumber), '--json', 'url,number,headRefOid,baseRefName,baseRefOid,isDraft,body'], repo));
  const owner = JSON.parse(command('gh', ['repo', 'view', '--json', 'nameWithOwner'], repo)).nameWithOwner;
  const bodyText = pr.body ?? '';
  const evidence = section(bodyText, 'Evidence');
  const bodyFields = evidenceFields(evidence);
  const hostedCommentUrl = bodyFields.fields.get('comment') ?? '';
  const ownerPattern = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const commentId = new RegExp(`^https://github\\.com/${ownerPattern}/pull/${prNumber}#issuecomment-(\\d+)$`).exec(hostedCommentUrl)?.[1];
  const comment = commentId ? JSON.parse(command('gh', ['api', `repos/${owner}/issues/comments/${commentId}`], repo)) : null;
  const commentFields = evidenceFields(comment?.body ?? '');
  const rawTested = bodyFields.fields.get('tested') ?? '';
  const testedSha = /^[0-9a-f]{40}$/i.test(rawTested) ? commitExists(repo, rawTested) : '';
  const hostedResult = Boolean(testedSha && bodyFields.valid && commentFields.valid &&
    bodyFields.fields.get('result') === 'passed' && commentFields.fields.get('result') === 'passed' &&
    bodyFields.fields.get('tested') === testedSha && commentFields.fields.get('tested') === testedSha &&
    bodyFields.fields.get('current head') === pr.headRefOid &&
    commentFields.fields.get('current head') === pr.headRefOid &&
    [...bodyFields.recordings].every(([label, type]) =>
      commentFields.recordings.get(label) === type && commentFields.captures.get(label) === bodyFields.captures.get(label)) &&
    bodyFields.recordings.size === commentFields.recordings.size &&
    recordedTests(evidence, bodyFields.captures));
  const reviewSha = review ? commitExists(repo, field(review.text, 'head_sha')) : '';
  const hostedBase = commitExists(repo, pr.baseRefOid);
  const mergeBase = hostedBase && pr.headRefOid === headSha ? command('git', ['merge-base', hostedBase, headSha], repo) : '';
  const artifactOnly = Boolean(testedSha) && pr.headRefOid === headSha &&
    (testedSha === headSha || Boolean(index && onlyIndexedArtifacts(repo, task, root, testedSha, headSha, index)));
  const reviewCurrent = Boolean(review?.status === 'clean' &&
    pr.baseRefName && mergeBase && field(review.text, 'base_branch') === pr.baseRefName &&
    commitExists(repo, field(review.text, 'base_sha')) === mergeBase &&
    sameCodeRevision(repo, task, root, index, reviewSha, testedSha));
  const verificationCurrent = Boolean(verification?.status === 'passed' &&
    sameCodeRevision(repo, task, root, index, commitExists(repo, field(verification.text, 'revision')), testedSha));
  const captureCurrent = Boolean(testedSha && artifactOnly && hostedResult);
  const captureHosted = Boolean(hostedResult && (await Promise.all([...bodyFields.recordings].map(([label, recording]) =>
    readable(bodyFields.captures.get(label), recording, testedSha, root)))).every(Boolean));
  const commentVerified = Boolean(comment && String(comment.id) === commentId && comment.html_url === hostedCommentUrl &&
    [...bodyFields.captures.values()].every(url => hostedCommentUrl !== url) && hostedResult);
  const bodyPublished = Boolean(hostedCommentUrl && bodyFields.captures.size && commentVerified);
  const descriptionCurrent = Boolean(bodyPublished && completeDescription(bodyText));
  const proof = {
    mode: draftHostCapture ? 'draft-host-capture' : 'ready', captureUploadMissing: draftHostCapture && Boolean(pr.isDraft && !bodyFields.captures.size),
    head: headSha, tested: testedSha, artifactOnlyAdvancement: artifactOnly, indexedArtifactsOnly: artifactOnly,
    substantiveChanged: Boolean(testedSha && !artifactOnly), reviewRequired: true, review: review?.status, reviewCurrent,
    verificationRequired, verification: verification?.status, verificationCurrent, capture: hostedResult ? 'passed' : '',
    captureCurrent, captureHosted, commentVerified, commentDistinct: Boolean(comment && commentVerified),
    finalBodyPublished: bodyPublished, finalBodyVerified: descriptionCurrent, bypass: Boolean(override),
  };
  const decision = decidePublicationProof(proof);
  let reason = decision.status === 'pass' ? 'all current publication proof is verified' : decision.status === 'stale' ? 'tested proof does not cover the substantive code at HEAD' : draftHostCapture ? (pr.isDraft ? 'draft is permitted only to host capture; ready publication is not authorized' : 'capture-hosting mode requires an existing draft PR') : override ? `audited override requested: ${override}; mandatory proof remains incomplete` : 'required current hosted proof or publication read-back is missing';
  if (override) reason = `audited override requested: ${override}; decision remains ${decision.status}`;
  return { ...decision, reason, head: headSha, tested: testedSha || null, pullRequest: pr.url, override: override || null,
    captureCurrent, captureHosted, commentVerified, reviewCurrent, verificationRequired, verificationCurrent, bodyPublished,
    descriptionCurrent,
    descriptionHash: createHash('sha256').update(bodyText).digest('hex') };
}

function usage() {
  return 'Usage: node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number> [--draft-host-capture] [--override <reason>]';
}
async function main(argv) {
  const [taskDir, repo, prNumber, ...options] = argv;
  if (!taskDir || !repo || !/^\d+$/.test(prNumber ?? '')) throw new Error(usage());
  let draftHostCapture = false; let override = '';
  for (let i = 0; i < options.length; i++) {
    if (options[i] === '--draft-host-capture') draftHostCapture = true;
    else if (options[i] === '--override' && options[i + 1]?.trim()) override = options[++i].trim();
    else throw new Error(usage());
  }
  try {
    process.stdout.write(`${JSON.stringify(await inspect({ taskDir, repo, prNumber, draftHostCapture, override }))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({status: 'incomplete', allowed: false, ready: false, reason: 'proof inspection failed; see stderr'})}\n`);
    process.stderr.write(`${String(error?.message ?? error).slice(0, 800)}\n`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${String(error?.message ?? error).slice(0, 800)}\n`); process.exitCode = 1; });
}
