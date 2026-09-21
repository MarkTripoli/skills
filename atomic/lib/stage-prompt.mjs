import fs from 'node:fs';
import path from 'node:path';
import { allocateArtifactIteration, semanticSeries } from './artifact-index.mjs';
import { planProgress } from './artifacts.mjs';

export const SKILLS = {
  'gather-sources': 'sources', 'create-research-questions': 'research-questions', 'create-research': 'research',
  'create-design-discussion': 'design-discussion', 'create-prd': 'design-prd', 'create-tdd': 'design-tdd',
  'create-structure-outline': 'structure-outline', 'create-plan': 'plan', 'create-epic-plan': 'epic-plan',
  'start-epic-delivery': 'epic-delivery', 'reproduce-bug': 'reproduction', 'fix-bug': 'fix',
  'implement-plan': 'implementation', 'implement-outline': 'implementation', 'implement-task': 'implementation', 'agent-implementer': 'implementation',
  'iterate-implementation': 'implementation', 'verify-implementation': 'verification', 'test-app': 'app-test',
  'review-code': 'code-review', 'fix-code-review': 'code-review-fixes', 'describe-pr': 'pr-description',
  'resolve-pr-reviews': 'pr-review', 'iterate-research-questions': 'research-questions', 'iterate-research': 'research',
  'iterate-design-discussion': 'design-discussion', 'iterate-prd': 'design-prd', 'iterate-tdd': 'design-tdd',
  'iterate-structure-outline': 'structure-outline', 'iterate-plan': 'plan',
};

export function primarySource(latest) { return latest.plan || latest['structure-outline'] || null; }
export function inspectSource(artifact) {
  try { return { progress: planProgress(artifact.text), error: null }; }
  catch (error) { return { progress: null, error: error instanceof Error ? error.message : String(error) }; }
}
export function currentProof(state, type) {
  const proof = state.proofs[type];
  return proof && proof.generation === state.generation && proof.revision === state.revision && proof.hash === state.latest[type]?.hash;
}
export function activeRecovery(state) {
  const recovery = state.recovery;
  if (!recovery) return null;
  const source = primarySource(state.latest);
  return recovery.source?.hash && source?.hash && recovery.source.hash !== source.hash ? null : recovery;
}
export function recoveryDiagnostic(state) { return activeRecovery(state); }
export function reconcileRecovery(state) {
  const recovery = state.recovery;
  if (!recovery) return { ...state, recovery: null };
  const source = primarySource(state.latest);
  if (recovery.source?.hash && source?.hash && recovery.source.hash !== source.hash) return { ...state, recovery: { ...recovery, source_superseded: true } };
  return { ...state, recovery };
}
export function expectedArtifactIteration(state, type) {
  if (!state.index) return null;
  const { kind, variant } = semanticSeries(type);
  return { ...allocateArtifactIteration(state.index, kind, variant), kind, variant };
}

function outputInstruction(task, installedSkill, type, state) {
  const expected = expectedArtifactIteration(state, type);
  if (!expected) return `Required output type: ${type}${type === 'pr-description' ? ', file pr-description.md' : ', using the installed artifact template and next numbered filename (revise existing primary artifacts in place)'}. Artifact frontmatter must carry type and a factual summary.`;
  const relative = expected.path;
  const helper = path.join(task.skillsDir, installedSkill, 'references', 'task-artifacts.mjs');
  const allocate = `${JSON.stringify(process.execPath)} ${JSON.stringify(helper)} allocate ${JSON.stringify(task.taskDir)} ${expected.kind} ${expected.variant}`;
  const record = `${JSON.stringify(process.execPath)} ${JSON.stringify(helper)} record ${JSON.stringify(task.taskDir)} ${expected.kind} ${expected.variant} ${type}`;
  return `Required output type: ${type}. Indexed task: run ${allocate}. Confirm its id/path are ${expected.id} and ${relative}, then write only to the unique writePath it returns. Run ${record} with that writePath as the final argument. Never write the canonical path directly. Success requires index.json to register ${expected.id} at ${relative} as current.`;
}
function sourceRevisionInstruction(task, installedSkill, type, source, state) {
  if (!state.index || !source || type !== 'implementation') return '';
  const expected = expectedArtifactIteration(state, source.type);
  const helper = path.join(task.skillsDir, installedSkill, 'references', 'task-artifacts.mjs');
  const allocate = `${JSON.stringify(process.execPath)} ${JSON.stringify(helper)} allocate ${JSON.stringify(task.taskDir)} ${expected.kind} ${expected.variant}`;
  const record = `${JSON.stringify(process.execPath)} ${JSON.stringify(helper)} record ${JSON.stringify(task.taskDir)} ${expected.kind} ${expected.variant} ${source.type}`;
  return `The authoritative ${source.type} is indexed and immutable. Run ${allocate}, confirm ${expected.id} at ${expected.path}, write the revision only to its returned writePath, then run ${record} with that writePath. Do not edit ${source.file} or the canonical path in place.`;
}

