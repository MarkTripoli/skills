import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { initTaskArtifacts, reserveArtifactIteration, recordArtifact, readArtifactIndex, semanticSeries, writeArtifactIndex } from '../shared/task-artifacts.mjs';
import { sourceRevision, readDeliveryArtifacts, parseRecord, checkReview, nextReview, reviewRoundLimit, deliveryStatus, saveEvidencePolicy, sealEvidence, sealInspection, beginRepair, completeRepair } from '../skills/delivery/deliver/contract.mjs';

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

test('review rounds stop on unchanged blockers and have no implicit repair cap', t => {
  const f = fixture(t);
  f.review({ findings: '### F1 blocking One\n\n- Evidence: cli.mjs:1\n\n### F2 blocking Two\n\n- Evidence: cli.mjs:1' });
  assert.equal(reviewCheck(f, f.review({ round: 2 })).progress, true);
  const third = reviewCheck(f, f.review({ round: 3 }));
  assert.equal(third.progress, false); assert.equal(third.limit_reached, false); assert.equal(third.round_limit, null);
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

test('invalid immutable reviews do not consume rounds or erase valid blocking history', t => {
  const f = fixture(t);
  const invalidFirst = f.review({ status: 'approve', findings: '', exit: 1 });
  assert.throws(() => reviewCheck(f, invalidFirst), /failed check exit/);
  const first = f.review({ findings: '### F1 blocking One\n\n- Evidence: cli.mjs:1\n\n### F2 blocking Two\n\n- Evidence: cli.mjs:1' });
  assert.equal(reviewCheck(f, first).round, 1);
  const invalidSecond = f.review({ round: 2, status: 'approve', findings: '', exit: 1 });
  assert.throws(() => reviewCheck(f, invalidSecond), /failed check exit/);
  const corrected = reviewCheck(f, f.review({ round: 2 }));
  assert.deepEqual(corrected.previous_blocking, ['F1', 'F2']);
  assert.equal(corrected.progress, true);
  assert.throws(() => parseRecord(f.taskDir, invalidFirst), /failed check exit/);
});

test('a valid duplicate round cannot replace a blocking verdict or reset the review limit', t => {
  const f = fixture(t); f.review();
  assert.throws(() => reviewCheck(f, f.review({ status: 'approve', findings: '' })), /round 1.*expected 2/);
  const recovered = reviewCheck(f, f.review({ round: 2, status: 'approve', findings: '' }));
  assert.deepEqual(recovered.previous_blocking, ['F1']);
  assert.equal(recovered.status, 'approve');
});

test('plan successors preserve prior valid blockers and cannot restart checkpoint rounds', t => {
  const f = fixture(t);
  const planReview = ({ round = 1, status = 'changes', exit = 0 } = {}) => {
    const plan = f.artifact('plan', null, `# Plan\n\nRevision for round ${round}.`);
    const record = readArtifactIndex(f.taskDir).artifactSeries['planning.plan'].iterations.at(-1);
    return f.review({ type: 'plan-review', checkpoint: 'plan', round, status, exit, findings: status === 'approve' ? '' : '### F1 blocking Missing cap\n\n- Evidence: cli.mjs:1', extra: `reviewed_artifact: ${plan}\nreviewed_artifact_sha256: ${record.sha256}\n` });
  };
  assert.equal(reviewCheck(f, planReview()).status, 'changes');
  assert.throws(() => reviewCheck(f, planReview({ round: 2, status: 'approve', exit: 1 })), /failed check exit/);
  assert.throws(() => reviewCheck(f, planReview({ status: 'approve' })), /round 1.*expected 2/);
  const corrected = reviewCheck(f, planReview({ round: 2, status: 'approve' }));
  assert.deepEqual(corrected.previous_blocking, ['F1']);
  assert.equal(corrected.status, 'approve');
});

test('phase CLI records only the approved phase and resumes through successor plan review', t => {
  const f = fixture(t);
  const cli = path.resolve('skills/delivery/deliver/contract.mjs');
  const command = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { cwd: f.repo, encoding: 'utf8' }));
  const plan = f.artifact('plan', null, '# Plan\n\n## Phase 1: First output\n\n### Verify\n\n- [ ] `node cli.mjs` reports new value.\n\n## Phase 2: Next output\n\n#### Automated Verification:\n\n- [ ] Check the next output.\n\n## Progress\n\nNone.');
  const record = readArtifactIndex(f.taskDir).artifactSeries['planning.plan'].iterations[0];
  const binding = `reviewed_artifact: ${plan}\nreviewed_artifact_sha256: ${record.sha256}\n`;
  const rejected = f.review({ status: 'approve', findings: '', exit: 1, extra: binding });
  assert.throws(() => command('phase-complete', f.taskDir, 'phase-1', rejected), /failed check exit/);
  assert.equal(readArtifactIndex(f.taskDir).artifactSeries['planning.plan'].iterations.length, 1);
  const wrongPlan = f.review({ status: 'approve', findings: '', extra: `reviewed_artifact: ${plan}\nreviewed_artifact_sha256: ${'0'.repeat(64)}\n` });
  assert.throws(() => command('phase-complete', f.taskDir, 'phase-1', wrongPlan), /digest-valid indexed artifact/);
  assert.equal(readArtifactIndex(f.taskDir).artifactSeries['planning.plan'].iterations.length, 1);
  const approved = f.review({ status: 'approve', findings: '', commit: f.git('rev-parse', '--short', 'HEAD'), extra: binding });
  const before = fs.readFileSync(path.join(f.taskDir, plan), 'utf8');
  const completed = command('phase-complete', f.taskDir, 'phase-1', approved);
  const successor = fs.readFileSync(path.join(f.taskDir, completed.path), 'utf8');
  assert.match(successor, /- \[x\] `node cli\.mjs` reports new value/);
  assert.match(successor, /- \[ \] Check the next output/);
  assert.equal(fs.readFileSync(path.join(f.taskDir, plan), 'utf8'), before);
  assert.equal(command('phase-complete', f.taskDir, 'phase-1', approved).path, completed.path);
  const resume = command('status', f.taskDir).resume;
  assert.equal(resume.next_phase, 'phase-2');
  assert.equal(resume.next_action, 'review-plan');
  assert.deepEqual(resume.phases.map(phase => phase.completed), [true, false]);
  const next = command('review-next', f.taskDir, 'slice-review', 'phase-1');
  assert.equal(next.next_round, 2);
  assert.equal(next.previous_record, approved);
  assert.equal(next.invalid_records[0].file, rejected);
  assert.match(next.invalid_records[0].error, /failed check exit/);
  const successorRecord = readArtifactIndex(f.taskDir).artifactSeries['planning.plan'].iterations.at(-1);
  const successorBinding = `reviewed_artifact: ${completed.path}\nreviewed_artifact_sha256: ${successorRecord.sha256}\n`;
  const planApproval = f.review({ type: 'plan-review', checkpoint: 'plan', status: 'approve', findings: '', extra: successorBinding });
  assert.equal(reviewCheck(f, planApproval).status, 'approve');
  assert.equal(command('status', f.taskDir).resume.next_action, 'build');
});

