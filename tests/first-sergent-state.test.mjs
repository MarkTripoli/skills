import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initialize, inspect, begin, gate, completeHostedPhase, answerHostedPhase, answer, completedRevision, suspendPhase, answerPhase, completedPhase, checkpointContext, startFreshSession } from '../skills/delivery/agent-first-sergent/state.mjs';
import { evaluateContextBoundary } from '../skills/delivery/route-model/context.mjs';
import { initTaskArtifacts, recordArtifact, reserveArtifactIteration } from '../shared/task-artifacts.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-sergent-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'task.md'), '---\nslug: sample\n---\nOriginal user request\n');
  const file = path.join(dir, '01-plan.md');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: First plan\n---\nFirst plan\n');
  return { dir, file };
}

const options = { workflow: 'full', gates: 'all', max_steps: 2, verify: true };

test('state accepts the destination pull-request gate policy', (t) => {
  const { dir } = fixture(t);
  const state = initialize(dir, { ...options, gates: 'pr' });
  assert.equal(state.options.gates, 'pr');
  assert.equal(inspect(dir).options.gates, 'pr');
  assert.equal(state.options.transport, 'native');
  assert.equal(state.options.quota_mode, 'off');
  assert.equal(state.options.context_policy, 'off');
});

test('approved artifact survives a fresh orchestrator but a changed revision requires review again', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, options);
  begin(dir, 'create-plan');
  const first = gate(dir, file);
  assert.equal(first.approved, false);
  assert.throws(() => begin(dir, 'implement-plan'), /pending human gate/);
  answer(dir, file, first.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
  assert.equal(inspect(dir).steps, 1);
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Revised plan\n---\nRevised plan\n');
  assert.throws(() => answer(dir, file, first.hash, 'approve'), /No human gate is pending/);
  const second = gate(dir, file);
  assert.equal(second.approved, false);
  answer(dir, file, second.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
  const other = path.join(dir, '02-plan.md');
  fs.writeFileSync(other, '---\ntype: plan\nsummary: Second plan\n---\nSecond artifact\n');
  gate(dir, other);
  assert.throws(() => gate(dir, file), /different artifact is awaiting/);
});

test('stale gate and empty revision feedback cannot authorize another artifact', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, options);
  const first = gate(dir, file);
  assert.throws(() => answer(dir, file, first.hash, 'revise', '  '), /nonempty feedback/);
  fs.writeFileSync(file, '---\ntype: plan\n---\nChanged during review\n');
  assert.throws(() => answer(dir, file, first.hash, 'approve'), /Stale gate/);
  const refreshed = gate(dir, file);
  assert.equal(refreshed.replaced, true);
  assert.notEqual(refreshed.hash, first.hash);
  assert.throws(() => answer(dir, file, first.hash, 'approve'), /Stale gate/);
  assert.equal(Object.keys(inspect(dir).approvals).length, 0);
  answer(dir, file, refreshed.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
});

test('revision feedback persists until a real in-place change and attempts remain bounded', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, options);
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'revise', 'Make the plan executable');
  assert.equal(inspect(dir).revision.feedback, 'Make the plan executable');
  assert.throws(() => gate(dir, file), /revision has not changed/);
  begin(dir, 'iterate-plan');
  assert.throws(() => completedRevision(dir, file), /did not change/);
  fs.writeFileSync(file, '---\ntype: plan\n---\nExecutable plan\n');
  completedRevision(dir, file);
  assert.equal(inspect(dir).revision, null);
  begin(dir, 'implement-plan');
  assert.throws(() => begin(dir, 'implement-plan'), /max_steps=2/);
  assert.equal(inspect(dir).steps, 2);
  assert.throws(() => initialize(dir, { ...options, gates: 'none' }), /differ from the saved run/);
  assert.equal(fs.readFileSync(path.join(dir, 'task.md'), 'utf8').endsWith('Original user request\n'), true);
});

