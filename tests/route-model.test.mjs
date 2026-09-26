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

test('configure-model-routing is model-invoked and documents one-question profile setup', () => {
  const skill = fs.readFileSync('skills/delivery/configure-model-routing/SKILL.md', 'utf8');
  assert.match(skill, /name: configure-model-routing/);
  assert.match(skill, /description: .*missing.*profile/);
  assert.match(skill, /exactly one question/);
  assert.match(skill, /SKILLS_MODEL_CANDIDATES_FILE/);
  assert.match(skill, /pi --list-models/);
  assert.match(skill, /omp models --json/);
  assert.match(skill, /route-model.*helper/s);
  assert.match(skill, /credentials.*not.*stored/i);
  assert.match(skill, /temporary profile.*same directory/i);
  assert.match(skill, /--candidates <temporary-file>/);
  assert.match(skill, /--project-only/);
  assert.match(skill, /ignores any `SKILLS_MODEL_CANDIDATES_FILE`/);
  assert.match(skill, /atomically rename the temporary file over the target/);
  assert.match(skill, /restore the prior file with an atomic rename/);
  assert.match(skill, /remove the new target atomically/);
  assert.match(skill, /pre-rename failure[\s\S]*retain the prior profile/i);
  assert.match(fs.readFileSync('docs/getting-started.md', 'utf8'), /Codex users run `\$configure-model-routing`/);
  assert.match(fs.readFileSync('docs/cheatsheet.md', 'utf8'), /Codex users invoke `\$configure-model-routing`/);
  assert.match(fs.readFileSync('runtimes/codex.md', 'utf8'), /`\$configure-model-routing`/);
  assert.match(fs.readFileSync('docs/model-routing.md', 'utf8'), /--project-only/);
  assert.match(fs.readFileSync('skills/delivery/deliver/SKILL.md', 'utf8'), /configure-model-routing/);
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
  for (const phase of ['implement-plan', 'agent-first-sergent', 'unknown-phase']) {
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

test('portable helper falls back when judge module has no systemOne, while Atomic mode fails', async () => {
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

test('Herdr documents native model arguments after its command separator', () => {
  const herd = fs.readFileSync('skills/delivery/herd-next/SKILL.md', 'utf8');
  assert.ok(herd.includes('model_args=(-- --model "$selected_model");'));
  assert.ok(herd.includes('herdr agent start "$name" --kind "$kind" --pane "$pane" "${model_args[@]}"'));
  assert.match(herd, /herdr agent start \.\.\. -- --model <model>/);
  const hook = fs.readFileSync('skills/delivery/herd-next/references/stop_hook.sh', 'utf8');
  assert.match(hook, /SKILLS_MODEL_CANDIDATES_FILE/);
  assert.match(hook, /model-candidates\.json/);
  assert.match(hook, /node \"\$route_helper\" --require-jev/);
  assert.match(hook, /agent_args=\(-- --model \"\$selected_model\"\)/);
  assert.match(hook, /\.result\.tab\.tab_id \/\/ \.result\.tab\.id \/\/ \.result\.tab_id/);
  assert.match(hook, /herdr pane close \"\$pane\"/);
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
function quotaSnapshot({ generatedAt = Date.now(), reports = [] } = {}) {
  return {
    generatedAt,
    reports,
    capacity: Object.fromEntries(reports.map((report) => [report.provider, [{ window: '5h', remainingAccounts: 1 }]])),
  };
}

function quotaReport(provider, remainingFraction, status = 'ok', accountId = 'raw-account-secret', fetchedAt = Date.now()) {
  return {
    provider,
    fetchedAt,
    metadata: { accountId, email: `${accountId}@invalid.test` },
    limits: [{ status, amount: { remainingFraction }, scope: { provider }, window: { label: '5 Hour' } }],
  };
}

test('OMP quota excludes ineligible exact models before Jev and keeps account identifiers local', async () => {
  const dir = fixture('throw new Error("Jev must not run");');
  fs.writeFileSync(path.join(dir, 'typed-judgment', 'judge.mjs'), `export let received; export async function systemOne(state, questions){ received = state; return { model: { type: "choice", choice: "provider3/strong", confidence: .9, probabilities: { "provider2/middle": .2, "provider3/strong": .8 } } }; }`);
  const snapshot = quotaSnapshot({
    reports: [
      quotaReport('provider', 0, 'exhausted'),
      quotaReport('provider2', .8),
      quotaReport('provider3', .8, 'warning'),
    ],
  });
  const result = await routeModel(dir, {
    phase: 'create-plan',
    economy: 'provider/model',
    candidates: [
      { model: 'provider/model', cost: 1, description: 'ordinary' },
      { model: 'provider2/middle', cost: 2, description: 'middle' },
      { model: 'provider3/strong', cost: 4, description: 'strong' },
    ],
    quotaMode: 'omp',
    quotaSnapshot: snapshot,
  });
  assert.equal(result.model, 'provider3/strong');
  assert.deepEqual(result.availableCandidates, ['provider2/middle', 'provider3/strong']);
  assert.equal(JSON.stringify(result).includes('raw-account-secret'), false);
  const helper = await import(`${pathToFileURL(path.join(dir, 'typed-judgment', 'judge.mjs')).href}`);
  assert.deepEqual(helper.received.candidates.map((candidate) => candidate.model), ['provider2/middle', 'provider3/strong']);
});

test('OMP quota never substitutes a stronger model for a mutation phase', async () => {
  const dir = fixture('throw new Error("Jev must not run");');
  await assert.rejects(routeModel(dir, {
    phase: 'implement-plan',
    economy: 'provider/model',
    candidates: [
      { model: 'provider/model', cost: 1, description: 'ordinary' },
      { model: 'provider2/middle', cost: 2, description: 'middle' },
    ],
    quotaMode: 'omp',
    quotaSnapshot: quotaSnapshot({
      reports: [quotaReport('provider', 0, 'exhausted'), quotaReport('provider2', .8)],
    }),
  }), /unavailable under the active quota policy/);
});

test('OMP quota stops on stale snapshots and unknown provider headroom', async () => {
  const dir = fixture('throw new Error("Jev must not run");');
  const candidate = [{ model: 'provider/model', cost: 1, description: 'ordinary' }];
  await assert.rejects(routeModel(dir, {
    phase: 'create-plan',
    economy: 'provider/model',
    candidates: candidate,
    quotaMode: 'omp',
    quotaSnapshot: quotaSnapshot({ generatedAt: Date.now() - 10 * 60 * 1000, reports: [quotaReport('provider', .8)] }),
  }), /stale-usage/);
  await assert.rejects(routeModel(dir, {
    phase: 'create-plan',
    economy: 'provider/model',
    candidates: candidate,
    quotaMode: 'omp',
    quotaSnapshot: quotaSnapshot({ reports: [{ provider: 'provider', fetchedAt: Date.now(), metadata: { accountId: 'account' }, limits: [{ status: 'ok', amount: {}, scope: { provider: 'provider' } }] }] }),
  }), /unknown-headroom/);
});
test('OMP quota rejects zero warning headroom, stale reports, and unknown account binding', async () => {
  const dir = fixture('throw new Error("Jev must not run");');
  const candidate = [{ model: 'provider/model', cost: 1, description: 'ordinary' }];
  const route = (report) => routeModel(dir, {
    phase: 'create-plan',
    economy: 'provider/model',
    candidates: candidate,
    quotaMode: 'omp',
    quotaSnapshot: quotaSnapshot({ reports: [report] }),
  });
  await assert.rejects(route(quotaReport('provider', 0, 'warning')), /quota-exhausted/);
  await assert.rejects(route(quotaReport('provider', .8, 'ok', 'account', Date.now() - 10 * 60 * 1000)), /stale-report/);
  await assert.rejects(route(quotaReport('provider', .8, 'ok', null)), /unknown-account-binding/);
});
test('OMP quota ignores unrelated model-scoped meters while applying provider headroom', async () => {
  const dir = fixture('throw new Error("Jev must not run");');
  const report = quotaReport('provider', .8);
  report.limits.unshift({ status: 'exhausted', amount: { remainingFraction: 0 }, scope: { provider: 'provider', model: 'provider/other' } });
  const result = await routeModel(dir, {
    phase: 'create-plan',
    economy: 'provider/model',
    candidates: [{ model: 'provider/model', cost: 1, description: 'ordinary' }],
    quotaMode: 'omp',
    quotaSnapshot: quotaSnapshot({ reports: [report] }),
  });
  assert.equal(result.model, 'provider/model');
});