test('four committed CLI phases resume beyond three approvals while later blocking repairs stay bounded', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.taskDir, 'task.md'), '\n## Decisions\n\n- Owner: review-round-limit: 3.\n');
  const cli = path.resolve('skills/delivery/deliver/contract.mjs');
  const command = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { cwd: f.repo, encoding: 'utf8' }));
  let plan = f.artifact('plan', null, '# Plan\n\n' + [1, 2, 3, 4].map(n => `## Phase ${n}: Output ${n}\n\n### Verify\n\n- [ ] \`node cli.mjs\` reports phase ${n}.\n`).join('\n') + '\n## Progress\n\nNone.');
  const binding = () => {
    const record = readArtifactIndex(f.taskDir).artifactSeries['planning.plan'].iterations.at(-1);
    return `reviewed_artifact: ${record.path}\nreviewed_artifact_sha256: ${record.sha256}\n`;
  };
  const approvePlan = () => {
    const next = command('review-next', f.taskDir, 'plan-review', 'plan');
    assert.equal(next.limit_reached, false);
    const file = f.review({ type: 'plan-review', checkpoint: 'plan', round: next.next_round, status: 'approve', findings: '', extra: binding() });
    const result = command('review', f.taskDir, file);
    assert.equal(result.limit_reached, false);
    assert.equal(result.repair_round, 0);
    return result.round;
  };
  assert.equal(approvePlan(), 1);
  for (let n = 1; n <= 4; n++) {
    assert.equal(command('status', f.taskDir).resume.next_phase, `phase-${n}`);
    fs.writeFileSync(path.join(f.repo, 'cli.mjs'), `console.log(\"phase ${n}\");\n`);
    f.git('commit', '-am', `phase ${n}`);
    assert.equal(execFileSync(process.execPath, ['cli.mjs'], { cwd: f.repo, encoding: 'utf8' }), `phase ${n}\n`);
    const file = f.review({ checkpoint: `phase-${n}`, status: 'approve', findings: '', extra: binding() });
    command('review', f.taskDir, file);
    plan = command('phase-complete', f.taskDir, `phase-${n}`, file).path;
    assert.equal(command('status', f.taskDir).resume.next_action, 'review-plan');
    assert.equal(approvePlan(), n + 1);
  }
  const resume = command('status', f.taskDir).resume;
  assert.equal(resume.next_action, 'final');
  assert.equal(resume.next_phase, null);
  assert.equal(resume.phases.every(phase => phase.completed), true);
  for (let repair = 1; repair <= 3; repair++) {
    const findings = Array.from({ length: 4 - repair }, (_, n) => `### F${n + 1} blocking Wrong output\n\n- Evidence: cli.mjs:1`).join('\n\n');
    if (repair === 2) {
      const invalid = f.review({ type: 'plan-review', checkpoint: 'plan', round: 7, status: 'approve', findings: '', exit: 1, extra: binding() });
      assert.throws(() => command('review', f.taskDir, invalid), /failed check exit/);
      assert.equal(command('review-next', f.taskDir, 'plan-review', 'plan').repair_round, 1);
    }
    const file = f.review({ type: 'plan-review', checkpoint: 'plan', round: 5 + repair, findings, extra: binding() });
    const verdict = command('review', f.taskDir, file);
    assert.equal(verdict.repair_round, repair);
    assert.equal(verdict.progress, true);
    assert.equal(verdict.limit_reached, repair === 3);
  }
  assert.equal(command('review-next', f.taskDir, 'plan-review', 'plan').limit_reached, true);
});

