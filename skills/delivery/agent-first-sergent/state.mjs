#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { evaluateContextBoundary } from '../route-model/context.mjs';

const filename = '.first-sergent-state.json';
const allowedGates = new Set(['all', 'plan', 'pr', 'none']);
const allowedTransports = new Set(['native', 'herdr']);
const allowedQuotaModes = new Set(['off', 'omp', 'agent-router']);
const allowedContextPolicies = new Set(['off', 'stop-at-60']);
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

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
  const boundary = evaluateContextBoundary(usage);
  const sessionId = typeof usage?.sessionId === 'string' && usage.sessionId.trim() ? usage.sessionId.trim() : null;
  state.context_boundary = { ...boundary, sessionId };
  if (boundary.action === 'fresh-session' && !sessionId) {
    state.context_boundary = { ...state.context_boundary, action: 'stop', status: 'unknown', reason: 'live child session identity unavailable' };
  }
  return save(root, state);
}

export function startFreshSession(taskDir, sessionId) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state?.context_boundary || state.context_boundary.action !== 'fresh-session') {
    throw new Error('No threshold context boundary is waiting for a fresh session');
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('A fresh session identity is required to cross the context boundary');
  }
  const nextSessionId = sessionId.trim();
  if (!state.context_boundary.sessionId || nextSessionId === state.context_boundary.sessionId) {
    throw new Error('Fresh session identity must differ from the exhausted child session');
  }
  state.context_boundary = {
    ...state.context_boundary,
    action: 'continue',
    resumed: true,
    previousSessionId: state.context_boundary.sessionId,
    sessionId: nextSessionId,
  };
  return save(root, state);
}

export function begin(taskDir, skill) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state) throw new Error('Initialize the task before dispatch');
  if (state.stopped) throw new Error('Human stopped this delivery');
  if (state.context_boundary && state.context_boundary.action !== 'continue') throw new Error('Start a fresh session at the saved context boundary before dispatch');
  if (state.pending) throw new Error('Resolve the pending human gate before dispatch');
  if (state.phase) throw new Error('Resume the addressable phase before dispatching another');
  if (!skill || typeof skill !== 'string') throw new Error('Skill name is required');
  if (state.steps >= state.options.max_steps) throw new Error(`Reached max_steps=${state.options.max_steps}`);
  state.steps += 1;
  state.last_skill = skill;
  return save(root, state);
}

export function gate(taskDir, file) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state) throw new Error('Initialize the task before gating');
  if (state.stopped) throw new Error('Human stopped this delivery');
  if (state.phase) throw new Error('Finish the addressable phase before gating its artifact');
  const current = artifact(root, file);
  if (state.pending && state.pending.file !== current.file) throw new Error('A different artifact is awaiting a human decision');
  const replaced = Boolean(state.pending && state.pending.hash !== current.hash);
  if (state.revision?.file === current.file && state.revision.hash === current.hash) throw new Error('The requested revision has not changed the artifact');
  if (state.approvals[current.file] === current.hash) {
    if (state.pending) { state.pending = null; save(root, state); }
    return { approved: true, ...current, steps: state.steps };
  }
  state.pending = current;
  save(root, state);
  return { approved: false, replaced, ...current, steps: state.steps };
}

export function answer(taskDir, file, hash, response, feedback = '') {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state?.pending) throw new Error('No human gate is pending');
  const current = artifact(root, file);
  if (state.pending.file !== current.file || state.pending.hash !== current.hash || state.pending.hash !== hash) throw new Error('Stale gate: reviewed hash differs from the pending artifact');
  if (!['approve', 'revise', 'stop'].includes(response)) throw new Error('Expected approve, revise or stop');
  if (response === 'revise' && !feedback.trim()) throw new Error('Revision requires nonempty feedback');
  if (response === 'stop') state.stopped = true;
  if (response === 'approve') state.approvals[current.file] = current.hash;
  if (response === 'revise') state.revision = { ...current, feedback };
  state.pending = null;
  return save(root, state);
}

export function completedRevision(taskDir, file) {
  const root = taskPath(taskDir);
  const state = inspect(root);
  if (!state?.revision) throw new Error('No revision is pending');
  const current = artifact(root, file);
  if (current.file !== state.revision.file || current.hash === state.revision.hash) throw new Error('Revision did not change the reviewed artifact');
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
    const { action, taskDir, options, skill, file, hash, response, feedback, handle, question, usage, sessionId } = JSON.parse(fs.readFileSync(0, 'utf8'));
    const operations = { inspect: () => inspect(taskDir), initialize: () => initialize(taskDir, options), checkpointContext: () => checkpointContext(taskDir, usage), startFreshSession: () => startFreshSession(taskDir, sessionId), begin: () => begin(taskDir, skill), gate: () => gate(taskDir, file), answer: () => answer(taskDir, file, hash, response, feedback), completedRevision: () => completedRevision(taskDir, file), suspendPhase: () => suspendPhase(taskDir, skill, handle, question), answerPhase: () => answerPhase(taskDir, handle, response), completedPhase: () => completedPhase(taskDir, handle, file) };
    if (!Object.hasOwn(operations, action)) throw new Error(`Unknown action: ${action}`);
    process.stdout.write(`${JSON.stringify(operations[action]())}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
