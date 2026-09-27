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
function fixture({ legacy = false } = {}) {
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
  if (!legacy) initTaskArtifacts(taskDir);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\ncase "$1 $2" in\n  "pr view") printf '%s' "$GH_PR_JSON" ;;\n  "repo view") printf '%s' '{"nameWithOwner":"owner/repo"}' ;;\n  "api repos/owner/repo/issues/comments/123") printf '%s' "$GH_COMMENT_JSON" ;;\n  *) exit 2 ;;\nesac\n`);
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  const fetchStub = path.join(root, 'fetch-stub.mjs');
  fs.writeFileSync(fetchStub, 'globalThis.fetch = async (url) => new Response("video bytes", { headers: { "content-type": "video/mp4" } });\n');
  return { root, repo, taskDir, bin, fetchStub };
}
function addArtifact(taskDir, type, text) {
  if (!fs.existsSync(path.join(taskDir, 'index.json'))) {
    const iteration = fs.readdirSync(taskDir).filter(name => /^\d{2,}-/.test(name)).length + 1;
    fs.writeFileSync(path.join(taskDir, `${String(iteration).padStart(2, '0')}-${type}-proof.md`), text);
    return;
  }
  const [kind, variant] = ARTIFACT_SERIES[type];
  const allocation = reserveArtifactIteration(taskDir, kind, variant);
  fs.writeFileSync(path.join(taskDir, allocation.writePath), text);
  recordArtifact(taskDir, kind, variant, type, allocation.writePath);
}
const captureUrl = 'https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc';
const commentUrl = 'https://github.com/owner/repo/pull/7#issuecomment-123';
const body = (tested, head, capture = captureUrl, result = 'passed') => `## Purpose\n\nOther reference: https://gitlab.com/example/unrelated\n\n## Evidence\n\n- result: ${result}\n- tested: ${tested}\n- current head: ${head}\n- capture: ${capture}\n- comment: ${commentUrl}\n\n## Change outline\n\nSource is unchanged.\n`;
const comment = (tested, head, capture = captureUrl, result = 'passed') => ({ id: 123, html_url: commentUrl, body: `- result: ${result}\n- tested: ${tested}\n- current head: ${head}\n- capture: ${capture}` });
function proofCommand({ repo, taskDir, bin, fetchStub, extra = [], prHead, tested, baseHead = tested ?? prHead, baseBranch = 'main', draft = false, prBody = '', posted = null }) {
  const script = new URL('../shared/publication-proof.mjs', import.meta.url).pathname;
  return JSON.parse(run(process.execPath, ['--import', fetchStub, script, taskDir, repo, '7', ...extra], repo, {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GH_PR_JSON: JSON.stringify({ url: 'https://github.com/owner/repo/pull/7', number: 7, headRefOid: prHead, baseRefName: baseBranch, baseRefOid: baseHead, isDraft: draft, body: prBody }),
    GH_COMMENT_JSON: JSON.stringify(posted),
  }));
}
function completed({ legacy = false, reviewLater = false } = {}) {
  const data = fixture({ legacy });
  const tested = run('git', ['rev-parse', 'HEAD'], data.repo);
  if (reviewLater) {
    addArtifact(data.taskDir, 'implementation', '---\ntype: implementation\nsummary: Task metadata recorded\n---\n\n# Implementation\n\nSource unchanged.\n');
    run('git', ['add', '.agents/tasks/proof-check/index.json', '.agents/tasks/proof-check/artifacts'], data.repo);
    run('git', ['commit', '-qm', 'docs(task): historical metadata'], data.repo);
  }
  const reviewed = run('git', ['rev-parse', 'HEAD'], data.repo);
  addArtifact(data.taskDir, 'code-review', `---\ntype: code-review\nstatus: clean\nsummary: No required findings\nbase_branch: main\nbase_sha: ${tested}\nhead_sha: ${reviewed}\n---\n\n## Critical and Required Findings\n\nNone.\n`);
  addArtifact(data.taskDir, 'verification', `---\ntype: verification\nstatus: passed\nsummary: Build passed\nrevision: ${reviewed}\n---\n\n## Items\n\n| Id | Verdict |\n|---|---|\n| A1 | pass |\n`);
  if (!legacy) {
    run('git', ['add', '.agents/tasks/proof-check/index.json', '.agents/tasks/proof-check/artifacts'], data.repo);
    run('git', ['commit', '-qm', 'docs(task): historical metadata'], data.repo);
  }
  const head = run('git', ['rev-parse', 'HEAD'], data.repo);
  return { ...data, tested, head, prHead: head, prBody: body(tested, head), posted: comment(tested, head) };
}
test.afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

test('draft can host missing capture but can never authorize ready publication', () => {
  const data = fixture();
  const head = run('git', ['rev-parse', 'HEAD'], data.repo);
  const draft = proofCommand({ ...data, prHead: head, draft: true, extra: ['--draft-host-capture'] });
  assert.deepEqual({ status: draft.status, allowed: draft.allowed, ready: draft.ready }, { status: 'incomplete', allowed: true, ready: false });
  assert.equal(proofCommand({ ...data, prHead: head, extra: ['--draft-host-capture'] }).allowed, false);
});

test('hosted body and comment, not task-local evidence, authorize current review', () => {
  const data = completed();
  assert.equal(fs.existsSync(path.join(data.taskDir, 'evidence')), false);
  const passed = proofCommand(data);
  assert.deepEqual({ status: passed.status, ready: passed.ready, tested: passed.tested }, { status: 'pass', ready: true, tested: data.tested });
  assert.equal(passed.descriptionCurrent, true);
  assert.equal(proofCommand({ ...data, posted: comment(data.tested, data.head, captureUrl, 'not passed') }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, captureUrl, 'not passed') }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, posted: { ...data.posted, id: 999 } }).status, 'incomplete');
});

