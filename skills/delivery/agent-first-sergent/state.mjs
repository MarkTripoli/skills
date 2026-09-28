#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateContextBoundary } from '../route-model/context.mjs';
const installedArtifacts = new URL('./references/task-artifacts.mjs', import.meta.url);
const { currentArtifact, indexFileExists, parseArtifactText } = await import(
  fs.existsSync(fileURLToPath(installedArtifacts))
    ? installedArtifacts : new URL('../../../shared/task-artifacts.mjs', import.meta.url)
);

const filename = '.first-sergent-state.json';
const allowedGates = new Set(['all', 'plan', 'pr', 'none']);
const allowedTransports = new Set(['native', 'herdr']);
const allowedQuotaModes = new Set(['off', 'omp', 'agent-router']);
const allowedContextPolicies = new Set(['off', 'stop-at-60']);
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const phaseArtifactTypes = Object.freeze({
  'gather-sources': 'sources',
  'create-research-questions': 'research-questions',
  'iterate-research-questions': 'research-questions',
  'create-research': 'research',
  'iterate-research': 'research',
  'create-design-discussion': 'design-discussion',
  'iterate-design-discussion': 'design-discussion',
  'create-prd': 'design-prd',
  'iterate-prd': 'design-prd',
  'create-tdd': 'design-tdd',
  'iterate-tdd': 'design-tdd',
  'create-structure-outline': 'structure-outline',
  'iterate-structure-outline': 'structure-outline',
  'create-plan': 'plan',
  'iterate-plan': 'plan',
  'create-epic-plan': 'epic-plan',
  'start-epic-delivery': 'epic-delivery',
  'reproduce-bug': 'reproduction',
  'fix-bug': 'fix',
  'implement-plan': 'implementation',
  'implement-outline': 'implementation',
  'iterate-implementation': 'implementation',
  'verify-implementation': 'verification',
  'test-app': 'app-test',
  'review-code': 'code-review',
  'fix-code-review': 'code-review-fixes',
  'review-artifact-comments': 'comment-review',
  'resolve-pr-reviews': 'pr-review',
  'iterate-evidence': 'evidence-iteration',
  'ci-commit': 'commit',
});
const taskArtifactTypes = [...new Set(Object.values(phaseArtifactTypes))];
const hostedPhases = new Set(['record-evidence', 'describe-pr']);
const planGatedPhases = new Set([
  'create-design-discussion', 'iterate-design-discussion', 'create-prd', 'iterate-prd',
  'create-tdd', 'iterate-tdd', 'create-structure-outline', 'iterate-structure-outline',
  'create-plan', 'iterate-plan', 'create-epic-plan', 'reproduce-bug',
]);
const planGatedTypes = new Set([...planGatedPhases].map((skill) => phaseArtifactTypes[skill]));
const needsLocalApproval = (state, artifactType) => state.options.gates === 'all' ||
  (state.options.gates === 'plan' && (state.steps === 0
    ? planGatedTypes.has(artifactType)
    : planGatedPhases.has(state.last_skill)));

function taskPath(taskDir) {
  const root = fs.realpathSync(taskDir);
  if (!fs.statSync(path.join(root, 'task.md')).isFile()) throw new Error('task.md is required');
  return root;
}

function artifact(root, file) {
  const resolved = fs.realpathSync(path.resolve(root, file));
  if (!resolved.startsWith(`${root}${path.sep}`) || resolved === path.join(root, 'task.md')) throw new Error('Artifact must be inside the task directory');
  return { file: path.relative(root, resolved), hash: digest(fs.readFileSync(resolved)) };
}
function revisionArtifactType(root, current) {
  const text = fs.readFileSync(path.join(root, current.file), 'utf8');
  if (!/^---\r?\n/.test(text)) {
    parseArtifactText(text, 'pr-description', current.file);
    return 'pr-description';
  }
  for (const type of taskArtifactTypes) {
    try {
      parseArtifactText(text, type, current.file);
      return type;
    } catch { /* Another registered artifact type may match. */ }
  }
  throw new Error('Revision requires a recognized task artifact type');
}


function phaseArtifact(root, state, current) {
  const expectedType = phaseArtifactTypes[state.last_skill];
  if (!expectedType) throw new Error(`No task-local artifact is registered for active phase ${state.last_skill}`);
  const text = fs.readFileSync(path.join(root, current.file), 'utf8');
  parseArtifactText(text, expectedType, current.file);
  if (indexFileExists(path.join(root, 'index.json'))) {
    const record = currentArtifact(root, expectedType);
    if (!record || record.path !== current.file || record.sha256 !== current.hash) {
      throw new Error(`Artifact does not match the current ${state.last_skill} phase artifact`);
    }
  }
}

