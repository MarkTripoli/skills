import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_MODEL = 'openai-codex/gpt-5.6-luna-fast';
export const DEFAULT_REASONING_MODEL = 'openai-codex/gpt-5.6-sol';

// Atomic is an adapter: portable route-model owns validation, JEV, and expected-loss policy.
export async function selectStageModel(skillsDir, options = {}) {
  const model = options.model ?? DEFAULT_MODEL;
  const reasoning = options.reasoningModel ?? DEFAULT_REASONING_MODEL;
  const available = options.modelCandidates ?? (options.availableModels === undefined ? [model, reasoning] : options.availableModels);
  if (!Array.isArray(available) || available.length === 0) throw new Error('availableModels must contain at least one model');
  const availableNames = [...new Set(available.map(item => typeof item === 'string' ? item : item?.model))];
  if (!availableNames.includes(model)) throw new Error(`Configured economy model ${JSON.stringify(model)} is not available`);
  const candidateValues = options.modelCandidates ?? [model, reasoning].filter(candidate => availableNames.includes(candidate));
  const candidates = [...new Map(candidateValues.map((candidate, index) => [
    typeof candidate === 'string' ? candidate : candidate?.model,
    typeof candidate === 'string' ? { model: candidate, cost: candidate === model ? 0 : index + 1, description: candidate === model ? 'configured economical model' : 'configured escalation candidate' } : candidate,
  ])).values()];
  let routeModel;
  try {
    ({ routeModel } = await import(pathToFileURL(path.join(skillsDir, 'route-model', 'route-model.mjs')).href));
  } catch (error) {
    throw new Error(`Portable route-model is unavailable from ${skillsDir}: ${error.message}`);
  }
  const result = await routeModel(skillsDir, {
    phase: options.skill,
    request: options.request,
    artifacts: options.artifacts,
    economy: model,
    candidates,
    routing: options.modelRouting ?? 'auto',
    choiceAliases: { economy: model, reasoning },
    requireJev: true,
  });
  const { expectedLosses, requestedModel, availableCandidates, profileSource, ...selection } = result;
  const aliases = { [model]: 'economy', [reasoning]: 'reasoning' };
  const probabilities = selection.probabilities && Object.fromEntries(Object.entries(selection.probabilities).map(([key, value]) => [aliases[key] || key, value]));
  return {
    ...selection,
    ...(probabilities ? { probabilities } : {}),
    availableModels: availableNames,
    candidates: selection.source === 'jev' ? availableCandidates : [model],
  };
}
