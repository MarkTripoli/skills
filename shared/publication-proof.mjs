#!/usr/bin/env node
import fs from 'node:fs';
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
function firstUrl(text, prefix) {
  const line = new RegExp(`^-\\s*${prefix}:\\s*(.*)$`, 'mi').exec(text)?.[1] ?? '';
  return /https:\/\/[^\s\])>]+/i.exec(line)?.[0] ?? '';
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
function hosted(url) {
  return /^https:\/\//i.test(url) && !/\s/.test(url);
}
async function readable(url) {
  if (!hosted(url)) return false;
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (response.status === 405 || response.status === 501) response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    return response.ok && !/(?:^|\/)(?:login|sign[_-]?in)(?:\/|$)/i.test(new URL(response.url || url).pathname);
  } catch { return false; }
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
export async function inspect({ taskDir, repo, prNumber, draftHostCapture = false, override = '' }) {
  const task = path.resolve(taskDir); const root = path.dirname(task);
  const index = indexFileExists(path.join(task, 'index.json')) ? readArtifactIndex(task) : null;
  const review = currentRecord(task, 'code-review', index);
  const verification = currentRecord(task, 'verification', index);
  const description = currentRecord(task, 'pr-description', index);
  const headSha = command('git', ['rev-parse', 'HEAD'], repo);
  const taskText = fs.readFileSync(path.join(task, 'task.md'), 'utf8');
  const verificationRequired = Boolean(verification) || /verification\s*:\s*required|verification is required|required verification/i.test(taskText);
  const pr = JSON.parse(command('gh', ['pr', 'view', String(prNumber), '--json', 'url,number,headRefOid,baseRefName,baseRefOid,isDraft,body'], repo));
  const owner = JSON.parse(command('gh', ['repo', 'view', '--json', 'nameWithOwner'], repo)).nameWithOwner;
  const bodyText = pr.body ?? '';
  const evidence = section(bodyText, 'Evidence');
  const captureUrl = firstUrl(evidence, 'capture');
  const hostedCommentUrl = firstUrl(evidence, 'comment');
  const ownerPattern = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const commentId = new RegExp(`^https://github\\.com/${ownerPattern}/pull/${prNumber}#issuecomment-(\\d+)$`).exec(hostedCommentUrl)?.[1];
  const comment = commentId ? JSON.parse(command('gh', ['api', `repos/${owner}/issues/comments/${commentId}`], repo)) : null;
  const commentText = comment?.body ?? '';
  const testedSha = commitExists(repo, field(evidence, 'tested'));
  const hostedResult = field(evidence, 'result').toLowerCase() === 'passed' &&
    field(commentText, 'result').toLowerCase() === 'passed' &&
    commitExists(repo, field(commentText, 'tested')) === testedSha &&
    commitExists(repo, field(evidence, 'current head')) === pr.headRefOid &&
    commitExists(repo, field(commentText, 'current head')) === pr.headRefOid;
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
  const captureHosted = await readable(captureUrl);
  const commentVerified = Boolean(comment && String(comment.id) === commentId && comment.html_url === hostedCommentUrl &&
    hostedCommentUrl !== captureUrl && commentText.includes(captureUrl) &&
    commentText.includes(testedSha) && commentText.includes(pr.headRefOid));
  const bodyPublished = Boolean(captureUrl && hostedCommentUrl && evidence.includes(captureUrl) && evidence.includes(hostedCommentUrl));
  const proof = {
    mode: draftHostCapture ? 'draft-host-capture' : 'ready', captureUploadMissing: draftHostCapture && Boolean(pr.isDraft && !captureUrl),
    head: headSha, tested: testedSha, artifactOnlyAdvancement: artifactOnly, indexedArtifactsOnly: artifactOnly,
    substantiveChanged: Boolean(testedSha && !artifactOnly), reviewRequired: true, review: review?.status, reviewCurrent,
    verificationRequired, verification: verification?.status, verificationCurrent, capture: hostedResult ? 'passed' : '',
    captureCurrent, captureHosted, commentVerified, commentDistinct: Boolean(comment && hostedCommentUrl !== captureUrl),
    finalBodyPublished: bodyPublished, finalBodyVerified: bodyPublished, bypass: Boolean(override),
  };
  const decision = decidePublicationProof(proof);
  let reason = decision.status === 'pass' ? 'all current publication proof is verified' : decision.status === 'stale' ? 'tested proof does not cover the substantive code at HEAD' : draftHostCapture ? (pr.isDraft ? 'draft is permitted only to host capture; ready publication is not authorized' : 'capture-hosting mode requires an existing draft PR') : override ? `audited override requested: ${override}; mandatory proof remains incomplete` : 'required current hosted proof or publication read-back is missing';
  if (override) reason = `audited override requested: ${override}; decision remains ${decision.status}`;
  return { ...decision, reason, head: headSha, tested: testedSha || null, pullRequest: pr.url, override: override || null,
    captureCurrent, captureHosted, commentVerified, reviewCurrent, verificationRequired, verificationCurrent, bodyPublished,
    descriptionCurrent: Boolean(bodyPublished && section(bodyText, 'Purpose') && section(bodyText, 'Change outline')),
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
