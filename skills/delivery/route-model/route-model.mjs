#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_ECONOMY = 'openai-codex/gpt-5.6-luna-fast';
export const MUTATION_PHASES = new Set(['implement-task', 'implement-plan', 'implement-outline', 'agent-implementer', 'iterate-implementation', 'fix-bug', 'fix-code-review', 'resolve-pr-reviews', 'reproduce-bug', 'test-app', 'record-evidence']);
export const ELIGIBLE_PHASES = new Set(['gather-sources', 'create-research-questions', 'create-research', 'create-design-discussion', 'create-prd', 'create-tdd', 'create-structure-outline', 'create-plan', 'create-epic-plan', 'verify-implementation', 'review-code', 'review-artifact-comments', 'describe-pr', 'iterate-research-questions', 'iterate-research', 'iterate-design-discussion', 'iterate-prd', 'iterate-tdd', 'iterate-structure-outline', 'iterate-plan']);

const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};
const number = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number`);
  return value;
};

export function normalizeCandidates(value, economy) {
  if (value === undefined) value = [{ model: economy, cost: 0, description: 'configured economical model' }];
  if (!Array.isArray(value) || value.length === 0) throw new Error('candidates must contain at least one candidate');
  const candidates = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`candidates[${index}] must be an object`);
    return { model: text(candidate.model, `candidates[${index}].model`), cost: number(candidate.cost, `candidates[${index}].cost`), description: text(candidate.description, `candidates[${index}].description`) };
  });
  if (new Set(candidates.map(({ model }) => model)).size !== candidates.length) throw new Error('candidates must not contain duplicate model identifiers');
  if (!candidates.some(({ model }) => model === economy)) throw new Error(`Configured economy model ${JSON.stringify(economy)} is not available`);
  return candidates;
}

function validateProbabilities(probabilities, models) {
  if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) throw new Error('probabilities must be an object');
  const keys = Object.keys(probabilities);
  if (keys.length !== models.length || models.some(model => !keys.includes(model))) throw new Error('probabilities must contain exactly the supplied model identifiers');
  const values = keys.map(key => probabilities[key]);
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('probabilities must contain finite numbers in [0,1]');
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) throw new Error('probabilities must sum to 1');
}

function answerFrom(answers) {
  return answers?.model && typeof answers.model === 'object' && !Array.isArray(answers.model) ? answers.model : null;
}

function expectedLosses(candidates, probabilities) {
  const maxCost = Math.max(...candidates.map(candidate => candidate.cost), 0);
  const minCost = Math.min(...candidates.map(candidate => candidate.cost));
  const costRange = maxCost - minCost || 1;
  return candidates.map((candidate, index) => {
    const costLoss = (candidate.cost - minCost) / costRange;
    const underProvision = candidates.slice(index + 1).reduce((sum, required) => sum + probabilities[required.model], 0);
    return costLoss + underProvision * 2;
  });
}

/** Route one phase using only caller-supplied exact candidates. */
export async function routeModel(skillsDir, options = {}) {
  if (typeof skillsDir !== 'string' || !skillsDir.trim()) throw new Error('skillsDir is required for model routing');
  const phase = text(options.phase ?? options.skill ?? 'unknown-phase', 'phase');
  const economy = text(options.economy ?? DEFAULT_ECONOMY, 'economy');
  const routing = options.routing ?? options.modelRouting ?? 'auto';
  if (routing !== 'auto' && routing !== 'fixed') throw new Error(`Unknown routing ${JSON.stringify(routing)}; expected auto or fixed`);
  const candidates = normalizeCandidates(options.candidates, economy);
  const models = candidates.map(candidate => candidate.model);
  const record = { candidates: models, availableCandidates: models, confidence: null, probabilities: null };
  if (routing === 'fixed' || !ELIGIBLE_PHASES.has(phase) || MUTATION_PHASES.has(phase) || candidates.length === 1) {
    return { ...record, model: economy, source: routing === 'fixed' ? 'fixed' : 'policy' };
  }
  const helperPath = path.resolve(skillsDir, 'typed-judgment', 'judge.mjs');
  let helper;
  try { helper = await import(pathToFileURL(helperPath).href); } catch (error) { throw new Error(`JEV is unavailable: cannot load ${helperPath}: ${error.message}`); }
  if (typeof helper.systemOne !== 'function') throw new Error(`JEV is unavailable: ${helperPath} has no systemOne export`);
  const criteria = Object.fromEntries(candidates.map(candidate => [candidate.model, `The request can be completed adequately by ${candidate.model}; choose the cheapest adequate candidate.`]));
  let answers;
  try {
    answers = await helper.systemOne({ phase, request: options.request ?? '', artifacts: options.artifacts ?? [], candidates }, { model: { type: 'choice', instructions: 'Choose the cheapest supplied model that can fully complete this phase in one pass. Never choose a model not listed as a criterion.', criteria } });
  } catch (error) { throw new Error(`JEV is unavailable: ${error.message}`); }
  const answer = answerFrom(answers);
  const aliases = options.choiceAliases || {};
  const choice = answer?.choice && aliases[answer.choice] ? aliases[answer.choice] : answer?.choice;
  if (!answer || answer.type !== 'choice' || typeof choice !== 'string' || !models.includes(choice)) throw new Error('Invalid JEV model-routing response: choice must be one supplied model identifier');
  let probabilities = answer.probabilities;
  if (Object.keys(aliases).length && probabilities && Object.keys(probabilities).some(key => aliases[key])) {
    probabilities = Object.fromEntries(Object.entries(probabilities).map(([key, value]) => [aliases[key] || key, value]));
  }
  validateProbabilities(probabilities, models);
  if (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) throw new Error('Invalid JEV model-routing response: confidence must be finite in [0,1]');
  const losses = expectedLosses(candidates, probabilities);
  const selectedIndex = losses.indexOf(Math.min(...losses));
  return { ...record, model: candidates[selectedIndex].model, source: 'jev', confidence: answer.confidence, probabilities, requestedModel: choice, expectedLosses: Object.fromEntries(models.map((model, index) => [model, losses[index]])), ...(helper.lastCall?.usage ? { usage: helper.lastCall.usage } : {}) };
}

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const skillsDir = input.skillsDir || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const result = await routeModel(skillsDir, input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
