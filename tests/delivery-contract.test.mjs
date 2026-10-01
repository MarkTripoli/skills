import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initTaskArtifacts, reserveArtifactIteration, recordArtifact, readArtifactIndex, semanticSeries } from '../shared/task-artifacts.mjs';
import { sourceRevision, readDeliveryArtifacts, parseRecord, checkReview, deliveryStatus, saveEvidencePolicy, sealEvidence, sealInspection, beginRepair, completeRepair } from '../skills/delivery/deliver/contract.mjs';

function fixture(t, indexed = true) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-contract-')));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Contract Test'); git('config', 'user.email', 'contract@example.invalid');
  fs.writeFileSync(path.join(repo, 'cli.mjs'), 'console.log("old value");\n'); git('add', 'cli.mjs'); git('commit', '-m', 'initial');
  const base = git('rev-parse', 'HEAD'); git('checkout', '-b', 'work');
  const taskDir = path.join(repo, 'delivery', 'tasks', 'change'); fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'task.md'), '---\nslug: change\nworkflow: oneshot\nbase: main\n---\nChange the output.\n');
  if (indexed) initTaskArtifacts(taskDir);
  let serial = 0;
  const artifact = (type, status, body, extra = '') => {
    const text = `---\ntype: ${type}\nsummary: Observed ${type}\n${status ? `status: ${status}\n` : ''}revision: ${sourceRevision(taskDir)}\n${extra}---\n${body}\n`;
    if (!indexed) { const name = `${String(++serial).padStart(2, '0')}-${type}-change.md`; fs.writeFileSync(path.join(taskDir, name), text); return name; }
    const { kind, variant } = semanticSeries(type); const reservation = reserveArtifactIteration(taskDir, kind, variant);
    fs.writeFileSync(path.join(taskDir, reservation.writePath), text);
    return recordArtifact(taskDir, kind, variant, type, reservation.writePath).path;
  };
  const review = ({ type = 'slice-review', status = 'changes', checkpoint = 'phase-1', round = 1, findings = '### F1 blocking Wrong output\n\n- Evidence: cli.mjs:1 reports old value.', exit = 0, commit = git('rev-parse', 'HEAD'), extra = '' } = {}) => artifact(type, status,
    `## Checks\n\n| Command | Exit | Result |\n|---|---|---|\n| node cli.mjs | ${exit} | observed |\n\n## Findings\n\n${findings}`,
    `checkpoint: ${checkpoint}\nreviewed_commit: ${commit}\nreviewer_model: unobserved: requested-strong\nround: ${round}\n${extra}`);
  const scratch = path.join(repo, 'captures'); fs.mkdirSync(scratch);
  const attachment = path.join(scratch, 'report.txt'); fs.writeFileSync(attachment, 'Actual terminal invocation was inspected.\n');
  const policy = { surfaces: [{ id: 'cli', kind: 'cli', behavior: 'existing', target: 'node cli.mjs', expectation: 'new value' }] };
  const capture = label => {
    const output = execFileSync(process.execPath, ['cli.mjs'], { cwd: repo, encoding: 'utf8' });
    const file = path.join(scratch, `${label}.txt`);
    fs.writeFileSync(file, `Tested SHA: ${git('rev-parse', 'HEAD')}\nCommand: node cli.mjs\nNode stdout:\n${output}Exit status: 0\n`);
    return file;
  };
  const baseline = async () => {
    saveEvidencePolicy({ taskDir, policy });
    const file = artifact('evidence-baseline', 'passed', '# Baseline\n\nObserved old value.');
    return sealEvidence({ taskDir, artifactFile: file, record: { baseline_commit: base, build_identity: 'node cli.mjs at base', attachments: [attachment], results: [{ surface: 'cli', status: 'passed', observed: 'old value' }], captures: [{ surface: 'cli', role: 'output', path: capture('baseline'), inspection: { observed: 'old value in original stdout' } }] } });
  };
  const build = () => { fs.writeFileSync(path.join(repo, 'cli.mjs'), 'console.log("new value");\n'); git('commit', '-am', 'implementation'); };
  return { repo, taskDir, git, base, scratch, attachment, policy, artifact, review, capture, baseline, build };
}
const reviewCheck = (f, file) => checkReview({ taskDir: f.taskDir, file });