function legacyArtifacts(root) {
  const before = {};
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && /^\d{2,}-.*\.md$/.test(entry.name)) {
      before[entry.name] = digest(fs.readFileSync(path.join(root, entry.name)));
    }
  }
  return before;
}

function save(root, state) {
  const target = path.join(root, filename);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return state;
}

export function inspect(taskDir) {
  const root = taskPath(taskDir);
  const file = path.join(root, filename);
  if (!fs.existsSync(file)) return null;
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (state?.version !== 1 || !Number.isSafeInteger(state.steps) || state.steps < 0 || !state.options || !allowedGates.has(state.options.gates) || (state.options.transport !== undefined && !allowedTransports.has(state.options.transport)) || (state.options.quota_mode !== undefined && !allowedQuotaModes.has(state.options.quota_mode)) || (state.options.quota_mode === 'agent-router' && state.options.transport !== 'herdr') || (state.options.context_policy !== undefined && !allowedContextPolicies.has(state.options.context_policy)) || !state.options.workflow || !Number.isSafeInteger(state.options.max_steps) || state.options.max_steps < 1 || !state.approvals || typeof state.approvals !== 'object' || Array.isArray(state.approvals)) throw new Error(`Invalid First Sergent state: ${file}`);
  if (state.context_boundary?.previousSessionId &&
    !(state.context_boundary.retiredSessionIds ?? []).includes(state.context_boundary.previousSessionId)) {
    state.context_boundary.retiredSessionIds = [
      ...(state.context_boundary.retiredSessionIds ?? []), state.context_boundary.previousSessionId,
    ];
    save(root, state);
  }
  // An approval recorded against a path/hash is not tied to a dispatch. In
  // particular, approvals from other phases cannot prove this phase finished.
  // A missing dispatch snapshot must be replayed against the current iteration.
  if (state.steps > 0 && !hostedPhases.has(state.last_skill) && indexFileExists(path.join(root, 'index.json'))
    && (!Object.hasOwn(state, 'phase_artifact_before') || !Object.hasOwn(state, 'completed_step'))) {
    const type = phaseArtifactTypes[state.last_skill];
    const record = type ? currentArtifact(root, type) : null;
    const hadSnapshot = Object.hasOwn(state, 'phase_artifact_before');
    const attributable = hadSnapshot && record &&
      record.id !== state.phase_artifact_before?.id &&
      (!needsLocalApproval(state) || state.approvals[record.path] === record.sha256) &&
      !state.pending && !state.revision;
    if (!Object.hasOwn(state, 'completed_step')) state.completed_step = attributable ? state.steps : null;
    if (!hadSnapshot) state.phase_artifact_before = record ? { id: record.id, hash: record.sha256 } : null;
    if (state.completed_step !== state.steps) state.legacy_replay = true;
    save(root, state);
  }
  if (state.steps > 0 && !hostedPhases.has(state.last_skill) && !indexFileExists(path.join(root, 'index.json'))
    && !Object.hasOwn(state, 'phase_legacy_before')) {
    if (state.completed_step === state.steps) state.legacy_resume_completed = true;
    state.phase_legacy_before = legacyArtifacts(root);
    if (state.completed_step !== state.steps) state.legacy_replay = true;
    save(root, state);
  }
  if (state.revision && (!Number.isSafeInteger(state.revision.step) || !state.revision.phaseType)) {
    const priorHash = state.phase_indexed
      ? state.phase_artifact_before?.hash : state.phase_legacy_before?.[state.revision.file];
    const dispatched = !state.legacy_replay && state.steps > 0 && priorHash === state.revision.hash;
    state.revision.step = Number.isSafeInteger(state.revision.step)
      ? state.revision.step : (dispatched ? state.steps - 1 : state.steps);
    state.revision.phaseType ??= phaseArtifactTypes[state.last_skill] ??
      revisionArtifactType(root, state.revision);
    if (!state.revision_required) state.revision_required = state.revision.file;
    save(root, state);
  }
  return state;
}

