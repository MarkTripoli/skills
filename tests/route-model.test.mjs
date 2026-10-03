import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { routeModel, loadCandidateProfile, strongestCandidate } from '../skills/delivery/route-model/route-model.mjs';
function runNode(script, input, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `exit ${code}`)));
    child.stdin.end(input);
  });
}

function fixture(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-model-'));
  fs.mkdirSync(path.join(dir, 'typed-judgment'));
  fs.writeFileSync(path.join(dir, 'typed-judgment', 'judge.mjs'), `export let lastCall={model:'jev-test',usage:{input_tokens:1}}; export async function systemOne(state, questions){${body}}`);
  return dir;
}
const candidates = [
  { model: 'cheap', cost: 1, description: 'ordinary' },
  { model: 'strong', cost: 4, description: 'difficult reasoning' },
];


const writeProfile = path.resolve('skills/delivery/configure-model-routing/scripts/write-profile.mjs');
const skillsDir = path.resolve('skills/delivery');
const goodProfile = { economy: 'cheap', routing: 'auto', candidates };
function writer(project, extra) {
  return runNode(writeProfile, '', ['--skills-dir', skillsDir, '--cwd', project, ...extra]);
}
const leftovers = (dir) => fs.readdirSync(dir).filter(name => /\.(tmp|bak)-/.test(name));

test('write-profile saves a project profile and verifies it', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'write-profile-'));
  const target = path.join(project, '.agents', 'model-candidates.json');
  const { stdout } = await writer(project, ['--target', target, '--scope', 'project', '--profile', JSON.stringify(goodProfile)]);
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.profileSource, 'project');
  assert.deepEqual(result.candidates, ['cheap', 'strong']);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), goodProfile);
  assert.deepEqual(leftovers(path.dirname(target)), []);
});

test('write-profile saves an environment-scope profile outside the project', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'write-profile-'));
  const target = path.join(project, 'user', 'profile.json');
  const { stdout } = await writer(project, ['--target', target, '--scope', 'env', '--profile', JSON.stringify(goodProfile)]);
  assert.equal(JSON.parse(stdout).profileSource, 'env');
  assert.ok(fs.existsSync(target));
});

test('write-profile leaves the prior target byte-identical when validation fails', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'write-profile-'));
  const target = path.join(project, '.agents', 'model-candidates.json');
  fs.mkdirSync(path.dirname(target));
  fs.writeFileSync(target, '{"prior":true}\n');
  const bad = [
    { ...goodProfile, candidates: [{ model: 'cheap', cost: -1, description: 'x' }, candidates[1]] },
    { ...goodProfile, economy: 'missing' },
    { ...goodProfile, routing: 'sometimes' },
  ];
  for (const profile of bad) {
    await assert.rejects(writer(project, ['--target', target, '--scope', 'project', '--profile', JSON.stringify(profile)]), /invalid profile/);
    assert.equal(fs.readFileSync(target, 'utf8'), '{"prior":true}\n');
    assert.deepEqual(leftovers(path.dirname(target)), []);
  }
});

test('write-profile restores the prior target when final verification fails', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'write-profile-'));
  const elsewhere = path.join(project, 'not-the-project-path.json');
  fs.writeFileSync(elsewhere, '{"prior":true}\n');
  await assert.rejects(writer(project, ['--target', elsewhere, '--scope', 'project', '--profile', JSON.stringify(goodProfile)]), /final lookup/);
  assert.equal(fs.readFileSync(elsewhere, 'utf8'), '{"prior":true}\n');
  const fresh = path.join(project, 'fresh.json');
  await assert.rejects(writer(project, ['--target', fresh, '--scope', 'project', '--profile', JSON.stringify(goodProfile)]), /final lookup/);
  assert.equal(fs.existsSync(fresh), false);
  assert.deepEqual(leftovers(project), []);
});

