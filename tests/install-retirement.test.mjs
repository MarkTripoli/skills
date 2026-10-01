import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { plan, apply, buildTrees, updateConfigBlock } from '../scripts/install.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const recorded = JSON.parse(fs.readFileSync(new URL('./fixtures/retirement-shipped.json', import.meta.url), 'utf8'));
const shipped = JSON.parse(gunzipSync(Buffer.from(recorded.payload, 'base64')).toString('utf8'));
const env = { PATH: '' };
const temps = [];
const ENTRY = "export { default } from './skills-delivery/workflows/delivery.ts';\n";
function tmpdir() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-')); temps.push(dir); return dir; }
after(() => { for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true }); });
function put(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function seed(dir, files) { for (const [file, content] of Object.entries(files)) put(path.join(dir, file), content); }
function options(home, extra = {}) { return { targets: ['portable'], skillNames: ['show-me'], cwd: home, home, env, ...extra }; }
function install(opts) {
  const planned = plan(opts);
  const lines = apply(planned, { built: buildTrees(planned, tmpdir()), uninstall: false, home: opts.home });
  return { planned, lines };
}
function atomic(home) {
  const base = path.join(home, '.atomic', 'agent', 'workflows');
  seed(path.join(base, 'skills-delivery'), shipped.atomic);
  put(path.join(base, 'skills-delivery.mjs'), ENTRY);
  return base;
}
const configSection = '[agents.agent-first-sergent]\nconfig_file = "./agents/agent-first-sergent.toml"';

test('install removes byte-exact historical skills and workers across runtime directories, not lookalikes', () => {
  const home = tmpdir();
  const roots = ['.agents/skills', '.claude/skills', '.omp/agent/skills', '.pi/agent/skills'];
  for (const root of roots) for (const [name, files] of Object.entries(shipped.skills)) seed(path.join(home, root, name), files);
  const lookalike = path.join(home, '.claude/skills/run-task/SKILL.md');
  fs.appendFileSync(lookalike, '\nMy custom instruction, retaining the original collection link.\n');
  const md = path.join(home, '.claude/agents/agent-first-sergent.md');
  const toml = path.join(home, '.codex/agents/agent-first-sergent.toml');
  put(md, shipped.workers['agent-first-sergent.md']);
  put(toml, shipped.workers['agent-first-sergent.toml']);
  const config = path.join(home, '.codex/config.toml');
  put(config, 'model = "gpt-5"\n' + updateConfigBlock('', configSection + '\n\n[agents.mine]\nconfig_file = "mine.toml"'));
  const result = install(options(home, { targets: ['claude-code'] }));
  for (const root of roots) for (const name of Object.keys(shipped.skills)) {
    if (root === '.claude/skills' && name === 'run-task') continue;
    assert.equal(fs.existsSync(path.join(home, root, name)), false, `${root}/${name}`);
  }
  assert.match(fs.readFileSync(lookalike, 'utf8'), /My custom instruction/);
  assert.equal(fs.existsSync(md), false);
  assert.equal(fs.existsSync(toml), false);
  const remaining = fs.readFileSync(config, 'utf8');
  assert.match(remaining, /model = "gpt-5"/);
  assert.match(remaining, /\[agents.mine\]/);
  assert.doesNotMatch(remaining, /agent-first-sergent/);
  assert.ok(result.planned.notes.some(note => note.includes('edited, extra or unknown')));
});

test('pre-existing edits to references, workers and managed configuration survive with their dependencies', () => {
  const home = tmpdir();
  const skill = path.join(home, '.agents/skills/agent-first-sergent');
  seed(skill, shipped.skills['agent-first-sergent']);
  put(path.join(skill, 'references/my-reference.md'), 'My reference.\n');
  const worker = path.join(home, '.codex/agents/agent-first-sergent.toml');
  put(worker, shipped.workers['agent-first-sergent.toml'] + '\n# my worker change\n');
  const config = path.join(home, '.codex/config.toml');
  const text = updateConfigBlock('', configSection);
  put(config, text);
  install(options(home));
  assert.equal(fs.readFileSync(path.join(skill, 'references/my-reference.md'), 'utf8'), 'My reference.\n');
  assert.match(fs.readFileSync(worker, 'utf8'), /my worker change/);
  assert.equal(fs.readFileSync(config, 'utf8'), text);
  put(config, updateConfigBlock('', configSection + '\nmodel = "custom"'));
  const custom = fs.readFileSync(config, 'utf8');
  install(options(home));
  assert.equal(fs.readFileSync(config, 'utf8'), custom);
});

test('Codex installation and selected uninstall preserve edited retired configuration and its exact worker', () => {
  const home = tmpdir();
  const worker = path.join(home, '.codex/agents/agent-first-sergent.toml');
  put(worker, shipped.workers['agent-first-sergent.toml']);
  const config = path.join(home, '.codex/config.toml');
  const customized = configSection + '\nmodel = "my-custom-model"\n# My retired worker comment';
  put(config, 'model = "outside"\n' + updateConfigBlock('', '# My managed preamble\n' + customized));
  const opts = options(home, { targets: ['codex'], skillNames: ['agent-implementer'] });
  install(opts);
  const installed = fs.readFileSync(config, 'utf8');
  assert.ok(installed.includes(customized));
  assert.ok(installed.includes('# My managed preamble'));
  assert.ok(installed.startsWith('model = "outside"\n'));
  assert.ok(installed.includes('[agents.agent-implementer]'));
  assert.equal(fs.readFileSync(worker, 'utf8'), shipped.workers['agent-first-sergent.toml']);
  apply(plan({ ...opts, uninstall: true }), { built: new Map(), uninstall: true, home });
  const uninstalled = fs.readFileSync(config, 'utf8');
  assert.ok(uninstalled.includes(customized));
  assert.doesNotMatch(uninstalled, /\[agents\.agent-implementer\]/);
  assert.equal(fs.readFileSync(worker, 'utf8'), shipped.workers['agent-first-sergent.toml']);
});

test('extra empty directories in historical skills, Archon packs or extensions prevent removal', () => {
  const home = tmpdir();
  const roots = [
    [path.join(home, '.agents/skills/run-task'), shipped.skills['run-task']],
    [path.join(home, '.archon/workflows/delivery'), shipped.packs.delivery],
    [path.join(home, '.omp/agent/extensions/run-task'), shipped.extensions.omp],
  ];
  for (const [root, files] of roots) { seed(root, files); fs.mkdirSync(path.join(root, 'my-empty-directory')); }
  install(options(home));
  for (const [root] of roots) assert.ok(fs.existsSync(path.join(root, 'my-empty-directory')));
});

test('exact Atomic installations, including copied YAML and helpers, retire in default and overridden directories', () => {
  const home = tmpdir(); const custom = tmpdir();
  const base = atomic(home);
  seed(path.join(custom, 'workflows/skills-delivery'), shipped.atomic);
  put(path.join(custom, 'workflows/skills-delivery.mjs'), ENTRY);
  put(path.join(base, 'mine.ts'), 'User workflow.\n');
  const result = install(options(home, { env: { ...env, ATOMIC_CODING_AGENT_DIR: custom } }));
  for (const parent of [base, path.join(custom, 'workflows')]) {
    assert.equal(fs.existsSync(path.join(parent, 'skills-delivery')), false);
    assert.equal(fs.existsSync(path.join(parent, 'skills-delivery.mjs')), false);
  }
  assert.equal(fs.readFileSync(path.join(base, 'mine.ts'), 'utf8'), 'User workflow.\n');
  assert.equal(result.lines.filter(line => line.startsWith('removed retired Atomic')).length, 4);
});

for (const mutation of ['source-edit', 'extra-file', 'extra-directory', 'dependency-edit', 'entry-edit']) {
  test(`Atomic ${mutation} made before planning preserves the tree and importing entry`, () => {
    const home = tmpdir(); const base = atomic(home); const tree = path.join(base, 'skills-delivery');
    if (mutation === 'source-edit') fs.appendFileSync(path.join(tree, 'workflows/delivery.ts'), '\n// my edit\n');
    if (mutation === 'extra-file') put(path.join(tree, 'notes.txt'), 'My notes.\n');
    if (mutation === 'extra-directory') fs.mkdirSync(path.join(tree, 'my-data'));
    if (mutation === 'dependency-edit') fs.appendFileSync(path.join(tree, 'node_modules/yaml/package.json'), '\n');
    if (mutation === 'entry-edit') fs.appendFileSync(path.join(base, 'skills-delivery.mjs'), '// my entry\n');
    const beforeEntry = fs.readFileSync(path.join(base, 'skills-delivery.mjs'), 'utf8');
    const result = install(options(home));
    assert.ok(fs.existsSync(path.join(tree, 'workflows/delivery.ts')));
    assert.equal(fs.readFileSync(path.join(base, 'skills-delivery.mjs'), 'utf8'), beforeEntry);
    assert.ok(result.planned.notes.some(note => note.includes('kept retired Atomic')));
  });
}

test('an edited Atomic entry importing another tree is retained while the exact retired tree is removed', () => {
  const home = tmpdir(); const base = atomic(home);
  const entry = "export { default } from './mine/workflow.ts';\n";
  put(path.join(base, 'skills-delivery.mjs'), entry);
  install(options(home));
  assert.equal(fs.existsSync(path.join(base, 'skills-delivery')), false);
  assert.equal(fs.readFileSync(path.join(base, 'skills-delivery.mjs'), 'utf8'), entry);
});

test('each byte-exact Atomic half can retire independently', () => {
  for (const half of ['tree', 'entry']) {
    const home = tmpdir(); const base = atomic(home);
    fs.rmSync(path.join(base, half === 'tree' ? 'skills-delivery.mjs' : 'skills-delivery'), { recursive: true });
    install(options(home));
    assert.equal(fs.existsSync(path.join(base, 'skills-delivery')), false);
    assert.equal(fs.existsSync(path.join(base, 'skills-delivery.mjs')), false);
  }
});

test('Archon packs and run-task extensions remove exact historical inventories, not shape-compatible edits', () => {
  const home = tmpdir();
  for (const [name, files] of Object.entries(shipped.packs)) seed(path.join(home, '.archon/workflows', name), files);
  for (const [runtime, files] of Object.entries(shipped.extensions)) seed(path.join(home, `.${runtime}/agent/extensions/run-task`), files);
  install(options(home));
  for (const name of Object.keys(shipped.packs)) assert.equal(fs.existsSync(path.join(home, '.archon/workflows', name)), false);
  for (const runtime of Object.keys(shipped.extensions)) assert.equal(fs.existsSync(path.join(home, `.${runtime}/agent/extensions/run-task`)), false);
  const pack = path.join(home, '.archon/workflows/delivery');
  const extension = path.join(home, '.omp/agent/extensions/run-task');
  seed(pack, shipped.packs.delivery); seed(extension, shipped.extensions.omp);
  const yaml = Object.keys(shipped.packs.delivery).find(name => name.endsWith('.yaml') && !name.includes('/fixtures/'));
  fs.appendFileSync(path.join(pack, yaml), '\n# My edit, preserving the name header.\n');
  fs.appendFileSync(path.join(extension, 'index.js'), '\n// My edit, preserving the extension header.\n');
  install(options(home));
  assert.match(fs.readFileSync(path.join(pack, yaml), 'utf8'), /My edit/);
  assert.match(fs.readFileSync(path.join(extension, 'index.js'), 'utf8'), /My edit/);
});

test('symlinked resources and runtime ancestors are retained without touching their targets', () => {
  const home = tmpdir(); const foreign = tmpdir();
  seed(path.join(foreign, 'run-task'), shipped.skills['run-task']);
  fs.mkdirSync(path.join(home, '.agents/skills'), { recursive: true });
  const linked = path.join(home, '.agents/skills/run-task');
  fs.symlinkSync(path.join(foreign, 'run-task'), linked);
  fs.mkdirSync(path.join(home, '.claude')); fs.symlinkSync(foreign, path.join(home, '.claude/skills'));
  const result = install(options(home));
  assert.ok(fs.lstatSync(linked).isSymbolicLink());
  assert.ok(fs.existsSync(path.join(foreign, 'run-task/SKILL.md')));
  assert.ok(result.planned.notes.some(note => note.includes('symlinked')));
});

test('apply rechecks exact contents and import relationships after planning', () => {
  const home = tmpdir(); const base = atomic(home);
  const skill = path.join(home, '.agents/skills/run-task'); seed(skill, shipped.skills['run-task']);
  const opts = options(home); const planned = plan(opts);
  fs.appendFileSync(path.join(skill, 'SKILL.md'), '\nMy late edit.\n');
  fs.appendFileSync(path.join(base, 'skills-delivery.mjs'), '// My late entry.\n');
  const lines = apply(planned, { built: buildTrees(planned, tmpdir()), uninstall: false, home });
  assert.match(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), /My late edit/);
  assert.ok(fs.existsSync(path.join(base, 'skills-delivery/workflows/delivery.ts')));
  assert.ok(lines.some(line => line.includes('contents changed after planning')));
});