export function stagePrompt(task, skill, state, inputs, feedback) {
  const type = SKILLS[skill];
  const source = primarySource(state.latest);
  const sourceForRevision = skill === 'iterate-plan' ? state.latest.plan : skill === 'iterate-structure-outline' ? state.latest['structure-outline'] : null;
  const revisionCheck = sourceForRevision ? inspectSource(sourceForRevision) : null;
  const recovery = recoveryDiagnostic(state);
  const failedProofFeedback = skill === 'iterate-implementation'
    ? ['verification', 'app-test'].map(proofType => ({ type: proofType, artifact: state.latest[proofType] }))
      .filter(({ type: proofType, artifact }) => artifact && artifact.status === 'failed' && currentProof(state, proofType))
      .map(({ type: proofType, artifact }) => `Current failed ${proofType} artifact (required fully-read feedback; its Findings remain in scope alongside human feedback): ${artifact.file}`)
    : [];
  const recoveryPrompt = recovery ? `Recovery is required after a real native delivery failure. Latest implementation receipt: ${recovery.receipt.file} (${recovery.receipt.hash}). Authoritative source: ${recovery.source.file} (${recovery.source.hash}). Reason: ${recovery.reason} Legal next actions are iterate-plan, iterate-implementation, or blocked. Do not treat model completion claims or the old receipt as evidence; do not return to ordinary implementation or complete until this recovery is resolved.` : '';
  const sourceRepair = sourceForRevision ? `Repair the authoritative ${sourceForRevision.type} artifact ${sourceForRevision.file} before implementation. ${revisionCheck.error ? `The controller rejected its implementation checklist: ${revisionCheck.error}` : 'The artifact was selected for revision.'} Correct the Markdown (including balanced fences), preserve numbered phases with executable checklists, and ${state.index ? 'save the corrected source as the required indexed iteration' : 'save the corrected source in place'}; do not fall back to an older source or claim completion without valid checklist evidence.` : '';
  const installedSkill = skill === 'implement-task' && fs.existsSync(path.join(task.skillsDir, skill, 'SKILL.md')) ? skill : skill === 'implement-task' ? 'iterate-implementation' : skill;
  return [
    `Read and follow ${path.join(task.skillsDir, installedSkill, 'SKILL.md')}. Work only in ${task.cwd}, on the existing task in ${task.taskDir}.`,
    `Read task.md and the selected primary artifacts completely. Other artifacts contribute only their summary. Artifact paths: ${JSON.stringify(Object.fromEntries(Object.entries(state.latest).map(([key, value]) => [key, value.file])))}`,
    'This session performs exactly one skill phase. Save its actual artifact before finishing. The workflow engine runs the next phase; print the normal skill answer and handoff fence, but do not launch another phase or workflow. Preserve existing work and use explicit paths for commits.',
    outputInstruction(task, installedSkill, type, state), sourceRevisionInstruction(task, installedSkill, type, source, state), sourceRepair, recoveryPrompt,
    source && ['implement-plan', 'implement-outline'].includes(skill) ? `Implement exactly the earliest unfinished phase in ${source.file}; update its real implementation checklist and save the implementation receipt. A receipt without completed checklist work is insufficient.` : '',
    skill === 'implement-task' ? `Implement exactly the bounded request in task.md directly; do not require or invent a plan, do not delegate to agent-implementer, and do not edit task artifacts other than ${state.index ? 'the required semantic implementation receipt' : 'a numbered implementation receipt'}. Run the decisive checks named by the request or repository, then write that receipt from ${path.join(task.skillsDir, 'iterate-implementation', 'references', 'implementation_template.md')} with completed_phase: 1. No placeholder completion or empty receipt.` : '',
    skill === 'iterate-implementation' ? 'Repair only the failed verification/app-test findings or supplied implementation feedback. A plan is optional for a oneshot or bugfix: use task.md plus the reproduction and failed evidence as the boundary. Record the repair and executed checks in a new implementation receipt. Keep any source checklist truthful.' : '',
    skill === 'verify-implementation' ? 'You are the independent verifier and have not written this implementation. Run the repository checks and every acceptance item. Record actual expected/observed/verdict rows; missing required evidence is blocked, never passed. Do not repair code in this session.' : '',
    skill === 'test-app' ? `Exercise the actual ${inputs.app_test} surface. Target: ${inputs.app_target || 'discover the configured application target'}. Missing runtime access is blocked. Record actual step verdicts.` : '',
    skill === 'resolve-pr-reviews' ? 'Do one review round only. Keep action-time confirmation for external replies/resolutions. Save pr-review status approved only when the current head is approved, no required thread is unresolved, and required checks passed; otherwise pending or blocked.' : '',
    skill === 'start-epic-delivery' ? 'Create each child task on the current epic branch with parent, base and depends_on. Preserve the approved epic-plan child names, prompts and acceptance criteria. The workflow engine launches eligible children; this session creates artifacts only.' : '',
    ...failedProofFeedback, feedback ? `Human feedback for this phase (apply to its artifact, not a replacement task):\n${feedback}` : '',
  ].filter(Boolean).join('\n\n');
}