export function initialize(taskDir, options) {
  const root = taskPath(taskDir);
  const normalized = options && {
    ...options,
    transport: options.transport ?? 'native',
    quota_mode: options.quota_mode ?? 'off',
    context_policy: options.context_policy ?? 'off',
  };
  if (!normalized || typeof normalized.workflow !== 'string' || !normalized.workflow || !allowedGates.has(normalized.gates) || !allowedTransports.has(normalized.transport) || !allowedQuotaModes.has(normalized.quota_mode) || (normalized.quota_mode === 'agent-router' && normalized.transport !== 'herdr') || !allowedContextPolicies.has(normalized.context_policy) || !Number.isSafeInteger(normalized.max_steps) || normalized.max_steps < 1) throw new Error('Expected workflow, gates and positive max_steps');
  const old = inspect(root);
  if (old) {
    const oldOptions = { transport: 'native', quota_mode: 'off', context_policy: 'off', ...old.options };
    if (JSON.stringify(oldOptions) !== JSON.stringify(normalized)) throw new Error('Delivery options differ from the saved run; resolve the change explicitly before resuming');
    return old;
  }
  return save(root, { version: 1, options: normalized, steps: 0, approvals: {}, pending: null, revision: null, phase: null, stopped: false });
}
export function checkpointContext(taskDir, usage) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state) throw new Error('Initialize the task before recording context');
  if ((state.options.context_policy ?? 'off') !== 'stop-at-60') return state;
  const prior = state.context_boundary;
  const expectedSessionId = prior?.sessionId ?? null;
  const retiredSessionIds = prior?.retiredSessionIds ?? [];
  const sessionId = typeof usage?.sessionId === 'string' && usage.sessionId.trim() ? usage.sessionId.trim() : null;
  const boundary = evaluateContextBoundary(usage);
  const blockedAction = prior?.action === 'fresh-session' ? 'fresh-session' : 'recheck-required';
  if (sessionId && retiredSessionIds.includes(sessionId)) {
    state.context_boundary = {
      ...prior, action: blockedAction, status: 'unknown',
      reason: 'live context metric belongs to a retired child session',
    };
    return save(root, state);
  }
  if (expectedSessionId && sessionId !== expectedSessionId) {
    state.context_boundary = {
      ...prior, action: blockedAction, status: 'unknown',
      reason: 'live context metric does not match the current child session identity',
    };
    return save(root, state);
  }
  if (boundary.status === 'unknown') {
    state.context_boundary = expectedSessionId
      ? { ...prior, action: blockedAction, status: 'unknown', reason: boundary.reason }
      : { ...boundary, action: 'stop', sessionId: null };
    return save(root, state);
  }
  state.context_boundary = { ...boundary, sessionId, retiredSessionIds,
    ...(prior?.previousSessionId ? { previousSessionId: prior.previousSessionId } : {}) };
  if (!sessionId) {
    state.context_boundary = { ...state.context_boundary, action: 'stop', status: 'unknown', reason: 'live child session identity unavailable' };
  }
  return save(root, state);
}

export function startFreshSession(taskDir, sessionId) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  const replay = state?.legacy_replay === true;
  if (!state || (!replay && (!state.context_boundary || (state.context_boundary.action !== 'fresh-session'
    && !(state.steps > 0 && state.context_boundary.action === 'continue')))) ||
    (replay && (state.options.context_policy ?? 'off') === 'stop-at-60' &&
      !['continue', 'fresh-session'].includes(state.context_boundary?.action))) {
    throw new Error('No measured context boundary is waiting for a fresh session');
  }
  if (state.stopped || state.pending || state.phase) {
    throw new Error('Resolve the active phase and human gate before handing off its child session');
  }
  const resumingPhase = state.steps > 0 && state.completed_step !== state.steps;
  const revisionPhase = resumingPhase && !replay && Boolean(
    (state.revision && state.revision_required && state.revision.step === state.steps) ||
    (state.hosted_revision && state.hosted_revision.step === state.steps)
  );
  if (resumingPhase && state.context_boundary?.action !== 'fresh-session' && !replay && !revisionPhase) {
    throw new Error('Wait for the current child to finish and gate its artifact before retiring its session');
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('A fresh session identity is required to cross the context boundary');
  }
  if (state.resume_step !== undefined) throw new Error('Resume the already-registered fresh child session');
  const nextSessionId = sessionId.trim();
  if (state.replay_session_id === nextSessionId || nextSessionId === state.context_boundary?.sessionId
    || (state.context_boundary?.retiredSessionIds ?? []).includes(nextSessionId)) {
    throw new Error('Fresh session identity must be new and differ from every retired child session');
  }
  if (state.steps > 0 && (!resumingPhase || revisionPhase)) state.next_phase_session_id = nextSessionId;
  if (resumingPhase && !revisionPhase) state.resume_step = state.steps;
  if (!state.context_boundary) {
    state.replay_session_id = nextSessionId;
    return save(root, state);
  }
  const retiredSessionIds = [...new Set([
    ...(state.context_boundary.retiredSessionIds ?? []),
    ...(state.context_boundary.sessionId ? [state.context_boundary.sessionId] : []),
  ])];
  state.context_boundary = {
    action: 'awaiting-checkpoint',
    status: 'unknown',
    previousSessionId: state.context_boundary.sessionId,
    retiredSessionIds,
    sessionId: nextSessionId,
    reason: 'fresh child requires its own live context metric before dispatch',
  };
  return save(root, state);
}