test('route-model returns no model when no profile exists', async () => {
  const dir = fixture('throw new Error("must not call");');
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'route-empty-'));
  const previous = process.env.SKILLS_MODEL_CANDIDATES_FILE;
  try {
    delete process.env.SKILLS_MODEL_CANDIDATES_FILE;
    const result = await routeModel(dir, { phase: 'create-plan', cwd: project });
    assert.equal(result.model, null);
    assert.equal(result.profileSource, 'none');
    assert.deepEqual(result.candidates, []);
  } finally {
    if (previous !== undefined) process.env.SKILLS_MODEL_CANDIDATES_FILE = previous;
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('every eligible phase names an existing skill', async () => {
  const { ELIGIBLE_PHASES } = await import('../skills/delivery/route-model/route-model.mjs');
  for (const phase of ELIGIBLE_PHASES) assert.ok(fs.existsSync(path.join('skills/delivery', phase, 'SKILL.md')), phase);
});

test('candidate profiles use explicit, environment, then project precedence', async () => {
  const dir = fixture('throw new Error("must not call");');
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'route-project-'));
  fs.mkdirSync(path.join(project, '.agents'));
  const projectProfile = { economy: 'project-cheap', candidates: [{ model: 'project-cheap', cost: 1, description: 'project' }] };
  fs.writeFileSync(path.join(project, '.agents', 'model-candidates.json'), JSON.stringify(projectProfile));
  const previous = process.env.SKILLS_MODEL_CANDIDATES_FILE;
  try {
    delete process.env.SKILLS_MODEL_CANDIDATES_FILE;
    assert.equal((await routeModel(dir, { phase: 'unknown', cwd: project })).profileSource, 'project');
    const envFile = path.join(project, 'env.json');
    fs.writeFileSync(envFile, JSON.stringify({ economy: 'env-cheap', candidates: [{ model: 'env-cheap', cost: 1, description: 'environment' }] }));
    process.env.SKILLS_MODEL_CANDIDATES_FILE = envFile;
    assert.equal((await routeModel(dir, { phase: 'unknown', cwd: project })).profileSource, 'env');
    const projectOnly = await routeModel(dir, { phase: 'unknown', cwd: project, projectOnly: true });
    assert.equal(projectOnly.profileSource, 'project');
    assert.deepEqual(projectOnly.candidates, ['project-cheap']);
    assert.equal(projectOnly.model, 'project-cheap');
    const explicitProjectOnly = await routeModel(dir, { phase: 'unknown', cwd: project, projectOnly: true, economy: 'explicit-cheap', candidates: [{ model: 'explicit-cheap', cost: 1, description: 'explicit' }] });
    assert.equal(explicitProjectOnly.profileSource, 'explicit');
    assert.equal((await routeModel(dir, { phase: 'unknown', cwd: project, economy: 'explicit-cheap', candidates: [{ model: 'explicit-cheap', cost: 1, description: 'explicit' }] })).profileSource, 'explicit');
    fs.writeFileSync(envFile, '{bad');
    await assert.rejects(routeModel(dir, { phase: 'unknown', cwd: project }), /Invalid model candidate profile/);
  } finally {
    if (previous === undefined) delete process.env.SKILLS_MODEL_CANDIDATES_FILE; else process.env.SKILLS_MODEL_CANDIDATES_FILE = previous;
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('portable helper keeps economy for mutation and unknown phases without JEV', async () => {
  const dir = fixture('throw new Error("must not call");');
  for (const phase of ['implement-plan', 'agent-implementer', 'unknown-phase']) {
    const result = await routeModel(dir, { phase, economy: 'cheap', candidates });
    assert.equal(result.model, 'cheap');
    assert.equal(result.source, 'policy');
  }
});
test('mutation returns the configured economy even when candidates are ordered differently', async () => {
  const dir = fixture('throw new Error("must not call");');
  const result = await routeModel(dir, {
    phase: 'implement-plan',
    economy: 'cheap',
    candidates: [
      { model: 'strong', cost: 2, description: 'strong capability' },
      { model: 'cheap', cost: 1, description: 'ordinary capability' },
    ],
  });
  assert.equal(result.model, 'cheap');
  assert.deepEqual(result.availableCandidates, ['strong', 'cheap']);
});


test('portable helper selects the cheapest adequate exact candidate', async () => {
  const dir = fixture('return { model: { type: "choice", choice: "strong", confidence: .9, probabilities: { cheap: .1, strong: .9 } } };');
  const result = await routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates });
  assert.equal(result.model, 'strong');
  assert.deepEqual(result.candidates, ['cheap', 'strong']);
  assert.deepEqual(result.probabilities, { cheap: .1, strong: .9 });
});

