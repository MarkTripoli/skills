import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SKILLS, artifactGate, boundaryState, contextBoundaryAdmission, eligible, gated, initialState, judgment, reconcileRecovery, runSkill, stagePrompt } from '../atomic/lib/controller.mjs';
import { admitPlanWaves } from '../atomic/lib/plan-waves.mjs';
import { digest, observeArtifacts, planProgress, readArtifact } from '../atomic/lib/artifacts.mjs';
import { ensureTask, revision } from '../atomic/lib/workspace.mjs';

const inputs = { verify: false, app_test: 'none' };
const state = (latest = {}, proofs = {}) => ({ latest, proofs, revision: 'r1', generation: 0, approvals: {} });
const artifact = (type, status = null) => ({ type, status, hash: `${type}-hash`, file: `${type}.md`, summary: type });
const proved = (latest, types, generation = 0, codeRevision = 'r1') => ({
  ...state(latest, Object.fromEntries(types.map(type => [type, { hash: latest[type].hash, generation, revision: codeRevision }]))),
  generation, revision: codeRevision,
});

test('plan-wave admission matches planProgress headings and ignores fenced examples', () => {
  const phase = (heading, dependency, file) =>
    `${heading}\n\n**Depends on**: ${dependency}\n\n#### 1.1 Edit\n**File**: \`${file}\`\n**Changes**: Update it.\n`;
  const plan = `${phase('## Phase 1', '-', 'src/a.ts')}\n${phase('### Phase 2: Work', '-', 'src/b.ts')}\n${phase('## Phase 3: Final', 'Phase 1, 2', 'src/c.ts')}`;
  assert.deepEqual(admitPlanWaves(plan), { ok: true, waves: [['1', '2'], ['3']] });
  const interleaved = `${phase('## Phase 1', '-', 'src/a.ts')}\n${phase('## Phase 2', 'Phase 1', 'src/b.ts')}\n${phase('## Phase 3', '-', 'src/c.ts')}`;
  assert.deepEqual(admitPlanWaves(interleaved), { ok: true, waves: [['1'], ['2', '3']] });
  const dependencyGap = `${phase('## Phase 1', '-', 'src/a.ts')}\n${phase('## Phase 2', 'Phase 1', 'src/b.ts')}\n${phase('## Phase 3', '-', 'src/a.ts')}`;
  assert.deepEqual(admitPlanWaves(dependencyGap), { ok: true, waves: [['1'], ['2', '3']] });
  const padded = `${phase('## Phase 01', '-', 'src/a.ts')}\n${phase('## Phase 02', 'Phase 1', 'src/b.ts')}`;
  assert.deepEqual(admitPlanWaves(padded), { ok: true, waves: [['1'], ['2']] });
  assert.deepEqual(admitPlanWaves(`${phase('## Phase 1', '-', 'src/a.ts')}\n${phase('## Phase 02', 'Phase 01', 'src/b.ts')}`), { ok: true, waves: [['1'], ['2']] });
  assert.match(admitPlanWaves(`${phase('## Phase 01', '-', 'src/a.ts')}\n${phase('## Phase 1', '-', 'src/b.ts')}`).error, /Duplicate phase 1/);
  assert.deepEqual(admitPlanWaves(`${phase('## Phase 1', '-', 'src/a.ts')}\n\`\`\`md\n## Phase 2: Example\n**Depends on**: -\n**File**: \`src/a.ts\`\n\`\`\``), { ok: true, waves: [['1']] });
  const nestedFence = `${phase('## Phase 1', '-', 'src/a.ts')}\n\`\`\`\`markdown\n\`\`\`js\n**File**: \`src/b.ts\`\n\`\`\`\n\`\`\`\`\n${phase('## Phase 2', '-', 'src/b.ts')}`;
  assert.deepEqual(admitPlanWaves(nestedFence), { ok: true, waves: [['1', '2']] });
  const indentedOwner = `${phase('## Phase 1', '-', 'src/a.ts')}\n\n    **File**: \`src/b.ts\`\n${phase('## Phase 2', '-', 'src/b.ts')}`;
  assert.deepEqual(admitPlanWaves(indentedOwner), { ok: true, waves: [['1', '2']] });
  const indentedFenceCloser = [
    phase('## Phase 1', '-', 'src/a.ts').trimEnd(), '````markdown', '    ````',
    '### Phase 9: Example', '**Depends on**: -', '**File**: `src/a.ts`',
    '````', phase('## Phase 2', '-', 'src/b.ts').trimEnd(),
  ].join('\n');
  assert.deepEqual(admitPlanWaves(indentedFenceCloser), { ok: true, waves: [['1', '2']] });
  assert.match(admitPlanWaves(`## Phase 1: First\n\n**File**: \`src/a.ts\``).error, /Depends on/);
  assert.match(admitPlanWaves(`${phase('## Phase 1: First', 'Phase 2', 'src/a.ts')}\n${phase('## Phase 2: Second', '-', 'src/b.ts')}`).error, /appears later/);
  assert.match(admitPlanWaves(`${phase('## Phase 1: First', 'Phase 2', 'src/a.ts')}\n${phase('## Phase 2: Second', 'Phase 1', 'src/b.ts')}`).error, /cycle/);
  assert.match(admitPlanWaves(`${phase('## Phase 1: First', '-', 'src/a.ts')}\n${phase('## Phase 2: Second', 'Phase 9', 'src/b.ts')}`).error, /unknown phase/);
  assert.match(admitPlanWaves(`${phase('## Phase 1: First', '-', 'src/shared')}\n${phase('## Phase 2: Second', '-', 'src/shared/child')}`).error, /overlapping declared file scope/);
  assert.match(admitPlanWaves(`${phase('## Phase 1: First', '-', '../outside.ts')}`).error, /unsafe or ambiguous/);
  assert.match(admitPlanWaves('## Phase Not numbered\\n').error, /Malformed numbered phase heading/);
});
test('final checklist closure does not excuse changed dependency or file ownership', () => {
  const before = [
    '## Phase 1', '**Depends on**: -', '**File**: `src/a.ts`', '- [x] Implement phase one',
    '## Phase 2', '**Depends on**: Phase 1', '**File**: `src/b.ts`', '- [ ] Implement phase two',
  ].join('\n');
  assert.deepEqual(admitPlanWaves(before), { ok: true, waves: [['1'], ['2']] });
  const finished = before.replace('[ ] Implement phase two', '[x] Implement phase two');
  assert.equal(planProgress(finished).complete, true);
  assert.deepEqual(admitPlanWaves(finished), { ok: true, waves: [['1'], ['2']] });
  for (const [revised, reason] of [
    [finished.replace('src/b.ts', '../outside.ts'), /unsafe or ambiguous file path/],
    [finished.replace('**Depends on**: Phase 1', '**Depends on**: Phase 9'), /unknown phase 9/],
    [finished.replace('**File**: `src/b.ts`', '**Changes**: Update phase two.'), /unknown file ownership/],
  ]) {
    assert.equal(planProgress(revised).complete, true);
    assert.match(admitPlanWaves(revised).error, reason);
  }
});
test('plan implementation prompt binds work to admitted dependency waves', () => {
  const source = { ...artifact('plan'), text: '# Plan\n\n## Phase 1\n' };
  const prompt = stagePrompt(
    { skillsDir: '/skills', cwd: '/repo', taskDir: '/task' },
    'implement-plan', state({ plan: source }), { ...inputs, dependency_waves: [['1', '2'], ['3']] },
  );
  assert.match(prompt, /dependencyWaves are ordered as 1, 2 → 3/);
  assert.match(prompt, /do not launch parallel workers/);
});

