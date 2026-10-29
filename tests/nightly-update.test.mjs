import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DEFAULT_REMOTE, checkState, compareTags, latestTag, normalizeSelection, parseArgs, parseTag, stateDir, update } from '../scripts/nightly-update.mjs';
import { installUpdater, LABEL, systemdFiles, launchdPlist, UNIT } from '../scripts/install-updater.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temps = [];
function tmpdir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skills-nightly-')));
  temps.push(dir);
  return dir;
}
function put(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
after(() => temps.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const LS = ['a\trefs/tags/v4.3.1', 'b\trefs/tags/v5.0.0', 'c\trefs/tags/v5.10.0', 'd\trefs/tags/v5.9.0', 'e\trefs/tags/v6.0.0-rc1', 'f\trefs/tags/nightly'].join('\n');
const base = dir => ({ dir, setting: 'codex', skillNames: ['show-me'], env: { PATH: '' } });
function recorder({ fail } = {}) {
  const calls = [];
  return { calls, exec(command, args, options) {
    calls.push({ command, args, options });
    if (fail?.(command, args)) throw new Error('simulated command failure');
    return args[0] === 'ls-remote' ? LS : '';
  } };
}

test('release tags compare numerically and exclude prereleases and unsafe numbers', () => {
  assert.deepEqual(parseTag('v5.1.0'), [5, 1, 0]);
  for (const tag of ['v6.0.0-rc1', 'nightly', 'v05.1.0', 'v9007199254740992.0.0']) assert.equal(parseTag(tag), null);
  assert.ok(compareTags('v5.10.0', 'v5.9.0') > 0);
  assert.equal(latestTag(LS), 'v5.10.0');
  assert.equal(latestTag('a\trefs/tags/nightly'), null);
});

test('public defaults require deliberate skill selection instead of enabling all orchestration', () => {
  const parsed = parseArgs(['--targets', 'codex', '--skill', 'show-me', '--project']);
  assert.equal(parsed.remote, DEFAULT_REMOTE);
  assert.equal(DEFAULT_REMOTE, 'https://github.com/MarkTripoli/skills.git');
  assert.equal(parsed.project, true);
  assert.equal(stateDir({}, '/home/user'), '/home/user/.local/state/marktripoli-skills');
  assert.throws(() => normalizeSelection(parseArgs([])), /select skills explicitly/);
  assert.deepEqual(normalizeSelection(parseArgs(['--skill', '*'])).skillNames, ['*']);
  for (const args of [['--remote'], ['--unknown'], ['--targets', 'auto,codex', '--skill', 'show-me'], ['--skill', '../foreign']]) {
    assert.throws(() => normalizeSelection(parseArgs(args)));
  }
});

test('a release installs once for the same selection and repeats for changed selected resources', async () => {
  const dir = tmpdir();
  const { calls, exec } = recorder();
  const options = { ...base(dir), setting: 'claude-code,codex', exec };
  assert.match(await update(options), /nothing -> v5\.10\.0 for claude-code, codex/);
  const marker = JSON.parse(fs.readFileSync(path.join(dir, 'installed.json'), 'utf8'));
  assert.equal(marker.tag, 'v5.10.0');
  const install = calls.find(call => call.command === process.execPath);
  assert.deepEqual(install.args.slice(1), ['claude-code', 'codex', '--skill', 'show-me', '--yes']);
  assert.ok(calls.find(call => call.args[0] === 'clone').args.includes('v5.10.0'));
  assert.ok(calls.find(call => call.command === 'npm').args.includes('--ignore-scripts'));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['installed.json', 'owner']);
  calls.length = 0;
  assert.match(await update(options), /already at v5\.10\.0/);
  assert.equal(calls.length, 1);
  calls.length = 0;
  await update({ ...options, skillNames: ['create-plan'] });
  assert.ok(calls.some(call => call.command === process.execPath && call.args.includes('create-plan')));
  assert.notEqual(JSON.parse(fs.readFileSync(path.join(dir, 'installed.json'), 'utf8')).fingerprint, marker.fingerprint);
});

test('a newer release completed before lock acquisition is not downgraded', async () => {
  const dir = tmpdir();
  const initial = recorder();
  await update({ ...base(dir), exec: initial.exec });
  const marker = path.join(dir, 'installed.json');
  const installed = JSON.parse(fs.readFileSync(marker, 'utf8'));
  put(marker, JSON.stringify({ ...installed, tag: 'v5.0.0' }));
  const lock = path.join(dir, 'update.lock');
  const open = fs.openSync;
  const pending = recorder();
  let completed = false;
  fs.openSync = (file, ...args) => {
    if (file === lock && !completed) {
      completed = true;
      put(marker, JSON.stringify({ ...installed, tag: 'v5.11.0' }));
    }
    return open(file, ...args);
  };
  try {
    assert.match(await update({ ...base(dir), exec: pending.exec }), /already at v5\.11\.0/);
  } finally {
    fs.openSync = open;
  }
  assert.equal(JSON.parse(fs.readFileSync(marker, 'utf8')).tag, 'v5.11.0');
  assert.deepEqual(pending.calls.map(call => call.args[0]), ['ls-remote']);
  assert.equal(fs.existsSync(lock), false);
});

test('project scope and runtime/model overrides survive scheduled configuration', async () => {
  const root = tmpdir(); const home = path.join(root, 'home'); const cwd = path.join(root, 'project');
  fs.mkdirSync(cwd); fs.mkdirSync(home);
  const dir = path.join(root, 'state');
  const env = { PATH: '/custom/bin', CODEX_HOME: path.join(root, 'codex'), CLAUDE_CONFIG_DIR: path.join(root, 'claude'), SKILLS_MODEL_CANDIDATES_FILE: path.join(root, 'models.json') };
  const scheduler = recorder();
  installUpdater(['--targets', 'codex', '--skill', 'show-me', '--project', '--state-dir', dir], { home, cwd, env, platform: 'linux', exec: scheduler.exec });
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert.deepEqual(config.env, env);
  assert.equal(config.cwd, cwd);
  assert.equal(config.project, true);
  assert.deepEqual(config.skillNames, ['show-me']);
  assert.equal(fs.readFileSync(path.join(dir, 'bin/nightly-update.mjs'), 'utf8'), fs.readFileSync(path.join(REPO, 'scripts/nightly-update.mjs'), 'utf8'));
  const { calls, exec } = recorder();
  await update({ ...config, dir, exec });
  const install = calls.find(call => call.command === process.execPath);
  assert.equal(install.options.cwd, cwd);
  assert.equal(install.options.env.CODEX_HOME, env.CODEX_HOME);
  assert.equal(install.options.env.SKILLS_MODEL_CANDIDATES_FILE, env.SKILLS_MODEL_CANDIDATES_FILE);
  assert.ok(install.args.includes('--project'));
  assert.ok(scheduler.calls.some(call => call.args.join(' ') === `--user enable --now ${UNIT}.timer`));
});

test('failed installs retain the prior release marker and clean their private checkout for retry', async () => {
  const dir = tmpdir();
  const initial = recorder();
  await update({ ...base(dir), exec: initial.exec });
  const marker = fs.readFileSync(path.join(dir, 'installed.json'), 'utf8');
  const failed = recorder({ fail: command => command === process.execPath });
  await assert.rejects(update({ ...base(dir), skillNames: ['create-plan'], exec: failed.exec }), /simulated command failure/);
  assert.equal(fs.readFileSync(path.join(dir, 'installed.json'), 'utf8'), marker);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['installed.json', 'owner']);
  assert.match(await update({ ...base(dir), skillNames: ['create-plan'], exec: initial.exec }), /updated/);
});

