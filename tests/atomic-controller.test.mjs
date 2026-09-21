import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { boundaryState, eligible, initialState, judgment, reconcileRecovery, runSkill, stagePrompt } from '../atomic/lib/controller.mjs';
import { digest, observeArtifacts, planProgress, readArtifact } from '../atomic/lib/artifacts.mjs';
import { ensureTask, revision } from '../atomic/lib/workspace.mjs';

const inputs = { verify: false, app_test: 'none' };
const state = (latest = {}, proofs = {}) => ({ latest, proofs, revision: 'r1', generation: 0, approvals: {} });
const artifact = (type, status = null) => ({ type, status, hash: `${type}-hash`, file: `${type}.md`, summary: type });

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
  fs.rmSync(repo, { recursive: true, force: true });
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
