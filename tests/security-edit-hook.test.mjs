import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import securityEditHook, { inspectEditedFile } from '../hooks/security-edit.mjs';

function workspace(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'security-edit-hook-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}
function file(root, name, contents) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}
const offlineEnv = cwd => ({ TRIVY_CACHE_DIR: path.join(cwd, 'no-local-trivy-cache') });

test('successful write result scans saved Dockerfile bytes and reports advisory coverage', t => {
  const cwd = workspace(t);
  const target = file(cwd, 'Dockerfile', 'FROM saved-content\n');
  const calls = [];
  const run = (bin, args, options) => {
    calls.push({ bin, args });
    assert.equal(options.cwd, fs.realpathSync(cwd));
    if (args[0] === '--version') return { status: 0, stdout: 'hadolint 2.12.0' };
    assert.notEqual(args.at(-1), fs.realpathSync(target));
    assert.equal(path.basename(args.at(-1)), 'Dockerfile');
    assert.equal(fs.readFileSync(args.at(-1), 'utf8'), 'FROM saved-content\n');
    return { status: 0, stdout: JSON.stringify([{ line: 1, code: 'DL3006', level: 'warning', message: 'source prose is never reported' }]) };
  };
  const report = inspectEditedFile({ toolName: 'write', input: { path: 'Dockerfile' }, details: { path: 'Dockerfile' }, content: [{ type: 'text', text: 'Wrote file: Dockerfile' }], isError: false }, { cwd, env: offlineEnv(cwd), run });
  assert.equal(report.coverage, 'incomplete');
  assert.equal(report.results[0].file, 'Dockerfile');
  assert.deepEqual(report.results[0].lanes.find(item => item.tool === 'hadolint').findings, [
    { tool: 'hadolint', path: 'Dockerfile', line: 1, rule: 'DL3006', severity: 'WARNING' },
  ]);
  assert.match(report.results[0].lanes.find(item => item.tool === 'semgrep').reason, /no registry fetch/);
  assert.match(report.results[0].lanes.find(item => item.tool === 'trivy_fs').reason, /no download/);
  assert.deepEqual(calls.map(({ bin, args }) => [bin, args[0]]), [['hadolint', '--version'], ['hadolint', '--format']]);
  assert.equal(JSON.stringify(report).includes('source prose is never reported'), false);
  const snapshot = calls.find(item => item.args[0] === '--format').args.at(-1);
  assert.equal(fs.existsSync(snapshot), false);
});

test('successful multi-file hashline edit scans saved files and follows MV destination', t => {
  const cwd = workspace(t);
  const dockerSource = file(cwd, 'Dockerfile', 'FROM saved image\n');
  const docker = path.join(cwd, 'Dockerfile.production');
  fs.renameSync(dockerSource, docker);
  const workflow = file(cwd, '.github/workflows/build.yaml', 'name: saved workflow\n');
  const seen = [];
  const run = (bin, args) => {
    if (args[0] === '--version') return { status: 0, stdout: `${bin} local` };
    const target = args.at(-1);
    seen.push({ bin, target, contents: fs.readFileSync(target, 'utf8') });
    if (bin === 'hadolint') return { status: 0, stdout: '[]' };
    if (bin === 'actionlint') return { status: 0, stdout: '' };
    assert.fail(`unexpected scanner ${bin}`);
  };
  const patch = [
    '*** Begin Patch',
    '[Dockerfile#A1B2]',
    'MV Dockerfile.production',
    '[.github/workflows/build.yaml#C3D4]',
    'PUT 1.=1:',
    '+name: saved workflow',
    '*** End Patch',
  ].join('\n');
  const content = [
    '[Dockerfile.production#D5E6]',
    '1:FROM saved image',
    '[.github/workflows/build.yaml#F7A8]',
    '1:name: saved workflow',
  ].join('\n');
  const report = inspectEditedFile({ toolName: 'edit', input: { patch }, details: {}, content: [{ type: 'text', text: content }], isError: false }, { cwd, env: offlineEnv(cwd), run });
  assert.deepEqual(report.results.map(item => item.file).sort(), ['.github/workflows/build.yaml', 'Dockerfile.production']);
  assert.deepEqual(seen.map(item => path.basename(item.target)).sort(), ['Dockerfile.production', 'build.yaml'].sort());
  assert.notDeepEqual(seen.map(item => item.target).sort(), [docker, workflow].map(file => fs.realpathSync(file)).sort());
  assert.deepEqual(seen.map(item => item.contents).sort(), ['FROM saved image\n', 'name: saved workflow\n'].sort());
});