test('an in-phase question blocks outer gates until the same child finishes', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, options);
  begin(dir, 'create-prd');
  const prd = path.join(dir, '01-design-prd.md');
  fs.writeFileSync(prd, '---\ntype: design-prd\nsummary: First PRD\n---\nFirst PRD\n');
  suspendPhase(dir, 'create-prd', 'agent://prd-1', 'Which user owns this flow?');
  assert.equal(inspect(dir).phase.handle, 'agent://prd-1');
  assert.throws(() => gate(dir, file), /Finish the addressable phase/);
  assert.throws(() => begin(dir, 'create-tdd'), /Resume the addressable phase/);
  assert.throws(() => answerPhase(dir, 'agent://other', 'owner'), /No matching phase/);
  answerPhase(dir, 'agent://prd-1', 'The administrator');
  assert.throws(() => answerPhase(dir, 'agent://prd-1', 'A different owner'), /already answered/);
  suspendPhase(dir, 'create-prd', 'agent://prd-1', 'Where does this apply?');
  assert.equal(inspect(dir).phase.answer, null);
  assert.throws(() => suspendPhase(dir, 'create-prd', 'agent://prd-1', 'New question'), /Answer the previous/);
  answerPhase(dir, 'agent://prd-1', 'At checkout');
  assert.equal(inspect(dir).phase.answer, 'At checkout');
  completedPhase(dir, 'agent://prd-1', prd);
  assert.equal(inspect(dir).phase, null);
  assert.equal(gate(dir, prd).approved, false);
});

test('a stop decision remains terminal after a restarted liaison', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, options);
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'stop');
  assert.equal(inspect(dir).stopped, true);
  assert.throws(() => begin(dir, 'implement-plan'), /Human stopped/);
  assert.throws(() => gate(dir, file), /Human stopped/);
});

test('gate cannot read outside the task directory', (t) => {
  const { dir } = fixture(t);
  initialize(dir, options);
  assert.throws(() => gate(dir, path.join(dir, 'task.md')), /Artifact must be inside/);
  const external = path.join(os.tmpdir(), `first-sergent-outside-${process.pid}`);
  fs.writeFileSync(external, 'outside');
  t.after(() => fs.rmSync(external, { force: true }));
  assert.throws(() => gate(dir, external), /Artifact must be inside/);
});

