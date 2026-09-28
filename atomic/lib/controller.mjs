import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, observeArtifacts, planProgress, requireFresh, section } from './artifacts.mjs';
import { git, revision, saveRecord } from './workspace.mjs';
import { selectStageModel } from './models.mjs';
import { currentHostedCapture, hostedProof } from './hosted-proof.mjs';
import {
  SKILLS, activeRecovery, currentProof, expectedArtifactIteration, inspectSource,
  primarySource, reconcileRecovery, recoveryDiagnostic, stagePrompt,
} from './stage-prompt.mjs';

export { SKILLS, activeRecovery, reconcileRecovery, recoveryDiagnostic, stagePrompt } from './stage-prompt.mjs';
const revisionSkills = {
  'sources': 'gather-sources', 'research-questions': 'iterate-research-questions', 'research': 'iterate-research',
  'design-discussion': 'iterate-design-discussion', 'design-prd': 'iterate-prd', 'design-tdd': 'iterate-tdd',
  'structure-outline': 'iterate-structure-outline', plan: 'iterate-plan', 'epic-plan': 'create-epic-plan',
  reproduction: 'reproduce-bug', implementation: 'iterate-implementation', fix: 'iterate-implementation',
  'pr-description': 'describe-pr',
  verification: 'iterate-implementation', 'app-test': 'iterate-implementation',
  'code-review': 'fix-code-review', 'code-review-fixes': 'fix-code-review', evidence: 'record-evidence',
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
const recoveryChoices = ['iterate-plan', 'iterate-implementation', 'blocked'];
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
    if (!currentProof(state, 'pr-review')) return ['resolve-pr-reviews'];
    if (a['pr-review'].status !== 'approved') return ['blocked'];
    if (!validProof(state, 'code-review', 'clean')) return ['review-code'];
    if (!currentHostedCapture(state.hosted)) return ['record-evidence'];
    if (!currentHostedDescription(state)) return ['describe-pr'];
    return [state.hosted.ready ? 'complete' : 'blocked'];
  }
  if (recoveryDiagnostic(state)) return recoveryChoices.slice();

  // A later primary artifact is authoritative for the preparation it supersedes. This
  // lets a resumed or supplied task continue from a valid outline/plan instead of
  // recreating earlier research and design phases. An empty task still follows the
  // complete ordered preparation chain.
  //
  // Keep source precedence independent of parse validity: a malformed plan must be
  // repaired as the authoritative source, never silently replaced by an older outline.
  const source = primarySource(a);
  const sourceCheck = source ? inspectSource(source) : null;
  if (sourceCheck?.error) return [revisionSkills[source.type]];
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
    if (source) {
      const progress = sourceCheck.progress;
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
  if (!currentHostedCapture(state.hosted)) return ['record-evidence'];
  if (!currentHostedDescription(state)) return ['describe-pr'];
  return [state.hosted.ready ? 'complete' : 'blocked'];
}
function hasPrimaryArtifact(latest, type) { return Boolean(latest[type]); }
function makeRecovery(skill, source, before, after, receipt, codeRevision) {
  return {
    kind: 'implementation-no-progress', status: 'blocked', skill,
    reason: 'The fresh implementation receipt did not advance the authoritative implementation checklist.',
    source: { type: source.type, file: source.file, hash: source.hash },
    receipt: { type: receipt.type, file: receipt.file, hash: receipt.hash },
    before_remaining: before.remaining, after_remaining: after.remaining,
    code_revision: codeRevision,
    actions: recoveryChoices.slice(),
  };
}
function validProof(state, type, status) { return currentProof(state, type) && (!status || state.latest[type].status === status); }
function acceptanceItems(task, state) {
  const request = fs.readFileSync(path.join(task.taskDir, 'task.md'), 'utf8');
  const source = primarySource(state.latest);
  const items = [];
  const seen = new Set();
  const add = text => {
    const item = text.replace(/^\s*(?:[-*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '').trim();
    const key = item.toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ');
    if (item && !/^(?:none\.?|n\/a|not applicable)\.?$/i.test(item) && !seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  };
  const bullets = text => text.split('\n').filter(line => /^\s*(?:[-*]|\d+[.)])\s+/.test(line));
  const criteria = section(request, 'Acceptance criteria');
  const taskItems = bullets(criteria);
  for (const line of taskItems.length ? taskItems : criteria.trim() ? [criteria.trim()] : []) add(line);
  for (const line of bullets(section(source?.text || '', 'Desired End State'))) add(line);
  for (const artifact of [source, state.latest.implementation, state.latest.fix]) {
    if (!artifact) continue;
    const lines = artifact.text.split('\n');
    let verify = false;
    for (const line of lines) {
      if (/^#{1,3}\s/.test(line)) verify = /^### Verify\s*$/i.test(line);
      else if (verify && /^\s*[-*]\s+(?:\[[ xX]\]\s+)?\S/.test(line)) add(line);
    }
  }
  const reproduction = state.latest.reproduction?.text.match(/^\s*(?:[-*]\s*)?Run:\s*(.+)$/im);
  if (reproduction) add(`Run: ${reproduction[1]}`);
  return items;
}
function verificationRows(artifact) {
  const table = section(artifact.text, 'Items').split('\n')
    .filter(line => /^\s*\|/.test(line))
    .map(line => line.split(/(?<!\\)\|/).slice(1, -1).map(cell => cell.trim()));
  const header = table.shift()?.map(cell => cell.toLowerCase()) || [];
  const columns = Object.fromEntries(['id', 'item', 'decided by', 'observed', 'verdict'].map(name => [name, header.indexOf(name)]));
  if (Object.values(columns).some(index => index < 0)) throw new Error(`${artifact.file}: verification Items table lacks proof columns`);
  return table.filter(row => !row.every(cell => /^-+$/.test(cell))).map(row =>
    Object.fromEntries(Object.entries(columns).map(([name, index]) => [name, row[index] || ''])));
}
function requireAcceptanceEvidence(task, state, artifact) {
  if (artifact.type !== 'verification' || artifact.status !== 'passed') return [];
  const promises = acceptanceItems(task, state);
  const rows = verificationRows(artifact);
  const acceptance = rows.filter(row => /^A/i.test(row.id));
  const normalized = value => value.toLowerCase().replace(/[`*_\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (!rows.length || acceptance.length !== promises.length || acceptance.some(row => !/^A[1-9]\d*$/i.test(row.id)) || promises.some((promise, index) => {
    const row = acceptance.find(candidate => candidate.id.toUpperCase() === `A${index + 1}`);
    return !row || row.verdict.toLowerCase() !== 'pass' || !normalized(row.item).includes(normalized(promise));
  }) || new Set(acceptance.map(row => row.id.toUpperCase())).size !== acceptance.length) {
    throw new Error(`${artifact.file}: passed verification lacks a matching passed A-row for every upstream acceptance item (or has an unaccounted A-row)`);
  }
  return rows.filter(row => /^[AC][1-9]\d*$/i.test(row.id) && row.verdict.toLowerCase() === 'pass');
}
function executeVerification(task, state, artifact, rows, step) {
  const beforeHead = git(task.cwd, ['rev-parse', 'HEAD']);
  const evidence = [];
  for (const row of rows) {
    const command = row['decided by'].match(/^`([^`\n]+)`$/)?.[1];
    if (!command) throw new Error(`${artifact.file}: ${row.id} has no executable command; an artifact assertion is not proof`);
    const run = spawnSync('/bin/sh', ['-c', command], {
      cwd: task.cwd, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const actualLines = `${run.stdout || ''}\n${run.stderr || ''}`.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const output = actualLines.join(' ');
    const exit = row.observed.match(/\b(?:exit(?:ed)?(?:\s+code)?|status)\s*[:=]?\s*0\b/i);
    const quoted = exit ? row.observed.slice(exit.index + exit[0].length)
      .replace(/^[\s:;,.—-]*(?:(?:stdout|output)\s*[:=]\s*)?/i, '')
      .replace(/^[`"']|[`"']$/g, '').trim() : '';
    if (run.error || run.status !== 0 || !exit ||
      (row.id.toUpperCase().startsWith('A') && (!quoted || !actualLines.includes(quoted)))) {
      throw new Error(`${artifact.file}: ${row.id} claimed pass is not corroborated by execution (${run.error?.message || `exit ${run.status}`}; ${output.slice(0, 300)})`);
    }
    const current = revision(task.cwd, task.taskRootRelative);
    if (current !== state.revision || git(task.cwd, ['rev-parse', 'HEAD']) !== beforeHead) {
      throw new Error(`${artifact.file}: ${row.id} changed the exact source revision while checking it`);
    }
    evidence.push({ id: row.id, command, exit: run.status, observed: quoted, output_sha256: digest(output), head: beforeHead, revision: current });
  }
  saveRecord(task, `${String(step).padStart(3, '0')}-verification-execution`, { artifact: artifact.file, hash: artifact.hash, head: beforeHead, revision: state.revision, evidence });
  return evidence;
}
async function requireIndependentReview(ctx, task, state, artifact, step, stageSession, acceptance, sourceHead, model) {
  const head = git(task.cwd, ['rev-parse', 'HEAD']);
  if (artifact.metadata.head_sha !== sourceHead || git(task.cwd, ['merge-base', sourceHead, head]) !== sourceHead) {
    throw new Error(`${artifact.file}: clean review is not pinned to exact source HEAD ${sourceHead}`);
  }
  const risks = ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability'];
  const name = `${String(step).padStart(3, '0')}-independent-review`;
  const prompt = [
    `Independently review the changed implementation in ${task.cwd} against task ${path.join(task.taskDir, 'task.md')}. Do not edit files or publish anything.`,
    `Pin reviewed source HEAD ${sourceHead} (current HEAD ${head} may include only the task artifact commit) and source revision ${state.revision}; inspect the actual diff, task and authoritative artifacts. Review acceptance items ${JSON.stringify(acceptance)} and risks ${JSON.stringify(risks)}.`,
    `Return only a JSON object {"head":string,"revision":string,"acceptance":[{"item":string,"evidence":string}],"risks":[{"risk":string,"evidence":string}],"findings":[{"location":string,"problem":string}]}. Include every assigned acceptance item with concrete changed path:line and observed behavior/test oracle; cover every assigned risk with concrete changed path:line and observation. Report all consequential findings. An unavailable or incomplete inspection must not claim coverage.`,
  ].join('\n\n');
  const result = await ctx.task(name, { prompt, context: 'fresh', cwd: task.cwd, model, maxOutput: { bytes: 16_384, lines: 160 } });
  let report;
  try { report = JSON.parse(result.text); }
  catch { throw new Error(`${artifact.file}: independent reviewer did not return a completed structured report`); }
  const complete = stageSession && result.sessionId && result.sessionId !== stageSession && report && !Array.isArray(report) &&
    report.head === sourceHead && report.revision === state.revision &&
    Array.isArray(report.acceptance) && report.acceptance.length === acceptance.length &&
    acceptance.every(item => report.acceptance.some(covered => covered.item === item && /[^\s:]+:\d+\b/.test(covered.evidence || ''))) &&
    Array.isArray(report.risks) && report.risks.length === risks.length &&
    risks.every(risk => report.risks.some(item => item.risk === risk && /[^\s:]+:\d+\b/.test(item.evidence || ''))) &&
    Array.isArray(report.findings);
  if (!complete || git(task.cwd, ['rev-parse', 'HEAD']) !== head || revision(task.cwd, task.taskRootRelative) !== state.revision) {
    throw new Error(`${artifact.file}: independent reviewer proof is missing, scope-incomplete, or not bound to exact HEAD`);
  }
  saveRecord(task, `${name}-proof`, { artifact: artifact.file, hash: artifact.hash, reviewed_head: sourceHead, head, revision: state.revision, session: result.sessionId, report });
  if (report.findings.length) throw new Error(`${artifact.file}: independent reviewer found consequential defects; clean review cannot advance`);
  return { head, session: result.sessionId };
}
function currentHostedDescription(state) {
  const proof = state.proofs?.['hosted-description'];
  return Boolean(state.hosted?.descriptionCurrent && proof &&
    proof.hash === state.hosted.descriptionHash &&
    proof.revision === state.revision && proof.generation === state.generation);
}
// Evidence lives on the PR. Local task artifacts cannot authorize this transition.

export function initialState(observation, codeRevision) { return { ...observation, revision: codeRevision, generation: 0, proofs: {}, approvals: {} }; }
export function contextBoundaryAdmission(inputs = {}) {
  if (inputs.context_policy !== 'stop-at-60') return null;
  return {
    action: 'stop',
    status: 'unknown',
    reason: 'Atomic WorkflowContext exposes no documented live child context telemetry; stage dispatch is blocked before ctx.task',
  };
}

export async function runSkill(ctx, task, state, inputs, skill, step, feedback = '') {
  const contextBoundary = contextBoundaryAdmission(inputs);
  if (contextBoundary) throw new Error(contextBoundary.reason);
  const name = `${String(step).padStart(3, '0')}-${skill}`;
  const installedSkill = skill === 'implement-task' && fs.existsSync(path.join(task.skillsDir, skill, 'SKILL.md')) ? skill : skill === 'implement-task' ? 'iterate-implementation' : skill;
  const prompt = stagePrompt(task, skill, state, inputs, feedback);
  if (!fs.existsSync(path.join(task.skillsDir, installedSkill, 'SKILL.md'))) throw new Error(`Missing installed skill ${installedSkill} in ${task.skillsDir}`);
  const taskRequest = fs.readFileSync(path.join(task.taskDir, 'task.md'), 'utf8');
  const artifactSummaries = Object.values(state.latest).map(({ file, type, summary, status }) => ({ file, type, summary, status }));
  const selection = await ctx.tool(`${name}-select-model`, { skill, request: taskRequest, artifacts: artifactSummaries, model: inputs.model, model_routing: inputs.model_routing, reasoning_model: inputs.reasoning_model, available_models: inputs.available_models, model_candidates: inputs.model_candidates, quota_mode: inputs.quota_mode }, async () => {
    const choice = await selectStageModel(task.skillsDir, { skill, request: taskRequest, artifacts: artifactSummaries, model: inputs.model, modelRouting: inputs.model_routing, reasoningModel: inputs.reasoning_model, availableModels: inputs.available_models, modelCandidates: inputs.model_candidates, quotaMode: inputs.quota_mode, quotaSnapshot: inputs.quota_snapshot, quotaCommand: inputs.quota_command, quotaMaxAgeMs: inputs.quota_max_age_ms, quotaRequiredHeadroom: inputs.quota_required_headroom, cwd: task.cwd, env: process.env });
    saveRecord(task, `${name}-model`, choice);
    return choice;
  }, { timeoutMs: 90_000 });
  const sourceHead = skill === 'review-code' ? git(task.cwd, ['rev-parse', 'HEAD']) : null;
  const result = await ctx.task(name, {
    prompt, context: 'fresh', cwd: task.cwd,
    model: selection.model,
    maxOutput: { bytes: 16_384, lines: 160 },
  });
  const observed = await ctx.tool(`${name}-observe`, { task_dir: task.taskDir, skill, context_policy: inputs.context_policy ?? 'off' }, async () => {
    const after = observeArtifacts(task.taskDir);
    const hostedStage = skill === 'record-evidence' || skill === 'describe-pr';
    const artifact = hostedStage ? null : requireFresh(state, after, SKILLS[skill], expectedArtifactIteration(state, SKILLS[skill]));
    if (['verify-implementation', 'review-code'].includes(skill) && (
      fs.readFileSync(path.join(task.taskDir, 'task.md'), 'utf8') !== taskRequest ||
      ['plan', 'structure-outline', 'implementation', 'fix', 'reproduction'].some(type => state.latest[type]?.hash !== after.latest[type]?.hash)
    )) throw new Error(`${skill} changed authoritative task, plan, or receipt while claiming independent proof`);
    const executionRows = skill === 'verify-implementation' ? requireAcceptanceEvidence(task, state, artifact) : [];
    const codeRevision = revision(task.cwd, task.taskRootRelative);
    if (!mutations.has(skill) && state.revision !== codeRevision) throw new Error(`${skill} changed implementation files; its independent observation is invalid`);
    if (skill === 'verify-implementation' && artifact.status === 'passed') executeVerification(task, state, artifact, executionRows, step);
    if (hostedStage) {
      const hosted = await hostedProof(task);
      if (!currentHostedCapture(hosted) || (skill === 'describe-pr' && !hosted.descriptionCurrent)) {
        throw new Error(`${skill} did not publish current, readable capture and revision-bound PR description/comment proof`);
      }
      const proofs = { ...state.proofs };
      if (skill === 'describe-pr') proofs['hosted-description'] = {
        hash: hosted.descriptionHash, revision: codeRevision, generation: state.generation,
        session: result.sessionId || name,
      };
      else delete proofs['hosted-description'];
      saveRecord(task, name, { skill, revision: codeRevision, hosted: true, model: result.model ?? selection.model });
      return { ...state, ...after, revision: codeRevision, hosted, proofs };
    }
    let recovery = null;
    if (['implement-plan', 'implement-outline'].includes(skill)) {
      const oldSource = state.latest.plan || state.latest['structure-outline'];
      if (!oldSource) throw new Error(`${skill} requires a plan or structure-outline artifact`);
      const newSource = after.latest[oldSource.type];
      if (!newSource) throw new Error(`${skill} did not preserve its authoritative ${oldSource.type} artifact`);
      const beforeProgress = planProgress(oldSource.text);
      const afterProgress = planProgress(newSource.text);
      if (afterProgress.remaining >= beforeProgress.remaining) recovery = makeRecovery(skill, newSource, beforeProgress, afterProgress, artifact, codeRevision);
    }
    const generation = state.generation + (mutations.has(skill) ? 1 : 0);
    const next = { ...state, ...after, revision: codeRevision, generation, proofs: { ...state.proofs, [artifact.type]: { hash: artifact.hash, revision: codeRevision, generation, session: result.sessionId || name } } };
    if (recovery) next.recovery = recovery;
    if (recovery) saveRecord(task, `${name}-recovery`, recovery);
    saveRecord(task, name, { skill, artifact: artifact.file, hash: artifact.hash, revision: codeRevision, generation, session: result.sessionId ?? null, session_file: result.sessionFile ?? null, model: result.model ?? selection.model, selected_model: selection.model, model_selection: selection, modelAttempts: result.modelAttempts ?? null, model_attempts: result.modelAttempts ?? null, result: result.text, ...(recovery ? { recovery } : {}) });
    return next;
  });
  if (skill === 'review-code' && observed.latest['code-review']?.status === 'clean') {
    await requireIndependentReview(ctx, task, state, observed.latest['code-review'], step, result.sessionId, acceptanceItems(task, state), sourceHead, selection.model);
  }
  return observed;
}

export async function artifactGate(ctx, task, inputs, state, type, step) {
  const artifact = type === 'pr-description' && currentHostedCapture(state.hosted) && currentHostedDescription(state)
    ? { file: state.hosted.pullRequest, hash: state.hosted.descriptionHash, summary: 'Hosted pull request body and evidence' }
    : type === 'pr-description' ? null : state.latest[type];
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
  const source = primarySource(state.latest);
  const sourceCheck = source ? inspectSource(source) : null;
  const implementation = sourceCheck?.error
    ? { source: source.file, type: source.type, valid: false, complete: null, remaining: null, phases: [], error: sourceCheck.error }
    : sourceCheck?.progress || null;
  return { request: fs.readFileSync(path.join(task.taskDir, 'task.md'), 'utf8'), mode: task.mode, candidates, artifacts: Object.values(state.latest).map(({ file, type, summary, status }) => ({ file, type, summary, status })), implementation, recovery: recoveryDiagnostic(state) };
}