test('blocked verification for unproved acceptance cannot advance to review', () => {
  const latest = {
    implementation: artifact('implementation'),
    verification: artifact('verification', 'blocked'),
  };
  const current = proved(latest, ['verification']);
  assert.deepEqual(eligible(current, { verify: true, app_test: 'none' }, 'oneshot', false), ['blocked']);
});
test('fixed modes enforce preparation prerequisites and canonical design artifact types', () => {
  assert.deepEqual(eligible(state(), inputs, 'prd', false), ['create-research']);
  assert.deepEqual(eligible(state({ research: artifact('research') }), inputs, 'prd', false), ['create-prd']);
  assert.deepEqual(eligible(state({ research: artifact('research'), 'design-prd': artifact('design-prd') }), inputs, 'prd', false), ['create-tdd']);
  assert.deepEqual(eligible(state(), inputs, 'full', true), ['gather-sources', 'create-research-questions']);
});

test('oneshot uses a bounded direct implementation action and bugfix repairs remain eligible without a plan', () => {
  assert.deepEqual(eligible(state(), inputs, 'oneshot', false), ['implement-task']);
  assert.deepEqual(eligible(state({ reproduction: artifact('reproduction', 'reproduced'), fix: artifact('fix') }), inputs, 'bugfix', false), ['review-code']);
});

