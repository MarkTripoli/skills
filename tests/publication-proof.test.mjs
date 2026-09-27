import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ARTIFACT_SERIES, initTaskArtifacts, recordArtifact, reserveArtifactIteration } from '../shared/task-artifacts.mjs';

const dirs = [];
// Small, real one-frame MPEG-4 and Matroska captures; decoder shims recognize their
// exact bytes so this suite runs without locally installed ffmpeg/ffprobe.
const mp4 = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc282aXNvMm1wNDEAAAMtbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAAAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAi90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAHLbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABdm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATZzdGJsAAAA6nN0c2QAAAAAAAAAAQAAANptcDR2AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABE0xhdmM2Mi4yOC4xMDIgbXBlZzQAAAAAAAAAAAAAAAAAGP//AAAAYGVzZHMAAAAAA4CAgE8AAQAEgICAQSARAAAAAAMNQAADDUAFgICALwAAAbABAAABtYkTAAABAAAAASAAxI2IAA0AhAIUYwAAAbJMYXZjNjIuMjguMTAyBoCAgAECAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAADDUAAAw1AAAAAEHN0dHMAAAAAAAAAAAAAABBzdHNjAAAAAAAAAAAAAAAUc3RzegAAAAAAAAAAAAAAAAAAABBzdGNvAAAAAAAAAAAAAAAobXZleAAAACB0cmV4AAAAAAAAAAEAAAABAAAAAAAAAAAAAAAAAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2Mi4xMi4xMDIAAABwbW9vZgAAABBtZmhkAAAAAAAAAAEAAABYdHJhZgAAACR0ZmhkAAAAOQAAAAEAAAAAAAADTQAAQAAAAAAUAQEAAAAAABR0ZmR0AQAAAAAAAAAAAAAAAAAAGHRydW4AAAAFAAAAAQAAAHgCAAAAAAAAHG1kYXQAAAGzABAHAAABthYFGCobYHgFrwAAAENtZnJhAAAAK3RmcmEBAAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAADTQEBAQAAABBtZnJvAAAAAAAAAEM=', 'base64');
const mkv = Buffer.from('GkXfo6NChoEBQveBAULygQRC84EIQoKIbWF0cm9za2FCh4EEQoWBAhhTgGcB/////////xFNm3Sxv4Sh5vHkTbuLU6uEFUmpZlOsgaFNu4tTq4QWVK5rU6yB5k27jFOrhBJUw2dTrIIBduwBAAAAAAAAYgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFUmpZsC/hGG5Gnwq17GDD0JATYCNTGF2ZjYyLjEyLjEwMldBjUxhdmY2Mi4xMi4xMDJzpJDGhn2Yp3/aSWWrZBzMqZjoFlSua0CKv4Rr0tPVrgEAAAAAAAB714EBc8WI1FycTJ87EZGcgQAitZyDdW5kiIEAho9WX01QRUc0L0lTTy9BU1CDgQEj44OEO5rKAOCQsIEQuoEQmoECVbCEVbmBAWOirwAAAbABAAABtYkTAAABAAAAASAAxI2IAA0AhAIUYwAAAbJMYXZjNjIuMjguMTAyElTDZ92/hILNX0pzc6BjwIBnyJpFo4dFTkNPREVSRIeNTGF2ZjYyLjEyLjEwMnNzsWPAi2PFiNRcnEyfOxGRZ8igRaOHRU5DT0RFUkSHk0xhdmM2Mi4yOC4xMDIgbXBlZzQfQ7Z1o7+E54K9E+eBAKOYgQAAgAAAAbMAEAcAAAG2FgUYKhtgeAWv', 'base64');
const videoResponse = `new Response(Buffer.from("${mp4.toString('base64')}", "base64"), { headers: { "content-type": "video/mp4" } })`;
const mkvResponse = `new Response(Buffer.from("${mkv.toString('base64')}", "base64"), { headers: { "content-type": "video/x-matroska" } })`;
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
  const digests = [mp4, mkv].map(bytes => createHash('sha256').update(bytes).digest('hex'));
  const decoder = `#!${process.execPath}
const fs = require('node:fs');
const crypto = require('node:crypto');
const file = process.argv[1].endsWith('ffprobe') ? process.argv.at(-1) : process.argv[process.argv.indexOf('-i') + 1];
if (process.env.DECODER_DISABLED || !file || !${JSON.stringify(digests)}.includes(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'))) process.exit(2);
if (process.env.MEDIA_LOG) fs.appendFileSync(process.env.MEDIA_LOG, file + '\\n');
if (process.argv[1].endsWith('ffprobe')) process.stdout.write('{"streams":[{"width":16,"height":16}]}\\n');
else process.stdout.write(process.env.FRAME_MISSING ? '# framecrc\\n' : '# framecrc\\n0, 0, 0, 1, 384, 0x01234567\\n');
`;
  for (const name of ['ffprobe', 'ffmpeg']) {
    fs.writeFileSync(path.join(bin, name), decoder, { mode: 0o755 });
  }
  const fetchStub = path.join(root, 'fetch-stub.mjs');
  fs.writeFileSync(fetchStub, `globalThis.fetch = async () => ${videoResponse};\n`);
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
const fields = (tested, head, capture, result, recording) => `- result: ${result}\n- tested: ${tested}\n- current head: ${head}\n- recording: ${recording}\n- capture: ${capture}`;
const table = `| Test | Result | Capture | Cue |
|---|---|---|---|
| Browser playback and assertion | passed | primary | 00:12 asserted player state |`;
const body = (tested, head, capture = captureUrl, result = 'passed', recording = 'ui-video') => `## Purpose\n\nPublish the feature for reviewers.\n\n## Special things to note\n\n- No unusual migration.\n\n## Evidence\n\n${fields(tested, head, capture, result, recording)}\n- comment: ${commentUrl}\n\n### Recorded tests\n\n${recording === 'ui-video' ? table : table.replace('Browser playback and assertion | passed | primary | 00:12 asserted player state', 'Focused command returned expected output | passed | primary | output line 4: expected identifier')}\n\n## Change outline\n\n- Source is unchanged.\n\n## Human Review\n\n### Review targets\n\n- Check the observable behavior.\n\n### Verify\n\n- [ ] Confirm hosted capture and review.\n\n### Known limits\n\n- None.\n`;
const comment = (tested, head, capture = captureUrl, result = 'passed', recording = 'ui-video') => ({ id: 123, html_url: commentUrl, body: fields(tested, head, capture, result, recording) });
function proofCommand({ repo, taskDir, bin, fetchStub, extra = [], prHead, tested, baseHead = tested ?? prHead, baseBranch = 'main', draft = false, prBody = '', posted = null, decoderDisabled = false, frameMissing = false, mediaLog = '' }) {
  const script = new URL('../shared/publication-proof.mjs', import.meta.url).pathname;
  return JSON.parse(run(process.execPath, ['--import', fetchStub, script, taskDir, repo, '7', ...extra], repo, {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GH_PR_JSON: JSON.stringify({ url: 'https://github.com/owner/repo/pull/7', number: 7, headRefOid: prHead, baseRefName: baseBranch, baseRefOid: baseHead, isDraft: draft, body: prBody }),
    GH_COMMENT_JSON: JSON.stringify(posted),
    GH_TESTED_SHA: tested ?? prHead,
    DECODER_DISABLED: decoderDisabled ? '1' : '',
    FRAME_MISSING: frameMissing ? '1' : '',
    MEDIA_LOG: mediaLog,
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

test('direct raw gist transcript and actual video bytes are accepted, but screenshot, HTML and fake MIME are not', () => {
  const data = completed();
  const gist = 'https://gist.githubusercontent.com/Triippz/d7993fe7e63742009d84ecfa109cc145/raw/2036b0f05b4cd2026030770b592411b888a0d313/public-proof-d0297ce.txt';
  const transcript = `Repository: /tmp/checkout\nSource SHA: ${data.tested}\nFocused command: node --test tests/api.test.mjs\nExit status: 0\nFull npm test: 412 Node pass.\n\nSTDOUT\nPreparing worktree (new branch 'api')\n✔ observed API result\n\nSTDERR\n`;
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(transcript)}, { headers: { "content-type": "text/plain; charset=utf-8" } });\n`);
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gist, 'passed', 'cli-terminal'), posted: comment(data.tested, data.head, gist, 'passed', 'cli-terminal') }).status, 'pass');
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, captureUrl, 'passed', 'cli-terminal'), posted: comment(data.tested, data.head, captureUrl, 'passed', 'cli-terminal') }).status, 'pass');
  const gitlab = 'https://gitlab.com/owner/repo/uploads/abcdef1234/proof.mp4';
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => ${videoResponse};\n`);
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gitlab), posted: comment(data.tested, data.head, gitlab) }).status, 'pass');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response(Uint8Array.of(0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0), { headers: { "content-type": "video/mp4" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete', 'an MP4 type header alone is not a recording');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("video bytes", { headers: { "content-type": "video/mp4" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("", { headers: { "content-type": "video/mp4" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response(Uint8Array.of(137,80,78,71,13,10,26,10), { headers: { "content-type": "image/png" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => ${videoResponse.replace('video/mp4', 'application/octet-stream')};\n`);
  assert.equal(proofCommand(data).status, 'pass');
});

test('unlabeled and explicitly primary fields cannot collide and skip the UI capture', () => {
  const data = completed();
  const gist = 'https://gist.githubusercontent.com/owner/abcdef/raw/123456/proof.txt';
  const transcript = `Source SHA: ${data.tested}\nFocused command: node --test tests/api.test.mjs\nSTDOUT:\nexpected identifier\nExit status: 0\n`;
  const explicit = (value) => value.replace('- recording:', '- recording primary:').replace('- capture:', '- capture primary:');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => ${videoResponse};\n`);
  assert.equal(proofCommand({ ...data, prBody: explicit(data.prBody), posted: { ...data.posted, body: explicit(data.posted.body) } }).status, 'pass');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async (url) => String(url).includes('/raw/') ?
    new Response(${JSON.stringify(transcript)}, { headers: { 'content-type': 'text/plain' } }) :
    new Response('unrecorded UI', { headers: { 'content-type': 'video/mp4' } });\n`);
  const collision = `\n- recording primary: cli-terminal\n- capture primary: ${gist}`;
  const prBody = data.prBody.replace(`- capture: ${captureUrl}`, `- capture: ${captureUrl}${collision}`);
  const posted = { ...data.posted, body: data.posted.body + collision };
  assert.equal(proofCommand({ ...data, prBody, posted }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody, posted: data.posted }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, posted }).status, 'incomplete');
  for (const extra of [`- recording primary: ui-video`, `- capture primary: ${captureUrl}`]) {
    assert.equal(proofCommand({ ...data, prBody: `${data.prBody}\n${extra}` }).status, 'incomplete', extra);
  }
});