export function begin(taskDir, skill) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state) throw new Error('Initialize the task before dispatch');
  if (state.stopped) throw new Error('Human stopped this delivery');
  if ((state.options.context_policy ?? 'off') === 'stop-at-60'
    && (state.context_boundary?.action !== 'continue' || !state.context_boundary.sessionId)) {
    throw new Error('A live context metric and child session identity are required before dispatch');
  }
  if (state.context_boundary && state.context_boundary.action !== 'continue') throw new Error('Start a fresh session at the saved context boundary before dispatch');
  if (state.pending) throw new Error('Resolve the pending human gate before dispatch');
  if (state.phase) throw new Error('Resume the addressable phase before dispatching another');
  const fixingReview = state.revision?.phaseType === 'code-review' &&
    state.last_skill === 'review-code' && skill === 'fix-code-review';
  if (state.review_recheck_required && skill !== 'review-code' &&
    !(state.resume_step !== undefined && skill === state.last_skill) &&
    !(state.revision?.phaseType === 'code-review-fixes' && skill === 'fix-code-review')) {
    throw new Error('Review the code again after fixing review findings');
  }
  if (state.revision_required && state.resume_step === undefined && (!state.revision ||
    (state.steps > 0 && phaseArtifactTypes[skill] !== phaseArtifactTypes[state.last_skill] && !fixingReview))) {
    throw new Error('Gate the requested artifact revision before dispatching another phase');
  }
  if (!skill || typeof skill !== 'string') throw new Error('Skill name is required');
  if (state.legacy_replay && state.resume_step === undefined) {
    throw new Error('Replay the legacy phase in a fresh child session before dispatching another');
  }
  if (state.resume_step === undefined && state.steps >= state.options.max_steps) throw new Error(`Reached max_steps=${state.options.max_steps}`);
  const expectedType = phaseArtifactTypes[skill];
  const indexed = indexFileExists(path.join(root, 'index.json'));
  if (state.resume_step !== undefined) {
    if (state.resume_step !== state.steps || skill !== state.last_skill) {
      throw new Error('Resume the checkpointed phase before dispatching another');
    }
    if (state.legacy_replay) {
      state.phase_indexed = indexed;
      if (state.revision && state.revision.step === state.steps) {
        state.revision.replayStep = state.steps;
      }
      if (indexed) {
        const prior = expectedType ? currentArtifact(root, expectedType) : null;
        state.phase_artifact_before = prior ? { id: prior.id, hash: prior.sha256 } : null;
        state.phase_legacy_before = null;
      } else {
        state.phase_legacy_before = legacyArtifacts(root);
      }
      delete state.legacy_replay;
    }
    delete state.resume_step;
    if (state.context_boundary) {
      state.context_boundary = {
        action: 'recheck-required',
        status: 'unknown',
        sessionId: state.context_boundary.sessionId,
        retiredSessionIds: state.context_boundary.retiredSessionIds ?? [],
        reason: 'a new live context metric is required before the next dispatch',
      };
    }
    return save(root, state);
  }
  const revisingHosted = Boolean(state.hosted_revision && state.last_skill === 'describe-pr' && skill === 'describe-pr');
  if (state.steps > 0 && hostedPhases.has(state.last_skill) && state.completed_step !== state.steps && !revisingHosted) {
    throw new Error('Verify hosted phase proof before dispatching another phase');
  }
  if ((state.options.context_policy ?? 'off') === 'stop-at-60' && state.steps > 0 &&
    state.next_phase_session_id !== state.context_boundary.sessionId) {
    throw new Error('Register a fresh child session and its live context metric before the next phase');
  }
  const prior = expectedType && indexed ? currentArtifact(root, expectedType) : null;
  state.steps += 1;
  state.completed_step = null;
  state.last_skill = skill;
  if (skill === 'review-code') state.review_recheck_required = false;
  state.phase_artifact_before = prior ? { id: prior.id, hash: prior.sha256 } : null;
  state.phase_indexed = indexed;
  state.phase_legacy_before = expectedType && !indexed
    ? legacyArtifacts(root) : null;
  delete state.legacy_resume_completed;
  state.hosted_approval = null;
  if (!revisingHosted) state.hosted_revision = null;
  delete state.next_phase_session_id;
  if ((state.options.context_policy ?? 'off') === 'stop-at-60') {
    state.context_boundary = {
      action: 'recheck-required',
      status: 'unknown',
      sessionId: state.context_boundary.sessionId,
      retiredSessionIds: state.context_boundary.retiredSessionIds ?? [],
      reason: 'a new live context metric is required before the next dispatch',
    };
  }
  return save(root, state);
}