test('offline and dry-run paths never create state or invoke an installer', async () => {
  const root = tmpdir(); const dir = path.join(root, 'state');
  const offline = recorder({ fail: () => true });
  await assert.rejects(update({ ...base(dir), exec: offline.exec }), /simulated command failure/);
  assert.equal(fs.existsSync(dir), false);
  const { calls, exec } = recorder();
  assert.match(await update({ ...base(dir), dryRun: true, exec }), /would install v5\.10\.0/);
  assert.deepEqual(calls.map(call => call.args[0]), ['ls-remote']);
  assert.equal(fs.existsSync(dir), false);
});

test('automatic targets skip undetected runtimes before fetching and never use the portable fallback', async () => {
  const root = tmpdir(); const dir = path.join(root, 'state'); const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const { calls, exec } = recorder();
  const options = { ...base(dir), setting: 'auto', env: { PATH: bin }, exec };
  assert.match(await update(options), /no agent found/);
  assert.equal(calls.length, 0);
  assert.equal(fs.existsSync(dir), false);
  put(path.join(bin, 'codex'), '');
  assert.match(await update(options), /for codex/);
  assert.deepEqual(calls.find(call => call.command === process.execPath).args.slice(1), ['codex', '--skill', 'show-me', '--yes']);
});

test('foreign state, source-controlled checkouts, and symlinked state fail before fetching or deletion', async () => {
  const root = tmpdir(); const foreign = path.join(root, 'foreign');
  put(path.join(foreign, 'keep'), 'user data');
  const { calls, exec } = recorder();
  await assert.rejects(update({ ...base(foreign), exec }), /foreign updater state/);
  const checkout = path.join(root, 'checkout');
  put(path.join(checkout, '.git'), 'gitdir: elsewhere');
  await assert.rejects(update({ ...base(path.join(checkout, 'state')), exec }), /source-controlled/);
  const link = path.join(root, 'link');
  fs.symlinkSync(foreign, link, 'dir');
  await assert.rejects(update({ ...base(link), exec }), /symlinked/);
  assert.equal(calls.length, 0);
  assert.equal(fs.readFileSync(path.join(foreign, 'keep'), 'utf8'), 'user data');
});