test('absolute alias paths resolve inside the canonical repository root', t => {
  const cwd = workspace(t);
  const target = file(cwd, 'cfg/image.txt', 'FROM saved via alias\n');
  fs.symlinkSync(target, path.join(cwd, 'Dockerfile'));
  const canonicalRoot = fs.realpathSync(cwd);
  let aliasRoot;
  if (process.platform === 'darwin' && canonicalRoot.startsWith('/private/')) {
    aliasRoot = canonicalRoot.slice('/private'.length);
  } else {
    aliasRoot = path.join(path.dirname(cwd), `${path.basename(cwd)}-alias`);
    fs.symlinkSync(canonicalRoot, aliasRoot, 'dir');
    t.after(() => fs.rmSync(aliasRoot, { force: true }));
  }
  assert.equal(fs.realpathSync(aliasRoot), canonicalRoot);
  const calls = [];
  const run = (bin, args) => {
    calls.push({ bin, args });
    if (args[0] === '--version') return { status: 0, stdout: 'hadolint local' };
    assert.notEqual(args.at(-1), fs.realpathSync(target));
    assert.equal(path.basename(args.at(-1)), 'Dockerfile');
    assert.equal(fs.readFileSync(args.at(-1), 'utf8'), 'FROM saved via alias\n');
    return { status: 0, stdout: '[]' };
  };
  const report = inspectEditedFile({
    toolName: 'write',
    input: { path: path.join(aliasRoot, 'Dockerfile') },
    details: {},
    content: 'Wrote file',
    isError: false,
  }, { cwd, env: offlineEnv(cwd), run });
  assert.equal(report.results[0].file, 'Dockerfile');
  const snapshot = calls.find(item => item.args[0] === '--format').args.at(-1);
  assert.equal(fs.existsSync(snapshot), false);
  assert.deepEqual(calls.map(item => item.args[0]), ['--version', '--format']);
});

test('scanner reads a bounded snapshot after an in-root symlink changes', t => {
  const cwd = workspace(t);
  const target = file(cwd, 'cfg/image.txt', 'FROM saved repository bytes\n');
  const alias = path.join(cwd, 'Dockerfile');
  fs.symlinkSync(target, alias);
  const outside = file(path.dirname(cwd), `${path.basename(cwd)}-outside-image`, 'FROM outside bytes\n');
  t.after(() => fs.rmSync(outside, { force: true }));
  let snapshot;
  const run = (bin, args) => {
    if (args[0] === '--version') {
      fs.unlinkSync(alias);
      fs.symlinkSync(outside, alias);
      return { status: 0, stdout: 'hadolint local' };
    }
    snapshot = args.at(-1);
    assert.notEqual(snapshot, alias);
    assert.equal(path.basename(snapshot), 'Dockerfile');
    assert.equal(fs.readFileSync(snapshot, 'utf8'), 'FROM saved repository bytes\n');
    return { status: 0, stdout: '[]' };
  };
  const report = inspectEditedFile({
    toolName: 'write', input: { path: 'Dockerfile' }, details: {},
    content: 'Wrote file: Dockerfile', isError: false,
  }, { cwd, env: offlineEnv(cwd), run });
  assert.equal(report.results[0].file, 'Dockerfile');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'FROM outside bytes\n');
  assert.equal(fs.existsSync(snapshot), false);
});

test('environment files are excluded through either original or resolved aliases', t => {
  const cwd = workspace(t);
  const secret = file(cwd, '.env', 'SECRET=not-scanned\n');
  const safe = file(cwd, 'cfg/image.txt', 'FROM safe image\n');
  fs.symlinkSync(secret, path.join(cwd, 'Dockerfile'));
  fs.symlinkSync(safe, path.join(cwd, '.env.local'));
  let calls = 0;
  const run = () => { calls += 1; throw new Error('environment file must not be scanned'); };
  const inspect = name => inspectEditedFile({
    toolName: 'write', input: { path: name }, details: {}, content: 'Wrote file', isError: false,
  }, { cwd, env: offlineEnv(cwd), run });
  const targetIsEnvironment = inspect('Dockerfile');
  const aliasIsEnvironment = inspect('.env.local');
  assert.match(targetIsEnvironment.lanes[0].reason, /environment files are not scanned/);
  assert.match(aliasIsEnvironment.lanes[0].reason, /environment files are not scanned/);
  assert.equal(calls, 0);
});

test('files above the scan snapshot bound are not read by scanners', t => {
  const cwd = workspace(t);
  const target = path.join(cwd, 'Dockerfile');
  fs.mkdirSync(cwd, { recursive: true });
  const fd = fs.openSync(target, 'w');
  fs.ftruncateSync(fd, 5 * 1024 * 1024 + 1);
  fs.closeSync(fd);
  let calls = 0;
  const report = inspectEditedFile({
    toolName: 'write', input: { path: 'Dockerfile' }, details: {}, content: 'Wrote file', isError: false,
  }, { cwd, env: offlineEnv(cwd), run() { calls += 1; throw new Error('oversized file must not be scanned'); } });
  assert.match(report.lanes[0].reason, /5 MiB scan snapshot limit/);
  assert.equal(calls, 0);
});