test('native clean reviews reject blocked decisions and failed current results without rejecting probe history', t => {
  const f = fixture(t, false);
  const native = (story, decision = 'approve') => f.artifact('code-review', 'clean',
    `## Verification Story\n\n${story}\n\n## Critical and Required Findings\n\nNone.\n\n## Verdict\n\n- decision: ${decision}`,
    `checkpoint: final\nreviewed_commit: ${f.git('rev-parse', 'HEAD')}\nreviewer_model: unobserved: requested-strong\nround: 1\n`);
  for (const decision of ['blocked', 'request_changes']) assert.throws(() => reviewCheck(f, native('- result: passed', decision)), /contradicts.*decision/);
  for (const story of [
    '| Command | Exit | Result |\n|---|---|---|\n| node cli.mjs | 1 | failed |',
    '| Command | Result |\n|---|---|\n| node cli.mjs | failed |',
    '- command or inspection: node cli.mjs\n- result: exit 1; incorrect output',
    '- result: failed; incorrect output',
    '| Command | Exit |\n|---|---|\n| first | 0 |\n\n| Command | Exit |\n|---|---|\n| current | 2 |',
  ]) assert.throws(() => reviewCheck(f, native(story)), /failed check/);
  const file = native('Setup returned exit 1 without arguments; the supported invocation follows.\nExpected-negative probe returned exit 1 as expected.\n\n### Expected-negative probes\n\n| Command | Exit |\n|---|---|\n| reject malformed input | 1 |\n\n### Current checks\n\n| Command | Exit | Result |\n|---|---|---|\n| node cli.mjs | 0 | passed |\n\n- result: passed; expected-negative probe rejected with exit 1');
  assert.equal(reviewCheck(f, file).status, 'approve');
  assert.deepEqual(parseRecord(f.taskDir, file).ids, []);
});