test('authentic short API responses and multiline terminal stdout count as observed output', () => {
  const data = completed();
  const gist = 'https://gist.githubusercontent.com/owner/abcdef/raw/123456/proof.txt';
  for (const response of ['OK', '[]', 'true']) {
    const transcript = `Source SHA: ${data.tested}\nRequest: GET /api/items\nStatus: 200\nResponse body: ${response}\n`;
    fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(transcript)}, { headers: { 'content-type': 'text/plain' } });\n`);
    assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gist, 'passed', 'api-probe'), posted: comment(data.tested, data.head, gist, 'passed', 'api-probe') }).status, 'pass', response);
  }
  for (const stdout of ['STDOUT:\nexpected API identifier\nmore details', 'STDOUT\nexpected API identifier']) {
    const transcript = `Source SHA: ${data.tested}\nFocused command: node --test tests/api.test.mjs\n${stdout}\nExit status: 0\n`;
    fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(transcript)}, { headers: { 'content-type': 'text/plain' } });\n`);
    assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gist, 'passed', 'cli-terminal'), posted: comment(data.tested, data.head, gist, 'passed', 'cli-terminal') }).status, 'pass');
  }
  const missingOutput = `Source SHA: ${data.tested}\nFocused command: node --test tests/api.test.mjs\nSTDOUT:\nExit status: 0\n`;
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(missingOutput)}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gist, 'passed', 'cli-terminal'), posted: comment(data.tested, data.head, gist, 'passed', 'cli-terminal') }).status, 'incomplete');
});

