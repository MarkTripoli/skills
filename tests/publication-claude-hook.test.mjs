import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyPublicationCommand } from '../shared/publication-command.mjs';

const source = fileURLToPath(new URL('../hooks/publication-pretooluse.mjs', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));
const dirs = [];
const gitEnv = process.platform === 'darwin' && fs.existsSync('/Library/Developer/CommandLineTools')
  ? { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } : process.env;
test.afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-publication-'));
  dirs.push(temp);
  const repo = path.join(temp, 'repo');
  const taskDir = path.join(repo, '.agents', 'tasks', 'proof-check');
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(taskDir, 'task.md'), '---\nslug: proof-check\n---\n');
  assert.equal(spawnSync('git', ['init', '-q', repo], { env: gitEnv }).status, 0);
  fs.mkdirSync(path.join(temp, 'hooks'));
  fs.mkdirSync(path.join(temp, 'shared'));
  fs.copyFileSync(source, path.join(temp, 'hooks', 'publication-pretooluse.mjs'));
  fs.copyFileSync(path.join(root, 'shared', 'publication-command.mjs'), path.join(temp, 'shared', 'publication-command.mjs'));
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(temp, 'shared', 'publication-proof.mjs'), 'process.stdout.write(process.env.PROOF_OUTPUT ?? "invalid");\n');
  const gh = path.join(bin, 'gh');
  fs.writeFileSync(gh, '#!/bin/sh\nif [ "$1 $2" = "pr view" ]; then printf "%s" "$PR_VIEW"; else exit 2; fi\n');
  fs.chmodSync(gh, 0o755);
  // This observed ./gh command shape is never executed by the hook.
  const marker = path.join(temp, 'shim-executed');
  fs.writeFileSync(path.join(repo, 'gh'), `#!/bin/sh\ntouch '${marker}'\n`);
  fs.chmodSync(path.join(repo, 'gh'), 0o755);
  return { temp, repo, taskDir, bin, marker };
}

function invoke(fix, command, extra = {}, payload = {}) {
  const result = spawnSync(process.execPath, [path.join(fix.temp, 'hooks', 'publication-pretooluse.mjs')], {
    cwd: fix.repo,
    encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: fix.repo, ...payload }),
    env: {
      ...gitEnv, PATH: `${fix.bin}:${process.env.PATH}`, SKILLS_PUBLICATION_TASK_DIR: fix.taskDir,
      PR_VIEW: JSON.stringify({ number: 7, isDraft: true }),
      PROOF_OUTPUT: JSON.stringify({ status: 'stale', allowed: false, ready: false, reason: 'tested proof does not cover the substantive code at HEAD' }),
      ...extra,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(fix.marker), false);
  return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : null;
}

test('classifier distinguishes real draft flags from quoted body text and prioritizes compound ready calls', () => {
  assert.deepEqual(classifyPublicationCommand('./gh pr create --title PROBE --body PROBE --base epic --head probe'), { action: 'ready-create' });
  assert.deepEqual(classifyPublicationCommand('gh pr create --body "some --draft words" --title test'), { action: 'ready-create' });
  assert.deepEqual(classifyPublicationCommand('gh pr create --body \"--draft\" --title test'), { action: 'ready-create' });
  assert.deepEqual(classifyPublicationCommand('gh pr create --body=--draft --title test'), { action: 'ready-create' });
  assert.deepEqual(classifyPublicationCommand('gh pr create --draft --body "caption"'), { action: 'draft-create' });
  assert.deepEqual(classifyPublicationCommand('gh pr create --draft && ./gh pr ready 7'), { action: 'ready-existing', number: '7' });
  assert.deepEqual(classifyPublicationCommand('gh pr ready 7'), { action: 'ready-existing', number: '7' });
  assert.deepEqual(classifyPublicationCommand('gh pr merge 7'), { action: 'unsupported-pr-command' });
  assert.deepEqual(classifyPublicationCommand('gh -R owner/repo pr ready 7'), { action: 'unsupported-pr-command' });
  assert.deepEqual(classifyPublicationCommand('cd elsewhere && gh pr ready 7'), { action: 'unsupported-pr-command' });
  assert.deepEqual(classifyPublicationCommand('GH_TOKEN=value gh pr ready 7'), { action: 'unsupported-pr-command' });
  assert.deepEqual(classifyPublicationCommand('/opt/homebrew/bin/gh pr create --draft'), { action: 'unsupported-pr-command' });
  assert.deepEqual(classifyPublicationCommand('printf ok | xargs gh pr ready 7'), { action: 'unsupported-pr-command' });
  assert.deepEqual(classifyPublicationCommand('gh pr create --draft && bash -c "gh pr ready 7"'), { action: 'unsupported-pr-command' });
  assert.equal(classifyPublicationCommand('gh pr edit 7 --body-file /tmp/provisional'), null);
  assert.equal(classifyPublicationCommand('gh pr comment 7 --body "passed proof"'), null);
  assert.equal(classifyPublicationCommand('echo "gh pr ready 7"'), null);
  assert.equal(classifyPublicationCommand('git status'), null);
});