test('historical invalid native approvals remain immutable while corrected current reviews recover', t => {
  for (const [decision, exit, error] of [['blocked', 0, /contradicts.*decision/], ['approve', 1, /failed check/]]) {
    const f = fixture(t);
    const file = 'artifacts/review/code/0001.md';
    const body = `## Verification Story\n\n| Command | Exit |\n|---|---|\n| node cli.mjs | ${exit} |\n\n## Critical and Required Findings\n\nNone.\n\n## Verdict\n\n- decision: ${decision}`;
    const bytes = `---\ntype: code-review\nsummary: Observed code-review\nstatus: clean\nrevision: ${sourceRevision(f.taskDir)}\ncheckpoint: final\nreviewed_commit: ${f.git('rev-parse', 'HEAD')}\nreviewer_model: unobserved: requested-strong\nround: 1\n---\n${body}\n`;
    const record = { id: 'review.code.0001', iteration: 1, path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), type: 'code-review', status: 'clean', summary: 'Observed code-review' };
    fs.mkdirSync(path.dirname(path.join(f.taskDir, file)), { recursive: true });
    fs.writeFileSync(path.join(f.taskDir, file), bytes);
    const index = readArtifactIndex(f.taskDir);
    index.generation = 1; index.artifactSeries['review.code'] = { current: record.id, iterations: [record] };
    writeArtifactIndex(f.taskDir, index); // Receipt recorded by the earlier native parser.
    assert.throws(() => reviewCheck(f, file), error);
    const unproven = deliveryStatus({ taskDir: f.taskDir });
    assert.equal(unproven.artifacts['code-review'], undefined);
    assert.equal(unproven.unproven['code-review'], file);
    assert.equal(unproven.unproven.index, undefined);
    const history = nextReview({ taskDir: f.taskDir, type: 'code-review', checkpoint: 'final' });
    assert.equal(history.next_round, 1); assert.match(history.invalid_records[0].error, error);
    const corrected = f.artifact('code-review', 'clean', body.replace(`| ${exit} |`, '| 0 |').replace(`decision: ${decision}`, 'decision: approve'),
      `checkpoint: final\nreviewed_commit: ${f.git('rev-parse', 'HEAD')}\nreviewer_model: unobserved: requested-strong\nround: 1\n`);
    assert.equal(reviewCheck(f, corrected).status, 'approve');
    assert.equal(deliveryStatus({ taskDir: f.taskDir }).missing.includes('Current clean code review'), false);
    assert.equal(fs.readFileSync(path.join(f.taskDir, file), 'utf8'), bytes);
    assert.deepEqual(readArtifactIndex(f.taskDir).artifactSeries['review.code'].iterations[0], record);
    fs.appendFileSync(path.join(f.taskDir, file), 'tampered history\n');
    assert.throws(() => reserveArtifactIteration(f.taskDir, 'review', 'code'), /SHA-256/);
    assert.throws(() => reviewCheck(f, corrected), /SHA-256/);
  }
});

test('generic approvals reject failed result fields as well as failed exits', t => {
  const f = fixture(t, false);
  const file = f.artifact('final-review', 'approve', '## Checks\n\n| Command | Exit | Result |\n|---|---|---|\n| node cli.mjs | 0 | failed: wrong output |\n\n## Findings\n\nNone.',
    `checkpoint: final\nreviewed_commit: ${f.git('rev-parse', 'HEAD')}\nreviewer_model: unobserved: requested-strong\nround: 1\n`);
  assert.throws(() => reviewCheck(f, file), /failed check/);
});

