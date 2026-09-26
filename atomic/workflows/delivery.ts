import { workflow } from '@bastani/atomic/workflows';
import { Type } from 'typebox';
import { observeArtifacts, frontmatter, planProgress } from '../lib/artifacts.mjs';
import { ensureTask, revision, saveRecord, childrenFor, childWave, prepareChild, expandPath } from '../lib/workspace.mjs';
import { MODES, SKILLS, judgment, eligible, initialState, runSkill, artifactGate, boundaryState, recoveryDiagnostic, reconcileRecovery, contextBoundaryAdmission } from '../lib/controller.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSkillsDir } from '../lib/skill-storage.mjs';

const choices = (values: string[], fallback: string) => Type.Union(values.map(value => Type.Literal(value)), { default: fallback });
const delivery = workflow({
  name: 'delivery',
  description: 'Deliver a task through independent artifact-backed skill sessions. JEV selects eligible actions at every boundary; explicit workflows use a fixed path. Human gates use native Atomic UI.',
  autoAttach: true,
  inputs: {
    request: Type.String({ minLength: 1, description: 'Literal task request. Do not include credentials.' }),
    task_dir: Type.Optional(Type.String({ description: 'Existing task directory to reuse in its current worktree.' })),
    skills_dir: Type.Optional(Type.String({ description: 'Installed skill directory; defaults to ~/.agents/skills.' })),
    workflow: choices(['auto', ...MODES], 'auto'),
    gates: choices(['all', 'none', 'plan', 'pr'], 'all'),
    liaison: choices(['none', 'first-sergent'], 'none'),
    transport: choices(['native', 'herdr'], 'native'),
    quota_mode: choices(['off', 'omp', 'agent-router'], 'off'),
    quota_command: Type.Optional(Type.String({ minLength: 1, description: 'OMP executable used when quota_mode=omp.' })),
    quota_max_age_ms: Type.Optional(Type.Number({ minimum: 0, description: 'Maximum age of an OMP usage snapshot.' })),
    quota_required_headroom: Type.Optional(Type.Number({ minimum: 0, maximum: 1, description: 'Minimum remaining fraction required for every candidate.' })),
    context_policy: choices(['off', 'stop-at-60'], 'off'),
    model: Type.String({ minLength: 1, default: 'openai-codex/gpt-5.6-luna-fast', description: 'Ordinary economical stage model; mandatory for every code-writing and unknown phase.' }),
    model_routing: choices(['auto', 'fixed'], 'auto'),
    reasoning_model: Type.String({ minLength: 1, default: 'openai-codex/gpt-5.6-sol', description: 'Stronger reasoning model available to JEV for allowed non-code phases.' }),
    available_models: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: 'Legacy exact model identifiers available to the active runtime or account; portable route-model accepts richer candidate objects.' })),
    model_candidates: Type.Optional(Type.Array(Type.Object({ model: Type.String({ minLength: 1 }), cost: Type.Number({ minimum: 0 }), description: Type.String({ minLength: 1 }) }), { description: 'Exact caller-supplied candidates for the shared portable route-model helper.' })),
    app_test: choices(['none', 'web', 'ios', 'android'], 'none'),
    app_target: Type.Optional(Type.String({ description: 'URL, simulator, emulator or application target.' })),
    verify: Type.Boolean({ default: true, description: 'Run independent implementation verification.' }),
    max_steps: Type.Integer({ default: 40, minimum: 1, description: 'Maximum fresh skill sessions including repairs and feedback iterations.' }),
    branch: Type.Optional(Type.String({ description: 'New task branch, or required current branch for a supplied task directory.' })),
    base: Type.Optional(Type.String({ description: 'New worktree base; otherwise repository default branch.' })),
  },
  outputs: {
    status: Type.String(), summary: Type.String(), task_dir: Type.String(), branch: Type.String(),
    steps: Type.Integer(), children: Type.Array(Type.String()),
  },
  run: async (ctx) => {
    const inputs = ctx.inputs;
    // Tool checkpoints reject explicit undefined values; retain one stable,
    // serializable snapshot for durable records and child workflow inputs.
    const persistedInputs = JSON.parse(JSON.stringify(inputs));
    const cwd = ctx.cwd || process.cwd();
    const runId = ctx.runId;
    if (!runId) throw new Error('Atomic must supply its ctx.runId for durable delivery records');
    const existing = inputs.task_dir ? frontmatter(fs.readFileSync(path.join(path.resolve(cwd, expandPath(inputs.task_dir)), 'task.md'), 'utf8'), 'task.md') : null;
    const routeRequest = existing?.body || inputs.request;
    const routeWorkflow = existing?.metadata?.workflow || inputs.workflow;
    const adaptive = routeWorkflow === 'auto';
    const skillsDir = resolveSkillsDir(inputs.skills_dir, cwd);
    const route = await ctx.tool('select-delivery-mode', { request: routeRequest, workflow: routeWorkflow, skills_dir: skillsDir }, async () => {
      if (!adaptive) return { choice: routeWorkflow, source: 'explicit', confidence: null };
      const decision = await judgment(skillsDir, { request: routeRequest }, {
        oneshot: 'One bounded change with known behavior and no unresolved design questions.',
        lean: 'One deliverable needing focused research and an implementation outline.',
        full: 'One deliverable needing research, design alternatives and a detailed implementation plan.',
        prd: 'One deliverable with open product requirements that need PRD and technical design.',
        bugfix: 'A reported defect requiring a failing reproduction before any fix.',
        epic: 'Known requirements split into independently mergeable child tasks.',
        program: 'Open product requirements plus multiple independently mergeable child tasks.',
        'resolve-reviews': 'Address the current pull request review threads in its existing task.',
        'epic-wave': 'Start the next dependency-ready wave of an existing approved epic.',
      });
      return { ...decision, source: 'jev' };
    }, { timeoutMs: 90_000 });
    const task = await ctx.tool('open-task-workspace', { inputs: { ...persistedInputs, request: routeRequest, workflow: routeWorkflow }, cwd, mode: route.choice }, async () => {
      const opened = ensureTask(inputs, cwd, runId, route.choice);
      saveRecord(opened, 'route', route);
      saveRecord(opened, 'inputs', { ...persistedInputs, request: opened.request, workflow: opened.mode });
      return opened;
    }, { timeoutMs: 90_000 });
    const taskInputs = { ...persistedInputs, request: task.request, workflow: task.mode };
    let state = await ctx.tool('observe-initial-artifacts', { task_dir: task.taskDir }, async () => initialState(observeArtifacts(task.taskDir), revision(task.cwd, task.taskRootRelative)));
    state = { ...state, recovery: recoveryDiagnostic(state) };
    let steps = 0;
    let forced: { skill: string; feedback: string } | null = null;
    const launched: string[] = [];
    const finish = async (status: string, summary: string) => {
      const result = await ctx.tool(`finish-${status}`, { task_dir: task.taskDir, status, summary, steps, children: launched }, async () => {
        const output = { status, summary, task_dir: task.taskDir, branch: task.branch || '', steps, children: launched };
        saveRecord(task, 'result', output);
        return output;
      });
      if (status === 'blocked') return ctx.exit({ status: 'blocked', reason: summary, outputs: result });
      return result;
    };
    if (taskInputs.quota_mode === 'agent-router') {
      if (taskInputs.transport !== 'herdr') return finish('blocked', 'agent-router quota requires explicit transport=herdr; native Atomic transport has no external-router reservation path.');
      if (process.env.HERDR_ENV !== '1') return finish('blocked', 'agent-router quota requires HERDR_ENV=1; no Herdr pane was controlled.');
      return finish('blocked', 'agent-router is not dispatched: the current CLI owns reservation only inside `router run TASK --json --usage --no-enrich`, but it cannot bind the caller-selected account or guarantee the existing task worktree. No dry-run reservation or alternate fallback was used.');
    }

    // Each loop creates new tracked work. Neither a repair nor a feedback round
    // reopens an ancestor, so replay preserves one acyclic stage sequence.
    while (steps < inputs.max_steps) {
      // Observation is workflow-owned external state. Keep the callback's identity stable
      // (task directory plus boundary ordinal), rather than hashing live values into replay
      // arguments; native replay can then reach the same frontier after a process restart.
      const boundary = await ctx.tool(`${steps}-refresh-boundary`, { task_dir: task.taskDir }, async () => {
        const boundaryObservation = observeArtifacts(task.taskDir);
        return { ...boundaryObservation, revision: revision(task.cwd, task.taskRootRelative) };
      });
      const hashes = state.hashes || {};
      const observedHashes = boundary.hashes || {};
      const artifactsChanged = Object.keys(hashes).length !== Object.keys(observedHashes).length
        || Object.entries(observedHashes).some(([file, hash]) => hashes[file] !== hash);
      const proofs = artifactsChanged || state.revision !== boundary.revision ? {} : state.proofs;
      state = { ...state, ...boundary, proofs };
      state = reconcileRecovery(state);
      // Reused artifacts still need the selected human approval policy. Approvals
      // are tied to content hashes, not an artifact filename or a claimed status.
      if (!forced) {
        for (const type of ['sources', 'research-questions', 'research', 'design-discussion', 'design-prd', 'design-tdd', 'structure-outline', 'plan', 'epic-plan', 'reproduction']) {
          const gate = await artifactGate(ctx, task, taskInputs, state, type, `boundary-${steps}`);
          state = gate.state;
          if (gate.stopped) return finish('blocked', `Human stopped at ${type}; retained task and worktree are unchanged.`);
          if (gate.skill) { forced = { skill: gate.skill, feedback: gate.feedback }; break; }
        }
      }
      const candidates = forced ? [forced.skill] : eligible(state, taskInputs, task.mode, adaptive);
      if (!candidates.length) throw new Error('No eligible delivery transition; required evidence or workflow mode is invalid');
      const observation = boundaryState(task, state, candidates);
      const decision = await ctx.tool(`${steps}-choose-next`, { task_dir: task.taskDir, boundary: steps, forced: forced?.skill || null }, async () => {
        let selected;
        try {
          selected = forced ? { choice: forced.skill, source: 'human-feedback', confidence: null }
            : adaptive ? { ...await judgment(task.skillsDir, observation, Object.fromEntries(candidates.map(skill => [skill, skill === 'complete' ? 'All enforced delivery criteria are satisfied; finish.' : skill === 'blocked' ? 'A required prerequisite or failed evidence prevents safe advancement; stop observably.' : `Run ${skill} next against the observed task artifacts.`]))), source: 'jev' }
              : { choice: candidates[0], source: 'explicit-workflow', confidence: null };
        } catch (error) {
          saveRecord(task, `${steps}-decision-error`, { message: String(error) });
          throw error;
        }
        saveRecord(task, `${steps}-decision`, { observation, ...selected });
        return selected;
      }, { timeoutMs: 90_000 });
      if (!candidates.includes(decision.choice)) throw new Error(`Unsafe transition: ${decision.choice} was not eligible`);
      if (decision.choice === 'complete') return finish('completed', 'Implementation, required independent verification, clean code review and pull request description are complete.');
      if (decision.choice === 'blocked') {
        const recovery = recoveryDiagnostic(state);
        if (recovery) return finish('blocked', `Implementation recovery remains unresolved. Receipt ${recovery.receipt.file} (${recovery.receipt.hash}); source ${recovery.source.file} (${recovery.source.hash}). Reason: ${recovery.reason}. Legal next actions are iterate-plan or iterate-implementation; no completion claim is accepted.`);
        const source = state.latest.plan || state.latest['structure-outline'];
        const missingReceipt = source && !state.latest.implementation && planProgress(source.text).complete;
        return finish('blocked', missingReceipt ? `Implementation source ${source.file} is complete but has no implementation receipt; missing receipt evidence cannot be recovered by decreasing checkboxes. Resume with genuine validation evidence or inspect the task.` : `Required evidence is not ready: ${Object.values(state.latest).filter(artifact => ['blocked', 'failed', 'not-reproduced', 'pending'].includes(artifact.status)).map(artifact => `${artifact.file}: ${artifact.status}`).join('; ') || 'unmet task prerequisites'}. Correct the prerequisite and resume the native stage or rerun with this task_dir.`);
      }
      const contextBoundary = contextBoundaryAdmission(taskInputs);
      if (contextBoundary) return finish('blocked', `Context policy stopped before stage dispatch: ${contextBoundary.reason}. Atomic has no documented live child context monitor; resume with a managed transport that exposes one or leave context_policy=off.`);

      if (decision.choice === 'children') {
        const children = await ctx.tool(`${steps}-read-epic-children`, { task_dir: task.taskDir }, async () => childrenFor(task));
        const wave = await ctx.tool(`${steps}-observe-child-wave`, { task_dir: task.taskDir, children }, async () => childWave(task, children));
        if (!wave.ready.length) return finish(wave.done.length === children.length ? 'completed' : 'blocked', wave.done.length === children.length ? 'All epic children are delivered and merged into the epic branch.' : `No dependency-ready children. Existing child runs: ${wave.started.join(', ') || 'none'}; waiting dependencies: ${wave.blocked.join(', ') || 'none'}. Finish and merge child pull requests, then run delivery with workflow=epic-wave and this task_dir.`);
        // Serial native child boundaries avoid shared-frontier races and keep
        // each child isolated in its own persistent branch/worktree.
        for (const slug of wave.ready) {
          const child = children.find(item => item.slug === slug);
          const childDir = await ctx.tool(`${steps}-open-child-${slug}`, { task_dir: task.taskDir, child }, async () => prepareChild(task, child), { timeoutMs: 90_000 });
          const result = await ctx.workflow(delivery, {
            stageName: `${steps}-child-${slug}`,
            inputs: { ...taskInputs, request: child.request, workflow: child.workflow, task_dir: childDir, skills_dir: task.skillsDir, branch: child.slug, base: task.branch, gates: 'none' },
          });
          launched.push(slug);
          await ctx.tool(`${steps}-record-child-${slug}`, { task_dir: task.taskDir, child: slug, result }, async () => { saveRecord(task, `child-${slug}`, result); return { saved: true }; });
          if (result.status !== 'completed' || result.exited || result.outputs?.status !== 'completed') return finish('blocked', `Child ${slug} did not complete; inspect its native child run before starting dependent work.`);
        }
        return finish('blocked', `Delivered child wave: ${launched.join(', ')}. Child PRs still require merge into ${task.branch}; use workflow=epic-wave afterward. Parent completion never substitutes for merged dependency evidence.`);
      }

      const skill = decision.choice;
      const feedback = forced?.feedback || '';
      forced = null;
      state = await runSkill(ctx, task, state, taskInputs, skill, ++steps, feedback);
      const gate = await artifactGate(ctx, task, taskInputs, state, SKILLS[skill], `stage-${steps}`);
      state = gate.state;
      if (gate.stopped) return finish('blocked', `Human stopped after ${skill}. Task artifacts and native stage are retained.`);
      if (gate.skill) forced = { skill: gate.skill, feedback: gate.feedback };
    }
    // Completion is still evaluated after the last allowed stage. Reaching the
    // bound can never turn unfinished implementation or a dirty review green.
    if (!forced && eligible(state, taskInputs, task.mode, adaptive).includes('complete')) return finish('completed', 'All required delivery evidence is complete.');
    const recovery = recoveryDiagnostic(state);
    if (recovery) return finish('blocked', `Implementation recovery remains unresolved. Receipt ${recovery.receipt.file} (${recovery.receipt.hash}); source ${recovery.source.file} (${recovery.source.hash}). Reason: ${recovery.reason}. Resume with iterate-plan or iterate-implementation, or stop as blocked.`);
    return finish('blocked', `Reached max_steps=${taskInputs.max_steps} with delivery work remaining. Inspect the last artifact before resuming with an explicit larger bound.`);
  },
});
export default delivery;