// Capture-host access is isolated; the seal still consumes and checks the complete byte stream.
function hosted(t, bytes, { status = 200, redirect = null } = {}) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(bytes(), { status, headers: redirect ? { location: redirect } : { 'content-type': 'text/plain' } });
  t.after(() => { globalThis.fetch = previous; });
  return 'https://gist.githubusercontent.com/operator/012345abcdef/raw/capture.txt';
}
async function currentEvidence(t, f, options = {}) {
  const output = f.capture('current');
  const url = hosted(t, () => fs.readFileSync(output));
  const file = f.artifact('evidence', 'passed', '# Current recording\n\nObserved new value.');
  const record = { revision: sourceRevision(f.taskDir), build_identity: 'committed node cli.mjs', attachments: [f.attachment], results: [{ surface: 'cli', status: 'passed', observed: 'new value in stdout' }], captures: [{ surface: 'cli', role: 'output', path: output, inspection: { observed: 'new value on stdout line 4' } }], hosted: [{ url, capture: output }], ...options };
  return { file, output, record, seal: await sealEvidence({ taskDir: f.taskDir, artifactFile: file, record }) };
}

test('indexed current records ignore stray numbered files and fail closed on changed indexed bytes', t => {
  const f = fixture(t); const file = f.review({ status: 'approve', findings: '' });
  fs.writeFileSync(path.join(f.taskDir, '99-slice-review-fake.md'), 'not a registered artifact');
  assert.equal(readDeliveryArtifacts(f.taskDir).latest['slice-review'].file, path.join(f.taskDir, file));
  fs.appendFileSync(path.join(f.taskDir, file), 'tampered\n');
  assert.throws(() => readDeliveryArtifacts(f.taskDir), /SHA-256/);
  const status = deliveryStatus({ taskDir: f.taskDir });
  assert.deepEqual(status.artifacts, {}); assert.match(status.problems.join('\n'), /SHA-256/);
});

test('a malformed present index cannot fall back to valid legacy proof', t => {
  const f = fixture(t, false); f.review({ status: 'approve', findings: '' });
  fs.writeFileSync(path.join(f.taskDir, 'index.json'), '{ malformed');
  assert.throws(() => readDeliveryArtifacts(f.taskDir), /invalid JSON/);
});

test('only genuinely absent indexes permit legacy review discovery', t => {
  const f = fixture(t, false); const file = f.review({ status: 'approve', findings: '' });
  assert.equal(reviewCheck(f, file).status, 'approve');
  initTaskArtifacts(f.taskDir);
  assert.throws(() => reviewCheck(f, file), /current indexed/);
});

test('review approval contradicting blocking findings or failed check exits is rejected', t => {
  const f = fixture(t);
  assert.throws(() => reviewCheck(f, f.review({ status: 'approve' })), /contradicts 1 blocking/);
  assert.throws(() => reviewCheck(f, f.review({ status: 'approve', findings: '', exit: 1 })), /failed check exit/);
  assert.throws(() => reviewCheck(f, f.review({ findings: '### F1 blocking Wrong output\n\nNo evidence.' })), /cites no evidence/);
});

test('review records are head and source bound across configured task roots', t => {
  const f = fixture(t); const file = f.review({ status: 'approve', findings: '' });
  fs.appendFileSync(path.join(f.taskDir, 'task.md'), '\n## Decisions\n\nLocal decision.\n');
  assert.equal(reviewCheck(f, file).status, 'approve');
  fs.writeFileSync(path.join(f.repo, 'cli.mjs'), 'console.log("changed after review");\n');
  assert.throws(() => reviewCheck(f, file), /tracked files changed/);
  f.git('commit', '-am', 'changed after review');
  assert.throws(() => reviewCheck(f, file), /not HEAD/);
});

test('history parsing keeps earlier immutable rounds but current review checking rejects them', t => {
  const f = fixture(t); const first = f.review();
  const second = f.review({ round: 2, status: 'approve', findings: '' });
  assert.equal(parseRecord(f.taskDir, first).round, 1);
  assert.throws(() => reviewCheck(f, first), /current indexed/);
  assert.equal(reviewCheck(f, second).progress, true);
});