test('portable helper treats array order as capability order and sends descriptions to JEV', async () => {
  const dir = fixture('return { model: { type: "choice", choice: "strong", confidence: .9, probabilities: { cheap: .1, strong: .9 } } };');
  fs.writeFileSync(path.join(dir, 'typed-judgment', 'judge.mjs'), `export let received; export let lastCall={}; export async function systemOne(state, questions){ received = questions; return { model: { type: "choice", choice: "strong", confidence: .9, probabilities: { cheap: .1, strong: .9 } } }; }`);
  const result = await routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates });
  assert.equal(result.model, 'strong');
  const helper = await import(`${pathToFileURL(path.join(dir, 'typed-judgment', 'judge.mjs')).href}`);
  assert.match(helper.received.model.criteria.cheap, /ordinary/);
  assert.match(helper.received.model.criteria.strong, /difficult reasoning/);
  const variedCosts = [{ model: 'weak', cost: 9, description: 'weak capability' }, { model: 'stronger', cost: 2, description: 'strong capability' }];
  const varied = await routeModel(dir, { phase: 'unknown', economy: 'weak', candidates: variedCosts });
  assert.deepEqual(varied.candidates, ['weak', 'stronger']);
});

test('portable helper falls back when judge module has no systemOne, while required mode fails', async () => {
  const dir = fixture('throw new Error("must not call");');
  fs.writeFileSync(path.join(dir, 'typed-judgment', 'judge.mjs'), 'export const lastCall = null;');
  const fallback = await routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates });
  assert.equal(fallback.source, 'fallback');
  assert.match(fallback.reason, /no systemOne/);
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates, requireJev: true }), /no systemOne/);
});

test('portable helper validates exact candidates and fails closed on JEV errors', async () => {
  const dir = fixture('throw new Error("offline");');
  const fallback = await routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates });
  assert.equal(fallback.model, 'cheap');
  assert.equal(fallback.source, 'fallback');
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates, requireJev: true }), /JEV is unavailable.*offline/);
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'missing', candidates }), /economy model/);
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates: [] }), /at least one/);
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates: [{ model: 'cheap', cost: -1, description: 'bad' }] }), /non-negative/);
});

test('portable helper exposes a machine-readable stdin contract', async () => {
  const dir = fixture('throw new Error("must not call");');
  const script = path.resolve('skills/delivery/route-model/route-model.mjs');
  const explicitFile = path.join(dir, 'explicit.json');
  fs.writeFileSync(explicitFile, JSON.stringify({ economy: 'cheap', candidates: [{ model: 'cheap', cost: 1, description: 'ordinary' }] }));
  const { stdout } = await runNode(script, JSON.stringify({ skillsDir: dir, phase: 'unknown-phase' }), ['--candidates', explicitFile]);
  const result = JSON.parse(stdout);
  assert.deepEqual(result.candidates, ['cheap']);
  assert.equal(result.model, 'cheap');
});

test('strongest candidate follows capability order even when costs vary', () => {
  assert.equal(strongestCandidate([{ model: 'weak', cost: 9 }, { model: 'strong', cost: 1 }]).model, 'strong');
});

test('profile lookup honors an injected environment without inheriting process configuration', t => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'route-env-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  fs.mkdirSync(path.join(project, '.agents'));
  const profile = model => ({ economy: model, candidates: [{ model, cost: 1, description: 'configured' }] });
  fs.writeFileSync(path.join(project, '.agents', 'model-candidates.json'), JSON.stringify(profile('project')));
  const envFile = path.join(project, 'env.json');
  fs.writeFileSync(envFile, JSON.stringify(profile('environment')));
  assert.equal(loadCandidateProfile({ projectDir: project, env: {} }).source, 'project');
  assert.equal(loadCandidateProfile({ projectDir: project, env: { SKILLS_MODEL_CANDIDATES_FILE: envFile } }).economy, 'environment');
  assert.equal(loadCandidateProfile({ projectDir: project, projectOnly: true, env: { SKILLS_MODEL_CANDIDATES_FILE: envFile } }).economy, 'project');
});

test('write-profile rejects a profile without candidates and writes only known keys', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'write-profile-'));
  const target = path.join(project, '.agents', 'model-candidates.json');
  await assert.rejects(writer(project, ['--target', target, '--scope', 'project', '--profile', JSON.stringify({ economy: 'x' })]), /candidates must be an array/);
  await writer(project, ['--target', target, '--scope', 'project', '--profile', JSON.stringify({ ...goodProfile, apiKey: 'secret' })]);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), goodProfile);
});