test('complete plan without receipt is blocked instead of replaying an impossible implementation phase', () => {
  const plan = artifact('plan');
  plan.text = '# Plan\n\n## Phase 1\n- [x] Implement the change\n';
  assert.deepEqual(eligible(state({ plan }), inputs, 'full', false), ['blocked']);
  assert.deepEqual(eligible(state({ plan }), inputs, 'full', true), ['blocked']);
});

const validSource = (type = 'plan') => ({ ...artifact(type), text: `# Source\n\n## Phase 1\n- [ ] Implement the change\n` });
const malformedSource = (type = 'plan') => ({ ...artifact(type), text: '# Source\n\n```diff\n## Phase 1\n- [ ] Implement the change\n+```\n' });

test('malformed authoritative plan routes to revision, reports the parse error, then resumes implementation', () => {
  const plan = malformedSource('plan');
  const outline = validSource('structure-outline');
  const broken = state({ plan, 'structure-outline': outline });
  const candidates = eligible(broken, inputs, 'full', false);
  assert.deepEqual(candidates, ['iterate-plan']);

  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-boundary-'));
  fs.writeFileSync(path.join(taskDir, 'task.md'), 'Recover malformed source\n');
  const boundary = boundaryState({ taskDir, mode: 'full' }, broken, candidates);
  assert.equal(boundary.implementation.valid, false);
  assert.equal(boundary.implementation.source, 'plan.md');
  assert.match(boundary.implementation.error, /numbered phases with executable checklists/);
  assert.match(stagePrompt({ skillsDir: '/skills', cwd: '/repo', taskDir }, 'iterate-plan', broken, inputs), /balanced fences/);

  const corrected = state({ plan: validSource('plan'), 'structure-outline': outline });
  assert.deepEqual(eligible(corrected, inputs, 'full', false), ['implement-plan']);
  fs.rmSync(taskDir, { recursive: true, force: true });
});

test('malformed outline is revised instead of recreating preparation, while a valid plan keeps precedence', () => {
  assert.deepEqual(eligible(state({ 'structure-outline': malformedSource('structure-outline') }), inputs, 'lean', false), ['iterate-structure-outline']);
  assert.deepEqual(eligible(state({ plan: validSource('plan'), 'structure-outline': malformedSource('structure-outline') }), inputs, 'full', false), ['implement-plan']);
});

