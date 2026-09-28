import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialize, inspect, begin, gate, completeHostedPhase, answerHostedPhase, answer, completedRevision, suspendPhase, answerPhase, completedPhase, checkpointContext, startFreshSession } from '../skills/delivery/agent-first-sergent/state.mjs';
import { evaluateContextBoundary } from '../skills/delivery/route-model/context.mjs';
import { initTaskArtifacts, recordArtifact, reserveArtifactIteration } from '../shared/task-artifacts.mjs';
import { buildRuntime } from '../scripts/lib/build.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-sergent-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'task.md'), '---\nslug: sample\n---\nOriginal user request\n');
  const file = path.join(dir, '01-plan.md');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: First plan\n---\nFirst plan\n');
  return { dir, file };
}

const options = { workflow: 'full', gates: 'all', max_steps: 2, verify: true };

function indexedFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'first-sergent-indexed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'sample');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'task.md'), '---\nslug: sample\n---\nOriginal user request\n');
  initTaskArtifacts(dir);
  const record = (type, kind, variant, summary, status = null) => {
    const allocation = reserveArtifactIteration(dir, kind, variant);
    const staging = path.join(dir, allocation.writePath);
    fs.writeFileSync(staging, `---\ntype: ${type}\nsummary: ${summary}\n${status ? `status: ${status}\n` : ''}---\n${summary}\n${status === 'clean' ? '\n## Critical and Required Findings\n\nNone.\n' : ''}`);
    return path.join(dir, recordArtifact(dir, kind, variant, type, staging).path);
  };
  const legacy = () => {
    const file = path.join(dir, '.first-sergent-state.json');
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete state.phase_artifact_before;
    delete state.completed_step;
    fs.writeFileSync(file, JSON.stringify(state));
  };
  return { dir, record, legacy };
}

test('installed runtime state imports its adjacent artifact helper', async (t) => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'first-sergent-installed-'));
  t.after(() => fs.rmSync(dest, { recursive: true, force: true }));
  buildRuntime('oh-my-pi', dest, { skillNames: ['agent-first-sergent', 'route-model'] });
  const installed = await import(pathToFileURL(path.join(dest, 'skills', 'agent-first-sergent', 'state.mjs')).href);
  const { dir } = fixture(t);
  assert.equal(installed.initialize(dir, options).steps, 0);
  assert.equal(installed.inspect(dir).options.gates, 'all');
});

test('state accepts the destination pull-request gate policy', (t) => {
  const { dir } = fixture(t);
  const state = initialize(dir, { ...options, gates: 'pr' });
  assert.equal(state.options.gates, 'pr');
  assert.equal(inspect(dir).options.gates, 'pr');
  assert.equal(state.options.transport, 'native');
  assert.equal(state.options.quota_mode, 'off');
  assert.equal(state.options.context_policy, 'off');
});

test('adopted plan artifacts retain plan-policy human approval before any dispatch', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, { ...options, gates: 'plan' });
  const pending = gate(dir, file);
  assert.equal(pending.approved, false);
  assert.equal(inspect(dir).steps, 0);
  answer(dir, file, pending.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
  const receipt = path.join(dir, '02-implementation.md');
  fs.writeFileSync(receipt, '---\ntype: implementation\nsummary: Done\n---\nDone\n');
  assert.equal(gate(dir, receipt).approved, true);
  const description = path.join(dir, '03-description.md');
  fs.writeFileSync(description, '## Purpose\n\nPublish a human review.\n\n## Change outline\n\nNo code change.\n');
  assert.equal(gate(dir, description).approved, true);
});

test('reused quoted plan types remain gated and a headerless plan cannot bypass review', (t) => {
  const { dir, file } = fixture(t);
  fs.writeFileSync(file, '---\ntype: "plan"\nsummary: First plan\n---\nFirst plan\n');
  initialize(dir, { ...options, gates: 'plan' });
  const pending = gate(dir, file);
  assert.equal(pending.approved, false);
  fs.writeFileSync(file, '# Plan\n\nMalformed local plan without frontmatter.\n');
  assert.throws(() => gate(dir, file), /incomplete PR description/);
  assert.equal(inspect(dir).pending.hash, pending.hash);
});