test('complete transcripts beyond 64 KiB require their final successful exit and fit the documented cap', () => {
  const data = completed();
  const gist = 'https://gist.githubusercontent.com/owner/abcdef/raw/123456/proof.txt';
  const cli = { ...data, prBody: body(data.tested, data.head, gist, 'passed', 'cli-terminal'), posted: comment(data.tested, data.head, gist, 'passed', 'cli-terminal') };
  const prefix = `Source SHA: ${data.tested}\nFocused command: node --test tests/api.test.mjs\nSTDOUT:\nobserved result\n`;
  const transcript = `${prefix}${'worktree event\n'.repeat(6000)}Exit status: 0\n`;
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(transcript)}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'pass');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(`Exit status: 0\n${prefix}${'worktree event\n'.repeat(6000)}Exit status: 1\n`)}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete', 'an earlier success cannot hide a final failed exit');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(transcript.slice(0, 65536))}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete');
  const script = `Source SHA: ${data.tested}\nScript started on 2026-09-27 [COMMAND="node --test tests/api.test.mjs"]\nobserved result\n${'line of output\n'.repeat(6000)}Script done on 2026-09-27 [COMMAND_EXIT_CODE="0"]\n`;
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(script)}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'pass');
  const interactive = `Source SHA: ${data.tested}\nScript started on 2026-09-27\n$ node --test tests/api.test.mjs\n\nobserved result\n$ printf 'exit=%s\\n' "$?"\nexit=0\n$ exit\nScript done on 2026-09-27 [COMMAND_EXIT_CODE="0"]\n`;
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(interactive)}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'pass', 'interactive script requires immediate tested-command status');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(interactive.replace(/\$ printf[^\n]*\nexit=0\n/, ''))}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete', 'shell exit zero cannot replace command status');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(interactive.replace('exit=0', 'exit=1'))}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete', 'failed command cannot be hidden by successful shell exit');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(interactive.replace('observed result\n', ''))}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete', 'prompt and status alone are not observed command output');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(interactive.replace('observed result\n', "observed result\n$ printf 'unrelated\\n'\nunrelated\n"))}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete', 'intervening shell command invalidates tested-command exit binding');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(script.replace('observed result\n', '').replaceAll('line of output\n', ''))}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete', 'a script trailer without observed output is not proof');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(script.replace('COMMAND_EXIT_CODE="0"', 'COMMAND_EXIT_CODE="1"'))}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(${JSON.stringify(prefix)})); for (let i = 0; i < 129; i++) controller.enqueue(new Uint8Array(65536).fill(32)); controller.enqueue(new TextEncoder().encode('Exit status: 0\\n')); controller.close(); }
  }), { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete', 'streamed output over 8 MiB must fail rather than use its prefix');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(transcript)}, { status: 206, headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand(cli).status, 'incomplete', 'partial HTTP response cannot establish complete proof');
});

