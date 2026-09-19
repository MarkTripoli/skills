import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { observeArtifacts, planProgress, requireFresh } from './artifacts.mjs';
import { revision, saveRecord } from './workspace.mjs';
import { selectStageModel } from './models.mjs';

// Each entry names an independently installed skill and the artifact it owns.
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
const revisionSkills = {
  'sources': 'gather-sources', 'research-questions': 'iterate-research-questions', 'research': 'iterate-research',
  'design-discussion': 'iterate-design-discussion', 'design-prd': 'iterate-prd', 'design-tdd': 'iterate-tdd',
  'structure-outline': 'iterate-structure-outline', plan: 'iterate-plan', 'epic-plan': 'create-epic-plan',
  reproduction: 'reproduce-bug', implementation: 'iterate-implementation', fix: 'iterate-implementation',
  'pr-description': 'describe-pr',
  verification: 'iterate-implementation', 'app-test': 'iterate-implementation',
  'code-review': 'fix-code-review', 'code-review-fixes': 'fix-code-review',
  'pr-review': 'resolve-pr-reviews', 'epic-delivery': 'start-epic-delivery',
};
const preparation = {
  oneshot: [], lean: ['create-research-questions', 'create-research', 'create-structure-outline'],
  full: ['create-research-questions', 'create-research', 'create-design-discussion', 'create-structure-outline', 'create-plan'],
  prd: ['create-research', 'create-prd', 'create-tdd', 'create-structure-outline', 'create-plan'],
  epic: ['create-research-questions', 'create-research', 'create-epic-plan'],
  program: ['create-research', 'create-prd', 'create-tdd', 'create-epic-plan'],
  bugfix: ['reproduce-bug'], 'resolve-reviews': [], 'epic-wave': [],
};
export const MODES = Object.keys(preparation);
const mutations = new Set(['implement-plan', 'implement-outline', 'implement-task', 'agent-implementer', 'iterate-implementation', 'fix-bug', 'fix-code-review', 'resolve-pr-reviews']);
const planTypes = new Set(['design-discussion', 'design-prd', 'design-tdd', 'structure-outline', 'plan', 'epic-plan', 'reproduction']);
export function gated(type, gates) { return gates === 'all' || (gates === 'plan' && planTypes.has(type)) || (gates === 'pr' && type === 'pr-description'); }