export function gate(taskDir, file) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state) throw new Error('Initialize the task before gating');
  if (state.stopped) throw new Error('Human stopped this delivery');
  if (hostedPhases.has(state.last_skill)) throw new Error('Hosted phase proof must be verified independently; no task-local artifact gate exists');
  if (state.phase) throw new Error('Finish the addressable phase before gating its artifact');
  if (state.resume_step !== undefined) throw new Error('Resume the checkpointed phase before gating its artifact');
  if (state.steps > 0 && state.phase_indexed !== undefined &&
    state.phase_indexed !== indexFileExists(path.join(root, 'index.json'))) {
    throw new Error('Artifact index mode changed since dispatch');
  }
  const current = artifact(root, file);
  if (state.legacy_replay && state.pending) {
    if (state.phase_indexed) phaseArtifact(root, state, current);
    else if (state.pending.file !== current.file) {
      throw new Error('Refresh the pending legacy gate for its original artifact');
    }
    const replaced = state.pending.file !== current.file || state.pending.hash !== current.hash;
    state.pending = current;
    save(root, state);
    return { approved: false, replaced, ...current, steps: state.steps };
  }
  if (state.revision_required && !state.phase_indexed && state.revision_required !== current.file) {
    throw new Error('Gate the requested artifact revision, not another artifact');
  }
  if (state.steps > 0) phaseArtifact(root, state, current);
  if (state.steps > 0 && indexFileExists(path.join(root, 'index.json'))) {
    if (!Object.hasOwn(state, 'phase_artifact_before')) throw new Error('Active phase has no artifact snapshot from dispatch');
    const record = currentArtifact(root, phaseArtifactTypes[state.last_skill]);
    if (record && record.id === state.phase_artifact_before?.id && state.completed_step !== state.steps) {
      throw new Error('Active phase has not recorded a new artifact iteration');
    }
  }
  if (state.legacy_replay) throw new Error('Replay the legacy phase in a fresh child session before gating its artifact');
  if (state.steps > 0 && state.phase_legacy_before !== null && state.phase_legacy_before !== undefined) {
    if (!/^\d{2,}-.*\.md$/.test(current.file)) throw new Error('Legacy phase artifact must be a numbered task-root file');
    if (state.phase_legacy_before[current.file] === current.hash && !state.legacy_resume_completed) {
      throw new Error('Active phase has not produced a fresh legacy artifact');
    }
  }
  if (state.pending?.kind === 'hosted') throw new Error('A hosted description is awaiting a human decision');
  if (state.pending && state.pending.file !== current.file && !state.phase_indexed) throw new Error('A different artifact is awaiting a human decision');
  const replaced = Boolean(state.pending && (state.pending.file !== current.file || state.pending.hash !== current.hash));
  if (state.revision?.file === current.file && state.revision.hash === current.hash) throw new Error('The requested revision has not changed the artifact');
  if (state.steps > 0) state.completed_step = state.steps;
  const artifactType = state.steps === 0 && state.options.gates === 'plan'
    ? revisionArtifactType(root, current) : null;
  if (!needsLocalApproval(state, artifactType) || state.approvals[current.file] === current.hash) {
    state.revision_required = false;
    if (state.pending) state.pending = null;
    save(root, state);
    return { approved: true, ...current, steps: state.steps };
  }
  state.pending = current;
  save(root, state);
  return { approved: false, replaced, ...current, steps: state.steps };
}
/** Consume current hosted publication proof; PR approval is a distinct human decision. */
export function completeHostedPhase(taskDir, skill, proof) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state || state.stopped || state.phase || state.resume_step !== undefined ||
    !hostedPhases.has(skill) || state.last_skill !== skill ||
    (state.completed_step === state.steps && skill !== 'describe-pr') ||
    (state.pending && state.pending.kind !== 'hosted')) {
    throw new Error('An active hosted-only phase with verified proof is required');
  }
  try {
    verifyHostedProof(skill, proof);
  } catch (error) {
    if (skill === 'describe-pr' && state.completed_step === state.steps) {
      state.completed_step = null;
      state.hosted_approval = null;
      state.pending = null;
      save(root, state);
    }
    throw error;
  }
  const current = { kind: 'hosted', step: state.steps, url: proof.pullRequest, hash: proof.descriptionHash, head: proof.head };
  if (state.hosted_revision && state.steps <= state.hosted_revision.step) {
    throw new Error('Dispatch the hosted revision in a new matching phase before completing it');
  }
  if (skill === 'describe-pr' && ['pr', 'all'].includes(state.options.gates)) {
    if (state.hosted_revision && state.hosted_revision.hash === current.hash) {
      throw new Error('The requested hosted description revision has not changed');
    }
    const approved = state.hosted_approval?.step === current.step &&
      state.hosted_approval.url === current.url && state.hosted_approval.hash === current.hash &&
      state.hosted_approval.head === current.head;
    if (!approved) {
      const replaced = Boolean(state.pending?.kind === 'hosted' && !sameHosted(state.pending, current));
      state.completed_step = null;
      state.hosted_approval = null;
      state.pending = current;
      save(root, state);
      return { approved: false, replaced, ...current };
    }
    state.pending = null;
    state.hosted_revision = null;
  }
  state.completed_step = state.steps;
  state.hosted_proof = { step: state.steps, skill, url: proof.pullRequest, head: proof.head, descriptionHash: proof.descriptionHash ?? null };
  save(root, state);
  return { approved: true, ...current };
}