test('native no-progress receipt becomes persisted recovery and only revised source reopens implementation', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-recovery-'));
  initGit(repo);
  const taskDir = path.join(repo, '.agents', 'tasks', 'recovery');
  const skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-recovery-skills-'));
  fs.mkdirSync(path.join(skillsDir, 'route-model'), { recursive: true });
  fs.copyFileSync(path.resolve('skills/delivery/route-model/route-model.mjs'), path.join(skillsDir, 'route-model', 'route-model.mjs'));
  fs.copyFileSync(path.resolve('skills/delivery/route-model/quota.mjs'), path.join(skillsDir, 'route-model', 'quota.mjs'));
  fs.mkdirSync(path.join(skillsDir, 'implement-plan'), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'implement-plan', 'SKILL.md'), '# implement-plan\n');
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'task.md'), 'Recover a blocked implementation\n');
  fs.writeFileSync(path.join(taskDir, '01-plan.md'), '---\ntype: plan\nsummary: recovery plan\n---\n# Plan\n\n## Phase 1\n- [ ] Implement the change\n');
  const plan = readArtifact(path.join(taskDir, '01-plan.md'));
  const beforeRevision = revision(repo);
  const before = { ...state({ plan }, { verification: { generation: 0, revision: beforeRevision, hash: 'verification' }, 'code-review': { generation: 0, revision: beforeRevision, hash: 'review' } }), revision: beforeRevision, hashes: {} };
  const task = { taskDir, cwd: repo, skillsDir, runId: 'recovery-run' };
  const ctx = {
    tool: async (_name, _args, callback) => callback(),
    task: async () => {
      fs.writeFileSync(path.join(repo, 'implementation.js'), 'safety closure\n');
      fs.writeFileSync(path.join(taskDir, '02-implementation.md'), '---\ntype: implementation\nsummary: implementation completed\n---\n# Receipt\n\nImplementation completed.\n');
      return { sessionId: 'native-session', text: 'Implementation completed.' };
    },
  };
  const next = await runSkill(ctx, task, before, { ...inputs, model: 'test-model', model_routing: 'fixed' }, 'implement-plan', 1);
  assert.equal(next.recovery.status, 'blocked');
  assert.deepEqual(eligible(next, inputs, 'full', true), ['iterate-plan', 'iterate-implementation', 'blocked']);
  assert.equal(fs.existsSync(path.join(taskDir, '.atomic-delivery', 'recovery-run', '001-implement-plan-recovery.json')), true);
  assert.equal(next.generation, 1);
  assert.equal(next.revision, revision(repo));
  assert.equal(next.proofs.verification.generation, 0);
  const boundary = boundaryState(task, next, eligible(next, inputs, 'full', true));
  assert.equal(boundary.recovery.receipt.file, path.join(taskDir, '02-implementation.md'));
  assert.equal(boundary.recovery.source.file, path.join(taskDir, '01-plan.md'));
  assert.match(boundary.recovery.reason, /fresh implementation receipt did not advance/i);
  assert.match(stagePrompt(task, 'iterate-plan', next, inputs), /02-implementation\.md/);

  // A no-op repair remains repair-only; changing the authoritative source is enough
  // to permit the next legitimate implementation attempt even at the same count.
  assert.deepEqual(eligible(next, inputs, 'full', false), ['iterate-plan', 'iterate-implementation', 'blocked']);
  const noOpRepair = reconcileRecovery({ ...next, revision: 'repaired-code', latest: { ...next.latest, implementation: { ...next.latest.implementation, hash: 'new-receipt', summary: 'completed' } } });
  assert.equal(noOpRepair.recovery.status, 'blocked');
  const revised = { ...next, latest: { ...next.latest, plan: { ...next.latest.plan, hash: 'revised-plan' } } };
  assert.deepEqual(eligible(revised, inputs, 'full', false), ['implement-plan']);
  assert.equal(planProgress(revised.latest.plan.text).remaining, planProgress(next.latest.plan.text).remaining);
  // Once the repaired implementation is accepted, proofs from before the code mutation remain stale and route to review.
  const settled = { ...revised, recovery: null, latest: { ...revised.latest, plan: { ...revised.latest.plan, text: '# Plan\n\n## Phase 1\n- [x] Implement the change\n', hash: 'completed-plan' }, implementation: { ...revised.latest.implementation, hash: 'completed-implementation', summary: 'implemented', text: '# Receipt\n\nImplementation completed.\n' } } };
  assert.deepEqual(eligible(settled, inputs, 'full', false), ['review-code']);
  fs.rmSync(skillsDir, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});
test('observed checklist progress ignores blocked prose and fresh initial state does not infer recovery', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-progress-'));
  initGit(repo);
  const taskDir = path.join(repo, '.agents', 'tasks', 'progress');
  const skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-progress-skills-'));
  fs.mkdirSync(path.join(skillsDir, 'route-model'), { recursive: true });
  fs.copyFileSync(path.resolve('skills/delivery/route-model/route-model.mjs'), path.join(skillsDir, 'route-model', 'route-model.mjs'));
  fs.copyFileSync(path.resolve('skills/delivery/route-model/quota.mjs'), path.join(skillsDir, 'route-model', 'quota.mjs'));
  fs.mkdirSync(path.join(skillsDir, 'implement-plan'), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'implement-plan', 'SKILL.md'), '# implement-plan\n');
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'task.md'), 'Advance the implementation\n');
  fs.writeFileSync(path.join(taskDir, '01-plan.md'), '---\ntype: plan\nsummary: progress plan\n---\n# Plan\n\n## Phase 1\n- [ ] Implement phase one\n\n## Phase 2\n- [ ] Implement phase two\n');
  const plan = readArtifact(path.join(taskDir, '01-plan.md'));
  const beforeRevision = revision(repo);
  const before = { ...state({ plan }), revision: beforeRevision, hashes: {} };
  const task = { taskDir, cwd: repo, skillsDir, runId: 'progress-run' };
  const ctx = {
    tool: async (_name, _args, callback) => callback(),
    task: async () => {
      fs.writeFileSync(path.join(taskDir, '01-plan.md'), '---\ntype: plan\nsummary: progress plan\n---\n# Plan\n\n## Phase 1\n- [x] Implement phase one\n\n## Phase 2\n- [ ] Implement phase two\n');
      fs.writeFileSync(path.join(taskDir, '02-implementation.md'), '---\ntype: implementation\nsummary: blocked and unavailable behavior is documented\n---\n# Receipt\n\nThe implementation completed phase one; blocked and unavailable behavior remains fail-closed.\n');
      return { sessionId: 'progress-session', text: 'Completed phase one; blocked behavior remains fail-closed.' };
    },
  };
  const next = await runSkill(ctx, task, before, { ...inputs, model: 'test-model', model_routing: 'fixed' }, 'implement-plan', 1);
  assert.equal(next.recovery, undefined);
  assert.deepEqual(eligible(next, inputs, 'full', false), ['implement-plan']);
  assert.equal(boundaryState(task, next, ['implement-plan']).recovery, null);

  const fresh = initialState(observeArtifacts(taskDir), revision(repo));
  assert.deepEqual(eligible(fresh, inputs, 'full', false), ['implement-plan']);
  fs.rmSync(skillsDir, { recursive: true, force: true });
});