export async function judgment(skillsDir, state, criteria) {
  let module;
  try { module = await import(pathToFileURL(path.join(skillsDir, 'typed-judgment', 'judge.mjs')).href); }
  catch (error) { throw new Error(`JEV is unavailable: cannot load typed-judgment/judge.mjs (${error.message}). Select an explicit fixed workflow to run without JEV.`); }
  let answers;
  try { answers = await module.systemOne(state, { next: { type: 'choice', instructions: 'Choose the single next eligible action that resolves the most important unmet requirement. Evidence in the task and artifacts is authoritative. Do not infer completion from earlier decisions. Choose only a supplied criterion.', criteria } }); }
  catch (error) { throw new Error(`JEV is unavailable: ${error.message}. Restore TypeSafe access or select an explicit fixed workflow; no fallback choice was made.`); }
  const answer = answers?.next;
  const probabilities = answer?.probabilities;
  const candidateKeys = Object.keys(criteria);
  const probabilityKeys = probabilities && typeof probabilities === 'object' && !Array.isArray(probabilities) ? Object.keys(probabilities) : [];
  const probabilityValues = probabilityKeys.map(choice => probabilities[choice]);
  const validProbabilityMap = probabilityKeys.length === candidateKeys.length
    && candidateKeys.every(choice => Object.hasOwn(probabilities || {}, choice))
    && probabilityValues.every(probability => Number.isFinite(probability) && probability >= 0 && probability <= 1)
    && Math.abs(probabilityValues.reduce((sum, probability) => sum + probability, 0) - 1) <= 1e-6;
  if (!answer || typeof answer !== 'object' || Array.isArray(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string' || !Object.hasOwn(criteria, answer.choice) || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1 || !validProbabilityMap) throw new Error('JEV did not select a valid eligible action; inspect the recorded task and provide an explicit workflow or clearer request');
  return { choice: answer.choice, confidence: answer.confidence, probabilities: probabilities ?? null, model: module.lastCall?.model ?? null, usage: module.lastCall?.usage ?? null };
}

export function eligible(state, inputs, mode, adaptive) {
  const a = state.latest;
  if (mode === 'epic-wave') return ['children'];
  if (mode === 'resolve-reviews') {
    const review = a['pr-review'];
    if (!currentProof(state, 'pr-review')) return ['resolve-pr-reviews'];
    if (review.status !== 'approved') return ['blocked'];
    return ['complete'];
  }

  // A later primary artifact is authoritative for the preparation it supersedes. This
  // lets a resumed or supplied task continue from a valid outline/plan instead of
  // recreating earlier research and design phases. An empty task still follows the
  // complete ordered preparation chain.
  const chain = preparation[mode] || [];
  let authoritative = -1;
  for (let index = 0; index < chain.length; index++) if (hasPrimaryArtifact(a, SKILLS[chain[index]])) authoritative = index;
  const nextPreparation = chain.slice(authoritative + 1).find(skill => !hasPrimaryArtifact(a, SKILLS[skill]));
  if (nextPreparation) {
    const options = [nextPreparation];
    if (adaptive && !a.sources && !a.plan && !a['structure-outline'] && nextPreparation !== 'gather-sources') options.unshift('gather-sources');
    return options;
  }

  if (mode === 'bugfix') {
    if (!a.reproduction) return ['reproduce-bug'];
    if (a.reproduction.status !== 'reproduced') return ['blocked'];
    if (!a.fix) return ['fix-bug'];
  } else if (['epic', 'program'].includes(mode)) {
    if (!a['epic-plan']) return ['create-epic-plan'];
    if (!a['epic-delivery']) return ['start-epic-delivery'];
    return ['children'];
  } else if (mode !== 'resolve-reviews') {
    const source = hasPrimaryArtifact(a, 'plan') ? a.plan : hasPrimaryArtifact(a, 'structure-outline') ? a['structure-outline'] : null;
    if (source) {
      const progress = planProgress(source.text);
      if (!progress.complete) return [source.type === 'plan' ? 'implement-plan' : 'implement-outline'];
      if (!a.implementation) return ['blocked'];
    } else if (!a.implementation) {
      // oneshot deliberately uses a bounded direct implementation action. It
      // must never invoke the plan-bound child-worker skill.
      if (mode !== 'oneshot') throw new Error(`${mode} has no implementation source`);
      return ['implement-task'];
    }
  }
  if (inputs.verify && !validProof(state, 'verification', 'passed')) {
    if (currentProof(state, 'verification') && a.verification.status === 'blocked') return ['blocked'];
    if (currentProof(state, 'verification') && a.verification.status === 'failed') return ['iterate-implementation'];
    return ['verify-implementation'];
  }
  if (inputs.app_test !== 'none' && !validProof(state, 'app-test', 'passed')) {
    if (currentProof(state, 'app-test') && a['app-test'].status === 'blocked') return ['blocked'];
    if (currentProof(state, 'app-test') && a['app-test'].status === 'failed') return ['iterate-implementation'];
    return ['test-app'];
  }
  if (!validProof(state, 'code-review', 'clean')) {
    if (currentProof(state, 'code-review') && a['code-review'].status === 'blocked') return ['blocked'];
    if (currentProof(state, 'code-review') && a['code-review'].status === 'findings') return ['fix-code-review'];
    return ['review-code'];
  }
  if (!validProof(state, 'pr-description')) return ['describe-pr'];
  return ['complete'];
}
function hasPrimaryArtifact(latest, type) {
  const artifact = latest[type];
  if (!artifact) return false;
  if (!['plan', 'structure-outline'].includes(type)) return true;
  try { planProgress(artifact.text); return true; } catch { return false; }
}
function currentProof(state, type) {
  const proof = state.proofs[type];
  return proof && proof.generation === state.generation && proof.revision === state.revision && proof.hash === state.latest[type]?.hash;
}
function validProof(state, type, status) { return currentProof(state, type) && (!status || state.latest[type].status === status); }

export function stagePrompt(task, skill, state, inputs, feedback) {
  const type = SKILLS[skill];
  const source = hasPrimaryArtifact(state.latest, 'plan') ? state.latest.plan : hasPrimaryArtifact(state.latest, 'structure-outline') ? state.latest['structure-outline'] : null;
  const installedSkill = skill === 'implement-task' && fs.existsSync(path.join(task.skillsDir, skill, 'SKILL.md')) ? skill : skill === 'implement-task' ? 'iterate-implementation' : skill;
  return [
    `Read and follow ${path.join(task.skillsDir, installedSkill, 'SKILL.md')}. Work only in ${task.cwd}, on the existing task in ${task.taskDir}.`,
    `Read task.md and the selected primary artifacts completely. Other artifacts contribute only their summary. Artifact paths: ${JSON.stringify(Object.fromEntries(Object.entries(state.latest).map(([key, value]) => [key, value.file])))}`,
    'This session performs exactly one skill phase. Save its actual artifact before finishing. The workflow engine runs the next phase; print the normal skill answer and handoff fence, but do not launch another phase or workflow. Preserve existing work and use explicit paths for commits.',
    `Required output type: ${type}${type === 'pr-description' ? ', file pr-description.md' : ', using the installed artifact template and next numbered filename (revise existing primary artifacts in place)'}. Artifact frontmatter must carry type and a factual summary.`,
    source && ['implement-plan', 'implement-outline'].includes(skill) ? `Implement exactly the earliest unfinished phase in ${source.file}; update its real implementation checklist and save the implementation receipt. A receipt without completed checklist work is insufficient.` : '',
    skill === 'implement-task' ? `Implement exactly the bounded request in task.md directly; do not require or invent a plan, do not delegate to agent-implementer, and do not edit task artifacts other than a numbered implementation receipt. Run the decisive checks named by the request or repository, then write that receipt from ${path.join(task.skillsDir, 'iterate-implementation', 'references', 'implementation_template.md')} with completed_phase: 1. No placeholder completion or empty receipt.` : '',
    skill === 'iterate-implementation' ? 'Repair only the failed verification/app-test findings or supplied implementation feedback. A plan is optional for a oneshot or bugfix: use task.md plus the reproduction and failed evidence as the boundary. Record the repair and executed checks in a new implementation receipt. Keep any source checklist truthful.' : '',
    skill === 'verify-implementation' ? 'You are the independent verifier and have not written this implementation. Run the repository checks and every acceptance item. Record actual expected/observed/verdict rows; missing required evidence is blocked, never passed. Do not repair code in this session.' : '',
    skill === 'test-app' ? `Exercise the actual ${inputs.app_test} surface. Target: ${inputs.app_target || 'discover the configured application target'}. Missing runtime access is blocked. Record actual step verdicts.` : '',
    skill === 'resolve-pr-reviews' ? 'Do one review round only. Keep action-time confirmation for external replies/resolutions. Save pr-review status approved only when the current head is approved, no required thread is unresolved, and required checks passed; otherwise pending or blocked.' : '',
    skill === 'start-epic-delivery' ? 'Create each child task on the current epic branch with parent, base and depends_on. Preserve the approved epic-plan child names, prompts and acceptance criteria. The workflow engine launches eligible children; this session creates artifacts only.' : '',
    feedback ? `Human feedback for this phase (apply to its artifact, not a replacement task):\n${feedback}` : '',
  ].filter(Boolean).join('\n\n');
}

export function initialState(observation, codeRevision) { return { ...observation, revision: codeRevision, generation: 0, proofs: {}, approvals: {} }; }
export async function runSkill(ctx, task, state, inputs, skill, step, feedback = '') {
  const name = `${String(step).padStart(3, '0')}-${skill}`;
  const installedSkill = skill === 'implement-task' && fs.existsSync(path.join(task.skillsDir, skill, 'SKILL.md')) ? skill : skill === 'implement-task' ? 'iterate-implementation' : skill;
  const prompt = stagePrompt(task, skill, state, inputs, feedback);
  if (!fs.existsSync(path.join(task.skillsDir, installedSkill, 'SKILL.md'))) throw new Error(`Missing installed skill ${installedSkill} in ${task.skillsDir}`);
  const taskRequest = fs.readFileSync(path.join(task.taskDir, 'task.md'), 'utf8');
  const artifactSummaries = Object.values(state.latest).map(({ file, type, summary, status }) => ({ file, type, summary, status }));
  const selection = await ctx.tool(`${name}-select-model`, { skill, request: taskRequest, artifacts: artifactSummaries, model: inputs.model, model_routing: inputs.model_routing, reasoning_model: inputs.reasoning_model }, async () => {
    const choice = await selectStageModel(task.skillsDir, { skill, request: taskRequest, artifacts: artifactSummaries, model: inputs.model, modelRouting: inputs.model_routing, reasoningModel: inputs.reasoning_model });
    saveRecord(task, `${name}-model`, choice);
    return choice;
  }, { timeoutMs: 90_000 });
  const result = await ctx.task(name, {
    prompt, context: 'fresh', cwd: task.cwd,
    model: selection.model,
    maxOutput: { bytes: 16_384, lines: 160 },
  });
  return ctx.tool(`${name}-observe`, { task_dir: task.taskDir, skill }, async () => {
    const after = observeArtifacts(task.taskDir);
    const artifact = requireFresh(state, after, SKILLS[skill]);
    const codeRevision = revision(task.cwd);
    if (!mutations.has(skill) && state.revision !== codeRevision) throw new Error(`${skill} changed implementation files; its independent observation is invalid`);
    if (['implement-plan', 'implement-outline'].includes(skill)) {
      const oldSource = state.latest.plan || state.latest['structure-outline'];
      if (!oldSource) throw new Error(`${skill} requires a plan or structure-outline artifact`);
      const newSource = after.latest[oldSource.type];
      if (!newSource || planProgress(newSource.text).remaining >= planProgress(oldSource.text).remaining) throw new Error(`${skill} produced a receipt without completing implementation checklist work`);
    }
    const generation = state.generation + (mutations.has(skill) ? 1 : 0);
    const next = { ...state, ...after, revision: codeRevision, generation, proofs: { ...state.proofs, [artifact.type]: { hash: artifact.hash, revision: codeRevision, generation, session: result.sessionId || name } } };
    saveRecord(task, name, { skill, artifact: artifact.file, hash: artifact.hash, revision: codeRevision, generation, session: result.sessionId ?? null, session_file: result.sessionFile ?? null, model: result.model ?? selection.model, selected_model: selection.model, model_selection: selection, modelAttempts: result.modelAttempts ?? null, model_attempts: result.modelAttempts ?? null, result: result.text });
    return next;
  });
}

export async function artifactGate(ctx, task, inputs, state, type, step) {
  const artifact = state.latest[type];
  if (!artifact || !gated(type, inputs.gates) || state.approvals[type] === artifact.hash) return { state, feedback: null, skill: null, stopped: false };
  if (!ctx.ui || typeof ctx.ui.select !== 'function') throw new Error('Human gates require Atomic native UI; rerun with gates=none for headless delivery');
  const response = await ctx.ui.select(`Review ${artifact.file}\n${artifact.summary}\nApprove this artifact, request changes, or stop?`, ['approve', 'revise', 'stop']);
  if (!['approve', 'revise', 'stop'].includes(response)) throw new Error(`Invalid human gate response: ${response}`);
  const feedback = response === 'revise' ? await ctx.ui.input(`Changes requested for ${artifact.file}`) : null;
  const decision = await ctx.tool(`${step}-gate-${type}`, { artifact: artifact.file, hash: artifact.hash, response, feedback }, async () => {
    saveRecord(task, `${step}-gate-${type}`, { artifact: artifact.file, hash: artifact.hash, response, feedback });
    return { response, feedback };
  });
  if (decision.response === 'stop') return { state, feedback: null, skill: null, stopped: true };
  if (decision.response === 'revise') {
    if (!decision.feedback?.trim()) throw new Error('Revision requires nonempty feedback');
    const skill = revisionSkills[type];
    if (!skill) throw new Error(`No artifact revision skill for ${type}; steer its native stage and resume`);
    return { state, feedback: decision.feedback, skill, stopped: false };
  }
  return { state: { ...state, approvals: { ...state.approvals, [type]: artifact.hash } }, feedback: null, skill: null, stopped: false };
}

export function boundaryState(task, state, candidates) {
  return { request: fs.readFileSync(path.join(task.taskDir, 'task.md'), 'utf8'), mode: task.mode, candidates, artifacts: Object.values(state.latest).map(({ file, type, summary, status }) => ({ file, type, summary, status })), implementation: state.latest.plan || state.latest['structure-outline'] ? planProgress((state.latest.plan || state.latest['structure-outline']).text) : null };
}