test('a running update lock prevents a second installation without touching the marker', async () => {
  const dir = tmpdir();
  checkState(dir, { create: true });
  put(path.join(dir, 'update.lock'), '');
  const { calls, exec } = recorder();
  await assert.rejects(update({ ...base(dir), exec }), /EEXIST/);
  assert.equal(calls.length, 1);
  assert.equal(fs.existsSync(path.join(dir, 'update.lock')), true);
  assert.equal(fs.existsSync(path.join(dir, 'installed.json')), false);
});

test('rendering scheduler configuration never touches HOME or runs scheduler commands', () => {
  for (const platform of ['linux', 'darwin']) {
    const root = tmpdir(); const home = path.join(root, 'home'); const dir = path.join(root, 'state');
    fs.mkdirSync(home);
    put(path.join(home, 'AGENTS.md'), 'user-managed instructions\n');
    const exec = () => assert.fail('preview must not run commands');
    const text = installUpdater(['--targets', 'codex', '--skill', 'show-me', '--state-dir', dir, '--print'], { home, cwd: root, env: { PATH: '/bin' }, platform, exec });
    assert.match(text, /MarkTripoli\/skills|io\.github\.marktripoli/);
    assert.match(text, /show-me/);
    assert.deepEqual(fs.readdirSync(home), ['AGENTS.md']);
    assert.equal(fs.existsSync(dir), false);
  }
});

