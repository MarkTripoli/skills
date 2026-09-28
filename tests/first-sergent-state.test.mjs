import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initialize, inspect, begin, gate, answer, completedRevision, suspendPhase, answerPhase, completedPhase, checkpointContext, startFreshSession } from '../skills/delivery/agent-first-sergent/state.mjs';
import { evaluateContextBoundary } from '../skills/delivery/route-model/context.mjs';

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
  assert.throws(() => startFreshSession(dir, 'third-session'), /current child to finish/);
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'approve');
  startFreshSession(dir, 'third-session');
  checkpointContext(dir, { sessionId: 'third-session', contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } });
  begin(dir, 'review-code');
  assert.equal(inspect(dir).context_boundary.sessionId, 'third-session');
  assert.deepEqual(inspect(dir).context_boundary.retiredSessionIds, ['old-session', 'new-session']);
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
