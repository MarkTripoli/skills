import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { routeModel } from '../skills/delivery/route-model/route-model.mjs';
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
  for (const phase of ['implement-plan', 'unknown-phase']) {
    const result = await routeModel(dir, { phase, economy: 'cheap', candidates });
    assert.equal(result.model, 'cheap');
    assert.equal(result.source, 'policy');
  }
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

test('portable helper validates exact candidates and fails closed on JEV errors', async () => {
  const dir = fixture('throw new Error("offline");');
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates }), /JEV is unavailable.*offline/);
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'missing', candidates }), /economy model/);
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates: [] }), /at least one/);
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates: [{ model: 'cheap', cost: -1, description: 'bad' }] }), /non-negative/);
});

test('Herdr documents native model arguments after its command separator', () => {
  const herd = fs.readFileSync('skills/delivery/herd-next/SKILL.md', 'utf8');
  assert.ok(herd.includes('model_args=(-- --model "$selected_model");'));
  assert.ok(herd.includes('herdr agent start "$name" --kind "$kind" --pane "$pane" "${model_args[@]}"'));
  assert.match(herd, /herdr agent start \.\.\. -- --model <model>/);
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