test('approved artifact survives a fresh orchestrator but a changed revision requires review again', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, options);
  fs.unlinkSync(file);
  begin(dir, 'create-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: First plan\n---\nFirst plan\n');
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
test('indexed plan approval must match the current registered iteration', (t) => {
  const { dir, record } = indexedFixture(t);
  initialize(dir, options);
  begin(dir, 'create-plan');
  const first = record('plan', 'planning', 'plan', 'First plan');
  const pending = gate(dir, first);
  assert.equal(pending.approved, false);

  const second = record('plan', 'planning', 'plan', 'Replaced before approval');
  assert.throws(() => answer(dir, first, pending.hash, 'approve'), /does not match the current create-plan phase artifact/);
  assert.equal(inspect(dir).pending.hash, pending.hash);
  assert.equal(inspect(dir).approvals[path.relative(dir, first)], undefined);
  assert.throws(() => begin(dir, 'implement-plan'), /pending human gate/);

  const replacement = gate(dir, second);
  assert.equal(replacement.replaced, true);
  answer(dir, second, replacement.hash, 'approve');
  assert.equal(gate(dir, second).approved, true);
  begin(dir, 'implement-plan');
  assert.equal(inspect(dir).steps, 2);
  const { dir: alteredDir, record: alteredRecord } = indexedFixture(t);
  initialize(alteredDir, options);
  begin(alteredDir, 'create-plan');
  const altered = alteredRecord('plan', 'planning', 'plan', 'Indexed plan');
  const alteredPending = gate(alteredDir, altered);
  const indexFile = path.join(alteredDir, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  index.artifactSeries['planning.plan'].iterations[0].sha256 = 'a'.repeat(64);
  fs.writeFileSync(indexFile, JSON.stringify(index));
  assert.throws(() => answer(alteredDir, altered, alteredPending.hash, 'approve'), /SHA-256 hash does not match indexed artifact/);
  assert.equal(inspect(alteredDir).pending.hash, alteredPending.hash);
  assert.equal(inspect(alteredDir).approvals[path.relative(alteredDir, altered)], undefined);
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
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Executable\n---\nExecutable plan\n');
  completedRevision(dir, file);
  assert.equal(inspect(dir).revision, null);
  assert.throws(() => begin(dir, 'implement-plan'), /Gate the requested artifact revision/);
  const revised = gate(dir, file);
  assert.equal(revised.approved, false);
  answer(dir, file, revised.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
  begin(dir, 'implement-plan');
  assert.throws(() => begin(dir, 'implement-plan'), /max_steps=2/);
  assert.equal(inspect(dir).steps, 2);
  assert.throws(() => initialize(dir, { ...options, gates: 'none' }), /differ from the saved run/);
  assert.equal(fs.readFileSync(path.join(dir, 'task.md'), 'utf8').endsWith('Original user request\n'), true);
});

test('requested revision requires a fresh child and blocks unrelated dispatch', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, { ...options, max_steps: 3, context_policy: 'stop-at-60' });
  const metric = (sessionId = 'child-a') => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  checkpointContext(dir, metric());
  begin(dir, 'create-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Proposed plan\n---\nProposed plan\n');
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'revise', 'Require executable plan');
  assert.equal(inspect(dir).completed_step, null);
  checkpointContext(dir, metric());
  assert.throws(() => begin(dir, 'implement-plan'), /Gate the requested artifact revision/);
  assert.throws(() => begin(dir, 'iterate-plan'), /Register a fresh child session/);
  startFreshSession(dir, 'child-b');
  checkpointContext(dir, metric('child-b'));
  begin(dir, 'iterate-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Executable\n---\nExecutable plan\n');
  completedRevision(dir, file);
  checkpointContext(dir, metric('child-b'));
  assert.throws(() => begin(dir, 'implement-plan'), /Gate the requested artifact revision/);
  const unrelated = path.join(dir, '02-plan.md');
  fs.writeFileSync(unrelated, '---\ntype: plan\nsummary: Different plan\n---\nDifferent plan\n');
  assert.throws(() => gate(dir, unrelated), /requested artifact revision/);
  assert.equal(inspect(dir).completed_step, null);
  const revised = gate(dir, file);
  answer(dir, file, revised.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
  checkpointContext(dir, metric('child-b'));
  startFreshSession(dir, 'child-c');
});

test('indexed revision advances to a fresh canonical iteration rather than mutating the old path', (t) => {
  const { dir, record } = indexedFixture(t);
  initialize(dir, { ...options, max_steps: 3 });
  begin(dir, 'create-plan');
  const old = record('plan', 'planning', 'plan', 'First plan');
  const first = gate(dir, old);
  answer(dir, old, first.hash, 'revise', 'Add executable steps');
  assert.throws(() => completedRevision(dir, old), /Dispatch the matching revision phase/);
  begin(dir, 'iterate-plan');
  const revised = record('plan', 'planning', 'plan', 'Executable plan');
  assert.throws(() => completedRevision(dir, old), /Revision did not change the reviewed artifact/);
  completedRevision(dir, revised);
  assert.throws(() => gate(dir, old), /does not match the current iterate-plan phase artifact/);
  const pending = gate(dir, revised);
  assert.equal(pending.approved, false);
  answer(dir, revised, pending.hash, 'approve');
  assert.equal(inspect(dir).revision_required, false);
  begin(dir, 'review-code');
  assert.equal(inspect(dir).steps, 3);
});

test('same-skill epic revisions require redispatch and a new indexed iteration', (t) => {
  const { dir, record } = indexedFixture(t);
  initialize(dir, { ...options, max_steps: 3 });
  begin(dir, 'create-epic-plan');
  const old = record('epic-plan', 'planning', 'epic', 'Initial epic');
  const first = gate(dir, old);
  answer(dir, old, first.hash, 'revise', 'Add implementation order');
  assert.throws(() => completedRevision(dir, old), /Dispatch the matching revision phase/);
  begin(dir, 'create-epic-plan');
  const revised = record('epic-plan', 'planning', 'epic', 'Ordered epic');
  completedRevision(dir, revised);
  const pending = gate(dir, revised);
  assert.equal(pending.approved, false);
  answer(dir, revised, pending.hash, 'approve');
  assert.equal(inspect(dir).revision_required, false);
});

