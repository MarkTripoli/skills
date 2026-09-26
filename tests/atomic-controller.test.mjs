import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SKILLS, boundaryState, contextBoundaryAdmission, eligible, gated, initialState, judgment, reconcileRecovery, runSkill, stagePrompt } from '../atomic/lib/controller.mjs';
import { digest, observeArtifacts, planProgress, readArtifact, requireFresh } from '../atomic/lib/artifacts.mjs';
import { createArtifactIndex, recordArtifact, reserveArtifactIteration, writeArtifactIndex } from '../atomic/lib/artifact-index.mjs';
import { ensureTask, revision } from '../atomic/lib/workspace.mjs';

const inputs = { verify: false, app_test: 'none' };
const state = (latest = {}, proofs = {}) => ({ latest, proofs, revision: 'r1', generation: 0, approvals: {} });
const artifact = (type, status = null) => ({ type, status, hash: `${type}-hash`, file: `${type}.md`, summary: type });
const proved = (latest, types, generation = 0, codeRevision = 'r1') => ({
  ...state(latest, Object.fromEntries(types.map(type => [type, { hash: latest[type].hash, generation, revision: codeRevision }]))),
  generation, revision: codeRevision,
});
const capturedRevision = revision(path.dirname(fileURLToPath(import.meta.url)));
const capturedArtifact = (status = 'passed', url = 'https://captures.example/test/probe-output.txt') => {
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-evidence-'));
  const capture = 'evidence/session/probe-output.txt';
  const report = 'artifacts/evidence/recording/0001.md';
  fs.mkdirSync(path.join(taskDir, 'evidence', 'session'), { recursive: true });
  fs.mkdirSync(path.join(taskDir, 'artifacts', 'evidence', 'recording'), { recursive: true });
  fs.writeFileSync(path.join(taskDir, capture), 'command output: passed\n');
  const summary = `Captured CLI session: ${url}`;
  const text = `---\ntype: evidence\nstatus: ${status ?? 'passed'}\nsummary: ${JSON.stringify(summary)}\n---\n# Evidence\n\n## Revision\n\n- commit: ${capturedRevision}\n\n## Sessions\n\n- CLI: ${capture}\n\n## Results\n\n| Test | Result | Capture line |\n|---|---|---|\n| command | ${status ?? 'unknown'} | line 1 |\n\n## Posted to\n\n- PR description: ${url}\n- PR comment: https://github.com/example/repo/pull/42#issuecomment-123\n${status === 'untested' ? '\n## Caveats\n\n- CLI could not run on this platform; capture contains the attempt.\n' : ''}`;
  const file = path.join(taskDir, report);
  fs.writeFileSync(file, text);
  return { ...readArtifact(file), status, path: report };
};
const publishedDescription = (url = 'https://captures.example/test/probe-output.txt') => ({
  ...artifact('pr-description'),
  text: `## Purpose\n\nShip behavior.\n\n## Evidence\n\n- [Capture](${url}) and [separate PR comment](https://github.com/example/repo/pull/42#issuecomment-123)\n\n## Change outline\n\nUpdated CLI.\n`,
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

test('delivery records behavior before description and cannot skip capture when checks are disabled', () => {
  const reviewed = proved({ implementation: artifact('implementation'), 'code-review': artifact('code-review', 'clean') }, ['code-review']);
  assert.deepEqual(eligible(reviewed, inputs, 'oneshot', false), ['record-evidence']);
  const unprovedCapture = { ...reviewed, latest: { ...reviewed.latest, evidence: capturedArtifact(), 'pr-description': publishedDescription() } };
  assert.deepEqual(eligible(unprovedCapture, inputs, 'oneshot', false), ['record-evidence']);
  const captured = proved(unprovedCapture.latest, ['code-review', 'evidence']);
  assert.deepEqual(eligible(captured, inputs, 'oneshot', false), ['describe-pr']);
  assert.deepEqual(eligible(proved(captured.latest, ['code-review', 'evidence', 'pr-description']), inputs, 'oneshot', false), ['complete']);
  assert.deepEqual(eligible(proved({ ...reviewed.latest, evidence: capturedArtifact('untested') }, ['code-review', 'evidence']), inputs, 'oneshot', false), ['describe-pr']);
  const noCaveat = capturedArtifact('untested');
  noCaveat.text = noCaveat.text.replace(/\n## Caveats\n[\s\S]*$/, '');
  assert.deepEqual(eligible(proved({ ...reviewed.latest, evidence: noCaveat }, ['code-review', 'evidence']), inputs, 'oneshot', false), ['record-evidence']);
  const assertionOnly = { ...capturedArtifact(), text: '## Results\n\n- Claimed success.\n' };
  assert.deepEqual(eligible(proved({ ...reviewed.latest, evidence: assertionOnly }, ['code-review', 'evidence']), inputs, 'oneshot', false), ['record-evidence']);
  const summaryOnly = capturedArtifact();
  summaryOnly.text = summaryOnly.text.replace(/## Posted to\n[\s\S]*$/, '');
  assert.deepEqual(eligible(proved({ ...reviewed.latest, evidence: summaryOnly }, ['code-review', 'evidence']), inputs, 'oneshot', false), ['record-evidence']);
  const noCapture = capturedArtifact();
  noCapture.text = noCapture.text.replace('evidence/session/probe-output.txt', 'evidence/session/missing-output.txt');
  assert.deepEqual(eligible(proved({ ...reviewed.latest, evidence: noCapture }, ['code-review', 'evidence']), inputs, 'oneshot', false), ['record-evidence']);
});

test('full delivery waits for checks and review, then capture, publication, and completion', () => {
  const plan = { ...validSource(), text: '# Source\n\n## Phase 1\n- [x] Implement the change\n' };
  const latest = {
    plan, implementation: artifact('implementation'), verification: artifact('verification', 'passed'),
    'app-test': artifact('app-test', 'passed'), 'code-review': artifact('code-review', 'clean'),
    evidence: capturedArtifact(), 'pr-description': publishedDescription(),
  };
  const enabled = { verify: true, app_test: 'web' };
  for (const [types, next] of [
    [[], 'verify-implementation'],
    [['verification'], 'test-app'],
    [['verification', 'app-test'], 'review-code'],
    [['verification', 'app-test', 'code-review'], 'record-evidence'],
    [['verification', 'app-test', 'code-review', 'evidence'], 'describe-pr'],
    [['verification', 'app-test', 'code-review', 'evidence', 'pr-description'], 'complete'],
  ]) assert.deepEqual(eligible(proved(latest, types), enabled, 'full', false), [next]);
  const noComment = { ...latest, 'pr-description': { ...latest['pr-description'], text: latest['pr-description'].text.replace('https://github.com/example/repo/pull/42#issuecomment-123', 'comment pending') } };
  assert.deepEqual(eligible(proved(noComment, ['verification', 'app-test', 'code-review', 'evidence', 'pr-description']), enabled, 'full', false), ['describe-pr']);
});

test('failed capture repairs behavior and blocked capture never advances to PR description', () => {
  const base = { implementation: artifact('implementation'), 'code-review': artifact('code-review', 'clean'), 'pr-description': publishedDescription() };
  for (const mode of ['oneshot', 'resolve-reviews']) {
    const latest = mode === 'resolve-reviews' ? { ...base, 'pr-review': artifact('pr-review', 'approved') } : base;
    const prior = mode === 'resolve-reviews' ? ['pr-review'] : ['code-review'];
    assert.deepEqual(eligible(proved({ ...latest, evidence: capturedArtifact('failed') }, [...prior, 'evidence', 'pr-description']), inputs, mode, false), ['iterate-implementation']);
    assert.deepEqual(eligible(proved({ ...latest, evidence: capturedArtifact('blocked') }, [...prior, 'evidence', 'pr-description']), inputs, mode, false), ['blocked']);
    assert.deepEqual(eligible(proved({ ...latest, evidence: capturedArtifact(null) }, [...prior, 'evidence', 'pr-description']), inputs, mode, false), ['record-evidence']);
    const failed = proved({ ...latest, evidence: capturedArtifact('failed') }, [...prior, 'evidence']);
    assert.match(stagePrompt({ skillsDir: '/skills', cwd: '/repo', taskDir: '/repo/.agents/tasks/example' }, 'iterate-implementation', failed, inputs), /Current failed evidence artifact/);
  }
});

test('changed review invalidates old evidence and requires fresh capture and description before completion', () => {
  const latest = { 'pr-review': artifact('pr-review', 'approved'), evidence: capturedArtifact(), 'pr-description': publishedDescription() };
  const before = proved(latest, ['pr-review', 'evidence', 'pr-description']);
  assert.deepEqual(eligible(before, inputs, 'resolve-reviews', false), ['complete']);
  const changed = { ...before, generation: 1, revision: 'r2', proofs: { ...before.proofs, 'pr-review': { hash: latest['pr-review'].hash, generation: 1, revision: 'r2' } } };
  assert.deepEqual(eligible(changed, inputs, 'resolve-reviews', false), ['record-evidence']);
  const recaptured = { ...changed, latest: { ...latest, evidence: { ...capturedArtifact('passed', 'https://captures.example/test/new-output.txt'), hash: 'fresh-capture' } }, proofs: { ...changed.proofs, evidence: { hash: 'fresh-capture', generation: 1, revision: 'r2' } } };
  assert.deepEqual(eligible(recaptured, inputs, 'resolve-reviews', false), ['describe-pr']);
  const wrongCapture = { ...recaptured, proofs: { ...recaptured.proofs, 'pr-description': { hash: latest['pr-description'].hash, generation: 1, revision: 'r2' } } };
  assert.deepEqual(eligible(wrongCapture, inputs, 'resolve-reviews', false), ['describe-pr']);
  const updated = { ...recaptured, latest: { ...recaptured.latest, 'pr-description': { ...publishedDescription('https://captures.example/test/new-output.txt'), hash: 'updated-description' } }, proofs: { ...recaptured.proofs, 'pr-description': { hash: 'updated-description', generation: 1, revision: 'r2' } } };
  assert.deepEqual(eligible(updated, inputs, 'resolve-reviews', false), ['complete']);
  assert.deepEqual(eligible({ ...updated, proofs: { ...updated.proofs, evidence: { ...updated.proofs.evidence, hash: 'old-capture' } } }, inputs, 'resolve-reviews', false), ['record-evidence']);
  assert.deepEqual(eligible({ ...updated, proofs: { ...updated.proofs, evidence: { ...updated.proofs.evidence, generation: 0 } } }, inputs, 'resolve-reviews', false), ['record-evidence']);
  assert.deepEqual(eligible({ ...updated, revision: 'r3' }, inputs, 'resolve-reviews', false), ['resolve-pr-reviews']);
  assert.deepEqual(eligible(initialState({ latest: updated.latest }, 'r2'), inputs, 'resolve-reviews', false), ['resolve-pr-reviews']);
});

test('indexed capture prompt requires evidence.recording and both hosted publication locations', () => {
  const task = { skillsDir: '/skills', cwd: '/repo', taskDir: '/repo/.agents/tasks/example' };
  const current = { ...state(), index: createArtifactIndex('example') };
  const capture = stagePrompt(task, 'record-evidence', current, inputs);
  assert.equal(SKILLS['record-evidence'], 'evidence');
  assert.match(capture, /evidence\.recording\.0001 at artifacts\/evidence\/recording\/0001\.md/);
  assert.match(capture, /executed session, probe output, or transcript/);
  assert.match(capture, /BOTH the PR description and a separate PR comment/);
  assert.match(stagePrompt(task, 'describe-pr', current, inputs), /verify both locations/);
});

test('indexed capture records a fresh evidence.recording iteration and rejects a stale prior receipt', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-capture-')), 'capture-task');
  fs.mkdirSync(dir);
  const capture = 'evidence/session/probe-output.txt';
  const receipt = status => `---\ntype: evidence\nstatus: ${status}\nsummary: "CLI output captured at ${capturedRevision}"\n---\n# Evidence\n\n## Revision\n\n- commit: ${capturedRevision}\n\n## Sessions\n\n- CLI: ${capture}\n\n## Results\n\n| Test | Result | Capture line |\n|---|---|---|\n| command | ${status} | line 1 |\n\n## Posted to\n\n- PR description: https://captures.example/test/probe-output.txt\n- PR comment: https://github.com/example/repo/pull/42#issuecomment-123\n`;
  try {
    fs.mkdirSync(path.join(dir, 'evidence', 'session'), { recursive: true });
    fs.writeFileSync(path.join(dir, capture), 'command output: passed\n');
    writeArtifactIndex(dir, createArtifactIndex('capture-task'));
    const before = observeArtifacts(dir);
    const first = reserveArtifactIteration(dir, 'evidence', 'recording');
    assert.equal(first.id, 'evidence.recording.0001');
    fs.writeFileSync(path.join(dir, first.writePath), receipt('passed'));
    recordArtifact(dir, 'evidence', 'recording', 'evidence', first.writePath);
    const observed = observeArtifacts(dir);
    assert.equal(requireFresh(before, observed, 'evidence', first).status, 'passed');
    assert.deepEqual(eligible(proved({ implementation: artifact('implementation'), 'code-review': artifact('code-review', 'clean'), evidence: observed.latest.evidence }, ['code-review', 'evidence']), inputs, 'oneshot', false), ['describe-pr']);
    const next = reserveArtifactIteration(dir, 'evidence', 'recording');
    assert.equal(next.id, 'evidence.recording.0002');
    assert.equal(next.supersedes, first.id);
    fs.writeFileSync(path.join(dir, next.writePath), receipt('failed'));
    recordArtifact(dir, 'evidence', 'recording', 'evidence', next.writePath);
    const failed = observeArtifacts(dir);
    assert.equal(requireFresh(observed, failed, 'evidence', next).status, 'failed');
    assert.equal(failed.latest.evidence.id, 'evidence.recording.0002');
    assert.deepEqual(eligible(proved({ implementation: artifact('implementation'), 'code-review': artifact('code-review', 'clean'), evidence: failed.latest.evidence }, ['code-review', 'evidence']), inputs, 'oneshot', false), ['iterate-implementation']);
    assert.throws(() => requireFresh(failed, failed, 'evidence', next), /did not create or revise/);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});