test('Atomic context policy blocks before a stage dispatch without live child telemetry', async () => {
  const boundary = contextBoundaryAdmission({ context_policy: 'stop-at-60' });
  assert.equal(boundary.action, 'stop');
  assert.match(boundary.reason, /no documented live child context telemetry/);
  assert.equal(contextBoundaryAdmission({ context_policy: 'off' }), null);
  let taskCalls = 0;
  let toolCalls = 0;
  const ctx = {
    tool: async () => { toolCalls += 1; },
    task: async () => { taskCalls += 1; },
  };
  await assert.rejects(
    runSkill(
      ctx,
      { taskDir: '/unreached', cwd: '/unreached', skillsDir: '/unreached' },
      state(),
      { ...inputs, context_policy: 'stop-at-60' },
      'create-research',
      1,
    ),
    /stage dispatch/,
  );
  assert.equal(taskCalls, 0);
  assert.equal(toolCalls, 0);
});

function judgmentFixture(response) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-controller-jev-'));
  const helperDir = path.join(dir, 'typed-judgment');
  fs.mkdirSync(helperDir);
  fs.writeFileSync(path.join(helperDir, 'judge.mjs'), `export let lastCall = { model: 'jev-test', usage: { input_tokens: 1 } }; export async function systemOne() { return ${JSON.stringify(response)}; }`);
  return dir;
}

test('closed-set action preference proceeds at moderate confidence and records the judgment', async () => {
  const dir = judgmentFixture({ next: { type: 'choice', choice: 'lean', confidence: 0.47, probabilities: { lean: 0.56, full: 0.31, oneshot: 0.13 } } });
  const result = await judgment(dir, { request: 'focused deliverable' }, { lean: 'focused research and outline', full: 'deep design', oneshot: 'bounded change' });
  assert.equal(result.choice, 'lean');
  assert.equal(result.confidence, 0.47);
  assert.deepEqual(result.probabilities, { lean: 0.56, full: 0.31, oneshot: 0.13 });
  assert.equal(result.model, 'jev-test');
  assert.deepEqual(result.usage, { input_tokens: 1 });
});

test('malformed or out-of-set action preference refuses without fallback', async () => {
  const dir = judgmentFixture({ next: { type: 'choice', choice: 'not-a-candidate', confidence: 0.9, probabilities: { lean: 1 } } });
  await assert.rejects(() => judgment(dir, { request: 'focused deliverable' }, { lean: 'focused research and outline' }), /valid eligible action/);
});

test('bugfix cannot select a fix before a reproduced defect', () => {
  assert.deepEqual(eligible(state({ reproduction: artifact('reproduction', 'not-reproduced') }), inputs, 'bugfix', false), ['blocked']);
  assert.deepEqual(eligible(state({ reproduction: artifact('reproduction', 'reproduced') }), inputs, 'bugfix', false), ['fix-bug']);
});

test('passed verification rejects unreachable evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-artifact-'));
  const file = path.join(dir, '01-verification-task.md');
  const header = `---\ntype: verification\nsummary: recorded checks\nstatus: passed\n---\n`;
  const table = '## Items\n\n| Id | Item | Verdict |\n|---|---|---|\n| C1 | check | unreachable |\n';
  fs.writeFileSync(file, header + table);
  assert.throws(() => readArtifact(file), /contradicts evidence/);
});