test('only fully retrieved and decodable video frames count, including Matroska', () => {
  const data = completed();
  const mediaLog = path.join(data.root, 'decoder-inputs.log');
  assert.equal(proofCommand({ ...data, mediaLog }).status, 'pass');
  const paths = fs.readFileSync(mediaLog, 'utf8').trim().split('\n');
  assert.equal(paths.length, 2, 'both video stream and actual frame were checked');
  for (const file of paths) {
    assert.equal(file.startsWith(`${path.dirname(data.taskDir)}${path.sep}`), false, 'temporary media stays outside the task root');
    assert.equal(fs.existsSync(file), false, 'temporary media is removed after inspection');
  }
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) { const bytes = Buffer.from("${mp4.toString('base64')}", "base64"); controller.enqueue(bytes.subarray(0, 128)); controller.enqueue(bytes.subarray(128)); controller.close(); }
  }), { headers: { 'content-type': 'video/mp4' } });\n`);
  assert.equal(proofCommand(data).status, 'pass', 'all chunks must reach the decoder');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => ${mkvResponse};\n`);
  assert.equal(proofCommand(data).status, 'pass');
  assert.equal(proofCommand({ ...data, decoderDisabled: true }).status, 'incomplete', 'unavailable video decoder fails closed');
  assert.equal(proofCommand({ ...data, frameMissing: true }).status, 'incomplete', 'metadata without a decoded frame cannot count');
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response(Buffer.concat([Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0,0,0,8,8,109,100,97,116]), Buffer.alloc(2048)]), { headers: { "content-type": "video/mp4" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete', 'ftyp + mdat + zeros is not a frame');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(Buffer.from("${mp4.subarray(0, 600).toString('base64')}", "base64"), { headers: { "content-type": "video/mp4" } });\n`);
  assert.equal(proofCommand(data).status, 'incomplete', 'truncated media is not complete');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(Buffer.from("${mp4.toString('base64')}", "base64"), { headers: { 'content-type': 'video/mp4', 'content-length': '134217729' } });\n`);
  assert.equal(proofCommand(data).status, 'incomplete', 'oversize advertised videos cannot be ingested');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(Buffer.from("${mp4.toString('base64')}", "base64"), { status: 206, headers: { 'content-type': 'video/mp4' } });\n`);
  assert.equal(proofCommand(data).status, 'incomplete', 'a video range is not a full hosted object');
  const gist = 'https://gist.githubusercontent.com/owner/abcdef/raw/123456/proof.txt';
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(`Source SHA: ${data.tested}\nFocused command: node --test tests/api.test.mjs\nSTDOUT: OK\nExit status: 0\n`)}, { headers: { 'content-type': 'text/plain' } });\n`);
  assert.equal(proofCommand({ ...data, decoderDisabled: true, prBody: body(data.tested, data.head, gist, 'passed', 'cli-terminal'), posted: comment(data.tested, data.head, gist, 'passed', 'cli-terminal') }).status, 'pass', 'text proof needs no video tools');
});

test('claimed proof without an actual recording cannot ready the PR', () => {
  const data = completed();
  const gist = 'https://gist.githubusercontent.com/owner/abcdef/raw/123456/proof.txt';
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("recorded proof", { headers: { "content-type": "text/plain" } });\n');
  assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gist, 'passed', 'cli-terminal'), posted: comment(data.tested, data.head, gist, 'passed', 'cli-terminal') }).status, 'incomplete');
  for (const claim of [
    `Source SHA: ${data.tested}\nFocused command: node --test tests/api.test.mjs\nExit status: 0\n`,
    `Source SHA: ${data.tested}\nFocused command: node --test tests/api.test.mjs\nSTDOUT: expected API identifier\n`,
    `Source SHA: ${data.tested}\nFocused command: passed\nExit status: 0\nSTDOUT: expected API identifier\n`,
  ]) {
    fs.writeFileSync(data.fetchStub, `globalThis.fetch = async () => new Response(${JSON.stringify(claim)}, { headers: { "content-type": "text/plain" } });\n`);
    assert.equal(proofCommand({ ...data, prBody: body(data.tested, data.head, gist, 'passed', 'cli-terminal'), posted: comment(data.tested, data.head, gist, 'passed', 'cli-terminal') }).status, 'incomplete');
  }
  fs.writeFileSync(data.fetchStub, 'globalThis.fetch = async () => new Response("video bytes", { headers: { "content-type": "video/mp4" } });\n');
  assert.equal(proofCommand(data).status, 'incomplete');
});

test('untrusted capture destinations and redirects to local or HTTP addresses are never fetched', () => {
  const data = completed();
  const fetches = path.join(data.root, 'fetches.log');
  const stub = (script) => fs.writeFileSync(data.fetchStub, `import fs from 'node:fs';\n` +
    `globalThis.fetch = async (url) => { fs.appendFileSync(${JSON.stringify(fetches)}, url + "\\n"); ${script} };\n`);
  stub(`return ${videoResponse};`);
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
  stub(`return String(url) === ${JSON.stringify(captureUrl)} ? Response.redirect(${JSON.stringify(githubMedia)}, 302) : ${videoResponse};`);
  assert.equal(proofCommand(data).status, 'pass');
  assert.equal(fs.readFileSync(fetches, 'utf8').endsWith(`${captureUrl}\n${githubMedia}\n`), true);
});

test('comment capture must equal the PR capture field, not merely appear elsewhere in comment', () => {
  const data = completed();
  const posted = comment(data.tested, data.head, 'https://gist.githubusercontent.com/owner/abcdef/raw/other.txt');
  posted.body += `\nOther reference: ${captureUrl}`;
  assert.equal(proofCommand({ ...data, posted }).status, 'incomplete');
});

test('every labeled capture is inspected and tied to a passed recorded-test row', () => {
  const data = completed();
  const gist = 'https://gist.githubusercontent.com/owner/abcdef/raw/123456/proof.txt';
  const pair = `\n- recording api: api-probe\n- capture api: ${gist}`;
  const row = '\n| API request returns expected data | passed | api | output line 4: expected identifier |';
  const prBody = body(data.tested, data.head)
    .replace(`- capture: ${captureUrl}`, `- capture: ${captureUrl}${pair}`)
    .replace(table, table + row);
  const posted = comment(data.tested, data.head);
  posted.body += pair;
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async (url) => String(url).includes('/raw/') ?
    new Response('Source SHA: ${data.tested}\\nRequest: GET /api/items\\nStatus: 200\\nResponse body: expected identifier', { headers: { 'content-type': 'text/plain' } }) :
    ${videoResponse};\n`);
  assert.equal(proofCommand({ ...data, prBody, posted }).status, 'pass');
  assert.equal(proofCommand({ ...data, prBody: prBody.replace(row, '') , posted }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody: prBody.replace('passed | api', 'untested | api'), posted }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody: prBody.replace('output line 4: expected identifier', 'looks good'), posted }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody, posted: { ...posted, body: posted.body.replace('api-probe', 'cli-terminal') } }).status, 'incomplete');
  fs.writeFileSync(data.fetchStub, `globalThis.fetch = async (url) => String(url).includes("/raw/") ? new Response("Source SHA: fake\\nRequest: GET /api/items\\nStatus: 200\\nResponse body: expected identifier", { headers: { "content-type": "text/plain" } }) : ${videoResponse};\n`);
  assert.equal(proofCommand({ ...data, prBody, posted }).status, 'incomplete');
});