test('review rounds stop on unchanged blockers, respect checkpoint isolation and reach the bounded limit', t => {
  const f = fixture(t);
  f.review({ findings: '### F1 blocking One\n\n- Evidence: cli.mjs:1\n\n### F2 blocking Two\n\n- Evidence: cli.mjs:1' });
  assert.equal(reviewCheck(f, f.review({ round: 2 })).progress, true);
  const third = reviewCheck(f, f.review({ round: 3 }));
  assert.equal(third.progress, false); assert.equal(third.limit_reached, true);
  assert.throws(() => reviewCheck(f, f.review({ round: 2, checkpoint: 'phase-2' })), /no earlier valid/);
});

test('plan reviews bind current immutable plan bytes, not only an unchanged Git head', t => {
  const f = fixture(t); const plan = f.artifact('plan', null, '# Plan\n\nChange CLI output.');
  const record = readArtifactIndex(f.taskDir).artifactSeries['planning.plan'].iterations[0];
  const file = f.review({ type: 'plan-review', checkpoint: 'plan', status: 'approve', findings: '', extra: `reviewed_artifact: ${plan}\nreviewed_artifact_sha256: ${record.sha256}\n` });
  assert.equal(reviewCheck(f, file).status, 'approve');
  f.artifact('plan', null, '# Plan\n\nDifferent acceptance criteria.');
  assert.throws(() => reviewCheck(f, file), /not the current indexed artifact/);
});

test('verification cannot advertise passing while a required verdict failed or went untested', t => {
  const f = fixture(t);
  for (const verdict of ['fail', 'untested', 'unreachable']) assert.throws(() => f.artifact('verification', 'passed', `## Items\n\n| Item | Verdict |\n|---|---|\n| output | ${verdict} |`), /contradicts evidence/);
});

test('authentic baseline remains base bound after implementation and cannot be backdated to task commits', async t => {
  const f = fixture(t); await f.baseline(); f.build();
  assert.equal(deliveryStatus({ taskDir: f.taskDir }).evidence.baseline, true);
  const file = f.artifact('evidence-baseline', 'passed', '# Baseline\n\nObserved current output.');
  await assert.rejects(sealEvidence({ taskDir: f.taskDir, artifactFile: file, record: { baseline_commit: f.git('rev-parse', 'HEAD') } }), /not a commit made by this task/);
});

test('scratch captures are external to task roots and sealed bytes cannot be tampered', async t => {
  const f = fixture(t); await f.baseline(); f.build();
  const current = await currentEvidence(t, f);
  assert.equal(current.seal.hosted[0].status, 200);
  fs.appendFileSync(current.output, 'tampering\n');
  assert.equal(deliveryStatus({ taskDir: f.taskDir }).evidence.evidence, false);
  const inside = path.join(f.taskDir, 'capture.txt'); fs.writeFileSync(inside, 'wrong storage');
  await assert.rejects(sealEvidence({ taskDir: f.taskDir, artifactFile: current.file, record: { ...current.record, attachments: [inside] } }), /outside the task root/);
});

test('strict terminal proof rejects preliminary success followed by trailing failure', async t => {
  const f = fixture(t); await f.baseline(); f.build(); const current = await currentEvidence(t, f);
  fs.appendFileSync(current.output, 'Exit status: 1\n');
  await assert.rejects(sealEvidence({ taskDir: f.taskDir, artifactFile: current.file, record: current.record }), /final successful outcome/);
});

test('hosted login pages and foreign redirects cannot become sealed evidence', async t => {
  const f = fixture(t); await f.baseline(); f.build(); const current = await currentEvidence(t, f);
  globalThis.fetch = async () => new Response('<html>login</html>', { status: 200 });
  await assert.rejects(sealEvidence({ taskDir: f.taskDir, artifactFile: current.file, record: current.record }), /bytes differ/);
  globalThis.fetch = async () => new Response('', { status: 302, headers: { location: 'https://foreign.invalid/login' } });
  await assert.rejects(sealEvidence({ taskDir: f.taskDir, artifactFile: current.file, record: current.record }), /outside supported/);
});