test('passed verification rejects unknown verdict rows even when another row passes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-artifact-'));
  const file = path.join(dir, '01-verification-task.md');
  const header = `---\ntype: verification\nsummary: recorded checks\nstatus: passed\n---\n`;
  const table = '## Items\n\n| Id | Item | Verdict |\n|---|---|---|\n| C1 | check | pass |\n| C2 | missing | maybe |\n';
  fs.writeFileSync(file, header + table);
  assert.throws(() => readArtifact(file), /contradicts evidence/);
});

test('a passed C-only verification cannot bypass task acceptance, but no-acceptance tasks may pass', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-acceptance-'));
  initGit(repo);
  const taskDir = path.join(repo, '.agents', 'tasks', 'acceptance');
  const skillsDir = path.join(repo, 'installed-skills');
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(path.join(skillsDir, 'verify-implementation'), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'verify-implementation', 'SKILL.md'), '# verify-implementation\n');
  fs.writeFileSync(path.join(taskDir, '01-implementation.md'), '---\ntype: implementation\nsummary: implemented\n---\n# Receipt\n\nImplemented change.\n');
  const latest = observeArtifacts(taskDir);
  const before = initialState(latest, revision(repo, '.agents/tasks'));
  const task = { taskDir, cwd: repo, taskRootRelative: '.agents/tasks', skillsDir, runId: 'acceptance-run' };
  const inputs = { verify: true, app_test: 'none', model: 'test-model', model_routing: 'fixed' };
  const header = '---\ntype: verification\nsummary: checks recorded\nstatus: passed\n---\n## Items\n\n| Id | Item | Verdict |\n|---|---|---|\n';
  let rows;
  const ctx = {
    tool: async (name, _args, callback) => name.endsWith('-select-model') ? { model: 'test-model' } : callback(),
    task: async () => {
      fs.writeFileSync(path.join(taskDir, '02-verification.md'), header + rows);
      return { sessionId: 'verifier', text: 'Verification finished.' };
    },
  };
  try {
    fs.writeFileSync(path.join(taskDir, 'task.md'), '# Task\n\n## Acceptance criteria\n\n- CLI reports the requested value.\n');
    rows = '| C1 | repository check | pass |\n';
    await assert.rejects(() => runSkill(ctx, task, before, inputs, 'verify-implementation', 1), /lacks an accepted A-row/);
    rows += '| A1 | CLI reports the requested value | pass |\n';
    const accepted = await runSkill(ctx, task, before, inputs, 'verify-implementation', 2);
    assert.deepEqual(eligible(accepted, inputs, 'oneshot', false), ['review-code']);
    fs.writeFileSync(path.join(taskDir, 'task.md'), '# Task\n\nNo acceptance items are specified for this task.\n');
    rows = '| C1 | repository check | pass |\n';
    const noAcceptance = await runSkill(ctx, task, before, inputs, 'verify-implementation', 3);
    assert.deepEqual(eligible(noAcceptance, inputs, 'oneshot', false), ['review-code']);
    fs.writeFileSync(path.join(taskDir, '03-plan.md'), '---\ntype: plan\nsummary: plan\n---\n# Plan\n\n## Desired End State\n\n- CLI returns a value visible to users.\n\n## Phase 1\n- [x] Implement the behavior\n');
    const planned = initialState(observeArtifacts(taskDir), revision(repo, '.agents/tasks'));
    rows = '| C1 | changed repository check | pass |\n';
    await assert.rejects(() => runSkill(ctx, task, planned, inputs, 'verify-implementation', 4), /lacks an accepted A-row/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

function initGit(dir) {
  const run = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'ignore' });
  run(['init', '-b', 'main']);
  run(['config', 'user.email', 'atomic-test@example.invalid']);
  run(['config', 'user.name', 'Atomic Test']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'test\n');
  run(['add', 'README.md']);
  run(['commit', '-m', 'initial']);
}