test('legacy indexed and indexless revision gates replay in a fresh child without another step', (t) => {
  for (const indexed of [true, false]) {
    const setup = indexed ? indexedFixture(t) : fixture(t);
    const { dir } = setup;
    initialize(dir, { ...options, max_steps: 1 });
    if (!indexed) fs.unlinkSync(setup.file);
    begin(dir, 'create-plan');
    const original = indexed
      ? setup.record('plan', 'planning', 'plan', 'Initial plan')
      : setup.file;
    if (!indexed) fs.writeFileSync(original, '---\ntype: plan\nsummary: Initial plan\n---\nInitial plan\n');
    const pending = gate(dir, original);
    const stateFile = path.join(dir, '.first-sergent-state.json');
    const legacy = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    delete legacy.completed_step;
    delete legacy[indexed ? 'phase_artifact_before' : 'phase_legacy_before'];
    fs.writeFileSync(stateFile, JSON.stringify(legacy));
    assert.equal(inspect(dir).legacy_replay, true);
    answer(dir, original, pending.hash, 'revise', 'Make the plan executable');
    startFreshSession(dir, 'new-child');
    assert.equal(inspect(dir).resume_step, 1);
    begin(dir, 'create-plan');
    const revised = indexed
      ? setup.record('plan', 'planning', 'plan', 'Executable plan')
      : original;
    if (!indexed) fs.writeFileSync(revised, '---\ntype: plan\nsummary: Executable plan\n---\nExecutable plan\n');
    completedRevision(dir, revised);
    const review = gate(dir, revised);
    assert.equal(review.approved, false);
    answer(dir, revised, review.hash, 'approve');
    assert.equal(inspect(dir).steps, 1);
    assert.equal(inspect(dir).revision_required, false);
  }
});

test('persisted old revision records migrate before dispatch or in-flight completion', (t) => {
  for (const dispatched of [false, true]) {
    const { dir, file } = fixture(t);
    initialize(dir, { ...options, max_steps: 2 });
    if (dispatched) {
      fs.unlinkSync(file);
      begin(dir, 'create-plan');
      fs.writeFileSync(file, '---\ntype: plan\nsummary: First plan\n---\nFirst plan\n');
    }
    const pending = gate(dir, file);
    answer(dir, file, pending.hash, 'revise', 'Add executable steps');
    if (dispatched) begin(dir, 'iterate-plan');
    const stateFile = path.join(dir, '.first-sergent-state.json');
    const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    delete old.revision.step;
    delete old.revision.phaseType;
    fs.writeFileSync(stateFile, JSON.stringify(old));
    assert.equal(inspect(dir).revision.step, dispatched ? 1 : 0);
    assert.equal(inspect(dir).revision.phaseType, 'plan');
    if (!dispatched) begin(dir, 'iterate-plan');
    fs.writeFileSync(file, '---\ntype: plan\nsummary: Executable plan\n---\nExecutable plan\n');
    completedRevision(dir, file);
    const review = gate(dir, file);
    answer(dir, file, review.hash, 'approve');
    assert.equal(inspect(dir).revision_required, false);
  }
});

test('review findings dispatch a fixes receipt and require a fresh code review', (t) => {
  const { dir, record } = indexedFixture(t);
  initialize(dir, { ...options, max_steps: 4 });
  begin(dir, 'review-code');
  const findings = record('code-review', 'review', 'code', 'Required finding', 'findings');
  const pending = gate(dir, findings);
  answer(dir, findings, pending.hash, 'revise', 'Fix the required finding');
  assert.throws(() => begin(dir, 'implement-plan'), /requested artifact revision/);
  begin(dir, 'fix-code-review');
  const fixes = record('code-review-fixes', 'review', 'fixes', 'Finding fixed');
  completedRevision(dir, fixes);
  const review = gate(dir, fixes);
  answer(dir, fixes, review.hash, 'revise', 'Document verification of the fix');
  assert.throws(() => begin(dir, 'review-code'), /requested artifact revision/);
  begin(dir, 'fix-code-review');
  const revisedFixes = record('code-review-fixes', 'review', 'fixes', 'Verified finding fix');
  completedRevision(dir, revisedFixes);
  const revisedReview = gate(dir, revisedFixes);
  answer(dir, revisedFixes, revisedReview.hash, 'approve');
  assert.throws(() => begin(dir, 'describe-pr'), /Review the code again/);
  begin(dir, 'review-code');
  const clean = record('code-review', 'review', 'code', 'Fresh clean review', 'clean');
  assert.equal(gate(dir, clean).approved, false);
});

test('true-base legacy revision at the step bound can replay and complete', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, { ...options, max_steps: 1 });
  fs.unlinkSync(file);
  begin(dir, 'create-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Original plan\n---\nOriginal plan\n');
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'revise', 'Improve the plan');
  const stateFile = path.join(dir, '.first-sergent-state.json');
  const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  delete old.revision.step;
  delete old.revision.phaseType;
  delete old.revision_required;
  delete old.phase_legacy_before;
  delete old.completed_step;
  fs.writeFileSync(stateFile, JSON.stringify(old));
  assert.equal(inspect(dir).legacy_replay, true);
  assert.equal(inspect(dir).revision_required, '01-plan.md');
  startFreshSession(dir, 'fresh-revision-child');
  begin(dir, 'create-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Improved plan\n---\nImproved plan\n');
  completedRevision(dir, file);
  const changed = gate(dir, file);
  answer(dir, file, changed.hash, 'approve');
  assert.equal(inspect(dir).steps, 1);
});