test('plugin registers actual Bash PreToolUse hook', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  assert.equal(config.hooks.PreToolUse[0].matcher, 'Bash');
  assert.equal(config.hooks.PreToolUse[0].hooks[0].args[0], '${CLAUDE_PLUGIN_ROOT}/hooks/publication-pretooluse.mjs');
});

test('ready create denies before hosting, while draft create stays silent', () => {
  const fix = fixture();
  const denied = invoke(fix, './gh pr create --title PROBE --body PROBE --base epic --head probe');
  assert.equal(denied.permissionDecision, 'deny');
  assert.match(denied.permissionDecisionReason, /create a draft first/);
  assert.equal(invoke(fix, './gh pr create --draft --title PROBE --body PROBE --base epic --head probe'), null);
});

test('ready existing blocks stale proof with shared reason and permits only passing proof', () => {
  const fix = fixture();
  const denied = invoke(fix, 'gh pr ready 7');
  assert.equal(denied.permissionDecision, 'deny');
  assert.equal(denied.permissionDecisionReason, 'tested proof does not cover the substantive code at HEAD');
  assert.equal(invoke(fix, 'gh pr ready 7', { PROOF_OUTPUT: JSON.stringify({ status: 'pass', allowed: true, ready: true, reason: 'all current publication proof is verified' }) }), null);
  assert.equal(invoke(fix, 'gh pr ready', { PROOF_OUTPUT: JSON.stringify({ status: 'incomplete', allowed: true, ready: false, reason: 'draft is permitted only to host capture; ready publication is not authorized', override: 'audited' }) }).permissionDecision, 'deny');
});

test('invalid proof and unsupported targeted commands fail closed; unrelated calls remain untouched', () => {
  const fix = fixture();
  assert.match(invoke(fix, 'gh pr ready 7', { PROOF_OUTPUT: 'oops' }).permissionDecisionReason, /invalid JSON/);
  assert.match(invoke(fix, 'gh pr ready 7', { PROOF_OUTPUT: '{"status":"pass","ready":true}' }).permissionDecisionReason, /invalid decision/);
  assert.match(invoke(fix, 'gh pr create --draft=no').permissionDecisionReason, /Unsupported gh pr/);
  assert.match(invoke(fix, 'gh pr merge 7').permissionDecisionReason, /Unsupported gh pr/);
  assert.match(invoke(fix, undefined, {}, { tool_input: {} }).permissionDecisionReason, /Invalid Claude Bash command payload/);
  assert.equal(invoke(fix, 'git status'), null);
  assert.equal(invoke(fix, 'gh pr ready 7', { SKILLS_PUBLICATION_TASK_DIR: '' }), null);
  assert.equal(invoke(fix, 'gh pr ready 7', {}, { tool_name: 'Read' }), null);
});

test('repository-scoped opt-in leaves another repository untouched and rejects a non-draft ready transition', () => {
  const fix = fixture();
  const other = path.join(fix.temp, 'other');
  fs.mkdirSync(other);
  assert.equal(spawnSync('git', ['init', '-q', other], { env: gitEnv }).status, 0);
  assert.equal(invoke(fix, 'gh pr ready 7', {}, { cwd: other }), null);
  assert.match(invoke(fix, 'gh pr ready 7', { PR_VIEW: JSON.stringify({ number: 7, isDraft: false }) }).permissionDecisionReason, /existing draft PR/);
});