test('project retirement leaves home resources, history, GitHub skills and owner worktrees untouched', () => {
  const home = tmpdir(); const project = tmpdir();
  seed(path.join(home, '.agents/skills/run-task'), shipped.skills['run-task']); atomic(home);
  seed(path.join(project, '.agents/skills/run-task'), shipped.skills['run-task']);
  seed(path.join(project, '.atomic/workflows/skills-delivery'), shipped.atomic);
  put(path.join(project, '.atomic/workflows/skills-delivery.mjs'), ENTRY);
  for (const name of ['describe-pr', 'resolve-pr-reviews']) put(path.join(project, '.agents/skills', name, 'SKILL.md'), shipped.skills['run-task']['SKILL.md']);
  const task = path.join(project, '.agents/tasks/old/task.md'); put(task, 'Historical task.\n');
  const worktree = path.join(home, '.agents/worktrees/repo/old/sentinel'); put(worktree, 'Owner worktree.\n');
  install(options(home, { cwd: project, project: true, env: { CLAUDE_CONFIG_DIR: home, CODEX_HOME: home, ATOMIC_CODING_AGENT_DIR: home } }));
  assert.equal(fs.existsSync(path.join(project, '.agents/skills/run-task')), false);
  assert.equal(fs.existsSync(path.join(project, '.atomic/workflows/skills-delivery')), false);
  assert.ok(fs.existsSync(path.join(home, '.agents/skills/run-task/SKILL.md')));
  assert.ok(fs.existsSync(path.join(home, '.atomic/agent/workflows/skills-delivery.mjs')));
  for (const name of ['describe-pr', 'resolve-pr-reviews']) assert.ok(fs.existsSync(path.join(project, '.agents/skills', name, 'SKILL.md')));
  assert.equal(fs.readFileSync(task, 'utf8'), 'Historical task.\n');
  assert.equal(fs.readFileSync(worktree, 'utf8'), 'Owner worktree.\n');
});

