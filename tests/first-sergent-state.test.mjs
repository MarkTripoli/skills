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
  fs.writeFileSync(file, '---\ntype: plan\n---\nFirst plan\n');
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
  fs.writeFileSync(file, '---\ntype: plan\n---\nRevised plan\n');
  assert.throws(() => answer(dir, file, first.hash, 'approve'), /No human gate is pending/);
  const second = gate(dir, file);
  assert.equal(second.approved, false);
  answer(dir, file, second.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
  const other = path.join(dir, '02-research.md');
  fs.writeFileSync(other, '---\ntype: research\n---\nSecond artifact\n');
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
  completedPhase(dir, 'agent://prd-1', file);
  assert.equal(inspect(dir).phase, null);
  assert.equal(gate(dir, file).approved, false);
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

test('context policy stops at the live 60 percent boundary and starts a fresh session', (t) => {
  const { dir } = fixture(t);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  assert.equal(evaluateContextBoundary({ contextUsage: { tokens: 59, contextWindow: 100, percent: 59 } }).action, 'continue');
  assert.equal(evaluateContextBoundary({ type: 'response', command: 'get_state', success: true, data: { contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } } }).action, 'fresh-session');
  checkpointContext(dir, { sessionId: 'old-session', contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  assert.equal(inspect(dir).context_boundary.action, 'fresh-session');
  assert.equal(inspect(dir).context_boundary.sessionId, 'old-session');
  assert.throws(() => begin(dir, 'create-plan'), /fresh session/);
  startFreshSession(dir, 'new-session');
  assert.equal(inspect(dir).context_boundary.previousSessionId, 'old-session');
  assert.equal(inspect(dir).context_boundary.sessionId, 'new-session');
  begin(dir, 'create-plan');
  assert.equal(inspect(dir).steps, 1);
});
test('context threshold without a child identity remains blocked', (t) => {
  const { dir } = fixture(t);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  checkpointContext(dir, { contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  assert.equal(inspect(dir).context_boundary.action, 'stop');
  assert.match(inspect(dir).context_boundary.reason, /session identity unavailable/);
  assert.throws(() => startFreshSession(dir, 'new-session'), /threshold context boundary/);
});

test('context policy stops when the managed transport exposes no live metric', (t) => {
  const { dir } = fixture(t);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  checkpointContext(dir, {});
  assert.equal(inspect(dir).context_boundary.reason, 'live context metric unavailable');
  assert.throws(() => startFreshSession(dir), /threshold context boundary/);
  assert.throws(() => begin(dir, 'create-plan'), /fresh session/);
});