test('inspection binds the current evidence and cannot claim pass with findings', async t => {
  const f = fixture(t); await f.baseline(); f.build(); const current = await currentEvidence(t, f);
  const file = f.artifact('evidence-iteration', 'passed', '# Inspection\n\nObserved correct output.');
  const record = { revision: sourceRevision(f.taskDir), evidence_sha256: current.seal.artifact_sha256, status: 'passed', findings: [] };
  assert.throws(() => sealInspection({ taskDir: f.taskDir, artifactFile: file, record: { ...record, findings: [{ id: 'F1', observed: 'wrong', expected: 'right' }] } }), /contradict/);
  assert.equal(sealInspection({ taskDir: f.taskDir, artifactFile: file, record }).status, 'passed');
  assert.equal(deliveryStatus({ taskDir: f.taskDir }).evidence.inspection, true);
});

test('repair reservations persist, are idempotent, and no-op repairs cannot reset the allowance', t => {
  const f = fixture(t); saveEvidencePolicy({ taskDir: f.taskDir, policy: f.policy });
  assert.equal(beginRepair({ taskDir: f.taskDir, attemptId: 'one' }).number, 1);
  assert.equal(beginRepair({ taskDir: f.taskDir, attemptId: 'one' }).number, 1);
  completeRepair({ taskDir: f.taskDir, attemptId: 'one' });
  assert.throws(() => beginRepair({ taskDir: f.taskDir, attemptId: 'two' }), /no source progress/);
  fs.appendFileSync(path.join(f.taskDir, 'task.md'), '\n## Decisions\n\n- Owner: repair-extension +1: approved continuation.\n');
  assert.equal(beginRepair({ taskDir: f.taskDir, attemptId: 'two' }).number, 2);
});

test('an exhausted repair budget is preserved across sessions and policy changes cannot reset it', t => {
  const f = fixture(t); saveEvidencePolicy({ taskDir: f.taskDir, policy: f.policy });
  for (let n = 1; n <= 3; n++) {
    beginRepair({ taskDir: f.taskDir, attemptId: `attempt-${n}` });
    fs.writeFileSync(path.join(f.repo, 'cli.mjs'), `console.log(${n});\n`);
    completeRepair({ taskDir: f.taskDir, attemptId: `attempt-${n}` });
  }
  assert.throws(() => beginRepair({ taskDir: f.taskDir, attemptId: 'four' }), /allowance exhausted/);
  assert.throws(() => saveEvidencePolicy({ taskDir: f.taskDir, policy: { ...f.policy, max_repairs: 9, repair_authorization: 'not a reset' } }), /immutable/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.taskDir, '.delivery-state.json'))).repairs.used, 3);
});

test('repository aliases preserve source identity and committed evidence without weakening artifact containment', async t => {
  const f = fixture(t);
  const alias = `${f.repo}-alias`;
  fs.symlinkSync(f.repo, alias, 'dir');
  t.after(() => fs.unlinkSync(alias));
  const aliasedTask = path.join(alias, 'delivery', 'tasks', 'change');
  assert.equal(sourceRevision(aliasedTask), sourceRevision(f.taskDir));
  fs.appendFileSync(path.join(aliasedTask, 'task.md'), '\n## Decisions\n\nLocal task metadata.\n');
  assert.equal(sourceRevision(aliasedTask), sourceRevision(f.taskDir));
  await f.baseline();
  f.build();
  const current = await currentEvidence(t, { ...f, taskDir: aliasedTask });
  assert.equal(current.seal.build_commit, f.git('rev-parse', 'HEAD'));
  assert.equal(deliveryStatus({ taskDir: aliasedTask }).evidence.evidence, true);

  const inside = path.join(f.taskDir, 'capture.txt');
  fs.writeFileSync(inside, 'inside the physical task root');
  await assert.rejects(sealEvidence({ taskDir: aliasedTask, artifactFile: current.file, record: { ...current.record, attachments: [inside] } }), /outside the task root/);
  const linkedParent = path.join(f.repo, 'linked');
  fs.mkdirSync(linkedParent);
  const linkedTask = path.join(linkedParent, 'change');
  fs.symlinkSync(f.taskDir, linkedTask, 'dir');
  assert.throws(() => readDeliveryArtifacts(linkedTask), /task directory cannot be a symlink/);
});