test('stale legacy pending human gate refreshes without completing the replay', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, { ...options, max_steps: 1 });
  fs.unlinkSync(file);
  begin(dir, 'create-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Old draft\n---\nOld draft\n');
  const pending = gate(dir, file);
  const stateFile = path.join(dir, '.first-sergent-state.json');
  const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  delete old.phase_legacy_before;
  delete old.completed_step;
  fs.writeFileSync(stateFile, JSON.stringify(old));
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Changed before approval\n---\nChanged before approval\n');
  assert.throws(() => answer(dir, file, pending.hash, 'approve'), /Stale gate/);
  const replaced = gate(dir, file);
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.approved, false);
  answer(dir, file, replaced.hash, 'approve');
  assert.equal(inspect(dir).legacy_replay, true);
  startFreshSession(dir, 'new-child');
  begin(dir, 'create-plan');
  assert.throws(() => gate(dir, file), /fresh legacy artifact/);
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Created after replay\n---\nCreated after replay\n');
  assert.equal(gate(dir, file).approved, false);
});

test('three-digit numbered legacy artifacts are snapshotted and gated', (t) => {
  const { dir } = fixture(t);
  const old = path.join(dir, '100-implementation-old.md');
  const fresh = path.join(dir, '101-implementation-new.md');
  fs.writeFileSync(old, '---\ntype: implementation\nsummary: Old\n---\nOld receipt\n');
  initialize(dir, { ...options, gates: 'none' });
  begin(dir, 'implement-plan');
  assert.throws(() => gate(dir, old), /has not produced a fresh legacy artifact/);
  fs.writeFileSync(fresh, '---\ntype: implementation\nsummary: New\n---\nNew receipt\n');
  assert.equal(gate(dir, fresh).approved, true);
});

test('a revision can resume in a fresh child after the context threshold', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, { ...options, max_steps: 3, context_policy: 'stop-at-60' });
  const metric = (sessionId, percent) => ({ sessionId, contextUsage: { tokens: percent, contextWindow: 100, percent } });
  checkpointContext(dir, metric('child-a', 20));
  begin(dir, 'create-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Proposed\n---\nProposed plan\n');
  const first = gate(dir, file);
  answer(dir, file, first.hash, 'revise', 'Add executable steps');
  checkpointContext(dir, metric('child-a', 20));
  assert.throws(() => begin(dir, 'iterate-plan'), /Register a fresh child session/);
  startFreshSession(dir, 'child-b');
  checkpointContext(dir, metric('child-b', 10));
  begin(dir, 'iterate-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Executable\n---\nExecutable plan\n');
  completedRevision(dir, file);
  checkpointContext(dir, metric('child-b', 60));
  startFreshSession(dir, 'child-c');
  assert.equal(inspect(dir).resume_step, 2);
  checkpointContext(dir, metric('child-c', 10));
  begin(dir, 'iterate-plan');
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
});

test('unfinished local revision resumes at the same bounded step after a fresh child', (t) => {
  const { dir, file } = fixture(t);
  const metric = (sessionId, percent) => ({ sessionId, contextUsage: { tokens: percent, contextWindow: 100, percent } });
  initialize(dir, { ...options, gates: 'plan', context_policy: 'stop-at-60' });
  fs.unlinkSync(file);
  checkpointContext(dir, metric('child-a', 10));
  begin(dir, 'create-plan');
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Proposed\n---\nProposed plan\n');
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'revise', 'Add the executable steps');
  checkpointContext(dir, metric('child-a', 10));
  startFreshSession(dir, 'child-b');
  checkpointContext(dir, metric('child-b', 10));
  begin(dir, 'iterate-plan');
  checkpointContext(dir, metric('child-b', 60));
  startFreshSession(dir, 'child-c');
  assert.equal(inspect(dir).resume_step, 2);
  checkpointContext(dir, metric('child-c', 10));
  begin(dir, 'iterate-plan');
  assert.equal(inspect(dir).steps, 2);
  fs.writeFileSync(file, '---\ntype: plan\nsummary: Executable\n---\nExecutable plan\n');
  completedRevision(dir, file);
  const revised = gate(dir, file);
  assert.equal(revised.approved, false);
  answer(dir, file, revised.hash, 'approve');
  assert.equal(gate(dir, file).approved, true);
});

