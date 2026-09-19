import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { eligible, judgment } from '../atomic/lib/controller.mjs';
import { digest, readArtifact } from '../atomic/lib/artifacts.mjs';
import { ensureTask } from '../atomic/lib/workspace.mjs';

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