test('ensureTask recovers the same owned worktree on a partial retry', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-git-'));
  initGit(repo);
  const runId = `partial-${Date.now()}-${Math.random()}`;
  const options = { request: 'Recover partial workspace', branch: undefined };
  const first = ensureTask(options, repo, runId, 'oneshot');
  fs.rmSync(path.join(first.taskDir, 'task.md'));
  const resumed = ensureTask(options, repo, runId, 'oneshot');
  assert.equal(resumed.taskDir, first.taskDir);
  assert.equal(fs.existsSync(path.join(resumed.taskDir, 'task.md')), true);
  execFileSync('git', ['worktree', 'remove', '--force', first.cwd], { cwd: repo, stdio: 'ignore' });
  fs.rmSync(repo, { recursive: true, force: true });
});

test('ensureTask refuses an unrelated preexisting worktree path', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-git-'));
  initGit(repo);
  const runId = `unrelated-${Date.now()}-${Math.random()}`;
  const request = 'Refuse unrelated workspace';
  const slug = `${request.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 4).join('-')}-${digest(runId).slice(0, 8)}`;
  const target = path.join(os.homedir(), '.agents', 'worktrees', path.basename(repo), slug);
  fs.mkdirSync(target, { recursive: true });
  assert.throws(() => ensureTask({ request }, repo, runId, 'oneshot'), /already exists|refusing/);
  fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

test('PR-only approval gates select the pull request description', () => {
  assert.equal(gated('pr-description', 'pr'), true);
  assert.equal(gated('pr-review', 'pr'), false);
  assert.equal(gated('plan', 'pr'), false);
});

test('PR-only human approval follows the hosted body hash, never an ignored task description', async () => {
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-hosted-gate-'));
  try {
    const task = { taskDir, runId: 'gate-run' };
    const inputs = { gates: 'pr' };
    const hosted = { captureCurrent: true, captureHosted: true, commentVerified: true,
      reviewCurrent: true, verificationRequired: false, descriptionCurrent: true,
      pullRequest: 'https://github.com/example/repo/pull/1', descriptionHash: 'new-body' };
    const current = described(state({ 'pr-description': artifact('pr-description') }), hosted);
    const ctx = { ui: { select: async () => 'approve' }, tool: async (_name, _args, callback) => callback() };
    const approved = await artifactGate(ctx, task, inputs, current, 'pr-description', 'gate');
    assert.equal(approved.state.approvals['pr-description'], 'new-body');
    const revisedBody = { ...hosted, descriptionHash: 'revised-body' };
    const pending = { ...approved.state, hosted: revisedBody };
    assert.deepEqual(eligible(pending, inputs, 'oneshot', false), ['implement-task']);
    assert.equal((await artifactGate(ctx, task, inputs, pending, 'pr-description', 'gate-before-describe')).state, pending);
    const revised = described(approved.state, revisedBody);
    const stopped = await artifactGate({ ...ctx, ui: { select: async () => 'stop' } },
      task, inputs, revised, 'pr-description', 'gate-revised');
    assert.equal(stopped.stopped, true);
    assert.equal(stopped.state.approvals['pr-description'], 'new-body');
  } finally {
    fs.rmSync(taskDir, { recursive: true, force: true });
  }
});

const hosted = { captureCurrent: true, captureHosted: true, commentVerified: true, reviewCurrent: true,
  verificationRequired: false, verificationCurrent: false, descriptionCurrent: false, descriptionHash: 'body-v1', ready: false };
const described = (current, proof = current.hosted) => ({
  ...current, hosted: proof, proofs: { ...current.proofs, 'hosted-description': {
    hash: proof.descriptionHash, revision: current.revision, generation: current.generation,
  } },
});

test('publication transitions require current hosted capture regardless of ignored task artifacts', () => {
  const reviewed = proved({ implementation: artifact('implementation'), 'code-review': artifact('code-review', 'clean') }, ['code-review']);
  assert.deepEqual(eligible(reviewed, inputs, 'oneshot', false), ['record-evidence']);
  const ignoredReceipt = { ...reviewed, latest: { ...reviewed.latest, evidence: artifact('evidence', 'passed'), 'pr-description': artifact('pr-description') } };
  assert.deepEqual(eligible(ignoredReceipt, inputs, 'oneshot', false), ['record-evidence']);
  assert.deepEqual(eligible({ ...reviewed, hosted }, inputs, 'oneshot', false), ['describe-pr']);
  assert.deepEqual(eligible({ ...reviewed, hosted: { ...hosted, descriptionCurrent: true, ready: true } }, inputs, 'oneshot', false), ['describe-pr']);
  assert.deepEqual(eligible(described(reviewed, { ...hosted, descriptionCurrent: true, ready: true }), inputs, 'oneshot', false), ['complete']);
  const recaptured = described(reviewed, { ...hosted, descriptionCurrent: true, ready: true });
  recaptured.hosted = { ...recaptured.hosted, descriptionHash: 'body-v2' };
  assert.deepEqual(eligible(recaptured, inputs, 'oneshot', false), ['describe-pr'],
    'updating Evidence on an older full PR body cannot skip the describe-pr phase');
  for (const invalid of [{ ...hosted, captureHosted: false }, { ...hosted, commentVerified: false },
    { ...hosted, captureCurrent: false }, { ...hosted, reviewCurrent: false }]) {
    assert.deepEqual(eligible({ ...reviewed, hosted: invalid }, inputs, 'oneshot', false), ['record-evidence']);
  }
  assert.deepEqual(eligible(described(reviewed, { ...hosted, descriptionCurrent: true }), inputs, 'oneshot', false), ['blocked']);
});

test('verification and app test precede hosted capture; required verification is checked at publication', () => {
  const plan = { ...validSource(), text: '# Source\n\n## Phase 1\n- [x] Implement the change\n' };
  const latest = { plan, implementation: artifact('implementation'), verification: artifact('verification', 'passed'),
    'app-test': artifact('app-test', 'passed'), 'code-review': artifact('code-review', 'clean') };
  const enabled = { verify: true, app_test: 'web' };
  for (const [types, next] of [
    [[], 'verify-implementation'], [['verification'], 'test-app'],
    [['verification', 'app-test'], 'review-code'], [['verification', 'app-test', 'code-review'], 'record-evidence'],
  ]) assert.deepEqual(eligible(proved(latest, types), enabled, 'full', false), [next]);
  const complete = proved(latest, ['verification', 'app-test', 'code-review']);
  assert.deepEqual(eligible({ ...complete, hosted: { ...hosted, verificationRequired: true, verificationCurrent: false } }, enabled, 'full', false), ['record-evidence']);
  assert.deepEqual(eligible({ ...complete, hosted: { ...hosted, verificationRequired: true, verificationCurrent: true } }, enabled, 'full', false), ['describe-pr']);
});

test('review changes require clean review and new hosted proof before completion', () => {
  const latest = { 'pr-review': artifact('pr-review', 'approved'), 'code-review': artifact('code-review', 'clean') };
  const current = described(proved(latest, ['pr-review', 'code-review']), { ...hosted, descriptionCurrent: true, ready: true });
  assert.deepEqual(eligible(current, inputs, 'resolve-reviews', false), ['complete']);
  const changed = { ...current, generation: 1, revision: 'r2', proofs: {
    ...current.proofs, 'pr-review': { hash: latest['pr-review'].hash, generation: 1, revision: 'r2' },
  } };
  assert.deepEqual(eligible(changed, inputs, 'resolve-reviews', false), ['review-code']);
  const reviewed = { ...changed, proofs: { ...changed.proofs, 'code-review': {
    hash: latest['code-review'].hash, generation: 1, revision: 'r2',
  } }, hosted: null };
  assert.deepEqual(eligible(reviewed, inputs, 'resolve-reviews', false), ['record-evidence']);
  assert.deepEqual(eligible({ ...reviewed, hosted }, inputs, 'resolve-reviews', false), ['describe-pr']);
  assert.deepEqual(eligible(described(reviewed, { ...hosted, descriptionCurrent: true, ready: true }), inputs, 'resolve-reviews', false), ['complete']);
  assert.deepEqual(eligible(initialState({ latest }, 'r2'), inputs, 'resolve-reviews', false), ['resolve-pr-reviews']);
});

test('capture and description prompts demand hosted publication without a local receipt', () => {
  const task = { skillsDir: '/skills', cwd: '/repo', taskDir: '/repo/.agents/tasks/example' };
  const capture = stagePrompt(task, 'record-evidence', state(), inputs);
  assert.equal(SKILLS['record-evidence'], 'evidence');
  assert.match(capture, /temporary scratch outside the task root/);
  assert.match(capture, /distinct PR comment/);
  assert.doesNotMatch(capture, /evidence\\.recording|Required output type: evidence/);
  const description = stagePrompt(task, 'describe-pr', state(), inputs);
  assert.match(description, /Never save local evidence or PR-description copies/);
  assert.doesNotMatch(description, /Required output type: pr-description/);
});