test('failed completion and symlink escape never scan outside saved repository content', t => {
  const cwd = workspace(t);
  const outside = file(path.dirname(cwd), `${path.basename(cwd)}-outside-Dockerfile`, 'FROM outside\n');
  t.after(() => fs.rmSync(outside, { force: true }));
  fs.symlinkSync(outside, path.join(cwd, 'Dockerfile'));
  let calls = 0;
  const run = () => { calls += 1; throw new Error('scanner must not run'); };
  const failed = inspectEditedFile({ toolName: 'write', input: { path: 'Dockerfile' }, details: { path: 'Dockerfile' }, content: 'write failed', isError: true }, { cwd, env: offlineEnv(cwd), run });
  assert.match(failed.lanes[0].reason, /successful completion/);
  const escaped = inspectEditedFile({ toolName: 'write', input: { path: 'Dockerfile' }, details: { path: 'Dockerfile' }, content: 'Wrote file: Dockerfile', isError: false }, { cwd, env: offlineEnv(cwd), run });
  assert.match(escaped.lanes[0].reason, /outside the repository/);
  assert.equal(calls, 0);
});

test('Semgrep requires an explicit local rules path and sees completed workflow bytes', t => {
  const cwd = workspace(t);
  const target = file(cwd, '.github/workflows/build.yaml', 'name: saved workflow\n');
  const rules = file(cwd, 'rules.yml', 'rules: []\n');
  const calls = [];
  const run = (bin, args) => {
    calls.push({ bin, args });
    if (args[0] === '--version') return { status: 0, stdout: `${bin} local` };
    assert.notEqual(args.at(-1), fs.realpathSync(target));
    assert.equal(fs.readFileSync(args.at(-1), 'utf8'), 'name: saved workflow\n');
    if (bin === 'semgrep') return { status: 0, stdout: JSON.stringify({ results: [], errors: [] }) };
    if (bin === 'actionlint') return { status: 0, stdout: '' };
    assert.fail(`unexpected scanner ${bin}`);
  };
  const report = inspectEditedFile({ toolName: 'edit', input: { filePath: '.github/workflows/build.yaml' }, details: { filePath: '.github/workflows/build.yaml' }, content: [{ type: 'text', text: 'Edited file: .github/workflows/build.yaml' }], isError: false }, {
    cwd, env: { ...offlineEnv(cwd), SKILLS_SECURITY_SEMGREP_RULES: rules }, run,
  });
  const semgrep = report.results[0].lanes.find(item => item.tool === 'semgrep');
  assert.equal(semgrep.coverage, 'complete');
  const invocation = calls.find(call => call.bin === 'semgrep' && call.args[0] === 'scan');
  assert.ok(invocation.args.includes(rules));
  assert.equal(invocation.args.includes('p/default'), false);
});

test('OMP tool_result reads saved file after success and skips scanner on error', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'security-edit-hook-callback-'));
  const handlers = new Map();
  let output = '';
  let scannerCalls = 0;
  const originalWrite = process.stderr.write;
  try {
    securityEditHook({ on(event, handler) { handlers.set(event, handler); } }, {
      cwd, env: offlineEnv(cwd), run() { scannerCalls += 1; throw new Error('no scanner expected'); },
    });
    assert.deepEqual([...handlers.keys()], ['tool_result']);
    file(cwd, 'notes.txt', 'saved after edit execution\n');
    process.stderr.write = chunk => { output += String(chunk); return true; };
    handlers.get('tool_result')({
      toolName: 'edit', toolCallId: 'edit-1', input: {},
      details: {}, content: [{ type: 'text', text: 'Edited file: notes.txt' }], isError: false,
    });
    assert.match(output, /"file":"notes.txt"/);
    assert.equal(output.includes('saved after edit execution'), false);
    handlers.get('tool_result')({
      toolName: 'write', toolCallId: 'write-1', input: { path: 'Dockerfile' },
      details: { path: 'Dockerfile' }, content: [{ type: 'text', text: 'write failed' }], isError: true,
    });
    assert.match(output, /tool_result did not report successful completion/);
    assert.equal(scannerCalls, 0);
  } finally {
    process.stderr.write = originalWrite;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('successful edit result without a changed path is incomplete', t => {
  const cwd = workspace(t);
  const missing = inspectEditedFile({ toolName: 'edit', input: {}, details: {}, content: [], isError: false }, { cwd, env: offlineEnv(cwd) });
  assert.match(missing.lanes[0].reason, /no changed file paths/);
});
