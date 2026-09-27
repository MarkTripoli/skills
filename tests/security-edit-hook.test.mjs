import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectEditedFile } from '../hooks/security-edit.mjs';

function workspace(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'security-edit-hook-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}

const dockerEdit = { toolName: 'write', input: { path: 'Dockerfile', content: 'FROM scratch\n' } };

test('default edit hook reports local advisory and incomplete lanes without registry or cache access', t => {
  const cwd = workspace(t);
  const calls = [];
  const run = (bin, args, options) => {
    calls.push({ bin, args, options });
    assert.equal(options.cwd, cwd);
    if (args[0] === '--version') return { status: 0, stdout: 'hadolint 2.12.0' };
    assert.equal(fs.readFileSync(args.at(-1), 'utf8'), 'FROM scratch\n');
    if (bin !== 'hadolint') assert.fail(`unexpected scanner ${bin}`);
    return { status: 0, stdout: JSON.stringify([{ line: 1, code: 'DL3006', level: 'warning', message: 'do not expose source prose' }]) };
  };
  const report = inspectEditedFile(dockerEdit, { cwd, env: {}, run });
  assert.equal(report.supported, true);
  assert.equal(report.coverage, 'incomplete');
  assert.deepEqual(report.lanes.find(item => item.tool === 'hadolint').findings, [
    { tool: 'hadolint', path: 'Dockerfile', line: 1, rule: 'DL3006', severity: 'WARNING' },
  ]);
  assert.match(report.lanes.find(item => item.tool === 'semgrep').reason, /no registry fetch/);
  assert.match(report.lanes.find(item => item.tool === 'trivy_fs').reason, /no download/);
  assert.deepEqual(calls.map(({ bin, args }) => [bin, args[0]]), [['hadolint', '--version'], ['hadolint', '--format']]);
  assert.equal(JSON.stringify(report).includes('do not expose source prose'), false);
});

test('missing scanner remains visible as incomplete without blocking the edit', t => {
  const cwd = workspace(t);
  const report = inspectEditedFile(dockerEdit, {
    cwd,
    env: {},
    run(bin) {
      assert.equal(bin, 'hadolint');
      return { error: Object.assign(new Error('not installed'), { code: 'ENOENT' }), status: null, stdout: '' };
    },
  });
  const hadolint = report.lanes.find(item => item.tool === 'hadolint');
  assert.equal(hadolint.coverage, 'incomplete');
  assert.equal(hadolint.reason, 'tool unavailable');
  assert.equal(report.supported, true);
  assert.equal(report.coverage, 'incomplete');
});

test('Semgrep runs only with an explicit existing local rules path', t => {
  const cwd = workspace(t);
  const rules = path.join(cwd, 'rules.yml');
  fs.writeFileSync(rules, 'rules: []\n');
  const calls = [];
  const run = (bin, args) => {
    calls.push({ bin, args });
    if (args[0] === '--version') return { status: 0, stdout: `${bin} local` };
    if (bin === 'semgrep') return { status: 0, stdout: JSON.stringify({ results: [], errors: [] }) };
    if (bin === 'actionlint') return { status: 0, stdout: '' };
    return { status: 0, stdout: '[]' };
  };
  const report = inspectEditedFile({ toolName: 'edit', input: { file_path: '.github/workflows/build.yaml', newText: 'name: build\n' } }, {
    cwd,
    env: { SKILLS_SECURITY_SEMGREP_RULES: rules },
    run,
  });
  const semgrep = report.lanes.find(item => item.tool === 'semgrep');
  assert.equal(semgrep.coverage, 'complete');
  const invocation = calls.find(call => call.bin === 'semgrep' && call.args[0] === 'scan');
  assert.ok(invocation);
  assert.ok(invocation.args.includes(rules));
  assert.equal(invocation.args.includes('p/default'), false);
  assert.ok(report.lanes.some(item => item.tool === 'actionlint'));
});

test('unsupported callbacks and missing changed content are explicit and non-blocking', t => {
  const cwd = workspace(t);
  assert.equal(inspectEditedFile({ toolName: 'bash', input: {} }, { cwd }).supported, false);
  const missing = inspectEditedFile({ toolName: 'write', input: { path: 'Dockerfile' } }, { cwd });
  assert.equal(missing.supported, true);
  assert.match(missing.lanes[0].reason, /content unavailable/);
});