test('context policy requires a live metric and child identity before every dispatch', (t) => {
  const { dir } = fixture(t);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  assert.throws(() => begin(dir, 'create-plan'), /live context metric and child session identity/);
  checkpointContext(dir, { contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  assert.throws(() => begin(dir, 'create-plan'), /live context metric and child session identity/);
  checkpointContext(dir, { sessionId: 'current-session', contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  begin(dir, 'create-plan');
  assert.throws(() => begin(dir, 'verify-implementation'), /live context metric and child session identity/);
  checkpointContext(dir, { sessionId: 'current-session', contextUsage: { tokens: 25, contextWindow: 100, percent: 25 } });
  begin(dir, 'verify-implementation');
  assert.equal(inspect(dir).steps, 2);
});

test('ordinary next-phase handoff admits a fresh child only after the prior live metric and gates', (t) => {
  const { dir } = fixture(t);
  const prd = path.join(dir, '01-design-prd.md');
  const tdd = path.join(dir, '01-design-tdd.md');
  fs.writeFileSync(prd, '---\ntype: design-prd\nsummary: Approved PRD\n---\nApproved PRD\n');
  initialize(dir, { ...options, max_steps: 3, context_policy: 'stop-at-60' });
  const metric = (sessionId, percent) => ({ sessionId, contextUsage: { tokens: percent, contextWindow: 100, percent } });
  checkpointContext(dir, metric('child-a', 20));
  begin(dir, 'create-prd');
  checkpointContext(dir, metric('child-a', 22));
  assert.throws(() => startFreshSession(dir, 'child-b'), /current child to finish/);
  assert.equal(inspect(dir).context_boundary.sessionId, 'child-a');
  suspendPhase(dir, 'create-prd', 'agent://prd-a', 'Who owns this?');
  checkpointContext(dir, metric('child-a', 25));
  assert.throws(() => startFreshSession(dir, 'child-b'), /active phase and human gate/);
  answerPhase(dir, 'agent://prd-a', 'Administrator');
  completedPhase(dir, 'agent://prd-a', prd);
  const pending = gate(dir, prd);
  assert.throws(() => startFreshSession(dir, 'child-b'), /active phase and human gate/);
  answer(dir, prd, pending.hash, 'approve');
  assert.equal(inspect(dir).completed_step, 1);

  startFreshSession(dir, 'child-b');
  assert.equal(inspect(dir).context_boundary.action, 'awaiting-checkpoint');
  assert.deepEqual(inspect(dir).context_boundary.retiredSessionIds, ['child-a']);
  checkpointContext(dir, metric('child-a', 10));
  assert.equal(inspect(dir).context_boundary.sessionId, 'child-b');
  assert.equal(inspect(dir).context_boundary.action, 'recheck-required');
  assert.throws(() => begin(dir, 'create-tdd'), /live context metric/);
  checkpointContext(dir, metric('child-b', 15));
  begin(dir, 'create-tdd');
  assert.equal(inspect(dir).steps, 2);
  checkpointContext(dir, metric('child-a', 10));
  assert.equal(inspect(dir).context_boundary.action, 'recheck-required');
  assert.throws(() => startFreshSession(dir, 'child-a'), /measured context boundary/);
  checkpointContext(dir, metric('child-b', 20));
  assert.throws(() => startFreshSession(dir, 'child-c'), /current child to finish/);
  assert.throws(() => gate(dir, prd), /artifact type design-prd does not match design-tdd/);
  assert.equal(inspect(dir).completed_step, null);
  assert.equal(fs.existsSync(tdd), false);
  assert.throws(() => startFreshSession(dir, 'child-c'), /current child to finish/);
  fs.writeFileSync(tdd, '---\ntype: design-tdd\n---\nIncomplete TDD\n');
  assert.throws(() => gate(dir, tdd), /summary must be a scalar/);
  assert.equal(inspect(dir).completed_step, null);
  fs.writeFileSync(tdd, '---\ntype: design-tdd\nsummary: Completed TDD\n---\nCompleted TDD\n');
  const tddPending = gate(dir, tdd);
  assert.equal(tddPending.approved, false);
  assert.throws(() => startFreshSession(dir, 'child-c'), /active phase and human gate/);
  answer(dir, tdd, tddPending.hash, 'approve');
  assert.equal(inspect(dir).completed_step, 2);
  assert.equal(gate(dir, tdd).approved, true);
  assert.throws(() => startFreshSession(dir, 'child-a'), /retired child session/);
});

test('repeated indexed implementation phase needs its own artifact before handoff', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'first-sergent-indexed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'sample');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'task.md'), '---\nslug: sample\n---\nOriginal user request\n');
  initTaskArtifacts(dir);
  const implementation = (summary) => {
    const allocation = reserveArtifactIteration(dir, 'implementation', 'receipt');
    const staging = path.join(dir, allocation.writePath);
    fs.writeFileSync(staging, `---\ntype: implementation\nsummary: ${summary}\n---\n${summary}\n`);
    return path.join(dir, recordArtifact(dir, 'implementation', 'receipt', 'implementation', staging).path);
  };
  const metric = (sessionId) => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  checkpointContext(dir, metric('child-a'));
  begin(dir, 'implement-plan');
  assert.equal(inspect(dir).phase_artifact_before, null);
  const first = implementation('First implementation');
  const firstGate = gate(dir, first);
  answer(dir, first, firstGate.hash, 'approve');
  checkpointContext(dir, metric('child-a'));
  startFreshSession(dir, 'child-b');
  checkpointContext(dir, metric('child-b'));
  begin(dir, 'implement-plan');
  assert.equal(inspect(dir).phase_artifact_before.id, 'implementation.receipt.0001');
  checkpointContext(dir, metric('child-b'));
  assert.throws(() => gate(dir, first), /has not recorded a new artifact iteration/);
  assert.equal(inspect(dir).completed_step, null);
  assert.equal(inspect(dir).pending, null);
  assert.throws(() => startFreshSession(dir, 'child-c'), /current child to finish/);
  checkpointContext(dir, { sessionId: 'child-b', contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  startFreshSession(dir, 'child-c');
  assert.equal(inspect(dir).resume_step, 2);
  assert.throws(() => begin(dir, 'review-code'), /live context metric/);
  checkpointContext(dir, metric('child-c'));
  assert.throws(() => begin(dir, 'review-code'), /Resume the checkpointed phase/);
  begin(dir, 'implement-plan');
  assert.equal(inspect(dir).steps, 2);
  assert.equal(inspect(dir).phase_artifact_before.id, 'implementation.receipt.0001');
  assert.throws(() => gate(dir, first), /has not recorded a new artifact iteration/);
  const second = implementation('Second implementation');
  assert.throws(() => gate(dir, first), /does not match the current implement-plan phase artifact/);
  const secondGate = gate(dir, second);
  assert.equal(secondGate.approved, false);
  assert.equal(inspect(dir).completed_step, 2);
  answer(dir, second, secondGate.hash, 'approve');
  checkpointContext(dir, metric('child-c'));
  startFreshSession(dir, 'child-d');
  assert.equal(inspect(dir).context_boundary.sessionId, 'child-d');
});

test('hosted-only phases progress from verified publication proof without task-local receipts', (t) => {
  const { dir, file } = fixture(t);
  const metric = (sessionId) => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  const proof = {
    pullRequest: 'https://github.com/example/project/pull/17',
    head: 'a'.repeat(40),
    captureCurrent: true,
    captureHosted: true,
    commentVerified: true,
    bodyPublished: true,
    descriptionCurrent: true,
    descriptionHash: 'b'.repeat(64),
    allowed: true,
  };
  initialize(dir, { ...options, max_steps: 3, context_policy: 'stop-at-60' });
  checkpointContext(dir, metric('child-a'));
  begin(dir, 'record-evidence');
  assert.throws(() => gate(dir, file), /no task-local artifact gate/);
  assert.throws(() => begin(dir, 'describe-pr'), /live context metric/);
  checkpointContext(dir, metric('child-a'));
  assert.throws(() => begin(dir, 'describe-pr'), /Verify hosted phase proof/);
  assert.throws(() => startFreshSession(dir, 'child-b'), /current child to finish/);
  assert.throws(() => completeHostedPhase(dir, 'record-evidence', { ...proof, captureHosted: false }), /Current hosted publication proof/);
  completeHostedPhase(dir, 'record-evidence', { ...proof, allowed: false, bodyPublished: false, descriptionCurrent: false });
  assert.equal(inspect(dir).completed_step, 1);
  startFreshSession(dir, 'child-b');
  checkpointContext(dir, metric('child-b'));
  begin(dir, 'describe-pr');
  assert.throws(() => gate(dir, file), /no task-local artifact gate/);
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', { ...proof, descriptionCurrent: false }), /Current hosted publication proof/);
  assert.throws(() => completeHostedPhase(dir, 'record-evidence', proof), /active hosted-only phase/);
  const pending = completeHostedPhase(dir, 'describe-pr', proof);
  assert.equal(pending.approved, false);
  assert.equal(pending.url, proof.pullRequest);
  assert.equal(pending.hash, proof.descriptionHash);
  assert.throws(() => startFreshSession(dir, 'child-c'), Error);
  assert.equal(inspect(dir).pending.hash, pending.hash);
  answerHostedPhase(dir, proof, pending.hash, 'approve');
  assert.equal(completeHostedPhase(dir, 'describe-pr', proof).approved, true);
  checkpointContext(dir, metric('child-b'));
  startFreshSession(dir, 'child-c');
  assert.equal(inspect(dir).context_boundary.sessionId, 'child-c');
  assert.equal(inspect(dir).hosted_proof.step, 2);
  assert.equal(inspect(dir).hosted_proof.descriptionHash, proof.descriptionHash);
});

test('hosted description approval binds URL, hash, head, and independently refreshed proof', (t) => {
  const { dir, file } = fixture(t);
  const proof = {
    pullRequest: 'https://github.com/example/project/pull/17',
    head: 'a'.repeat(40),
    captureCurrent: true, captureHosted: true, commentVerified: true,
    bodyPublished: true, descriptionCurrent: true, descriptionHash: 'b'.repeat(64), allowed: true,
  };
  initialize(dir, { ...options, gates: 'pr', max_steps: 3 });
  begin(dir, 'describe-pr');
  const pending = completeHostedPhase(dir, 'describe-pr', proof);
  assert.equal(inspect(dir).completed_step, null);
  assert.throws(() => begin(dir, 'review-code'), /pending human gate/);
  assert.throws(() => answer(dir, file, pending.hash, 'approve'), /answerHostedPhase/);
  assert.throws(() => answerHostedPhase(dir, { ...proof, descriptionCurrent: false }, pending.hash, 'approve'), /Current hosted publication proof/);
  const changed = { ...proof, descriptionHash: 'c'.repeat(64) };
  assert.throws(() => answerHostedPhase(dir, changed, pending.hash, 'approve'), /Stale hosted gate/);
  assert.equal(completeHostedPhase(dir, 'describe-pr', changed).replaced, true);
  assert.throws(() => answerHostedPhase(dir, changed, pending.hash, 'approve'), /Stale hosted gate/);
  assert.throws(() => answerHostedPhase(dir, { ...changed, pullRequest: 'https://github.com/example/project/pull/18' }, changed.descriptionHash, 'approve'), /Stale hosted gate/);
  answerHostedPhase(dir, changed, changed.descriptionHash, 'approve');
  assert.equal(inspect(dir).completed_step, null);
  assert.equal(completeHostedPhase(dir, 'describe-pr', changed).approved, true);
  const drift = { ...changed, head: 'd'.repeat(40) };
  assert.equal(completeHostedPhase(dir, 'describe-pr', drift).approved, false);
  assert.equal(inspect(dir).completed_step, null);
  assert.throws(() => begin(dir, 'review-code'), /pending human gate/);
  answerHostedPhase(dir, drift, drift.descriptionHash, 'approve');
  assert.equal(completeHostedPhase(dir, 'describe-pr', drift).approved, true);
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', { ...drift, descriptionCurrent: false }), /Current hosted publication proof/);
  assert.equal(inspect(dir).completed_step, null);
  assert.equal(completeHostedPhase(dir, 'describe-pr', drift).approved, false);
  answerHostedPhase(dir, drift, drift.descriptionHash, 'approve');
  completeHostedPhase(dir, 'describe-pr', drift);
  begin(dir, 'review-code');
  begin(dir, 'describe-pr');
  assert.equal(completeHostedPhase(dir, 'describe-pr', drift).approved, false);
});

test('hosted revisions require changed body and stop remains terminal', (t) => {
  const { dir } = fixture(t);
  const proof = {
    pullRequest: 'https://github.com/example/project/pull/17', head: 'a'.repeat(40),
    captureCurrent: true, captureHosted: true, commentVerified: true,
    bodyPublished: true, descriptionCurrent: true, descriptionHash: 'b'.repeat(64), allowed: true,
  };
  initialize(dir, options);
  begin(dir, 'describe-pr');
  completeHostedPhase(dir, 'describe-pr', proof);
  assert.throws(() => answerHostedPhase(dir, proof, proof.descriptionHash, 'revise', ' '), /nonempty feedback/);
  answerHostedPhase(dir, proof, proof.descriptionHash, 'revise', 'Explain the rollout');
  assert.equal(inspect(dir).hosted_revision.feedback, 'Explain the rollout');
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', proof), /revision has not changed/);
  const revised = { ...proof, descriptionHash: 'c'.repeat(64) };
  completeHostedPhase(dir, 'describe-pr', revised);
  answerHostedPhase(dir, revised, revised.descriptionHash, 'stop');
  assert.equal(inspect(dir).stopped, true);
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', revised), /active hosted-only phase/);
});

test('none and plan policies complete hosted descriptions without approval prompts', (t) => {
  const { dir } = fixture(t);
  const proof = {
    pullRequest: 'https://github.com/example/project/pull/17', head: 'a'.repeat(40),
    captureCurrent: true, captureHosted: true, commentVerified: true,
    bodyPublished: true, descriptionCurrent: true, descriptionHash: 'b'.repeat(64), allowed: true,
  };
  for (const gates of ['none', 'plan']) {
    const task = path.join(dir, gates);
    fs.mkdirSync(task);
    fs.writeFileSync(path.join(task, 'task.md'), '---\nslug: sample\n---\nOriginal user request\n');
    initialize(task, { ...options, gates });
    begin(task, 'describe-pr');
    assert.equal(completeHostedPhase(task, 'describe-pr', proof).approved, true);
    assert.equal(inspect(task).pending, null);
    assert.equal(inspect(task).completed_step, 1);
  }
});

test('legacy indexed completed phase resumes while next repeated phase requires new iteration', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'first-sergent-legacy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'sample');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'task.md'), '---\nslug: sample\n---\nOriginal user request\n');
  initTaskArtifacts(dir);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  const metric = (sessionId) => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  checkpointContext(dir, metric('child-a'));
  begin(dir, 'implement-plan');
  const allocation = reserveArtifactIteration(dir, 'implementation', 'receipt');
  const staging = path.join(dir, allocation.writePath);
  fs.writeFileSync(staging, '---\ntype: implementation\nsummary: First implementation\n---\nFirst implementation\n');
  const first = path.join(dir, recordArtifact(dir, 'implementation', 'receipt', 'implementation', staging).path);
  const pending = gate(dir, first);
  answer(dir, first, pending.hash, 'approve');
  const stateFile = path.join(dir, '.first-sergent-state.json');
  const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  delete old.phase_artifact_before;
  delete old.completed_step;
  fs.writeFileSync(stateFile, JSON.stringify(old));
  assert.equal(inspect(dir).completed_step, 1);
  assert.equal(gate(dir, first).approved, true);
  checkpointContext(dir, metric('child-a'));
  startFreshSession(dir, 'child-b');
  checkpointContext(dir, metric('child-b'));
  begin(dir, 'implement-plan');
  const repeatedLegacy = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  delete repeatedLegacy.phase_artifact_before;
  delete repeatedLegacy.completed_step;
  fs.writeFileSync(stateFile, JSON.stringify(repeatedLegacy));
  assert.equal(inspect(dir).completed_step, null);
  assert.throws(() => gate(dir, first), /has not recorded a new artifact iteration/);
  assert.equal(inspect(dir).completed_step, null);
  checkpointContext(dir, { sessionId: 'child-b', contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  startFreshSession(dir, 'child-c');
  assert.equal(inspect(dir).resume_step, 2);
});

test('legacy indexed unapproved phase snapshots existing artifact without accepting it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'first-sergent-legacy-active-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'sample');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'task.md'), '---\nslug: sample\n---\nOriginal user request\n');
  initTaskArtifacts(dir);
  initialize(dir, options);
  begin(dir, 'implement-plan');
  const allocation = reserveArtifactIteration(dir, 'implementation', 'receipt');
  const staging = path.join(dir, allocation.writePath);
  fs.writeFileSync(staging, '---\ntype: implementation\nsummary: First implementation\n---\nFirst implementation\n');
  const first = path.join(dir, recordArtifact(dir, 'implementation', 'receipt', 'implementation', staging).path);
  const old = inspect(dir);
  delete old.phase_artifact_before;
  delete old.completed_step;
  fs.writeFileSync(path.join(dir, '.first-sergent-state.json'), JSON.stringify(old));
  assert.equal(inspect(dir).completed_step, null);
  assert.throws(() => gate(dir, first), /has not recorded a new artifact iteration/);
});

test('context threshold requires the fresh child live metric before dispatch', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, { ...options, max_steps: 3, context_policy: 'stop-at-60' });
  checkpointContext(dir, { sessionId: 'old-session', contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  assert.equal(inspect(dir).context_boundary.action, 'fresh-session');
  assert.throws(() => begin(dir, 'create-plan'));
  startFreshSession(dir, 'new-session');
  assert.equal(inspect(dir).context_boundary.action, 'awaiting-checkpoint');
  assert.throws(() => begin(dir, 'create-plan'));
  checkpointContext(dir, { sessionId: 'old-session', contextUsage: { tokens: 30, contextWindow: 100, percent: 30 } });
  assert.equal(inspect(dir).context_boundary.sessionId, 'new-session');
  assert.throws(() => begin(dir, 'create-plan'));
  checkpointContext(dir, { sessionId: 'old-session', contextUsage: { tokens: 30, contextWindow: 100, percent: 30 } });
  assert.equal(inspect(dir).context_boundary.sessionId, 'new-session');
  assert.throws(() => begin(dir, 'create-plan'));
  checkpointContext(dir, { sessionId: 'new-session', contextUsage: { tokens: 30, contextWindow: 100, percent: 30 } });
  begin(dir, 'create-plan');
  assert.equal(inspect(dir).steps, 1);
  assert.equal(inspect(dir).context_boundary.sessionId, 'new-session');
  checkpointContext(dir, { sessionId: 'old-session', contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  assert.equal(inspect(dir).context_boundary.action, 'recheck-required');
  assert.deepEqual(inspect(dir).context_boundary.retiredSessionIds, ['old-session']);
  assert.throws(() => begin(dir, 'verify-implementation'));
  checkpointContext(dir, { sessionId: 'new-session', contextUsage: { tokens: 25, contextWindow: 100, percent: 25 } });
  begin(dir, 'create-plan');
  checkpointContext(dir, { sessionId: 'new-session', contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  startFreshSession(dir, 'third-session');
  assert.equal(inspect(dir).resume_step, 2);
  checkpointContext(dir, { sessionId: 'third-session', contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } });
  begin(dir, 'create-plan');
  assert.equal(inspect(dir).steps, 2);
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'approve');
  checkpointContext(dir, { sessionId: 'third-session', contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } });
  startFreshSession(dir, 'fourth-session');
  checkpointContext(dir, { sessionId: 'fourth-session', contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } });
  begin(dir, 'review-code');
  assert.equal(inspect(dir).context_boundary.sessionId, 'fourth-session');
  assert.deepEqual(inspect(dir).context_boundary.retiredSessionIds, ['old-session', 'new-session', 'third-session']);
});
test('context threshold without a child identity remains blocked', (t) => {
  const { dir } = fixture(t);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  checkpointContext(dir, { contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  assert.equal(inspect(dir).context_boundary.action, 'stop');
  assert.match(inspect(dir).context_boundary.reason, /session identity unavailable/);
  assert.throws(() => startFreshSession(dir, 'new-session'), /measured context boundary/);
});

test('context policy stops when the managed transport exposes no live metric', (t) => {
  const { dir } = fixture(t);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  checkpointContext(dir, { sessionId: 'current-session' });
  assert.equal(inspect(dir).context_boundary.action, 'stop');
  assert.throws(() => startFreshSession(dir, 'new-session'));
  assert.throws(() => begin(dir, 'create-plan'));
  assert.equal(inspect(dir).steps, 0);
});