test('passed verification with reasoned optional untested scope remains current and approving', t => {
  const f = fixture(t);
  const file = f.artifact('verification', 'passed', '## Items\n\n| Id | Observed | Verdict | Required |\n|---|---|---|---|\n| C1 | old value | pass | yes |\n| A2 | device unavailable | untested | no |\n\n## Human Review\n\n### Known limits\n\n- A2: physical device unavailable; optional display inspection was not run.',
    `checkpoint: final\nreviewed_commit: ${f.git('rev-parse', 'HEAD')}\nreviewer_model: unobserved: requested-strong\nround: 1\n`);
  assert.equal(reviewCheck(f, file).status, 'approve');
  const status = deliveryStatus({ taskDir: f.taskDir });
  assert.equal(status.artifacts.verification.current, true);
  assert.equal(status.missing.includes('Current passed verification'), false);
  assert.deepEqual(status.problems, []);
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
  const f = fixture(t);
  Object.assign(f.policy, { max_repairs: 3, repair_authorization: 'Owner: stop after three repairs.' });
  saveEvidencePolicy({ taskDir: f.taskDir, policy: f.policy });
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

test('only owner Decisions set a review cap; positive integers and none change it without resetting receipt history', t => {
  const f = fixture(t);
  const task = path.join(f.taskDir, 'task.md');
  fs.appendFileSync(task, '\nThe request mentions review-round-limit: 1.\n\n## Decisions\n');
  const decide = line => fs.appendFileSync(task, `\n- Owner: ${line}\n`);
  assert.equal(reviewRoundLimit(f.taskDir), null);
  f.review();
  decide('review-round-limit: 2');
  const second = reviewCheck(f, f.review({ round: 2 }));
  assert.equal(second.round_limit, 2);
  assert.equal(second.limit_reached, true);
  decide('review-round-limit: 0');
  assert.equal(reviewRoundLimit(f.taskDir), 2);
  decide('review-round-limit: 3.5');
  assert.equal(reviewRoundLimit(f.taskDir), 2);
  decide('review-round-limit: none.');
  assert.equal(reviewRoundLimit(f.taskDir), null);
  const next = nextReview({ taskDir: f.taskDir, type: 'slice-review', checkpoint: 'phase-1' });
  assert.equal(next.next_round, 3);
  assert.equal(next.repair_round, 2);
  assert.equal(next.limit_reached, false);
  assert.equal(reviewCheck(f, f.review({ round: 3, status: 'approve', findings: '' })).repair_round, 0);
});

const repairOnce = (f, id) => {
  beginRepair({ taskDir: f.taskDir, attemptId: id });
  fs.writeFileSync(path.join(f.repo, 'cli.mjs'), `console.log(${JSON.stringify(id)});\n`);
  completeRepair({ taskDir: f.taskDir, attemptId: id });
};

test('five uncapped repairs persist without exhaustion or a serialized Infinity', t => {
  const f = fixture(t);
  saveEvidencePolicy({ taskDir: f.taskDir, policy: f.policy });
  for (let n = 1; n <= 5; n++) repairOnce(f, `repair-${n}`);
  const state = JSON.parse(fs.readFileSync(path.join(f.taskDir, '.delivery-state.json')));
  assert.equal(state.repairs.limit, null);
  assert.equal(state.repairs.used, 5);
  assert.equal(deliveryStatus({ taskDir: f.taskDir }).repairs.blocked, null);
});

test('legacy unauthorized default repair cap becomes uncapped without rewriting its policy', t => {
  const f = fixture(t);
  const file = path.join(f.taskDir, 'evidence-policy.json');
  const bytes = JSON.stringify({ schema: 'delivery-evidence-policy/v1', max_repairs: 3, repair_authorization: null, amendments: [], surfaces: f.policy.surfaces });
  fs.writeFileSync(file, bytes);
  fs.writeFileSync(path.join(f.taskDir, '.delivery-state.json'), JSON.stringify({ schema: 'delivery-state/v1', repairs: { limit: 3, used: 0, attempts: {}, blocked: null } }));
  for (let n = 1; n <= 4; n++) repairOnce(f, `repair-${n}`);
  assert.equal(deliveryStatus({ taskDir: f.taskDir }).repairs.limit, null);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});

for (const tamper of ['delete', 'null authorization', 'corrupt']) {
  test(`an owner repair cap survives policy ${tamper}`, t => {
    const f = fixture(t);
    Object.assign(f.policy, { max_repairs: 1, repair_authorization: 'Owner: one repair.' });
    saveEvidencePolicy({ taskDir: f.taskDir, policy: f.policy });
    repairOnce(f, 'one');
    const file = path.join(f.taskDir, 'evidence-policy.json');
    if (tamper === 'delete') fs.rmSync(file);
    else if (tamper === 'corrupt') fs.writeFileSync(file, '{ invalid');
    else fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file)), repair_authorization: null }));
    assert.throws(() => beginRepair({ taskDir: f.taskDir, attemptId: 'two' }), tamper === 'corrupt' ? /evidence-policy\.json/ : /exhausted/);
    if (tamper === 'delete') assert.throws(() => saveEvidencePolicy({ taskDir: f.taskDir, policy: { surfaces: f.policy.surfaces } }), /immutable/);
  });
}

test('verification needs an Items table and cannot grade a nonzero observed exit as passing', t => {
  const f = fixture(t);
  const review = body => f.artifact('verification', 'passed', body,
    `checkpoint: final\nreviewed_commit: ${f.git('rev-parse', 'HEAD')}\nreviewer_model: unobserved: requested-strong\nround: 1\n`);
  assert.throws(() => reviewCheck(f, review('## Human Review\n\nAll checks passed.')));
  for (const observed of ['exit code 1, 2 tests failed', 'exited with 2']) {
    assert.throws(() => reviewCheck(f, review(`## Items\n\n| ID | Observed | Verdict | Required |\n|---|---|---|---|\n| C1 | ${observed} | pass | yes |`)));
  }
  assert.equal(reviewCheck(f, review('## Items\n\n| ID | Observed | Verdict | Required |\n|---|---|---|---|\n| C1 | exit 0 \\| 12 tests passed | pass | yes |')).status, 'approve');
});
