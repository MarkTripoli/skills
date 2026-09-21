import fs from 'node:fs';

const source = new URL('../../shared/task-artifacts.mjs', import.meta.url);
const installed = new URL('../shared/task-artifacts.mjs', import.meta.url);
const implementation = await import((fs.existsSync(source) ? source : installed).href);

export const {
  ARTIFACT_SERIES,
  DEFAULT_TASK_ROOT,
  TASK_INDEX_SCHEMA,
  TASK_INDEX_VERSION,
  allocateArtifactIteration,
  createArtifactIndex,
  currentArtifact,
  initTaskArtifacts,
  indexFileExists,
  normalizeTaskRoot,
  parseArtifactText,
  parseTaskRootDirectives,
  readArtifactIndex,
  recordArtifact,
  reserveArtifactIteration,
  resolveTaskRoot,
  semanticSeries,
  serializeArtifactIndex,
  validateArtifactIndex,
  validateArtifactSemantics,
  writeArtifactIndex,
} = implementation;
