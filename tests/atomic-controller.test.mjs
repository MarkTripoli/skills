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

function proofFixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-acceptance-'));
  initGit(repo);
  const taskDir = path.join(repo, '.agents', 'tasks', 'acceptance');
  const skillsDir = path.join(repo, 'installed-skills');
  fs.mkdirSync(taskDir, { recursive: true });
  for (const name of ['verify-implementation', 'review-code']) {
    fs.mkdirSync(path.join(skillsDir, name), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, name, 'SKILL.md'), `# ${name}\n`);
  }
  fs.writeFileSync(path.join(repo, 'cli.mjs'), '// Existing CLI\nconsole.log(Number(process.argv[2]) + 1);\n');
  execFileSync('git', ['add', 'cli.mjs'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'existing CLI'], { cwd: repo, stdio: 'ignore' });
  fs.writeFileSync(path.join(repo, 'cli.mjs'), '// Existing CLI\nconsole.log(Number(process.argv[2]) * 2);\n');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'node cli.mjs 21' } }));
  fs.writeFileSync(path.join(taskDir, 'task.md'), '# Task\n\n## Acceptance criteria\n\n- CLI doubles input 21.\n- CLI doubles input 7.\n');
  fs.writeFileSync(path.join(taskDir, '01-implementation.md'), '---\ntype: implementation\nsummary: implemented\n---\n# Receipt\n\nImplemented CLI.\n');
  const task = { taskDir, cwd: repo, taskRootRelative: '.agents/tasks', skillsDir, runId: 'proof-run' };
  const before = initialState(observeArtifacts(taskDir), revision(repo, task.taskRootRelative));
  const options = { verify: true, app_test: 'none', model: 'test-model', model_routing: 'fixed' };
  const row = (id, item, input, observed) => `| ${id} | ${item} | \`node cli.mjs ${input}\` | exit 0; ${observed} | pass |\n`;
  const check = '| C1 | repository npm test | `npm test` | exit 0; 42 | pass |\n';
  const table = '| Id | Item | Decided by | Observed | Verdict |\n|---|---|---|---|---|\n';
  const verification = rows => `---\ntype: verification\nsummary: CLI checked\nstatus: passed\n---\n## Items\n\n${table}${rows}`;
  const ctx = (rows, worker, reviewBase = '') => ({
    tool: async (name, _args, callback) => name.endsWith('-select-model') ? { model: 'test-model' } : callback(),
    task: async (name, args) => {
      if (name.endsWith('-verify-implementation')) {
        fs.writeFileSync(path.join(taskDir, '02-verification.md'), verification(rows));
        return { sessionId: 'verification-session', text: 'Verified.' };
      }
      if (name.endsWith('-review-code')) {
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
        fs.writeFileSync(path.join(taskDir, '03-code-review.md'), `---\ntype: code-review\nstatus: clean\nsummary: Reviewed CLI\nhead_sha: ${head}\n${reviewBase}---\n## Independent Review\n\n- dispatch: claimed complete\n\n## Critical and Required Findings\n\nNone.\n`);
        execFileSync('git', ['add', '-A', '.agents/tasks/acceptance'], { cwd: repo, stdio: 'ignore' });
        execFileSync('git', ['commit', '-m', 'docs(task): review artifact'], { cwd: repo, stdio: 'ignore' });
        return { sessionId: 'review-author-session', text: 'Clean.' };
      }
      return worker(name, args);
    },
  });
  return { repo, taskDir, task, before, options, row, check, ctx };
}

test('passed verification requires every task, plan, and receipt acceptance item, not merely A1', async () => {
  const f = proofFixture();
  try {
    const a1 = f.row('A1', 'CLI doubles input 21.', 21, 42);
    await assert.rejects(() => runSkill(f.ctx(f.check + a1), f.task, f.before, f.options, 'verify-implementation', 1), /matching passed A-row/);
    fs.writeFileSync(path.join(f.taskDir, '04-plan.md'), '---\ntype: plan\nsummary: complete plan\n---\n## Desired End State\n\n- CLI doubles input 0.\n\n## Phase 1\n- [x] Implement\n\n### Verify\n- [x] CLI doubles input 3.\n');
    fs.writeFileSync(path.join(f.taskDir, '01-implementation.md'), '---\ntype: implementation\nsummary: implemented\n---\n# Receipt\n\n### Verify\n- CLI doubles input 9.\n');
    fs.writeFileSync(path.join(f.taskDir, '00-implementation-early.md'), '---\ntype: implementation\nsummary: earlier phase\n---\n# Receipt\n\n### Verify\n- CLI doubles input 11.\n');
    const planned = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const rows = a1 + f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + rows), f.task, planned, f.options, 'verify-implementation', 2), /matching passed A-row/);
    const complete = rows + f.row('A3', 'CLI doubles input 0.', 0, 0) +
      f.row('A4', 'CLI doubles input 3.', 3, 6) + f.row('A5', 'CLI doubles input 11.', 11, 22) +
      f.row('A6', 'CLI doubles input 9.', 9, 18);
    const accepted = await runSkill(f.ctx(f.check + complete), f.task, planned, f.options, 'verify-implementation', 3);
    assert.deepEqual(eligible(accepted, f.options, 'full', false), ['review-code']);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('phase automated verification requires replay while Human Review checks remain separately gated', async () => {
  for (const [type, file, phase] of [
    ['plan', '04-plan.md', '### Success Criteria:\n\n#### Automated Verification:\n'],
    ['structure-outline', '04-structure-outline.md', '### Validation\n\n#### Automated Verification\n'],
  ]) {
    const f = proofFixture();
    try {
      fs.writeFileSync(path.join(f.taskDir, file),
        `---\ntype: ${type}\nsummary: phase checks\n---\n## Phase 1: CLI\n\n- [x] Implement CLI.\n\n${phase}\n- [x] CLI doubles input 3.\n\n## Human Review\n\n### Verify\n\n- [ ] A human approves the visual result.\n`);
      const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
      const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) +
        f.row('A2', 'CLI doubles input 7.', 7, 14);
      await assert.rejects(() => runSkill(f.ctx(rows), f.task, before, f.options, 'verify-implementation', 1),
        /matching passed A-row/);
      const verified = await runSkill(f.ctx(rows + f.row('A3', 'CLI doubles input 3.', 3, 6)),
        f.task, before, f.options, 'verify-implementation', 2);
      assert.deepEqual(eligible(verified, f.options, 'oneshot', false), ['review-code']);
    } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
  }
});

