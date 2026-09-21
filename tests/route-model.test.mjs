import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { routeModel } from '../skills/delivery/route-model/route-model.mjs';
function runNode(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
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

test('portable helper requires weakest-to-strongest non-decreasing candidate order and sends descriptions to JEV', async () => {
  const dir = fixture('return { model: { type: "choice", choice: "strong", confidence: .9, probabilities: { cheap: .1, strong: .9 } } };');
  fs.writeFileSync(path.join(dir, 'typed-judgment', 'judge.mjs'), `export let received; export let lastCall={}; export async function systemOne(state, questions){ received = questions; return { model: { type: "choice", choice: "strong", confidence: .9, probabilities: { cheap: .1, strong: .9 } } }; }`);
  const result = await routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates });
  assert.equal(result.model, 'strong');
  const helper = await import(`${pathToFileURL(path.join(dir, 'typed-judgment', 'judge.mjs')).href}`);
  assert.match(helper.received.model.criteria.cheap, /ordinary/);
  assert.match(helper.received.model.criteria.strong, /difficult reasoning/);
  await assert.rejects(routeModel(dir, { phase: 'create-plan', economy: 'cheap', candidates: [candidates[1], candidates[0]] }), /ordered from weakest to strongest/);
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
  const { stdout } = await runNode(script, JSON.stringify({ skillsDir: dir, phase: 'unknown-phase', economy: 'cheap', candidates: [{ model: 'cheap', cost: 1, description: 'ordinary' }] }));
  const result = JSON.parse(stdout);
  assert.deepEqual(result.candidates, ['cheap']);
  assert.equal(result.model, 'cheap');
});