test('missing capture, wrong head, retargeted base and unreadable redirect fail closed', () => {
  const data = completed();
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, '') }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, posted: comment(data.tested, data.tested) }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, baseBranch: 'release' }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, baseHead: data.head }).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => Response.redirect("https://127.0.0.1/capture.mp4", 302);\n');
  assert.equal(proofCommand(data).status, 'incomplete');
});

test('direct raw gist text and image/video content are accepted, but HTML or empty captures are not', () => {
  const data = completed();
  const gist = 'https://gist.githubusercontent.com/owner/abcdef/raw/123456/proof.txt';
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("recorded proof", { headers: { "content-type": "text/plain; charset=utf-8" } });\n');
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gist), posted: comment(data.tested, data.head, gist) }).status, 'pass');
  const gitlab = 'https://gitlab.com/owner/repo/uploads/abcdef1234/proof.mp4';
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("video bytes", { headers: { "content-type": "video/mp4" } });\n');
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gitlab), posted: comment(data.tested, data.head, gitlab) }).status, 'pass');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("recorded proof", { headers: { "content-type": "text/plain; charset=utf-8" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("", { headers: { "content-type": "video/mp4" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("image bytes", { headers: { "content-type": "image/png" } });\n');
  assert.equal(proofCommand(data).status, 'pass');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response(Uint8Array.of(0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109), { headers: { "content-type": "application/octet-stream" } });\n');
  assert.equal(proofCommand(data).status, 'pass');
});

test('untrusted capture destinations and redirects to local or HTTP addresses are never fetched', () => {
  const data = completed();
  const fetches = path.join(data.root, 'fetches.log');
  const stub = (script) => fs.writeFileSync(data.fetchStub, `import fs from 'node:fs';\n` +
    `globalThis.fetch = async (url) => { fs.appendFileSync(${JSON.stringify(fetches)}, url + "\\n"); ${script} };\n`);
  stub('return new Response("video bytes", { headers: { "content-type": "video/mp4" } });');
  for (const url of ['https://127.0.0.1/proof.mp4', 'https://192.168.1.20/proof.mp4', 'https://internal.example.test/proof.mp4']) {
    assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, url), posted: comment(data.tested, data.head, url) }).status, 'incomplete');
  }
  assert.equal(fs.existsSync(fetches), false);
  for (const destination of ['https://127.0.0.1/proof.mp4', 'https://192.168.1.20/proof.mp4', 'http://github.com/user-attachments/assets/1234']) {
    stub(`return Response.redirect(${JSON.stringify(destination)}, 302);`);
    assert.equal(proofCommand(data).status, 'incomplete');
  }
  assert.equal(fs.readFileSync(fetches, 'utf8'), `${captureUrl}\n`.repeat(3));
  const githubMedia = 'https://private-user-images.githubusercontent.com/123456/proof.mp4';
  stub(`return String(url) === ${JSON.stringify(captureUrl)} ? Response.redirect(${JSON.stringify(githubMedia)}, 302) : new Response("video bytes", { headers: { "content-type": "video/mp4" } });`);
  assert.equal(proofCommand(data).status, 'pass');
  assert.equal(fs.readFileSync(fetches, 'utf8').endsWith(`${captureUrl}\n${githubMedia}\n`), true);
});

test('comment capture must equal the PR capture field, not merely appear elsewhere in comment', () => {
  const data = completed();
  const posted = comment(data.tested, data.head, 'https://gist.githubusercontent.com/owner/abcdef/raw/other.txt');
  posted.body += `\nOther reference: ${captureUrl}`;
  assert.equal(proofCommand({ ...data, posted }).status, 'incomplete');
});

test('source changes after the tested commit are stale even after a revert', () => {
  const data = completed();
  fs.writeFileSync(path.join(data.repo, 'source.txt'), 'changed\n');
  run('git', ['add', 'source.txt'], data.repo);
  run('git', ['commit', '-qm', 'fix: change source'], data.repo);
  fs.writeFileSync(path.join(data.repo, 'source.txt'), 'original\n');
  run('git', ['add', 'source.txt'], data.repo);
  run('git', ['commit', '-qm', 'fix: restore source'], data.repo);
  const movedHead = run('git', ['rev-parse', 'HEAD'], data.repo);
  const stale = proofCommand({ ...data, prHead: movedHead, prBody: body(data.tested, movedHead), posted: comment(data.tested, movedHead) });
  assert.equal(stale.status, 'stale');
});

test('latest legacy review overrides older clean review; current legacy head can pass', () => {
  const data = completed({ legacy: true });
  assert.equal(proofCommand(data).status, 'pass');
  addArtifact(data.taskDir, 'code-review', '---\ntype: code-review\nstatus: findings\nsummary: New required finding\n---\n\n## Critical and Required Findings\n\n### CR-001: Missing proof\n');
  assert.equal(proofCommand(data).status, 'incomplete');
});

test('review remains current across historical indexed metadata-only revision movement', () => {
  const data = completed({ reviewLater: true });
  assert.equal(proofCommand(data).status, 'pass');
});

test('unavailable GitHub readback never declares current proof', () => {
  const data = fixture();
  fs.writeFileSync(path.join(data.bin, 'gh'), '#!/bin/sh\nexit 2\n');
  const script = new URL('../shared/publication-proof.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [script, data.taskDir, data.repo, '7'], {
    cwd: data.repo, encoding: 'utf8', env: { ...process.env, PATH: `${data.bin}:${process.env.PATH}` },
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ready, false);
});
