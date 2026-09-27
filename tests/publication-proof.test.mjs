import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { ARTIFACT_SERIES, initTaskArtifacts, recordArtifact, reserveArtifactIteration } from '../shared/task-artifacts.mjs';

const dirs = [];
function run(bin, args, cwd, env = process.env) {
  const result = spawnSync(bin, args, { cwd, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `${bin} failed`);
  return result.stdout.trim();
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-proof-'));
  dirs.push(root);
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  run('git', ['init', '-q'], repo);
  run('git', ['config', 'user.email', 'proof@example.test'], repo);
  run('git', ['config', 'user.name', 'Proof Test'], repo);
  fs.writeFileSync(path.join(repo, 'source.txt'), 'original\n');
  run('git', ['add', 'source.txt'], repo);
  run('git', ['commit', '-qm', 'feat: initial source'], repo);
  const taskDir = path.join(repo, '.agents', 'tasks', 'proof-check');
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'task.md'), '---\nslug: proof-check\ntitle: Proof check\nworkflow: full\ncreated: 2026-09-27\n---\n');
  initTaskArtifacts(taskDir);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const gh = path.join(bin, 'gh');
  fs.writeFileSync(gh, `#!/bin/sh\ncase "$1 $2" in\n  "pr view") printf '%s' "$GH_PR_JSON" ;;\n  "repo view") printf '%s' '{"nameWithOwner":"owner/repo"}' ;;\n  "api repos/owner/repo/issues/7/comments") printf '%s' "$GH_COMMENTS_JSON" ;;\n  *) exit 2 ;;\nesac\n`);
  fs.chmodSync(gh, 0o755);
  return { root, repo, taskDir, bin };
}
function addArtifact(taskDir, type, text) {
  const [kind, variant] = ARTIFACT_SERIES[type];
  const allocation = reserveArtifactIteration(taskDir, kind, variant);
  fs.writeFileSync(path.join(taskDir, allocation.writePath), text);
  recordArtifact(taskDir, kind, variant, type, allocation.writePath);
}
function addEvidence(taskDir, testedSha, {captureUrl = 'describe-pr pending', commentUrl = 'describe-pr pending'} = {}) {
  addArtifact(taskDir, 'evidence', `---\ntype: evidence\nstatus: passed\nsummary: Captured behavior\n---\n\n## Revision\n\n- commit: ${testedSha}\n\n## Sessions\n\n- CLI: transcript\n\n## Results\n\n| Test | Result | Capture timestamp or line |\n|---|---|---|\n| behavior | passed | line 1 |\n\n## Caveats\n\n- None.\n\n## Posted to\n\n- PR description: ${captureUrl}\n- PR comment: ${commentUrl}\n`);
}
function proofCommand({ repo, taskDir, bin, extra = [], prHead, draft = false, prBody = '', comments = [], fetchStub = null }) {
  const script = new URL('../shared/publication-proof.mjs', import.meta.url).pathname;
  const output = run(process.execPath, [...(fetchStub ? ['--import', fetchStub] : []), script, taskDir, repo, '7', ...extra], repo, {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GH_PR_JSON: JSON.stringify({ url: 'https://github.com/owner/repo/pull/7', number: 7, headRefOid: prHead, isDraft: draft, body: prBody }),
    GH_COMMENTS_JSON: JSON.stringify(comments),
  });
  return JSON.parse(output);
}
function completeProofFixture({reviewLater = false} = {}) {
  const data = fixture();
  const tested = run('git', ['rev-parse', 'HEAD'], data.repo);
  const captureUrl = 'https://captures.example.test/proof.mp4';
  const commentUrl = 'https://github.com/owner/repo/pull/7#issuecomment-123';
  if (reviewLater) {
    addArtifact(data.taskDir, 'implementation', '---\ntype: implementation\nsummary: Task artifact recorded\n---\n\n# Implementation\n\nSource unchanged.\n');
    run('git', ['add', '.agents/tasks/proof-check/index.json', '.agents/tasks/proof-check/artifacts'], data.repo);
    run('git', ['commit', '-qm', 'docs(task): implementation artifact'], data.repo);
  }
  const reviewed = run('git', ['rev-parse', 'HEAD'], data.repo);
  addEvidence(data.taskDir, tested, {captureUrl, commentUrl});
  addArtifact(data.taskDir, 'code-review', `---\ntype: code-review\nstatus: clean\nsummary: No required findings\nhead_sha: ${reviewed}\n---\n\n## Critical and Required Findings\n\nNone.\n`);
  addArtifact(data.taskDir, 'verification', `---\ntype: verification\nstatus: passed\nsummary: Build passed\nrevision: ${reviewed}\n---\n\n## Items\n\n| Id | Verdict |\n|---|---|\n| A1 | pass |\n`);
  const prBody = `## Purpose\n\nPublish tested behavior.\n\n## Evidence\n\n- ${captureUrl}\n- ${commentUrl}\n\n## Change outline\n\nSource is unchanged.\n`;
  addArtifact(data.taskDir, 'pr-description', prBody);
  run('git', ['add', '.agents/tasks/proof-check/index.json', '.agents/tasks/proof-check/artifacts'], data.repo);
  run('git', ['commit', '-qm', 'docs(task): indexed proof artifacts'], data.repo);
  const head = run('git', ['rev-parse', 'HEAD'], data.repo);
  const fetchStub = path.join(data.root, 'fetch-stub.mjs');
  fs.writeFileSync(fetchStub, 'globalThis.fetch = async () => ({status: 200, ok: true});\n');
  const comment = {html_url: commentUrl, body: `passed ${captureUrl} tested ${tested} head ${head}`};
  return {...data, tested, head, prBody, comment, fetchStub};
}