test('an in-phase question blocks outer gates until the same child finishes', (t) => {
  const { dir, file } = fixture(t);
  const prd = path.join(dir, '01-design-prd.md');
  initialize(dir, options);
  begin(dir, 'create-prd');
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
  const { dir, file } = fixture(t);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  assert.throws(() => begin(dir, 'create-plan'), /live context metric and child session identity/);
  checkpointContext(dir, { contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  assert.throws(() => begin(dir, 'create-plan'), /live context metric and child session identity/);
  checkpointContext(dir, { sessionId: 'current-session', contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  begin(dir, 'create-plan');
  fs.appendFileSync(file, '\nCompleted first plan.\n');
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'approve');
  checkpointContext(dir, { sessionId: 'current-session', contextUsage: { tokens: 25, contextWindow: 100, percent: 25 } });
  assert.throws(() => begin(dir, 'verify-implementation'), /Register a fresh child session/);
  startFreshSession(dir, 'next-session');
  assert.throws(() => begin(dir, 'verify-implementation'), /live context metric/);
  checkpointContext(dir, { sessionId: 'next-session', contextUsage: { tokens: 25, contextWindow: 100, percent: 25 } });
  begin(dir, 'verify-implementation');
  assert.equal(inspect(dir).steps, 2);
});

test('a second low-usage checkpoint from the old child cannot authorize the next phase', (t) => {
  const { dir, file } = fixture(t);
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  const metric = (sessionId) => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  checkpointContext(dir, metric('child-a'));
  begin(dir, 'create-plan');
  fs.appendFileSync(file, '\nCompleted first plan.\n');
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'approve');
  checkpointContext(dir, metric('child-a'));
  checkpointContext(dir, metric('child-a'));
  assert.throws(() => begin(dir, 'implement-plan'), /Register a fresh child session/);
  assert.equal(inspect(dir).steps, 1);
  startFreshSession(dir, 'child-b');
  assert.throws(() => begin(dir, 'implement-plan'), /live context metric/);
  checkpointContext(dir, metric('child-b'));
  begin(dir, 'implement-plan');
  assert.equal(inspect(dir).steps, 2);
});

test('legacy previous child is retired across reload and cannot be registered again', (t) => {
  const { dir, file } = fixture(t);
  const stateFile = path.join(dir, '.first-sergent-state.json');
  const metric = (sessionId) => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  initialize(dir, { ...options, context_policy: 'stop-at-60' });
  checkpointContext(dir, metric('child-a'));
  begin(dir, 'create-plan');
  fs.appendFileSync(file, '\nCompleted first plan.\n');
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'approve');
  checkpointContext(dir, metric('child-a'));
  startFreshSession(dir, 'child-b');
  const legacy = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  delete legacy.context_boundary.retiredSessionIds;
  fs.writeFileSync(stateFile, JSON.stringify(legacy));

  assert.deepEqual(inspect(dir).context_boundary.retiredSessionIds, ['child-a']);
  checkpointContext(dir, metric('child-a'));
  assert.equal(inspect(dir).context_boundary.action, 'recheck-required');
  checkpointContext(dir, metric('child-b'));
  assert.throws(() => startFreshSession(dir, 'child-a'), /retired child session/);
  begin(dir, 'implement-plan');
  assert.deepEqual(inspect(dir).context_boundary.retiredSessionIds, ['child-a']);
});


test('ordinary next-phase handoff admits a fresh child only after the prior live metric and gates', (t) => {
  const { dir } = fixture(t);
  const prd = path.join(dir, '01-design-prd.md');
  const tdd = path.join(dir, '01-design-tdd.md');
  initialize(dir, { ...options, max_steps: 3, context_policy: 'stop-at-60' });
  const metric = (sessionId, percent) => ({ sessionId, contextUsage: { tokens: percent, contextWindow: 100, percent } });
  checkpointContext(dir, metric('child-a', 20));
  begin(dir, 'create-prd');
  fs.writeFileSync(prd, '---\ntype: design-prd\nsummary: Approved PRD\n---\nApproved PRD\n');
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
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', proof), /matching phase/);
  const revised = { ...proof, descriptionHash: 'c'.repeat(64) };
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', revised), /matching phase/);
  begin(dir, 'describe-pr');
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', proof), /revision has not changed/);
  completeHostedPhase(dir, 'describe-pr', revised);
  answerHostedPhase(dir, revised, revised.descriptionHash, 'stop');
  assert.equal(inspect(dir).stopped, true);
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', revised), /active hosted-only phase/);
});

test('hosted description revision requires a fresh child and preserves the reviewed hash', (t) => {
  const { dir } = fixture(t);
  const metric = (sessionId) => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  const proof = {
    pullRequest: 'https://github.com/example/project/pull/17', head: 'a'.repeat(40),
    captureCurrent: true, captureHosted: true, commentVerified: true,
    bodyPublished: true, descriptionCurrent: true, descriptionHash: 'b'.repeat(64), allowed: true,
  };
  initialize(dir, { ...options, gates: 'pr', max_steps: 2, context_policy: 'stop-at-60' });
  checkpointContext(dir, metric('child-a'));
  begin(dir, 'describe-pr');
  completeHostedPhase(dir, 'describe-pr', proof);
  answerHostedPhase(dir, proof, proof.descriptionHash, 'revise', 'Explain the rollout');
  const revised = { ...proof, descriptionHash: 'c'.repeat(64) };
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', revised), /matching phase/);
  checkpointContext(dir, metric('child-a'));
  startFreshSession(dir, 'child-b');
  checkpointContext(dir, metric('child-b'));
  assert.throws(() => begin(dir, 'review-code'), /Verify hosted phase proof/);
  begin(dir, 'describe-pr');
  checkpointContext(dir, { sessionId: 'child-b', contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  startFreshSession(dir, 'child-c');
  assert.equal(inspect(dir).resume_step, 2);
  checkpointContext(dir, metric('child-c'));
  begin(dir, 'describe-pr');
  assert.equal(inspect(dir).steps, 2);
  assert.throws(() => completeHostedPhase(dir, 'describe-pr', proof), /revision has not changed/);
  const pending = completeHostedPhase(dir, 'describe-pr', revised);
  assert.equal(pending.approved, false);
  answerHostedPhase(dir, revised, pending.hash, 'approve');
  assert.equal(completeHostedPhase(dir, 'describe-pr', revised).approved, true);
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
  checkpointContext(dir, metric('child-b'));
  startFreshSession(dir, 'child-c');
  assert.equal(inspect(dir).resume_step, 2);
  assert.equal(inspect(dir).context_boundary.action, 'awaiting-checkpoint');
  checkpointContext(dir, metric('child-c'));
  assert.throws(() => begin(dir, 'review-code'), /Resume the checkpointed phase/);
  begin(dir, 'implement-plan');
  assert.equal(inspect(dir).steps, 2);
  assert.throws(() => gate(dir, first), /has not recorded a new artifact iteration/);
  const next = reserveArtifactIteration(dir, 'implementation', 'receipt');
  const stagingNext = path.join(dir, next.writePath);
  fs.writeFileSync(stagingNext, '---\ntype: implementation\nsummary: Replayed implementation\n---\nReplayed implementation\n');
  const second = path.join(dir, recordArtifact(dir, 'implementation', 'receipt', 'implementation', stagingNext).path);
  assert.equal(gate(dir, second).approved, false);
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
  assert.equal(inspect(dir).legacy_replay, true);
  assert.throws(() => begin(dir, 'review-code'), /Replay the legacy phase/);
  startFreshSession(dir, 'new-child');
  assert.throws(() => begin(dir, 'review-code'), /Resume the checkpointed phase/);
  begin(dir, 'implement-plan');
  assert.equal(inspect(dir).steps, 1);
  assert.throws(() => gate(dir, first), /has not recorded a new artifact iteration/);
});

test('indexless legacy phases reject old receipts under every no-human gate', (t) => {
  for (const gates of ['none', 'pr', 'plan']) {
    const { dir } = fixture(t);
    const old = path.join(dir, '01-implementation-sample.md');
    const older = path.join(dir, '00-implementation-sample.md');
    const fresh = path.join(dir, '02-implementation-sample.md');
    const receipt = (summary) => `---\ntype: implementation\nsummary: ${summary}\n---\n${summary}\n`;
    fs.writeFileSync(old, receipt('Previous phase'));
    fs.writeFileSync(older, receipt('Older phase'));
    initialize(dir, { ...options, gates });
    begin(dir, 'implement-plan');
    assert.throws(() => gate(dir, old), /has not produced a fresh legacy artifact/);
    assert.throws(() => gate(dir, older), /has not produced a fresh legacy artifact/);
    assert.equal(inspect(dir).completed_step, null);
    fs.writeFileSync(fresh, receipt('New phase'));
    assert.equal(gate(dir, fresh).approved, true);
    assert.equal(inspect(dir).completed_step, 1);
    begin(dir, 'implement-plan');
    assert.throws(() => gate(dir, fresh), /has not produced a fresh legacy artifact/);
    assert.equal(inspect(dir).completed_step, null);
  }
});

test('indexless completed legacy resume retains completion but incomplete state replays', (t) => {
  const { dir } = fixture(t);
  const file = path.join(dir, '01-implementation-sample.md');
  const newer = path.join(dir, '02-implementation-sample.md');
  initialize(dir, { ...options, max_steps: 3 });
  begin(dir, 'implement-plan');
  fs.writeFileSync(file, '---\ntype: implementation\nsummary: Finished\n---\nFinished\n');
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'approve');
  const stateFile = path.join(dir, '.first-sergent-state.json');
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  delete saved.phase_legacy_before;
  fs.writeFileSync(stateFile, JSON.stringify(saved));
  assert.equal(inspect(dir).completed_step, 1);
  assert.equal(gate(dir, file).approved, true);
  begin(dir, 'implement-plan');
  const incomplete = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  delete incomplete.phase_legacy_before;
  fs.writeFileSync(stateFile, JSON.stringify(incomplete));
  assert.equal(inspect(dir).legacy_replay, true);
  assert.throws(() => gate(dir, file), /Replay the legacy phase/);
  startFreshSession(dir, 'new-child');
  begin(dir, 'implement-plan');
  assert.throws(() => gate(dir, file), /has not produced a fresh legacy artifact/);
  fs.writeFileSync(newer, '---\ntype: implementation\nsummary: Replayed\n---\nReplayed\n');
  assert.equal(gate(dir, newer).approved, false);
});

test('indexless legacy replay waits for a different child and same-skill dispatch under no-human gates', (t) => {
  for (const gates of ['none', 'pr', 'plan']) {
    const { dir } = fixture(t);
    const stale = path.join(dir, '01-implementation-sample.md');
    const beforeReplay = path.join(dir, '02-implementation-sample.md');
    const receipt = (summary) => `---\ntype: implementation\nsummary: ${summary}\n---\n${summary}\n`;
    const metric = (sessionId) => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
    initialize(dir, { ...options, gates, context_policy: 'stop-at-60' });
    checkpointContext(dir, metric('old-child'));
    begin(dir, 'implement-plan');
    fs.writeFileSync(stale, receipt('Old child receipt'));
    const stateFile = path.join(dir, '.first-sergent-state.json');
    const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    delete old.phase_legacy_before;
    delete old.completed_step;
    fs.writeFileSync(stateFile, JSON.stringify(old));
    assert.equal(inspect(dir).legacy_replay, true);

    fs.writeFileSync(stale, receipt('Changed before replay'));
    fs.writeFileSync(beforeReplay, receipt('Created before replay'));
    assert.throws(() => gate(dir, stale), /Replay the legacy phase/);
    assert.throws(() => gate(dir, beforeReplay), /Replay the legacy phase/);
    assert.equal(inspect(dir).completed_step, undefined);
    assert.equal(inspect(dir).legacy_replay, true);
    checkpointContext(dir, metric('old-child'));
    assert.throws(() => startFreshSession(dir, 'old-child'), /Fresh session identity must be new/);
    startFreshSession(dir, 'new-child');
    fs.writeFileSync(stale, receipt('Changed after child registration but before dispatch'));
    assert.throws(() => gate(dir, beforeReplay), /Resume the checkpointed phase/);
    assert.throws(() => begin(dir, 'review-code'), /live context metric and child session identity/);
    checkpointContext(dir, metric('new-child'));
    assert.throws(() => begin(dir, 'review-code'), /Resume the checkpointed phase/);
    begin(dir, 'implement-plan');
    assert.equal(inspect(dir).steps, 1);
    assert.equal(inspect(dir).legacy_replay, undefined);
    assert.throws(() => gate(dir, stale), /has not produced a fresh legacy artifact/);
    assert.throws(() => gate(dir, beforeReplay), /has not produced a fresh legacy artifact/);
    fs.writeFileSync(beforeReplay, receipt('Changed after replay dispatch'));
    assert.equal(gate(dir, beforeReplay).approved, true);
    assert.equal(inspect(dir).completed_step, 1);
  }
});

test('legacy no-human policies replay unapproved indexed artifacts in a new child below threshold', (t) => {
  for (const gates of ['none', 'pr']) {
    const { dir, record, legacy } = indexedFixture(t);
    initialize(dir, { ...options, gates, max_steps: 3, context_policy: 'stop-at-60' });
    const metric = (sessionId) => ({ sessionId, contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
    checkpointContext(dir, metric('old-child'));
    begin(dir, 'implement-plan');
    const stale = record('implementation', 'implementation', 'receipt', 'Already indexed without approval');
    legacy();
    assert.equal(inspect(dir).completed_step, null);
    assert.equal(inspect(dir).legacy_replay, true);
    assert.throws(() => gate(dir, stale), /has not recorded a new artifact iteration/);
    checkpointContext(dir, metric('old-child'));
    assert.throws(() => begin(dir, 'review-code'), /Replay the legacy phase/);
    startFreshSession(dir, 'new-child');
    assert.equal(inspect(dir).resume_step, 1);
    assert.throws(() => startFreshSession(dir, 'another-child'), /measured context boundary/);
    checkpointContext(dir, metric('new-child'));
    begin(dir, 'implement-plan');
    assert.equal(inspect(dir).steps, 1);
    assert.throws(() => gate(dir, stale), /has not recorded a new artifact iteration/);
    const replayed = record('implementation', 'implementation', 'receipt', 'Fresh replay');
    assert.equal(gate(dir, replayed).approved, true);
    assert.equal(inspect(dir).completed_step, 1);
    assert.deepEqual(inspect(dir).approvals, {});
    checkpointContext(dir, metric('new-child'));
    startFreshSession(dir, 'third-child');
    checkpointContext(dir, metric('third-child'));
    begin(dir, 'implement-plan');
    assert.throws(() => gate(dir, replayed), /has not recorded a new artifact iteration/);
  }
});

test('indexed legacy replay snapshots iterations recorded after inspect but before dispatch', (t) => {
  for (const gates of ['none', 'pr', 'plan']) {
    const { dir, record, legacy } = indexedFixture(t);
    initialize(dir, { ...options, gates });
    begin(dir, 'implement-plan');
    const old = record('implementation', 'implementation', 'receipt', 'Old child receipt');
    legacy();
    assert.equal(inspect(dir).legacy_replay, true);
    const beforeDispatch = record('implementation', 'implementation', 'receipt', 'Recorded before replay dispatch');
    startFreshSession(dir, 'new-child');
    begin(dir, 'implement-plan');
    assert.equal(inspect(dir).phase_artifact_before.id, 'implementation.receipt.0002');
    assert.throws(() => gate(dir, old), /does not match the current implement-plan phase artifact/);
    assert.throws(() => gate(dir, beforeDispatch), /has not recorded a new artifact iteration/);
    assert.equal(inspect(dir).completed_step, null);
    const fresh = record('implementation', 'implementation', 'receipt', 'Recorded after replay dispatch');
    assert.equal(gate(dir, fresh).approved, true);
    assert.equal(inspect(dir).completed_step, 1);
  }
});

test('artifact index mode cannot change between dispatch and gate', (t) => {
  for (const gates of ['none', 'pr', 'plan']) {
    const { dir, record } = indexedFixture(t);
    initialize(dir, { ...options, gates });
    begin(dir, 'implement-plan');
    const fresh = record('implementation', 'implementation', 'receipt', 'New implementation');
    fs.unlinkSync(path.join(dir, 'index.json'));
    assert.throws(() => gate(dir, fresh), /Artifact index mode changed since dispatch/);
    assert.equal(inspect(dir).completed_step, null);

    const { dir: root } = fixture(t);
    const indexless = path.join(root, 'sample');
    fs.mkdirSync(indexless);
    fs.writeFileSync(path.join(indexless, 'task.md'), '---\nslug: sample\n---\nOriginal user request\n');
    initialize(indexless, { ...options, gates });
    begin(indexless, 'implement-plan');
    initTaskArtifacts(indexless);
    const allocation = reserveArtifactIteration(indexless, 'implementation', 'receipt');
    const staging = path.join(indexless, allocation.writePath);
    fs.writeFileSync(staging, '---\ntype: implementation\nsummary: Indexed later\n---\nIndexed later\n');
    const later = path.join(indexless, recordArtifact(indexless, 'implementation', 'receipt', 'implementation', staging).path);
    assert.throws(() => gate(indexless, later), /Artifact index mode changed since dispatch/);
    assert.equal(inspect(indexless).completed_step, null);
  }
});

test('old approvals from unrelated and repeated phases never complete a new legacy phase', (t) => {
  const { dir, record, legacy } = indexedFixture(t);
  initialize(dir, { ...options, max_steps: 4 });
  begin(dir, 'implement-plan');
  for (const summary of ['First implementation', 'Revised implementation']) {
    const file = record('implementation', 'implementation', 'receipt', summary);
    const pending = gate(dir, file);
    answer(dir, file, pending.hash, 'approve');
  }
  begin(dir, 'create-research');
  const research = record('research', 'research', 'primary', 'Research');
  const pending = gate(dir, research);
  answer(dir, research, pending.hash, 'approve');
  begin(dir, 'implement-plan');
  legacy();
  const stale = path.join(dir, 'artifacts/implementation/receipt/0002.md');
  assert.equal(inspect(dir).completed_step, null);
  assert.equal(inspect(dir).legacy_replay, true);
  assert.throws(() => gate(dir, stale), /has not recorded a new artifact iteration/);
  assert.throws(() => begin(dir, 'review-code'), /Replay the legacy phase/);
  startFreshSession(dir, 'new-child');
  assert.throws(() => startFreshSession(dir, 'new-child'), /already-registered/);
  assert.throws(() => begin(dir, 'review-code'), /Resume the checkpointed phase/);
  begin(dir, 'implement-plan');
  assert.equal(inspect(dir).steps, 3);
  assert.throws(() => gate(dir, stale), /has not recorded a new artifact iteration/);
  const fresh = record('implementation', 'implementation', 'receipt', 'Third implementation');
  assert.equal(gate(dir, fresh).approved, false);
  assert.equal(inspect(dir).approvals[path.relative(dir, fresh)], undefined);
  answer(dir, fresh, inspect(dir).pending.hash, 'approve');
  assert.equal(inspect(dir).completed_step, 3);
  begin(dir, 'review-code');
  assert.equal(inspect(dir).steps, 4);
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
  fs.appendFileSync(file, '\nCompleted first plan.\n');
  const first = gate(dir, file);
  answer(dir, file, first.hash, 'approve');
  assert.equal(inspect(dir).steps, 1);
  assert.equal(inspect(dir).context_boundary.sessionId, 'new-session');
  checkpointContext(dir, { sessionId: 'old-session', contextUsage: { tokens: 20, contextWindow: 100, percent: 20 } });
  assert.equal(inspect(dir).context_boundary.action, 'recheck-required');
  checkpointContext(dir, { sessionId: 'new-session', contextUsage: { tokens: 25, contextWindow: 100, percent: 25 } });
  assert.throws(() => begin(dir, 'create-plan'), /Register a fresh child session/);
  startFreshSession(dir, 'next-session');
  checkpointContext(dir, { sessionId: 'next-session', contextUsage: { tokens: 25, contextWindow: 100, percent: 25 } });
  begin(dir, 'create-plan');
  checkpointContext(dir, { sessionId: 'next-session', contextUsage: { tokens: 60, contextWindow: 100, percent: 60 } });
  startFreshSession(dir, 'third-session');
  assert.equal(inspect(dir).resume_step, 2);
  checkpointContext(dir, { sessionId: 'third-session', contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } });
  begin(dir, 'create-plan');
  fs.appendFileSync(file, '\nFresh third-session plan revision.\n');
  assert.equal(inspect(dir).steps, 2);
  const pending = gate(dir, file);
  answer(dir, file, pending.hash, 'approve');
  checkpointContext(dir, { sessionId: 'third-session', contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } });
  startFreshSession(dir, 'fourth-session');
  checkpointContext(dir, { sessionId: 'fourth-session', contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } });
  begin(dir, 'review-code');
  assert.equal(inspect(dir).context_boundary.sessionId, 'fourth-session');
  assert.deepEqual(inspect(dir).context_boundary.retiredSessionIds, ['old-session', 'new-session', 'next-session', 'third-session']);
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