function verifyHostedProof(skill, proof) {
  if (!proof || typeof proof.pullRequest !== 'string' || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(proof.pullRequest) ||
    !/^[a-f0-9]{40}$/.test(proof.head ?? '') || proof.captureCurrent !== true ||
    proof.captureHosted !== true || proof.commentVerified !== true ||
    (skill === 'describe-pr' && (proof.bodyPublished !== true || proof.allowed !== true || proof.descriptionCurrent !== true ||
      !/^[a-f0-9]{64}$/.test(proof.descriptionHash ?? '')))) {
    throw new Error('Current hosted publication proof is required before completing this phase');
  }
}

function sameHosted(left, right) {
  return left.step === right.step && left.url === right.url && left.hash === right.hash && left.head === right.head;
}

export function answerHostedPhase(taskDir, proof, hash, response, feedback = '') {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state?.pending || state.pending.kind !== 'hosted' || state.last_skill !== 'describe-pr' || state.stopped) {
    throw new Error('No hosted human gate is pending');
  }
  verifyHostedProof('describe-pr', proof);
  const current = { kind: 'hosted', step: state.steps, url: proof.pullRequest, hash: proof.descriptionHash, head: proof.head };
  if (!sameHosted(state.pending, current) || hash !== current.hash) {
    throw new Error('Stale hosted gate: reviewed description hash or PR URL differs from current proof');
  }
  if (!['approve', 'revise', 'stop'].includes(response)) throw new Error('Expected approve, revise or stop');
  if (response === 'revise' && (typeof feedback !== 'string' || !feedback.trim())) throw new Error('Revision requires nonempty feedback');
  if (response === 'stop') state.stopped = true;
  if (response === 'approve') state.hosted_approval = current;
  if (response === 'revise') state.hosted_revision = { ...current, feedback };
  state.pending = null;
  return save(root, state);
}