test.afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

test('draft capture hosting stays incomplete and never readies publication', () => {
  const data = fixture();
  const head = run('git', ['rev-parse', 'HEAD'], data.repo);
  const beforeReceipt = proofCommand({ ...data, extra: ['--draft-host-capture'], prHead: head, draft: true });
  assert.deepEqual({ allowed: beforeReceipt.allowed, ready: beforeReceipt.ready, status: beforeReceipt.status }, { allowed: true, ready: false, status: 'incomplete' });
  addEvidence(data.taskDir, head);
  const result = proofCommand({ ...data, extra: ['--draft-host-capture'], prHead: head, draft: true });
  assert.deepEqual({ allowed: result.allowed, ready: result.ready, status: result.status }, { allowed: true, ready: false, status: 'incomplete' });
  const notDraft = proofCommand({ ...data, extra: ['--draft-host-capture'], prHead: head, draft: false });
  assert.equal(notDraft.allowed, false);
  assert.equal(notDraft.ready, false);
});

test('unavailable hosted PR inspection reports incomplete instead of a clean decision', () => {
  const data = fixture();
  fs.writeFileSync(path.join(data.bin, 'gh'), '#!/bin/sh\nexit 2\n');
  const script = new URL('../shared/publication-proof.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [script, data.taskDir, data.repo, '7'], {
    cwd: data.repo, encoding: 'utf8', env: {...process.env, PATH: `${data.bin}:${process.env.PATH}`},
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'incomplete', allowed: false, ready: false, reason: 'proof inspection failed; see stderr',
  });
});

test('indexed artifact-only HEAD advancement is not marked stale', () => {
  const data = fixture();
  const tested = run('git', ['rev-parse', 'HEAD'], data.repo);
  addEvidence(data.taskDir, tested);
  run('git', ['add', '.agents/tasks/proof-check/index.json', '.agents/tasks/proof-check/artifacts'], data.repo);
  run('git', ['commit', '-qm', 'docs(task): evidence artifact'], data.repo);
  const head = run('git', ['rev-parse', 'HEAD'], data.repo);
  const result = proofCommand({ ...data, prHead: head });
  assert.equal(result.status, 'incomplete');
  assert.match(result.reason, /required current proof/);
});

test('substantive code advancement after evidence reports stale', () => {
  const data = fixture();
  const tested = run('git', ['rev-parse', 'HEAD'], data.repo);
  addEvidence(data.taskDir, tested);
  run('git', ['add', '.agents/tasks/proof-check/index.json', '.agents/tasks/proof-check/artifacts'], data.repo);
  run('git', ['commit', '-qm', 'docs(task): evidence artifact'], data.repo);
  fs.writeFileSync(path.join(data.repo, 'source.txt'), 'changed\n');
  run('git', ['add', 'source.txt'], data.repo);
  run('git', ['commit', '-qm', 'fix: change source'], data.repo);
  const head = run('git', ['rev-parse', 'HEAD'], data.repo);
  const result = proofCommand({ ...data, prHead: head });
  assert.equal(result.status, 'stale');
  assert.equal(result.ready, false);
});

test('current clean proof passes after indexed artifacts and requires a final-head comment', () => {
  const data = completeProofFixture();
  const staleComment = {...data.comment, body: `passed https://captures.example.test/proof.mp4 tested ${data.tested}`};
  const incomplete = proofCommand({...data, prHead: data.head, comments: [staleComment]});
  assert.equal(incomplete.status, 'incomplete');
  const passed = proofCommand({...data, prHead: data.head, comments: [data.comment]});
  assert.deepEqual({status: passed.status, allowed: passed.allowed, ready: passed.ready}, {status: 'pass', allowed: true, ready: true});
  assert.equal(passed.tested, data.tested);
});

test('review and verification remain current across indexed artifact-only revision movement', () => {
  const data = completeProofFixture({reviewLater: true});
  const result = proofCommand({...data, prHead: data.head, comments: [data.comment]});
  assert.equal(result.status, 'pass');
  assert.equal(result.ready, true);
});

test('a substantive commit remains stale even if a later commit reverts its net diff', () => {
  const data = completeProofFixture();
  fs.writeFileSync(path.join(data.repo, 'source.txt'), 'changed\n');
  run('git', ['add', 'source.txt'], data.repo);
  run('git', ['commit', '-qm', 'fix: change source'], data.repo);
  fs.writeFileSync(path.join(data.repo, 'source.txt'), 'original\n');
  run('git', ['add', 'source.txt'], data.repo);
  run('git', ['commit', '-qm', 'fix: restore source'], data.repo);
  const head = run('git', ['rev-parse', 'HEAD'], data.repo);
  const result = proofCommand({...data, prHead: head});
  assert.equal(result.status, 'stale');
});
