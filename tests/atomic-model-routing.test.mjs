import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectStageModel } from '../atomic/lib/models.mjs';

function helper(response, body = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-model-routing-'));
  const skillDir = path.join(dir, 'typed-judgment');
  fs.mkdirSync(skillDir);
  fs.writeFileSync(path.join(skillDir, 'judge.mjs'), `
export let received;
export let lastCall = { model: 'jev-test', usage: { input_tokens: 3, output_tokens: 2 } };
export async function systemOne(state, questions) {
  received = { state, questions };
  ${body || `return ${JSON.stringify(response)};`}
}
`);
  return { dir, skillDir, helper: path.join(skillDir, 'judge.mjs') };
}

test('only the systemOne answers.model choice response is accepted', async () => {
  const malformed = [
    '{ choice: "economy", confidence: 0.9, probabilities: { economy: 0.9, reasoning: 0.1 } }',
    '{ route: { type: "choice", choice: "economy", confidence: 0.9, probabilities: { economy: 0.9, reasoning: 0.1 } } }',
    '{ stage_model: { type: "choice", choice: "economy", confidence: 0.9, probabilities: { economy: 0.9, reasoning: 0.1 } } }',
    '{ model: { type: "choice", choice: "baseline", confidence: 0.9, probabilities: { economy: 0.9, reasoning: 0.1 } } }',
  ];
  for (const response of malformed) {
    const fixture = helper(null, `return ${response};`);
    await assert.rejects(
      selectStageModel(fixture.dir, { skill: 'review-code', request: 'Review the change', artifacts: [] }),
      /Invalid JEV model-routing response/,
    );
  }
});

test('malformed JEV model response fails instead of selecting a fallback', async () => {
  const fixture = helper(null, 'return { model: { type: "choice", choice: "not-a-candidate", confidence: 0.9, probabilities: { economy: 0.9, reasoning: 0.1 } } };');
  await assert.rejects(
    selectStageModel(fixture.dir, { skill: 'review-code', request: 'Review the change', artifacts: [] }),
    /Invalid JEV model-routing response/,
  );
});

test('invalid choice probabilities fail while a moderate confidence remains valid', async () => {
  for (const probabilities of [
    '{ economy: 1.1, reasoning: -0.1 }',
    '{ economy: 0.7, reasoning: 0.1 }',
    '{ economy: 0.9, reasoning: 0.1, other: 0 }',
  ]) {
    const fixture = helper(null, `return { model: { type: "choice", choice: "economy", confidence: 0.41, probabilities: ${probabilities} } };`);
    await assert.rejects(
      selectStageModel(fixture.dir, { skill: 'review-code', request: 'Review the change', artifacts: [] }),
      /probabilities/,
    );
  }
});
test('confidence stays within the TypeSafe range without imposing a routing threshold', async () => {
  for (const confidence of ['-0.01', '1.01', 'NaN']) {
    const fixture = helper(null, `return { model: { type: "choice", choice: "economy", confidence: ${confidence}, probabilities: { economy: 0.6, reasoning: 0.4 } } };`);
    await assert.rejects(
      selectStageModel(fixture.dir, { skill: 'review-code', request: 'Review the change', artifacts: [] }),
      /confidence must be finite in \[0,1\]/,
    );
  }
});

test('auto routing reports an unavailable JEV service and fixed routing does not call it', async () => {
  const fixture = helper(null, 'throw new Error("service offline");');
  await assert.rejects(
    selectStageModel(fixture.dir, { skill: 'review-code', request: 'Review the change', artifacts: [] }),
    /JEV is unavailable.*service offline/,
  );
  assert.deepEqual(
    await selectStageModel(fixture.dir, { skill: 'review-code', model: 'caller/fixed-model', modelRouting: 'fixed' }),
    { model: 'caller/fixed-model', source: 'fixed', confidence: null, probabilities: null, availableModels: ['caller/fixed-model', 'openai-codex/gpt-5.6-sol'], candidates: ['caller/fixed-model'] },
  );
});
test('writing and unknown stages always use the ordinary model without calling JEV', async () => {
  const fixture = helper(null, 'throw new Error("JEV must not be called for code");');
  for (const skill of ['implement-task', 'reproduce-bug', 'test-app', 'record-evidence', 'unknown-stage']) {
    const result = await selectStageModel(fixture.dir, {
      skill,
      model: 'caller/provider-model',
      reasoningModel: 'configured/reasoning-model',
    });
    assert.equal(result.model, 'caller/provider-model', skill);
    assert.equal(result.source, 'policy', skill);
  }
});