export function answer(taskDir, file, hash, response, feedback = '') {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (state?.pending?.kind === 'hosted') throw new Error('Use answerHostedPhase with current hosted proof');
  if (!state?.pending) throw new Error('No human gate is pending');
  const current = artifact(root, file);
  if (state.phase_indexed) {
    if (!indexFileExists(path.join(root, 'index.json'))) throw new Error('Artifact index mode changed since dispatch');
    phaseArtifact(root, state, current);
  }
  if (state.pending.file !== current.file || state.pending.hash !== current.hash || state.pending.hash !== hash) throw new Error('Stale gate: reviewed hash differs from the pending artifact');
  if (!['approve', 'revise', 'stop'].includes(response)) throw new Error('Expected approve, revise or stop');
  if (response === 'revise' && !feedback.trim()) throw new Error('Revision requires nonempty feedback');
  if (response === 'stop') state.stopped = true;
  if (response === 'approve') {
    state.approvals[current.file] = current.hash;
    if (state.revision_required && !state.revision &&
      (state.phase_indexed || state.revision_required === current.file)) state.revision_required = false;
  }
  if (response === 'revise') {
    state.revision = { ...current, feedback, step: state.steps,
      phaseType: phaseArtifactTypes[state.last_skill] ?? revisionArtifactType(root, current) };
    state.revision_required = current.file;
    state.completed_step = null;
  }
  state.pending = null;
  return save(root, state);
}

export function completedRevision(taskDir, file) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state?.revision) throw new Error('No revision is pending');
  const fixingReview = state.revision.phaseType === 'code-review' &&
    state.last_skill === 'fix-code-review' && state.steps > state.revision.step;
  if (!Number.isSafeInteger(state.revision.step) ||
    !(state.steps > state.revision.step || state.revision.replayStep === state.steps) ||
    !state.revision.phaseType ||
    (phaseArtifactTypes[state.last_skill] !== state.revision.phaseType && !fixingReview) ||
    state.completed_step === state.steps) {
    throw new Error('Dispatch the matching revision phase before completing its artifact');
  }
  const current = artifact(root, file);
  if ((!state.phase_indexed && current.file !== state.revision.file && !fixingReview) ||
    current.hash === state.revision.hash) throw new Error('Revision did not change the reviewed artifact');
  phaseArtifact(root, state, current);
  if (fixingReview) {
    state.revision_required = current.file;
    state.review_recheck_required = true;
  }
  state.revision = null;
  return save(root, state);
}

export function suspendPhase(taskDir, skill, handle, question) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state || state.pending || state.last_skill !== skill || typeof handle !== 'string' || !handle.trim() || typeof question !== 'string' || !question.trim()) throw new Error('An addressable active phase and its question are required');
  if (state.phase && (state.phase.skill !== skill || state.phase.handle !== handle)) throw new Error('Another phase is waiting for an answer');
  if (state.phase && !state.phase.answer) {
    if (state.phase.question !== question) throw new Error('Answer the previous phase question first');
    return state;
  }
  state.phase = { skill, handle, question, answer: null };
  return save(root, state);
}

export function answerPhase(taskDir, handle, response) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state?.phase || state.phase.handle !== handle || typeof response !== 'string' || !response.trim()) throw new Error('No matching phase question awaits a nonempty answer');
  if (state.phase.answer) throw new Error('Phase question already answered');
  state.phase.answer = response;
  return save(root, state);
}

export function completedPhase(taskDir, handle, file) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state?.phase || state.phase.handle !== handle || !state.phase.answer) throw new Error('The addressable phase needs an answered question');
  const current = artifact(root, file);
  state.phase = null;
  save(root, state);
  return current;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { action, taskDir, options, skill, file, hash, response, feedback, handle, question, usage, sessionId, proof } = JSON.parse(fs.readFileSync(0, 'utf8'));
    const operations = { inspect: () => inspect(taskDir), initialize: () => initialize(taskDir, options), checkpointContext: () => checkpointContext(taskDir, usage), startFreshSession: () => startFreshSession(taskDir, sessionId), begin: () => begin(taskDir, skill), gate: () => gate(taskDir, file), completeHostedPhase: () => completeHostedPhase(taskDir, skill, proof), answerHostedPhase: () => answerHostedPhase(taskDir, proof, hash, response, feedback), answer: () => answer(taskDir, file, hash, response, feedback), completedRevision: () => completedRevision(taskDir, file), suspendPhase: () => suspendPhase(taskDir, skill, handle, question), answerPhase: () => answerPhase(taskDir, handle, response), completedPhase: () => completedPhase(taskDir, handle, file) };
    if (!Object.hasOwn(operations, action)) throw new Error(`Unknown action: ${action}`);
    process.stdout.write(`${JSON.stringify(operations[action]())}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