test('a claimed A-row pass cannot advance without controller-executed output', async () => {
  const f = proofFixture();
  try {
    const noCommand = '| A1 | CLI doubles input 21. | observed manually | exit 0; 42 | pass |\n' + f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + noCommand), f.task, f.before, f.options, 'verify-implementation', 2), /no executable command/);
    const fakeCheck = f.check.replace('exit 0; 42', 'exit 0; 999') + f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(fakeCheck), f.task, f.before, f.options, 'verify-implementation', 3), /C1 claimed pass is not corroborated/);
    const echo = '| A1 | CLI doubles input 21. | `printf 42` | exit 0; 42 | pass |\n' + f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + echo), f.task, f.before, f.options, 'verify-implementation', 4), /only manufactures a result/);
    const fabricated = '| A1 | CLI doubles input 21. | `node -e \"console.log(42)\"` | exit 0; 42 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + fabricated), f.task, f.before, f.options, 'verify-implementation', 5), /only manufactures a result/);
    const inlineAfterOption = '| A1 | CLI doubles input 21. | `node --input-type=module --eval "console.log(42)" -- 21` | exit 0; 42 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + inlineAfterOption), f.task, f.before, f.options,
      'verify-implementation', 5), /only manufactures a result/);
    const mutation = '| A1 | CLI doubles input 21. | `curl -X POST https://example.invalid/claim` | exit 0; 42 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + mutation), f.task, f.before, f.options, 'verify-implementation', 6), /cannot be safely replayed/);
    for (const unsafe of [
      'curl -d name=value https://example.invalid/claim',
      'curl -F name=value https://example.invalid/claim',
      'curl -T payload https://example.invalid/claim',
      'sh -c "curl -d name=value https://example.invalid/claim"',
      'curl -X \"POST\" https://example.invalid/claim',
      "curl --request 'DELETE' https://example.invalid/claim",
      String.raw`curl -X P\OST https://example.invalid/claim`,
      '/usr/bin/curl -X POST https://example.invalid/claim',
      '"/usr/bin/curl" -X POST https://example.invalid/claim',
      "'/usr/bin/cu''rl' -X POST https://example.invalid/claim",
      "'/usr/bin/ht''tp' POST https://example.invalid/claim",
      'gh api --method POST repos/owner/repo/issues/123/comments -f body=probe',
      '/usr/local/bin/glab api projects/1/issues/123/notes -X POST',
      'git fetch origin',
      'npx untrusted-package',
      'npm publish',
      'redis-cli -h production.invalid SET key value',
      '/usr/local/bin/redis-cli -h production.invalid SET key value',
      'python -m pip install remote-package',
      'python3 -m ensurepip',
      'uv run redis-cli -h production.invalid SET key value',
      'python -mpip install remote-package',
      'python3 -mensurepip',
      'uv run --with=remote-package pytest -q',
      'node --run version',
      'node /tmp/external-check.mjs 21',
      'node --test cli.mjs /tmp/external.test.mjs',
      'python -m pytest /tmp/external_test.py',
      'pytest /tmp/external_test.py',
      'uv run --offline pytest /tmp/external_test.py',
      'go -C /tmp run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...',
      'node ../outside-check.mjs 21',
      'node $(curl https://example.invalid/claim)',
      'node cli.mjs *',
      'VALUE=1 node cli.mjs 21',
      "node cli.mjs 21; printf '42'",
    ]) {
      const replay = `| A1 | CLI doubles input 21. | \`${unsafe}\` | exit 0; 42 | pass |\n` +
        f.row('A2', 'CLI doubles input 7.', 7, 14);
      await assert.rejects(() => runSkill(f.ctx(f.check + replay), f.task, f.before, f.options,
        'verify-implementation', 7), /cannot be safely replayed/);
    }
    const exitOnly = '| A1 | CLI doubles input 21. | `node cli.mjs 7` | exit 0 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + exitOnly), f.task, f.before, f.options,
      'verify-implementation', 8), /no decisive output/);
    const unrelated = '| A1 | CLI doubles input 21. | `node cli.mjs 7` | exit 0; 14 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + unrelated), f.task, f.before, f.options,
      'verify-implementation', 9), /did not exercise the claimed input/);
    const unusedInput = '| A1 | CLI doubles input 21. | `node cli.mjs 7 21` | exit 0; 14 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + unusedInput), f.task, f.before, f.options,
      'verify-implementation', 10), /did not exercise the claimed input/);
    fs.mkdirSync(path.join(f.repo, 'scripts'));
    fs.writeFileSync(path.join(f.repo, 'scripts', 'install.mjs'), 'console.log("42");\n');
    const installerState = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const installer = '| A1 | CLI doubles input 21. | `node scripts/install.mjs all --yes --uninstall` | exit 0; 42 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + installer), f.task, installerState, f.options,
      'verify-implementation', 11), /cannot be safely replayed/);
    const noCheck = f.row('A1', 'CLI doubles input 21.', 21, 42) + f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(noCheck), f.task, installerState, f.options, 'verify-implementation', 5), /omitted repository checks: npm test/);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('replayed interpreters cannot execute symlinked scripts outside the reviewed checkout', async () => {
  const f = proofFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-outside-script-'));
  const marker = path.join(outside, 'executed');
  try {
    const script = path.join(outside, 'check.mjs');
    fs.writeFileSync(script, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'executed'); console.log('42');\n`);
    fs.symlinkSync(script, path.join(f.repo, 'linked-check.mjs'));
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const rows = f.check + '| A1 | CLI doubles input 21. | `node linked-check.mjs 21` | exit 0; 42 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(rows), f.task, before, f.options,
      'verify-implementation', 1), /cannot be safely replayed/);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(f.repo, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('required package build checks use a supported runtime instead of an unexecutable bare script', async () => {
  const f = proofFixture();
  try {
    fs.mkdirSync(path.join(f.repo, 'scripts'));
    fs.writeFileSync(path.join(f.repo, 'scripts', 'build-runtimes.mjs'),
      `if (process.argv[2] !== '--runtime' || process.argv[3] !== 'codex') process.exit(2); console.log('built codex');\n`);
    fs.writeFileSync(path.join(f.repo, 'package.json'), JSON.stringify({
      scripts: { test: 'node cli.mjs 21', build: 'node scripts/build-runtimes.mjs' },
    }));
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const rows = f.check +
      '| C2 | Supported runtime build | `npm run build -- --runtime codex` | exit 0; built codex | pass |\n' +
      f.row('A1', 'CLI doubles input 21.', 21, 42) + f.row('A2', 'CLI doubles input 7.', 7, 14);
    const verified = await runSkill(f.ctx(rows), f.task, before, f.options, 'verify-implementation', 1);
    assert.deepEqual(verified.proofs.verification.executionEvidence.map(row => row.id), ['C1', 'C2', 'A1', 'A2']);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('verification runs literal quoted filesystem argv without invoking a shell', async () => {
  const f = proofFixture();
  try {
    fs.mkdirSync(path.join(f.repo, 'tests'));
    fs.copyFileSync(path.join(f.repo, 'cli.mjs'), path.join(f.repo, 'tests', 'cli with spaces.mjs'));
    const rows = '| A1 | CLI doubles input 21. | `node "tests/cli with spaces.mjs" 21` | exit 0; 42 | pass |\n' +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    const verified = await runSkill(f.ctx(f.check + rows), f.task,
      initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative)),
      f.options, 'verify-implementation', 1);
    assert.equal(verified.proofs.verification.executionEvidence[1].output, '42');
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('composed network executable never reaches even an offline local stub', async () => {
  const f = proofFixture();
  try {
    const bin = path.join(f.repo, 'bin');
    fs.mkdirSync(bin);
    const marker = path.join(f.repo, 'network-attempt.txt');
    fs.writeFileSync(path.join(bin, 'curl'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'invoked');\n`, { mode: 0o755 });
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const rows = `| A1 | CLI doubles input 21. | \`'bin/cu''rl' -X POST https://example.invalid/claim\` | exit 0; 42 | pass |\n` +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + rows), f.task, before,
      f.options, 'verify-implementation', 1), /cannot be safely replayed/);
    assert.equal(fs.existsSync(marker), false);
    const direct = `| A1 | CLI doubles input 21. | \`./bin/curl -X POST https://example.invalid/claim\` | exit 0; 42 | pass |\n` +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + direct), f.task, before,
      f.options, 'verify-implementation', 2), /cannot be safely replayed/);
    assert.equal(fs.existsSync(marker), false);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('no discovered repository check still permits direct acceptance probes', async () => {
  const f = proofFixture();
  try {
    fs.rmSync(path.join(f.repo, 'package.json'));
    fs.mkdirSync(path.join(f.repo, 'tests'));
    fs.copyFileSync(path.join(f.repo, 'cli.mjs'), path.join(f.repo, 'tests', 'cli.mjs'));
    const rows = (f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14)).replaceAll('node cli.mjs', 'node tests/cli.mjs');
    const verified = await runSkill(f.ctx(rows), f.task,
      initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative)),
      f.options, 'verify-implementation', 1);
    assert.deepEqual(eligible(verified, f.options, 'oneshot', false), ['review-code']);
    const proof = JSON.parse(fs.readFileSync(path.join(f.taskDir, '.atomic-delivery', 'proof-run', '001-verification-execution.json'), 'utf8'));
    assert.deepEqual(proof.evidence.map(row => row.id), ['A1', 'A2']);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('additional risk and bugfix regression A rows are replayed without dropping promised items', async () => {
  const f = proofFixture();
  try {
    const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14) +
      f.row('A3', 'Risk: CLI doubles input 3.', 3, 6) +
      f.row('A4', 'Regression: CLI doubles input 9.', 9, 18);
    const verified = await runSkill(f.ctx(rows), f.task, f.before, f.options, 'verify-implementation', 1);
    assert.deepEqual(verified.proofs.verification.executionEvidence.map(row => row.id),
      ['C1', 'A1', 'A2', 'A3', 'A4']);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('multiline CI and configured Python checks cannot disappear from passed verification', async () => {
  const f = proofFixture();
  try {
    fs.mkdirSync(path.join(f.repo, '.github', 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(f.repo, 'scripts'));
    fs.writeFileSync(path.join(f.repo, '.github', 'workflows', 'checks.yml'),
      'jobs:\n  proof:\n    steps:\n      - run: |\n          node scripts/check-cli.mjs 21\n');
    fs.writeFileSync(path.join(f.repo, 'scripts', 'check-cli.mjs'),
      'import { execFileSync } from \"node:child_process\";\nif (execFileSync(process.execPath, [\"cli.mjs\", process.argv[2]], { encoding: \"utf8\" }).trim() !== \"42\") process.exit(1);\nconsole.log(\"checked 42\");\n');
    const rows = f.row('A1', 'CLI doubles input 21.', 21, 42) + f.row('A2', 'CLI doubles input 7.', 7, 14);
    const wrongFlag = '| C2 | wrong CI flags | `node scripts/check-cli.mjs --help` | exit 0; checked 42 | pass |\n';
    await assert.rejects(() => runSkill(f.ctx(f.check + wrongFlag + rows), f.task,
      initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative)),
      f.options, 'verify-implementation', 0), /omitted repository checks: node scripts\/check-cli\.mjs 21/);
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    await assert.rejects(() => runSkill(f.ctx(f.check + rows), f.task, before, f.options, 'verify-implementation', 1),
      /omitted repository checks: node scripts\/check-cli\.mjs/);
    const ci = '| C2 | multiline CI source check | `node scripts/check-cli.mjs 21` | exit 0; checked 42 | pass |\n';
    const verified = await runSkill(f.ctx(f.check + ci + rows), f.task, before, f.options, 'verify-implementation', 2);
    assert.deepEqual(eligible(verified, f.options, 'oneshot', false), ['review-code']);
    fs.writeFileSync(path.join(f.repo, 'pyproject.toml'), '[project]\nname = \"fixture\"\n');
    const metadataOnly = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    await runSkill(f.ctx(f.check + ci.replace('multiline CI source check', 'CI source check with metadata-only Python') + rows),
      f.task, metadataOnly, f.options, 'verify-implementation', 3);
    fs.appendFileSync(path.join(f.repo, 'pyproject.toml'), '[tool.ruff]\nline-length = 88\n[tool.mypy]\nstrict = true\n');
    const configured = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    await assert.rejects(() => runSkill(f.ctx(f.check + ci.replace('multiline CI source check', 'CI source check with Python tools') + rows),
      f.task, configured, f.options, 'verify-implementation', 4),
      /omitted repository checks: ruff check \., mypy \./);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('direct CI node --test commands remain mandatory replayable repository checks', async () => {
  const f = proofFixture();
  try {
    const workflows = path.join(f.repo, '.github', 'workflows');
    fs.mkdirSync(workflows, { recursive: true });
    fs.mkdirSync(path.join(f.repo, 'tests'));
    fs.writeFileSync(path.join(f.repo, 'tests', 'unit.test.mjs'),
      `import test from 'node:test'; import assert from 'node:assert/strict'; import {execFileSync} from 'node:child_process';\ntest('cli doubles 21', () => assert.equal(execFileSync(process.execPath, ['cli.mjs', '21'], {encoding:'utf8'}).trim(), '42'));\n`);
    fs.writeFileSync(path.join(workflows, 'checks.yml'),
      'jobs:\n  proof:\n    steps:\n      - run: node --test tests/unit.test.mjs\n');
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const acceptance = f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(f.check + acceptance), f.task, before, f.options,
      'verify-implementation', 1), /omitted repository checks: node --test tests\/unit\.test\.mjs/);
    const rows = f.check +
      '| C2 | Direct Node CI test | `node --test tests/unit.test.mjs` | exit 0 | pass |\n' + acceptance;
    const verified = await runSkill(f.ctx(rows), f.task, before, f.options,
      'verify-implementation', 2);
    assert.deepEqual(verified.proofs.verification.executionEvidence.map(row => row.id),
      ['C1', 'C2', 'A1', 'A2']);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('event-scoped Conventional Commits CI defers to exact-head hosted job, not unsafe local variable replay', async () => {
  const f = proofFixture();
  try {
    const workflows = path.join(f.repo, '.github', 'workflows');
    fs.mkdirSync(workflows, { recursive: true });
    fs.writeFileSync(path.join(workflows, 'commits.yml'),
      'on:\n  pull_request:\njobs:\n  conventional:\n    steps:\n      - run: |\n          node scripts/check-commits.mjs \"$BASE..$HEAD\" \"$@\"\n');
    const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const verified = await runSkill(f.ctx(rows), f.task, before, f.options, 'verify-implementation', 1);
    assert.deepEqual(eligible(verified, f.options, 'oneshot', false), ['review-code']);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('release workflow prerequisite and Python runner checks remain mandatory', async () => {
  const f = proofFixture();
  try {
    const workflows = path.join(f.repo, '.github', 'workflows');
    fs.mkdirSync(workflows, { recursive: true });
    fs.writeFileSync(path.join(workflows, 'release.yml'),
      'jobs:\n  publish:\n    steps:\n      - run: |-\n          node scripts/check-package.mjs --strict\n          python -m pytest\n          uv run --locked pytest -q\n          npm publish\n      - name: Scan Go dependencies\n        run: |-\n          GOBIN=\"$RUNNER_TEMP/bin\" go install golang.org/x/vuln/cmd/govulncheck@v1.8.0\n          (cd tools/safety-dance && \"$RUNNER_TEMP/bin/govulncheck\" ./...)\n');
    fs.mkdirSync(path.join(f.repo, 'tests'));
    fs.writeFileSync(path.join(f.repo, 'tests', 'safety-dance-release.test.mjs'), 'import \"node:test\";\n');
    fs.writeFileSync(path.join(workflows, 'safety-dance-release.yml'),
      'jobs:\n  release:\n    steps:\n      - working-directory: tools/safety-dance\n        run: |-\n          go build -ldflags \"$ldflags\" -o \"dist/safety-dance\" ./cmd/safety-dance\n          ./scripts/package-release.sh --version \"${{ steps.version.outputs.version }}\" --os linux --arch amd64 --binary dist/safety-dance --out dist\n');
    const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    await assert.rejects(() => runSkill(f.ctx(rows), f.task, f.before, f.options,
      'verify-implementation', 1), /omitted repository checks: .*node scripts\/check-package\.mjs --strict, python -m pytest, uv run --locked pytest -q, go -C tools\/safety-dance run golang\.org\/x\/vuln\/cmd\/govulncheck@v1\.8\.0 \.\/\.\.\., go -C tools\/safety-dance build -o \/dev\/null \.\/cmd\/safety-dance, node --test tests\/safety-dance-release\.test\.mjs/);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('the pinned Go CI scanner check replays only its literal argv through an offline stub', async () => {
  const f = proofFixture();
  const originalPath = process.env.PATH;
  try {
    const workflows = path.join(f.repo, '.github', 'workflows');
    fs.mkdirSync(workflows, { recursive: true });
    fs.writeFileSync(path.join(workflows, 'scan.yml'),
      'jobs:\n  scan:\n    steps:\n      - run: |-\n          GOBIN="$RUNNER_TEMP/bin" go install golang.org/x/vuln/cmd/govulncheck@v1.8.0\n          (cd tools/safety-dance && "$RUNNER_TEMP/bin/govulncheck" ./...)\n');
    fs.mkdirSync(path.join(f.repo, 'tools', 'safety-dance'), { recursive: true });
    fs.writeFileSync(path.join(f.repo, 'tools', 'safety-dance', 'go.mod'), 'module example.invalid/safety-dance\n\ngo 1.23\n');
    const bin = path.join(f.repo, 'bin');
    fs.mkdirSync(bin);
    const argv = ['-C', 'tools/safety-dance', 'run', 'golang.org/x/vuln/cmd/govulncheck@v1.8.0', './...'];
    fs.writeFileSync(path.join(bin, 'go'), `#!${process.execPath}\nif (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify(argv))}) process.exit(2);\nconsole.log('offline scanner stub verified literal argv');\n`, { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
    const rows = f.check +
      '| C2 | pinned Go vulnerability check | `go -C tools/safety-dance run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...` | exit 0; offline scanner stub verified literal argv | pass |\n' +
      f.row('A1', 'CLI doubles input 21.', 21, 42) + f.row('A2', 'CLI doubles input 7.', 7, 14);
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const verified = await runSkill(f.ctx(rows), f.task, before, f.options, 'verify-implementation', 1);
    assert.deepEqual(verified.proofs.verification.executionEvidence.map(row => row.id), ['C1', 'C2', 'A1', 'A2']);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(f.repo, { recursive: true, force: true });
  }
});

test('writable check arguments cannot execute even offline local command stubs', async () => {
  const f = proofFixture();
  const originalPath = process.env.PATH;
  try {
    const moduleDir = path.join(f.repo, 'tools', 'safety-dance');
    fs.mkdirSync(path.join(moduleDir, 'cmd', 'safety-dance'), { recursive: true });
    const bin = path.join(f.repo, 'bin');
    fs.mkdirSync(bin);
    const marker = path.join(f.repo, 'unsafe-command-executed');
    for (const command of ['go', 'ruff', 'cargo']) {
      fs.writeFileSync(path.join(bin, command), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'invoked');\n`, { mode: 0o755 });
    }
    process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    for (const command of [
      'go -C tools/safety-dance build -o /tmp/unrelated-build ./cmd/safety-dance',
      'ruff format .',
      'cargo test --target-dir /tmp/unrelated-build',
      'npm test -- --prefix /tmp/unrelated-project',
    ]) {
      const row = `| A1 | CLI doubles input 21. | \`${command}\` | exit 0; 42 | pass |\n`;
      await assert.rejects(() => runSkill(f.ctx(f.check + row + f.row('A2', 'CLI doubles input 7.', 7, 14)),
        f.task, before, f.options, 'verify-implementation', 1), /cannot be safely replayed/);
      assert.equal(fs.existsSync(marker), false);
    }
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(f.repo, { recursive: true, force: true });
  }
});

test('a CI step working directory is bound to its replayed backend test rather than the root', async () => {
  const f = proofFixture();
  try {
    const backend = path.join(f.repo, 'backend');
    fs.mkdirSync(backend);
    fs.writeFileSync(path.join(backend, 'backend.test.mjs'),
      `import test from 'node:test'; import assert from 'node:assert/strict'; test('backend working directory', () => assert.equal(process.cwd(), import.meta.dirname));\n`);
    const workflows = path.join(f.repo, '.github', 'workflows');
    fs.mkdirSync(workflows, { recursive: true });
    fs.writeFileSync(path.join(workflows, 'backend.yml'),
      'jobs:\n  test:\n    steps:\n      - working-directory: backend\n        run: node --test backend.test.mjs\n');
    const rows = f.check +
      '| C2 | backend suite | `at backend: node --test backend.test.mjs` | exit 0 | pass |\n' +
      f.row('A1', 'CLI doubles input 21.', 21, 42) + f.row('A2', 'CLI doubles input 7.', 7, 14);
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const verified = await runSkill(f.ctx(rows), f.task, before, f.options, 'verify-implementation', 1);
    assert.match(verified.proofs.verification.executionEvidence.find(row => row.id === 'C2').output, /backend working directory/);
    const staleRows = rows.replace('at backend: node --test backend.test.mjs', 'node --test backend.test.mjs');
    await assert.rejects(() => runSkill(f.ctx(staleRows), f.task, before, f.options, 'verify-implementation', 2),
      /omitted repository checks: at backend: node --test backend.test.mjs/);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('a genuine expected-error exit and a silent filesystem predicate are acceptance evidence', async () => {
  const f = proofFixture();
  try {
    fs.mkdirSync(path.join(f.repo, 'tests'));
    fs.writeFileSync(path.join(f.repo, 'tests', 'errors.mjs'), 'console.error("invalid argument"); process.exit(2);\n');
    fs.writeFileSync(path.join(f.taskDir, 'task.md'), '# Task\n\n## Acceptance criteria\n\n- Invalid argument exits 2.\n- package.json exists.\n');
    fs.writeFileSync(path.join(f.repo, 'README.md'), 'unrelated file\n');
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const rows = '| A1 | Invalid argument exits 2. | `node tests/errors.mjs bad` | exit 2; invalid argument | pass |\n' +
      '| A2 | package.json exists. | `test -f package.json` | exit 0 | pass |\n';
    const verified = await runSkill(f.ctx(f.check + rows), f.task, before, f.options, 'verify-implementation', 1);
    assert.deepEqual(verified.proofs.verification.executionEvidence.map(row => [row.id, row.exit]),
      [['C1', 0], ['A1', 2], ['A2', 0]]);
    const unrelatedFile = '| A1 | Invalid argument exits 2. | `node tests/errors.mjs bad` | exit 2; invalid argument | pass |\n' +
      '| A2 | package.json exists. | `test -f README.md` | exit 0 | pass |\n';
    await assert.rejects(() => runSkill(f.ctx(f.check + unrelatedFile), f.task, before,
      f.options, 'verify-implementation', 2), /does not substantiate the named acceptance claim/);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('a failed boolean file predicate cannot pass as acceptance evidence', async () => {
  const f = proofFixture();
  try {
    fs.writeFileSync(path.join(f.taskDir, 'task.md'), '# Task\n\n## Acceptance criteria\n\n- missing.json exists.\n');
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const row = '| A1 | missing.json exists. | `test -f missing.json` | exit 1 | pass |\n';
    await assert.rejects(() => runSkill(f.ctx(f.check + row), f.task, before, f.options, 'verify-implementation', 1),
      /claimed pass is not corroborated/);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('A-row replay refuses mutating test-runner targets, numeric labels, and inverted predicates', async () => {
  const f = proofFixture();
  try {
    fs.mkdirSync(path.join(f.repo, 'scripts'));
    const marker = path.join(f.repo, 'mutated.txt');
    fs.writeFileSync(path.join(f.repo, 'scripts', 'install.mjs'),
      `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'changed'); console.log('42');\n`);
    fs.mkdirSync(path.join(f.repo, 'tests'));
    fs.writeFileSync(path.join(f.repo, 'tests', 'decoy21.test.mjs'),
      "import test from 'node:test'; console.log('42'); test('unrelated test', () => {});\n");
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const other = f.row('A2', 'CLI doubles input 7.', 7, 14);
    for (const [command, reason] of [
      ['node --test scripts/install.mjs', /cannot be safely replayed/],
      ['node --test tests/decoy21.test.mjs', /test-runner labels cannot substantiate numeric/],
    ]) {
      const row = `| A1 | CLI doubles input 21. | \`${command}\` | exit 0; 42 | pass |\n`;
      await assert.rejects(() => runSkill(f.ctx(f.check + row + other), f.task, before,
        f.options, 'verify-implementation', 1), reason);
    }
    assert.equal(fs.existsSync(marker), false);
    fs.writeFileSync(path.join(f.taskDir, 'task.md'), '# Task\n\n## Acceptance criteria\n\n- package.json does not exist.\n');
    const inverseState = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const inverse = '| A1 | package.json does not exist. | `test -f package.json` | exit 0 | pass |\n';
    await assert.rejects(() => runSkill(f.ctx(f.check + inverse), f.task, inverseState,
      f.options, 'verify-implementation', 2), /does not substantiate the named acceptance claim/);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('verification opt-out can review independent acceptance evidence without invented execution', async () => {
  const f = proofFixture();
  try {
    const options = { ...f.options, verify: false };
    const unproved = f.ctx('', () => {
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      const evidence = 'cli.mjs:2 inspected argument conversion and output in the changed implementation';
      return { sessionId: 'review-without-independent-observation', text: JSON.stringify({
        head, revision: f.before.revision,
        acceptance: ['CLI doubles input 21.', 'CLI doubles input 7.'].map(item => ({ item, evidence })),
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })),
        findings: [],
      }) };
    });
    await assert.rejects(() => runSkill(unproved, f.task, f.before, options, 'review-code', 1), /scope-incomplete/);
    const reviewer = f.ctx('', () => {
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      assert.equal(execFileSync(process.execPath, ['cli.mjs', '21'], { cwd: f.repo, encoding: 'utf8' }).trim(), '42');
      assert.equal(execFileSync(process.execPath, ['cli.mjs', '7'], { cwd: f.repo, encoding: 'utf8' }).trim(), '14');
      const evidence = 'cli.mjs:2 independently invoked node cli.mjs 21 and observed 42; invoked node cli.mjs 7 and observed 14';
      return { sessionId: 'independent-opt-out-review', text: JSON.stringify({
        head, revision: f.before.revision,
        acceptance: ['CLI doubles input 21.', 'CLI doubles input 7.'].map((item, index) => ({
          item, evidence, command: index === 0 ? 'node cli.mjs 21' : 'node cli.mjs 7',
          observed: index === 0 ? 'exit 0; 42' : 'exit 0; 14',
        })),
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })),
        findings: [],
      }) };
    });
    const reviewed = await runSkill(reviewer, f.task, f.before, options, 'review-code', 2);
    assert.equal(reviewed.latest['code-review'].status, 'clean');
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('deletion-only source diffs still admit independent review of old-side changed lines', async () => {
  const f = proofFixture();
  const installed = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-installed-review-'));
  try {
    fs.mkdirSync(path.join(installed, 'review-code'));
    fs.writeFileSync(path.join(installed, 'review-code', 'SKILL.md'), '# review-code\n');
    fs.rmSync(f.task.skillsDir, { recursive: true, force: true });
    f.task.skillsDir = installed;
    fs.rmSync(path.join(f.repo, 'package.json'));
    fs.rmSync(path.join(f.repo, 'cli.mjs'));
    fs.writeFileSync(path.join(f.taskDir, 'task.md'), '# Task\n\nRemove the obsolete CLI.\n');
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const reviewer = f.ctx('', () => {
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      assert.equal(fs.existsSync(path.join(f.repo, 'cli.mjs')), false);
      const evidence = 'cli.mjs:old:2 inspected the deleted old-side CLI implementation and observed the obsolete path absent';
      return { sessionId: 'independent-deletion-review', text: JSON.stringify({
        head, revision: before.revision, acceptance: [],
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })),
        findings: [],
      }) };
    });
    const reviewed = await runSkill(reviewer, f.task, before, { ...f.options, verify: false }, 'review-code', 1);
    assert.equal(reviewed.latest['code-review'].status, 'clean');
  } finally {
    fs.rmSync(installed, { recursive: true, force: true });
    fs.rmSync(f.repo, { recursive: true, force: true });
  }
});

test('no acceptance promises still require execution of the recorded repository check', async () => {
  const f = proofFixture();
  try {
    fs.writeFileSync(path.join(f.taskDir, 'task.md'), '# Task\n\nNo acceptance criteria were promised.\n');
    const check = f.check;
    const accepted = await runSkill(f.ctx(check), f.task, f.before, f.options, 'verify-implementation', 1);
    assert.deepEqual(eligible(accepted, f.options, 'oneshot', false), ['review-code']);
    await assert.rejects(() => runSkill(f.ctx(''), f.task, f.before, f.options, 'verify-implementation', 2), /contradicts evidence verdicts/);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('clean review requires a completed separate exact-HEAD reviewer; genuine checks and review advance', async () => {
  const f = proofFixture();
  try {
    const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) + f.row('A2', 'CLI doubles input 7.', 7, 14);
    const verified = await runSkill(f.ctx(rows), f.task, f.before, f.options, 'verify-implementation', 1);
    let dispatches = 0;
    const unavailable = f.ctx(rows, () => { dispatches++; throw new Error('worker unavailable'); });
    await assert.rejects(() => runSkill(unavailable, f.task, verified, f.options, 'review-code', 2), /worker unavailable/);
    assert.equal(dispatches, 1);
    const unrelated = f.ctx(rows, () => {
      dispatches++;
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      const evidence = 'README.md:1 reviewed node cli.mjs 21 printed 42 and node cli.mjs 7 printed 14';
      return { sessionId: 'different-but-irrelevant-reviewer', text: JSON.stringify({
        head, revision: verified.revision,
        acceptance: ['CLI doubles input 21.', 'CLI doubles input 7.'].map(item => ({ item, evidence })),
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })),
        findings: [],
      }) };
    });
    await assert.rejects(() => runSkill(unrelated, f.task, verified, f.options, 'review-code', 3), /scope-incomplete/);
    const unchanged = f.ctx(rows, () => {
      dispatches++;
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      const evidence = 'cli.mjs:1 inspected unchanged header and invoked node cli.mjs 21; observed 42 and invoked node cli.mjs 7; observed 14';
      return { sessionId: 'separate-but-unchanged-line', text: JSON.stringify({
        head, revision: verified.revision,
        acceptance: ['CLI doubles input 21.', 'CLI doubles input 7.'].map(item => ({ item, evidence })),
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })),
        findings: [],
      }) };
    });
    await assert.rejects(() => runSkill(unchanged, f.task, verified, f.options, 'review-code', 4), /scope-incomplete/);
    const reviewer = f.ctx(rows, () => {
      dispatches++;
      const output = execFileSync(process.execPath, ['cli.mjs', '21'], { cwd: f.repo, encoding: 'utf8' }).trim();
      assert.equal(output, '42');
      assert.equal(execFileSync(process.execPath, ['cli.mjs', '7'], { cwd: f.repo, encoding: 'utf8' }).trim(), '14');
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      const sourceLine = fs.readFileSync(path.join(f.repo, 'cli.mjs'), 'utf8').split('\n')[1];
      const evidence = `cli.mjs:2 ${sourceLine}; direct invocation node cli.mjs 21 printed 42 and node cli.mjs 7 printed 14`;
      return { sessionId: 'separate-reviewer-session', text: JSON.stringify({
        head, revision: verified.revision, acceptance: [
          { item: 'CLI doubles input 21.', evidence },
          { item: 'CLI doubles input 7.', evidence },
        ],
        risks: [
          { risk: 'functional correctness', evidence },
          { risk: 'security and data integrity', evidence: `cli.mjs:2 inspected argument conversion and output: ${sourceLine}` },
          { risk: 'acceptance oracle and test reachability', evidence: 'cli.mjs:2 independently invoked both accepted inputs and observed 42 and 14' },
        ], findings: [],
      }) };
    });
    const reviewed = await runSkill(reviewer, f.task, verified, f.options, 'review-code', 5);
    assert.equal(dispatches, 4);
    assert.deepEqual(eligible(reviewed, f.options, 'oneshot', false), ['record-evidence']);
    assert.equal(fs.existsSync(path.join(f.taskDir, '.atomic-delivery', 'proof-run', '005-independent-review-proof.json')), true);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('independent review cites committed changes at their shifted working-tree lines', async () => {
  const f = proofFixture();
  try {
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.repo, encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(f.repo, 'cli.mjs'),
      '// Existing CLI\nconsole.log(Number(process.argv[2]) * 2);\n');
    execFileSync('git', ['add', 'cli.mjs'], { cwd: f.repo });
    execFileSync('git', ['commit', '-m', 'fix: double CLI input'], { cwd: f.repo });
    fs.writeFileSync(path.join(f.repo, 'cli.mjs'),
      '// preparation 1\n// preparation 2\n// preparation 3\n// preparation 4\n// preparation 5\n// Existing CLI\nconsole.log(Number(process.argv[2]) * 2);\n');
    fs.appendFileSync(path.join(f.taskDir, 'task.md'), `\nbase: ${base}`);
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    const verified = await runSkill(f.ctx(rows), f.task, before, f.options,
      'verify-implementation', 1);
    const reviewer = f.ctx(rows, () => {
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      const evidence = 'cli.mjs:7 inspected changed doubling logic; node cli.mjs 21 printed 42 and node cli.mjs 7 printed 14';
      return { sessionId: 'shifted-line-reviewer', text: JSON.stringify({
        head, revision: verified.revision,
        acceptance: ['CLI doubles input 21.', 'CLI doubles input 7.'].map(item => ({ item, evidence })),
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })),
        findings: [],
      }) };
    });
    const reviewed = await runSkill(reviewer, f.task, verified, f.options,
      'review-code', 2);
    assert.deepEqual(eligible(reviewed, f.options, 'oneshot', false), ['record-evidence']);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('deletion-only review hunks cannot cite a surviving line shifted into the deleted number', async () => {
  const f = proofFixture();
  try {
    fs.writeFileSync(path.join(f.repo, 'cli.mjs'),
      'console.log(Number(process.argv[2]) * 2);\n// obsolete line\n// surviving line\n');
    execFileSync('git', ['add', 'cli.mjs'], { cwd: f.repo });
    execFileSync('git', ['commit', '-m', 'fix: double CLI input'], { cwd: f.repo });
    fs.writeFileSync(path.join(f.repo, 'cli.mjs'), 'console.log(Number(process.argv[2]) * 2);\n// surviving line\n');
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    const verified = await runSkill(f.ctx(rows), f.task, before, f.options,
      'verify-implementation', 1);
    const reviewer = f.ctx(rows, () => {
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      const evidence = 'cli.mjs:2 inspected unchanged surviving line; node cli.mjs 21 printed 42 and node cli.mjs 7 printed 14';
      return { sessionId: 'unchanged-line-reviewer', text: JSON.stringify({
        head, revision: verified.revision,
        acceptance: ['CLI doubles input 21.', 'CLI doubles input 7.'].map(item => ({ item, evidence })),
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })),
        findings: [],
      }) };
    });
    await assert.rejects(() => runSkill(reviewer, f.task, verified, f.options,
      'review-code', 2), /scope-incomplete/);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('independent reviewer findings supersede a writer clean draft and enter repair', async () => {
  const f = proofFixture();
  try {
    const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) +
      f.row('A2', 'CLI doubles input 7.', 7, 14);
    const verified = await runSkill(f.ctx(rows), f.task, f.before, f.options,
      'verify-implementation', 1);
    const reviewer = f.ctx(rows, () => {
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      const evidence = 'cli.mjs:2 inspected source; node cli.mjs 21 printed 42 and node cli.mjs 7 printed 14';
      return { sessionId: 'independent-finding-session', text: JSON.stringify({
        head, revision: verified.revision,
        acceptance: ['CLI doubles input 21.', 'CLI doubles input 7.'].map(item => ({ item, evidence })),
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })),
        findings: [{ location: 'cli.mjs:2', problem: 'A changed edge case drops the second input.' }],
      }) };
    });
    const reviewed = await runSkill(reviewer, f.task, verified, f.options, 'review-code', 2);
    assert.equal(reviewed.latest['code-review'].status, 'findings');
    assert.match(reviewed.latest['code-review'].text, /cli\.mjs:2/);
    assert.match(reviewed.latest['code-review'].text, /A changed edge case drops the second input/);
    assert.deepEqual(eligible(reviewed, f.options, 'oneshot', false), ['fix-code-review']);
  } finally { fs.rmSync(f.repo, { recursive: true, force: true }); }
});

test('hosted independent review binds artifact and worker to the PR base rather than task fallback', async () => {
  const f = proofFixture();
  const originalPath = process.env.PATH;
  try {
    const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.repo, encoding: 'utf8' }).trim();
    const hostedBase = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(f.taskDir, 'task.md'), '# Task\nbase: main\n\n## Acceptance criteria\n\n- CLI doubles input 21.\n- CLI doubles input 7.\n');
    const bin = path.join(f.repo, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
      baseRefName: 'release', baseRefOid: hostedBase, headRefOid: sourceHead,
    }))});\n`, { mode: 0o755 });
    process.env.PATH = `${bin}:${originalPath}`;
    const rows = f.check + f.row('A1', 'CLI doubles input 21.', 21, 42) + f.row('A2', 'CLI doubles input 7.', 7, 14);
    const before = initialState(observeArtifacts(f.taskDir), revision(f.repo, f.task.taskRootRelative));
    const verified = await runSkill(f.ctx(rows), f.task, before, f.options, 'verify-implementation', 1);
    const report = (base_branch, base_sha) => (_name, args) => {
      assert.match(args.prompt, /review base release at merge-base SHA/);
      const head = execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: f.repo, encoding: 'utf8' }).trim();
      const evidence = 'cli.mjs:1 inspected added CLI file and invoked node cli.mjs 21; observed 42 and node cli.mjs 7; observed 14';
      return { sessionId: 'independent-hosted-review', text: JSON.stringify({
        head, revision: verified.revision, base_branch, base_sha,
        acceptance: ['CLI doubles input 21.', 'CLI doubles input 7.'].map(item => ({ item, evidence })),
        risks: ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability']
          .map(risk => ({ risk, evidence })), findings: [],
      }) };
    };
    const reviewer = (branch, sha) => f.ctx(rows, report(branch, sha),
      `base_branch: ${branch}\nbase_sha: ${sha}\n`);
    await assert.rejects(() => runSkill(reviewer('main', sourceHead), f.task, verified,
      f.options, 'review-code', 2), /clean review base differs from hosted PR/);
    await assert.rejects(() => runSkill(f.ctx(rows, report('main', sourceHead),
      `base_branch: release\nbase_sha: ${hostedBase}\n`), f.task, verified,
      f.options, 'review-code', 3), /scope-incomplete/);
    const reviewed = await runSkill(reviewer('release', hostedBase), f.task, verified,
      f.options, 'review-code', 4);
    assert.equal(reviewed.latest['code-review'].status, 'clean');
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(f.repo, { recursive: true, force: true });
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