test('uninstall removes exact retired resources without building an install tree', () => {
  const home = tmpdir(); const skill = path.join(home, '.agents/skills/start-task'); seed(skill, shipped.skills['start-task']);
  const planned = plan(options(home, { uninstall: true }));
  apply(planned, { built: new Map(), uninstall: true, home });
  assert.equal(fs.existsSync(skill), false);
});

test('actual CLI dry-run lists exact owned retirement without writes; apply removes it', () => {
  const home = tmpdir(); const base = atomic(home);
  seed(path.join(home, '.agents/skills/run-task'), shipped.skills['run-task']);
  const run = (...extra) => spawnSync(process.execPath, [path.join(REPO, 'scripts/install.mjs'), 'portable', '--skill', 'show-me', '--yes', ...extra], { cwd: home, env: { PATH: '', HOME: home }, encoding: 'utf8' });
  const dry = run('--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would remove retired Atomic delivery workflow/);
  assert.ok(fs.existsSync(path.join(base, 'skills-delivery.mjs')));
  assert.ok(fs.existsSync(path.join(home, '.agents/skills/run-task/SKILL.md')));
  const applied = run();
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(fs.existsSync(path.join(base, 'skills-delivery')), false);
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/run-task')), false);
  assert.ok(fs.existsSync(path.join(home, '.agents/skills/show-me/SKILL.md')));
});

test('the retired --atomic option is rejected before writes', () => {
  const home = tmpdir();
  const result = spawnSync(process.execPath, [path.join(REPO, 'scripts/install.mjs'), 'portable', '--atomic', '--yes'], { cwd: home, env: { HOME: home, PATH: '' }, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown argument "--atomic"/);
  assert.deepEqual(fs.readdirSync(home), []);
});