test('scheduler uninstall preserves installed skills and user-editable updater configuration', () => {
  const root = tmpdir(); const home = path.join(root, 'home'); const dir = path.join(root, 'state');
  fs.mkdirSync(home);
  const { calls, exec } = recorder();
  const context = { home, cwd: root, env: { PATH: '/bin' }, platform: 'linux', exec };
  installUpdater(['--targets', 'codex', '--skill', 'show-me', '--state-dir', dir], context);
  const config = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
  put(path.join(home, '.agents/skills/show-me/SKILL.md'), 'installed skill');
  calls.length = 0;
  assert.match(installUpdater(['--uninstall', '--state-dir', dir], context), /installed skills.*unchanged/);
  assert.equal(fs.existsSync(path.join(home, '.config/systemd/user', `${UNIT}.timer`)), false);
  assert.equal(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'), config);
  assert.equal(fs.readFileSync(path.join(home, '.agents/skills/show-me/SKILL.md'), 'utf8'), 'installed skill');
  assert.ok(calls.some(call => call.args.join(' ') === `--user disable --now ${UNIT}.timer`));
});

test('scheduler serialization preserves spaces, XML characters, systemd specifiers, and literal dollars', () => {
  const inputs = { node: '/node path/node', script: '/state/$USER%/updater.mjs', config: '/state/a & b/config.json', dir: '/state/a & b', searchPath: '/custom bin:/bin' };
  const { service } = systemdFiles(inputs);
  assert.ok(service.includes('"/node path/node"'));
  assert.ok(service.includes('"/state/$$USER%%/updater.mjs"'));
  assert.ok(service.includes('Environment="PATH=/custom bin:/bin"'));
  const plist = launchdPlist({ ...inputs, hour: 4 });
  assert.ok(plist.includes(`<key>Label</key><string>${LABEL}</string>`));
  assert.ok(plist.includes('/state/a &amp; b/config.json'));
  assert.match(plist, /<key>Hour<\/key><integer>4<\/integer>/);
});

test('selected project updates use the split installer without mutating global instructions or unrelated resources', async () => {
  const root = tmpdir(); const home = path.join(root, 'home'); const cwd = path.join(root, 'project');
  const dir = path.join(root, 'state');
  const instructions = ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.codex/AGENTS.md', '.omp/agent/AGENTS.md', '.pi/agent/AGENTS.md'];
  for (const name of instructions) put(path.join(home, name), 'owner policy\n');
  put(path.join(cwd, 'AGENTS.md'), 'project policy\n');
  put(path.join(cwd, '.git'), 'gitdir: user-owned-checkout');
  const skillDirs = ['.claude/skills', '.agents/skills', '.omp/skills', '.pi/skills'];
  for (const name of skillDirs) put(path.join(cwd, name, 'foreign/SKILL.md'), 'unrelated skill\n');
  const globalsBefore = fs.readdirSync(home).sort();
  const exec = (command, args, options) => {
    if (args[0] === 'ls-remote') return LS;
    if (args[0] === 'clone') {
      // Use the real current split installer, but keep its writes in this isolated consumer HOME/project.
      const checkout = args.at(-1);
      fs.mkdirSync(path.join(checkout, 'scripts'));
      fs.symlinkSync(path.join(REPO, 'scripts/install.mjs'), path.join(checkout, 'scripts/install.mjs'));
      return '';
    }
    if (command === 'npm') return '';
    assert.equal(command, process.execPath);
    const result = spawnSync(command, args, { ...options, env: { ...options.env, HOME: home, USERPROFILE: home }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  await update({ ...base(dir), setting: 'claude-code,codex,oh-my-pi,pi,portable', project: true, cwd, exec });
  for (const name of skillDirs) {
    assert.deepEqual(fs.readdirSync(path.join(cwd, name)).sort(), ['foreign', 'show-me']);
    assert.equal(fs.readFileSync(path.join(cwd, name, 'foreign/SKILL.md'), 'utf8'), 'unrelated skill\n');
    assert.ok(fs.readFileSync(path.join(cwd, name, 'show-me/SKILL.md'), 'utf8').includes('show-me'));
  }
  assert.deepEqual(fs.readdirSync(home).sort(), globalsBefore);
  for (const name of instructions) assert.equal(fs.readFileSync(path.join(home, name), 'utf8'), 'owner policy\n');
  assert.equal(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8'), 'project policy\n');
  assert.equal(fs.existsSync(path.join(home, '.config/agent-instructions')), false);
  assert.equal(fs.existsSync(path.join(home, '.codex/config.toml')), false);
  assert.equal(fs.existsSync(path.join(cwd, '.claude/agents')), false);
});

test('no release tags leave state untouched and a known newer release never downgrades', async () => {
  const dir = path.join(tmpdir(), 'state');
  assert.match(await update({ ...base(dir), exec: () => 'a\trefs/tags/nightly' }), /no release tag/);
  assert.equal(fs.existsSync(dir), false);
  const { exec } = recorder();
  await update({ ...base(dir), exec });
  const marker = path.join(dir, 'installed.json');
  const before = fs.readFileSync(marker, 'utf8');
  assert.match(await update({ ...base(dir), exec: () => 'a\trefs/tags/v1.0.0' }), /already at v5\.10\.0/);
  assert.equal(fs.readFileSync(marker, 'utf8'), before);
});

test('dangling state and scheduler links cannot redirect writes to user files', () => {
  const root = tmpdir(); const dir = path.join(root, 'state'); const home = path.join(root, 'home');
  checkState(dir, { create: true });
  const target = path.join(root, 'must-not-be-created');
  fs.symlinkSync(target, path.join(dir, 'config.json'));
  const { calls, exec } = recorder();
  const argv = ['--targets', 'codex', '--skill', 'show-me', '--state-dir', dir];
  const context = { home, cwd: root, env: { PATH: '/bin' }, platform: 'linux', exec };
  assert.throws(() => installUpdater(argv, context), /symlinked/);
  assert.equal(fs.existsSync(target), false);
  fs.unlinkSync(path.join(dir, 'config.json'));
  const timer = path.join(home, '.config/systemd/user', `${UNIT}.timer`);
  fs.mkdirSync(path.dirname(timer), { recursive: true });
  fs.symlinkSync(target, timer);
  assert.throws(() => installUpdater(argv, context), /symlinked/);
  assert.equal(fs.existsSync(target), false);
  assert.equal(calls.length, 0);
});

test('launchd supports explicit enable, reconfiguration, and uninstall without changing policy', () => {
  const root = tmpdir(); const home = path.join(root, 'home'); const dir = path.join(root, 'state');
  put(path.join(home, 'AGENTS.md'), 'owner instructions');
  const { calls, exec } = recorder();
  const context = { home, cwd: root, env: { PATH: '/bin' }, platform: 'darwin', exec };
  const argv = ['--targets', 'codex', '--skill', 'show-me', '--state-dir', dir];
  installUpdater(argv, context);
  const plist = path.join(home, 'Library/LaunchAgents', `${LABEL}.plist`);
  assert.equal(fs.existsSync(plist), true);
  installUpdater(['--targets', 'codex', '--skill', 'coasts', '--state-dir', dir], context);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).skillNames, ['coasts']);
  installUpdater(['--uninstall', '--state-dir', dir], context);
  assert.equal(fs.existsSync(plist), false);
  assert.equal(fs.readFileSync(path.join(home, 'AGENTS.md'), 'utf8'), 'owner instructions');
  assert.equal(fs.existsSync(path.join(dir, 'config.json')), true);
});

test('relative runtime overrides retain their original working-directory meaning', () => {
  const cwd = tmpdir();
  const selection = normalizeSelection({ setting: 'codex', skillNames: ['show-me'], cwd, env: { PATH: `bin${path.delimiter}/usr/bin`, CODEX_HOME: '.custom-codex', SKILLS_MODEL_CANDIDATES_FILE: 'models.json' } });
  assert.equal(selection.env.CODEX_HOME, path.join(cwd, '.custom-codex'));
  assert.equal(selection.env.SKILLS_MODEL_CANDIDATES_FILE, path.join(cwd, 'models.json'));
  assert.equal(selection.env.PATH, `${path.join(cwd, 'bin')}${path.delimiter}/usr/bin`);
});

test('scheduler removal refuses an active updater before unloading its process', () => {
  const root = tmpdir();
  const home = path.join(root, 'home');
  const dir = path.join(root, 'state');
  const scheduler = recorder();
  const options = { home, cwd: root, env: { PATH: '' }, platform: 'darwin', exec: scheduler.exec };
  installUpdater(['--targets', 'codex', '--skill', 'show-me', '--state-dir', dir], options);
  put(path.join(dir, 'update.lock'), '');
  scheduler.calls.length = 0;
  assert.throws(() => installUpdater(['--uninstall', '--state-dir', dir], options), /updater is running/);
  assert.deepEqual(scheduler.calls, []);
  assert.ok(fs.existsSync(path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`)));
});

test('an unloaded launchd job can be re-enabled or removed without masking other errors', () => {
  const root = tmpdir();
  const home = path.join(root, 'home');
  const dir = path.join(root, 'state');
  const scheduler = recorder();
  let printError = 'Could not find service in domain for gui';
  const options = { home, cwd: root, env: { PATH: '' }, platform: 'darwin', exec(command, args, opts) {
    if (command === 'launchctl' && args[0] === 'print') throw new Error(printError);
    return scheduler.exec(command, args, opts);
  } };
  const selection = ['--targets', 'codex', '--skill', 'show-me', '--state-dir', dir];
  installUpdater(selection, options);
  installUpdater(selection, options);
  printError = 'permission denied';
  assert.throws(() => installUpdater(['--uninstall', '--state-dir', dir], options), /permission denied/);
  const plist = path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
  assert.ok(fs.existsSync(plist));
  printError = 'Could not find service in domain for gui';
  installUpdater(['--uninstall', '--state-dir', dir], options);
  assert.equal(fs.existsSync(plist), false);
});