test('a complete hosted description is required before ready, not merely Evidence fields', () => {
  const data = completed();
  const evidenceOnly = `## Evidence\n\n${fields(data.tested, data.head, captureUrl, 'passed', 'ui-video')}\n- comment: ${commentUrl}\n\n### Recorded tests\n\n${table}\n`;
  const incomplete = proofCommand({ ...data, prBody: evidenceOnly });
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.descriptionCurrent, false);
  for (const sectionName of ['Purpose', 'Special things to note', 'Change outline', 'Human Review']) {
    const cut = data.prBody.replace(new RegExp(`## ${sectionName}\\n[\\s\\S]*?(?=## |$)`), '');
    assert.equal(proofCommand({ ...data, prBody: cut }).status, 'incomplete', sectionName);
  }
  assert.equal(proofCommand({ ...data, prBody: data.prBody.replace('- No unusual migration.', '- {DETAILS}') }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody: data.prBody.replace(table, table.replace('passed', 'failed')) }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody: data.prBody.replace('- recording: ui-video', '- recording: image-screenshot') }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody: data.prBody.replace('- capture:', '- capture invalid:') }).status, 'incomplete');
  assert.equal(proofCommand({ ...data, prBody: data.prBody.replace(`- comment: ${commentUrl}`, '- comment: https://github.com/owner/other/pull/7#issuecomment-123') }).status, 'incomplete');
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