test('a competent economy choice retains the full judgment record and usage', async () => {
  const fixture = helper(null, 'return { model: { type: "choice", choice: "economy", confidence: 0.41, probabilities: { economy: 0.6, reasoning: 0.4 }, explanation: "adequate" } };');
  const result = await selectStageModel(fixture.dir, {
    skill: 'review-code',
    request: 'Review a bounded documentation-only change',
    artifacts: [{ file: 'review.md', summary: 'small diff' }],
    model: 'caller/model',
    reasoningModel: 'configured/reasoning-model',
  });
  assert.deepEqual(result, {
    model: 'caller/model',
    source: 'jev',
    confidence: 0.41,
    probabilities: { economy: 0.6, reasoning: 0.4 },
    availableModels: ['caller/model', 'configured/reasoning-model'],
    candidates: ['caller/model', 'configured/reasoning-model'],
    usage: { input_tokens: 3, output_tokens: 2 },
  });
});

test('a reasoning choice uses the explicit stronger model', async () => {
  const fixture = helper(null, 'return { model: { type: "choice", choice: "reasoning", confidence: 0.52, probabilities: { economy: 0.2, reasoning: 0.8 } } };');
  const result = await selectStageModel(fixture.dir, {
    skill: 'create-plan',
    model: 'caller/luna-fast',
    reasoningModel: 'caller/sol',
  });
  assert.equal(result.model, 'caller/sol');
  assert.equal(result.source, 'jev');
  assert.equal(result.confidence, 0.52);
  assert.deepEqual(result.probabilities, { economy: 0.2, reasoning: 0.8 });
  assert.deepEqual(result.availableModels, ['caller/luna-fast', 'caller/sol']);
  assert.deepEqual(result.candidates, ['caller/luna-fast', 'caller/sol']);
});

test('available models constrain escalation and skip JEV when reasoning is unavailable', async () => {
  const fixture = helper(null, 'throw new Error("JEV must not be called without reasoning");');
  const result = await selectStageModel(fixture.dir, {
    skill: 'create-plan',
    model: 'caller/luna-fast',
    reasoningModel: 'caller/sol',
    availableModels: ['caller/luna-fast', 'caller/other', 'caller/luna-fast'],
  });
  assert.equal(result.model, 'caller/luna-fast');
  assert.equal(result.source, 'policy');
  assert.deepEqual(result.availableModels, ['caller/luna-fast', 'caller/other']);
});

test('unavailable economy and explicit empty availability fail closed', async () => {
  const fixture = helper(null, 'throw new Error("JEV must not be called");');
  await assert.rejects(
    selectStageModel(fixture.dir, { skill: 'implement-plan', model: 'caller/luna-fast', availableModels: ['caller/sol'] }),
    /Configured economy model.*not available/,
  );
  await assert.rejects(
    selectStageModel(fixture.dir, { skill: 'implement-plan', availableModels: [] }),
    /availableModels must contain at least one model/,
  );
});

test('fixed routing also refuses an unavailable configured model', async () => {
  const fixture = helper(null, 'throw new Error("JEV must not be called");');
  await assert.rejects(
    selectStageModel(fixture.dir, { skill: 'review-code', model: 'caller/luna-fast', modelRouting: 'fixed', availableModels: ['caller/sol'] }),
    /Configured economy model.*not available/,
  );
});
