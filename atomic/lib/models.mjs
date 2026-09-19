import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_MODEL = 'openai-codex/gpt-5.6-luna-fast';
export const DEFAULT_REASONING_MODEL = 'openai-codex/gpt-5.6-sol';

// These stages may inspect or document work without writing implementation code. Every other
// unlisted stage stays on the caller-selected model because its mutation safety is unknown.
const JEV_ELIGIBLE_SKILLS = new Set([
  'gather-sources',
  'create-research-questions',
  'create-research',
  'create-design-discussion',
  'create-prd',
  'create-tdd',
  'create-structure-outline',
  'create-plan',
  'create-epic-plan',
  'verify-implementation',
  'review-code',
  'review-artifact-comments',
  'describe-pr',
  'iterate-research-questions',
  'iterate-research',
  'iterate-design-discussion',
  'iterate-prd',
  'iterate-tdd',
  'iterate-structure-outline',
  'iterate-plan',
]);

const CODE_WRITING_SKILLS = new Set([
  'implement-task',
  'implement-plan',
  'implement-outline',
  'agent-implementer',
  'iterate-implementation',
  'fix-bug',
  'fix-code-review',
  'resolve-pr-reviews',
]);

const modelName = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw new Error('Model names must be non-empty strings');
  return value.trim();
};

const unavailable = (message, error) => {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`JEV is unavailable: ${message}: ${detail}. Select model_routing=fixed to run without JEV.`);
};

function fixedRecord(model) {
  return { model, source: 'fixed', confidence: null, probabilities: null };
}

function policyRecord(model) {
  return { model, source: 'policy', confidence: null, probabilities: null };
}

function answerFrom(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null;
  return answers.model && typeof answers.model === 'object' && !Array.isArray(answers.model) ? answers.model : null;
}

function invalidAnswer(message) {
  throw new Error(`Invalid JEV model-routing response: ${message}`);
}

function validateAnswer(answer) {
  if (!answer) invalidAnswer('expected answers.model to contain a choice response');
  if (answer.type !== 'choice') invalidAnswer(`expected answers.model.type to be "choice", got ${JSON.stringify(answer.type)}`);
  if (answer.choice !== 'economy' && answer.choice !== 'reasoning') invalidAnswer(`expected choice economy or reasoning, got ${JSON.stringify(answer.choice)}`);
  if (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
    invalidAnswer(`confidence must be finite in [0,1], got ${JSON.stringify(answer.confidence)}`);
  }
  const probabilities = answer.probabilities;
  if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) {
    invalidAnswer('probabilities must be an object containing economy and reasoning');
  }
  const keys = Object.keys(probabilities);
  if (keys.length !== 2 || !keys.includes('economy') || !keys.includes('reasoning')) {
    invalidAnswer(`probabilities must contain only economy and reasoning, got ${JSON.stringify(keys)}`);
  }
  const values = keys.map((key) => probabilities[key]);
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    invalidAnswer(`probabilities must be finite numbers in [0,1], got ${JSON.stringify(probabilities)}`);
  }
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) {
    invalidAnswer(`probabilities must sum to 1, got ${JSON.stringify(probabilities)}`);
  }
  return answer;
}

/**
 * Select the model for one delivery stage. Auto routing asks the installed typed-judgment helper
 * only for known non-code phases; code-writing and unknown phases always use the ordinary model.
 */
export async function selectStageModel(skillsDir, options = {}) {
  if (typeof skillsDir !== 'string' || !skillsDir.trim()) throw new Error('skillsDir is required for model routing');
  if (!options || typeof options !== 'object') throw new Error('Model-routing options must be an object');

  const skill = typeof options.skill === 'string' ? options.skill.trim() : '';
  const model = modelName(options.model, DEFAULT_MODEL);
  const routing = options.modelRouting === undefined || options.modelRouting === null || options.modelRouting === ''
    ? 'auto' : options.modelRouting;
  if (routing !== 'auto' && routing !== 'fixed') throw new Error(`Unknown model_routing ${JSON.stringify(routing)}; expected auto or fixed`);

  if (routing === 'fixed') return fixedRecord(model);
  if (CODE_WRITING_SKILLS.has(skill) || !JEV_ELIGIBLE_SKILLS.has(skill)) return policyRecord(model);
  const reasoning = modelName(options.reasoningModel, DEFAULT_REASONING_MODEL);

  const helperPath = path.resolve(skillsDir, 'typed-judgment', 'judge.mjs');
  let helper;
  try {
    helper = await import(pathToFileURL(helperPath).href);
  } catch (error) {
    throw unavailable(`cannot load ${helperPath}`, error);
  }
  if (typeof helper.systemOne !== 'function') throw new Error(`JEV is unavailable: ${helperPath} does not export systemOne. Select model_routing=fixed to run without JEV.`);

  const state = {
    skill,
    request: options.request ?? '',
    artifacts: options.artifacts ?? [],
  };
  const questions = {
    model: {
      type: 'choice',
      instructions: `Choose whether the ordinary model or the stronger reasoning model is required for the ${skill || 'delivery'} phase. Use the ordinary model when it can complete this phase from the supplied request and artifacts; otherwise use the configured reasoning model. This is a model-adequacy judgment, not a price claim.`,
      criteria: {
        economy: `${model} is adequate for this phase and its supplied request and artifacts.`,
        reasoning: `${reasoning} is required for this phase because the ordinary model is not adequate or the phase needs its additional capability.`,
      },
    },
  };

  let answers;
  try {
    answers = await helper.systemOne(state, questions);
  } catch (error) {
    throw unavailable('the helper could not answer the model-adequacy judgment', error);
  }
  const answer = validateAnswer(answerFrom(answers));
  const { choice } = answer;

  const record = {
    model: choice === 'economy' ? model : reasoning,
    source: 'jev',
    confidence: answer.confidence,
    probabilities: answer.probabilities ?? null,
  };
  if (helper.lastCall?.usage !== undefined && helper.lastCall?.usage !== null) record.usage = helper.lastCall.usage;
  return record;
}
