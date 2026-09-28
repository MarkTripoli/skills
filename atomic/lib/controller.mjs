import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';
import { digest, observeArtifacts, planProgress, requireFresh, readArtifact, section } from './artifacts.mjs';
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
  const receipts = state.artifactSeries
    ? Object.values(state.artifactSeries).flatMap(series => series.iterations)
    : Object.keys(state.hashes || {}).filter(file => path.dirname(file) === task.taskDir && /^\d{2,}-[a-z0-9-]+\.md$/.test(path.basename(file))).map(file => readArtifact(file));
  for (const artifact of [source, ...receipts.filter(item => ['implementation', 'fix'].includes(item.type)), state.latest.implementation, state.latest.fix]) {
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
function repositoryChecks(cwd) {
  const checks = new Map();
  const add = command => checks.set(command, true);
  const exists = name => fs.existsSync(path.join(cwd, name));
  if (exists('package.json')) {
    const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const manager = exists('pnpm-lock.yaml') ? 'pnpm' : exists('yarn.lock') ? 'yarn'
      : exists('bun.lock') || exists('bun.lockb') ? 'bun' : 'npm';
    for (const name of ['test', 'lint', 'typecheck', 'build', 'check']) {
      if (Object.hasOwn(manifest.scripts || {}, name)) add(`${manager} ${name === 'test' ? name : `run ${name}`}`);
    }
  }
  if (exists('Makefile')) {
    const makefile = fs.readFileSync(path.join(cwd, 'Makefile'), 'utf8');
    for (const name of ['test', 'lint', 'check']) if (new RegExp(`^${name}:`, 'm').test(makefile)) add(`make ${name}`);
  }
  if (exists('go.mod')) { add('go test ./...'); add('go vet ./...'); }
  if (exists('Cargo.toml')) add('cargo test');
  const python = ['pyproject.toml', 'setup.cfg', 'tox.ini'].filter(exists)
    .map(name => fs.readFileSync(path.join(cwd, name), 'utf8')).join('\n');
  if (/\[(?:tool\.pytest(?:\.ini_options)?|tool:pytest|pytest)\]|\bpytest\b/.test(python)) add('pytest');
  if (/\[tool\.ruff(?:\.[^\]]+)?\]|^\s*ruff(?:\s|$)/m.test(python)) add('ruff check .');
  if (/\[(?:tool\.mypy|mypy)\]|^\s*mypy(?:\s|$)/m.test(python)) add('mypy .');
  if (exists('Package.swift')) add('swift test');
  if (exists('build.gradle') || exists('build.gradle.kts')) add('./gradlew test');
  const workflows = path.join(cwd, '.github', 'workflows');
  const addWorkflow = (name, command) => {
    if (/\$\{?[\w]|[;&|`]/.test(command)) throw new Error(`Cannot safely replay dynamic or chained CI check in ${name}: ${command}`);
    add(command);
  };
  if (fs.existsSync(workflows)) for (const name of fs.readdirSync(workflows)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const document = parseDocument(fs.readFileSync(path.join(workflows, name), 'utf8'), { uniqueKeys: true });
    if (document.errors.length) throw new Error(`Invalid CI workflow ${name}: ${document.errors[0].message}`);
    const jobs = document.toJS()?.jobs || {};
    for (const job of Object.values(jobs)) for (const step of job.steps || []) {
      if (typeof step.run !== 'string') continue;
      const commandLines = step.run.split('\n').map(line => line.trim());
      for (const line of commandLines) {
        if (!line || line.startsWith('#')) continue;
        if (/\bgovulncheck\b/.test(line) && !/\bgo install\b/.test(line)) {
          const version = commandLines.join('\n').match(/\bgo install golang\.org\/x\/vuln\/cmd\/govulncheck@([A-Za-z0-9.+-]+)/)?.[1];
          const directory = line.match(/\(\s*cd\s+([^\s;)]+)\s*&&/)?.[1];
          if (!version || !directory) throw new Error(`Cannot resolve CI vulnerability check in ${name}: ${line}`);
          addWorkflow(name, `go -C ${directory} run golang.org/x/vuln/cmd/govulncheck@${version} ./...`);
        } else if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint|typecheck|build|check)\b/.test(line)) addWorkflow(name, line);
        else if (/^(?:go (?:test|vet)|cargo (?:test|clippy)|pytest|python3? -m pytest|uv run (?:(?:--[\w-]+(?:=[^\s]+)?\s+)*)(?:pytest|python3? -m pytest|ruff|mypy)|ruff|mypy|make (?:test|lint|check)|swift test|\.\/gradlew test)\b/.test(line)) addWorkflow(name, line);
        else {
          const script = line.match(/^(?:node|python3?|bun)\s+(?!-[ecp]\b)([^\s"'$|;&]+\.(?:m?js|cjs|py))\b/);
          if (script && !/(?:deploy|release|publish|migrat|push)/i.test(script[1])) addWorkflow(name, line);
          else if (/^uv run\b/.test(line)) throw new Error(`Cannot resolve CI check in ${name}: ${line}`);
        }
      }
    }
  }
  return checks;
}
function requireAcceptanceEvidence(task, state, artifact) {
  if (artifact.type !== 'verification' || artifact.status !== 'passed') return [];
  const promises = acceptanceItems(task, state);
  const rows = verificationRows(artifact);
  const acceptance = rows.filter(row => /^A/i.test(row.id));
  const checks = rows.filter(row => /^C/i.test(row.id));
  const normalized = value => value.toLowerCase().replace(/[`*_\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (checks.some(row => !/^C[1-9]\d*$/i.test(row.id) || row.verdict.toLowerCase() !== 'pass') ||
      new Set(checks.map(row => row.id.toUpperCase())).size !== checks.length) {
    throw new Error(`${artifact.file}: passed verification has a missing or nonpassing repository check C-row`);
  }
  const recorded = checks.map(row => row['decided by'].match(/^`([^`\n]+)`$/)?.[1]).filter(Boolean);
  const missing = [...repositoryChecks(task.cwd).keys()].filter(required => !recorded.includes(required));
  if (missing.length) throw new Error(`${artifact.file}: passed verification omitted repository checks: ${missing.join(', ')}`);
  const ids = new Set(acceptance.map(row => row.id.toUpperCase()));
  if (acceptance.length < promises.length ||
      acceptance.some(row => !/^A[1-9]\d*$/i.test(row.id) || !row.item.trim() || row.verdict.toLowerCase() !== 'pass') ||
      ids.size !== acceptance.length ||
      acceptance.some((_, index) => !ids.has(`A${index + 1}`)) ||
      promises.some((promise, index) => {
        const row = acceptance.find(candidate => candidate.id.toUpperCase() === `A${index + 1}`);
        return !row || !normalized(row.item).includes(normalized(promise));
      })) {
    throw new Error(`${artifact.file}: passed verification lacks a matching passed A-row for every upstream acceptance item`);
  }
  return [...checks, ...acceptance];
}
function replayableVerificationCommand(command, id) {
  if (/^\s*(?:true|false|:|echo|printf)(?:\s|$)/.test(command) ||
      /^\s*(?:node|bun|python3?|ruby|perl)\s+(?:-[ecp]\b|--eval\b)/.test(command)) {
    throw new Error(`${id} acceptance command only manufactures a result; it does not exercise product behavior`);
  }
  if (/[;&|`$<>\r\n]/.test(command) ||
      /^\s*(?:sh|bash|zsh|\/bin\/(?:sh|bash|zsh))\s+-c\b/.test(command) ||
      /\b(?:curl|http|wget)\b/.test(command) &&
      (/\b(?:POST|PUT|PATCH|DELETE)\b/i.test(command) ||
        /(?:^|\s)(?:-[dFT]|--form(?:-string)?|--upload-file|--json|--data(?:-raw|-binary|-urlencode)?|--post-data|--post-file)(?:\S|\s|$)/i.test(command)) ||
      /^\s*(?:git\s+(?:push|reset|clean)|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:migrate|deploy|publish)\b|rm\b|mv\b)/.test(command)) {
    throw new Error(`${id} acceptance command cannot be safely replayed; use an isolated idempotent test instead`);
  }
}
function executeVerification(task, state, artifact, rows, step) {
  const beforeHead = git(task.cwd, ['rev-parse', 'HEAD']);
  const evidence = [];
  for (const row of rows) {
    const command = row['decided by'].match(/^`([^`\n]+)`$/)?.[1];
    if (!command) throw new Error(`${artifact.file}: ${row.id} has no executable command; an artifact assertion is not proof`);
    replayableVerificationCommand(command, row.id);
    const run = spawnSync('/bin/sh', ['-c', command], {
      cwd: task.cwd, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const actualLines = `${run.stdout || ''}\n${run.stderr || ''}`.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const output = actualLines.join(' ');
    const exit = row.observed.match(/\b(?:exit(?:ed)?(?:\s+code)?|status)\s*[:=]?\s*(\d{1,3})\b/i);
    const quoted = exit ? row.observed.slice(exit.index + exit[0].length)
      .replace(/^[\s:;,.—-]*(?:(?:stdout|output)\s*[:=]\s*)?/i, '')
      .replace(/^[`"']|[`"']$/g, '').trim() : '';
    if (row.id.toUpperCase().startsWith('A')) {
      if (!quoted && !/^\s*(?:test\s|[\[]\s)/.test(command)) {
        throw new Error(`${artifact.file}: ${row.id} has no decisive output or executable boolean predicate`);
      }
      const tokens = [...(row.item || '').matchAll(/(?<!\d)\d+(?:\.\d+)?(?!\d)/g)].map(match => match[0]);
      const claimed = `${command} ${quoted} ${/\b(?:exit(?:s|ed)?|status)\b/i.test(row.item || '') ? `exit ${exit?.[1] || ''}` : ''}`;
      if (tokens.some(token => !new RegExp(`(?<![\\d.])${token.replace('.', '\\.')}(?![\\d.])`).test(claimed))) {
        throw new Error(`${artifact.file}: ${row.id} command and observed result omit an acceptance input or outcome`);
      }
    }
    if (run.error || !exit || run.status !== Number(exit[1]) ||
      (row.id.toUpperCase().startsWith('C') && run.status !== 0) ||
      (quoted && !actualLines.includes(quoted))) {
      throw new Error(`${artifact.file}: ${row.id} claimed pass is not corroborated by execution (${run.error?.message || `exit ${run.status}`}; ${output.slice(0, 300)})`);
    }
    const current = revision(task.cwd, task.taskRootRelative);
    if (current !== state.revision || git(task.cwd, ['rev-parse', 'HEAD']) !== beforeHead) {
      throw new Error(`${artifact.file}: ${row.id} changed the exact source revision while checking it`);
    }
    evidence.push({ id: row.id, command, exit: run.status, observed: quoted, output_sha256: digest(output), output, head: beforeHead, revision: current });
  }
  saveRecord(task, `${String(step).padStart(3, '0')}-verification-execution`, { artifact: artifact.file, hash: artifact.hash, head: beforeHead, revision: state.revision, evidence });
  return evidence;
}
function changedSourcePaths(task, head) {
  const taskText = fs.readFileSync(path.join(task.taskDir, 'task.md'), 'utf8');
  const base = taskText.match(/^base:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1];
  const refs = [base, 'origin/HEAD', 'origin/main', 'main', 'origin/master', 'master'].filter(Boolean);
  const ancestor = refs.map(ref => git(task.cwd, ['merge-base', head, ref], true)).find(Boolean);
  const names = new Set([
    ...(ancestor ? git(task.cwd, ['diff', '--name-only', '-z', ancestor, head, '--', '.']).split('\0') : []),
    ...git(task.cwd, ['diff', '--name-only', '-z', head, '--', '.']).split('\0'),
    ...git(task.cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.']).split('\0'),
  ]);
  const taskRoot = task.taskRootRelative || '.agents/tasks';
  return new Set([...names].filter(name => name && name !== taskRoot && !name.startsWith(`${taskRoot}/`) &&
    name !== '.atomic' && !name.startsWith('.atomic/')));
}
function changedSourceLines(task, head, changed) {
  const taskText = fs.readFileSync(path.join(task.taskDir, 'task.md'), 'utf8');
  const base = taskText.match(/^base:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1];
  const ancestor = [base, 'origin/HEAD', 'origin/main', 'main', 'origin/master', 'master']
    .filter(Boolean).map(ref => git(task.cwd, ['merge-base', head, ref], true)).find(Boolean);
  const untracked = new Set(git(task.cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.']).split('\0'));
  const lines = new Map();
  for (const file of changed) {
    if (untracked.has(file)) {
      lines.set(file, [[1, fs.readFileSync(path.join(task.cwd, file), 'utf8').split('\n').length]]);
      continue;
    }
    const deleted = !fs.existsSync(path.join(task.cwd, file));
    const diffs = [
      ...(ancestor ? [git(task.cwd, ['diff', '--unified=0', ancestor, head, '--', file])] : []),
      git(task.cwd, ['diff', '--unified=0', head, '--', file]),
    ];
    lines.set(file, diffs.flatMap(diff => [...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)]
      .map(([, oldStart, oldLength, newStart, newLength]) => {
        const start = Number(deleted ? oldStart : newStart);
        const length = Number(deleted ? oldLength ?? 1 : newLength ?? 1);
        return [Math.max(1, start), Math.max(1, start + length - 1)];
      })));
  }
  return lines;
}
async function requireIndependentReview(ctx, task, state, artifact, step, stageSession, acceptance, sourceHead, model, verified) {
  const head = git(task.cwd, ['rev-parse', 'HEAD']);
  if (artifact.metadata.head_sha !== sourceHead || git(task.cwd, ['merge-base', sourceHead, head]) !== sourceHead) {
    throw new Error(`${artifact.file}: clean review is not pinned to exact source HEAD ${sourceHead}`);
  }
  const risks = ['functional correctness', 'security and data integrity', 'acceptance oracle and test reachability'];
  const changed = changedSourcePaths(task, sourceHead);
  const changedLines = changedSourceLines(task, sourceHead, changed);
  let execution = verified ? state.proofs.verification?.executionEvidence || [] : [];
  const name = `${String(step).padStart(3, '0')}-independent-review`;
  const prompt = [
    `Independently review the changed implementation in ${task.cwd} against task ${path.join(task.taskDir, 'task.md')}. Do not edit files or publish anything.`,
    `Pin reviewed source HEAD ${sourceHead} (current HEAD ${head} may include only the task artifact commit) and source revision ${state.revision}; inspect changed source paths ${JSON.stringify([...changed])}, actual controller-run acceptance commands and outputs ${JSON.stringify(execution)}, task and authoritative artifacts. For deleted paths cite the old-side deleted line number from the base diff; deletion-only work still needs a consequential review. Review acceptance items ${JSON.stringify(acceptance)} and risks ${JSON.stringify(risks)}.`,
    `Return only a JSON object {"head":string,"revision":string,"acceptance":[{"item":string,"evidence":string}],"risks":[{"risk":string,"evidence":string}],"findings":[{"location":string,"problem":string}]}. Every acceptance item must be examined against actual changed implementation lines and an independently meaningful direct observation or reachable test assertion. A green but unrelated test is a finding, never acceptance proof. Cite a changed path:line plus a test assertion path:line where tests provide the oracle; include the controller-executed command and decisive output when verification ran. For opted-out verification, independently inspect acceptance behavior without pretending an absent oracle ran. Cover every risk with inspected changed path:line and concrete behavior. Report consequential findings; incomplete inspection cannot claim coverage.`,
    `When verification is opted out, each acceptance entry MUST also include {"command":"an idempotent direct product probe","observed":"exit N; decisive output"}; the controller reruns the command and rejects claims without an observed result. Cite that command and its decisive output in evidence. No verification artifact is invented.`,
  ].join('\n\n');
  const result = await ctx.task(name, { prompt, context: 'fresh', cwd: task.cwd, model, maxOutput: { bytes: 16_384, lines: 160 } });
  let report;
  try { report = JSON.parse(result.text); }
  catch { throw new Error(`${artifact.file}: independent reviewer did not return a completed structured report`); }
  if (!verified && stageSession && result.sessionId && result.sessionId !== stageSession &&
      report?.head === sourceHead && report.revision === state.revision &&
      Array.isArray(report.acceptance) && report.acceptance.length === acceptance.length &&
      report.acceptance.every(covered => typeof covered.command === 'string' && typeof covered.observed === 'string')) {
    const probes = acceptance.map((item, index) => {
      const covered = report.acceptance.find(entry => entry.item === item);
      return { id: `A${index + 1}`, item, 'decided by': `\`${covered?.command || ''}\``, observed: covered?.observed || '' };
    });
    execution = executeVerification(task, state, artifact, probes, `${step}-review`);
  }
  const inspected = evidence => {
    if (typeof evidence !== 'string' || evidence.length < 40) return false;
    const citations = [...evidence.matchAll(/(?:^|\s)([^\s:]+):([1-9]\d*)\b/g)];
    return citations.some(([, file, line]) => changedLines.get(file)?.some(([start, end]) => Number(line) >= start && Number(line) <= end)) &&
      /\b(?:observed|printed|returned|passed|failed|asserted|invoked|executed|confirmed|produces?|rejects?|preserves?|inspected)\b/i.test(evidence);
  };
  const complete = stageSession && result.sessionId && result.sessionId !== stageSession && report && !Array.isArray(report) &&
    report.head === sourceHead && report.revision === state.revision && changed.size > 0 &&
    Array.isArray(report.acceptance) && report.acceptance.length === acceptance.length &&
    acceptance.every((item, index) => report.acceptance.some(covered => {
      const oracle = execution.find(row => row.id.toUpperCase() === `A${index + 1}`);
      return covered.item === item && inspected(covered.evidence) && oracle &&
        covered.evidence.includes(oracle.command) &&
        covered.evidence.includes(oracle.observed || `exit ${oracle.exit}`);
    })) &&
    Array.isArray(report.risks) && report.risks.length === risks.length &&
    risks.every(risk => report.risks.some(item => item.risk === risk && inspected(item.evidence))) &&
    Array.isArray(report.findings);
  if (!complete || git(task.cwd, ['rev-parse', 'HEAD']) !== head || revision(task.cwd, task.taskRootRelative) !== state.revision) {
    throw new Error(`${artifact.file}: independent reviewer proof is missing, scope-incomplete, or not bound to exact HEAD`);
  }
  saveRecord(task, `${name}-proof`, { artifact: artifact.file, hash: artifact.hash, reviewed_head: sourceHead, head, revision: state.revision, changed: [...changed], session: result.sessionId, execution, report });
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
    const executionEvidence = skill === 'verify-implementation' && artifact.status === 'passed'
      ? executeVerification(task, state, artifact, executionRows, step) : [];
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
    const next = { ...state, ...after, revision: codeRevision, generation, proofs: { ...state.proofs, [artifact.type]: { hash: artifact.hash, revision: codeRevision, generation, session: result.sessionId || name, ...(executionEvidence.length ? { executionEvidence } : {}) } } };
    if (recovery) next.recovery = recovery;
    if (recovery) saveRecord(task, `${name}-recovery`, recovery);
    saveRecord(task, name, { skill, artifact: artifact.file, hash: artifact.hash, revision: codeRevision, generation, session: result.sessionId ?? null, session_file: result.sessionFile ?? null, model: result.model ?? selection.model, selected_model: selection.model, model_selection: selection, modelAttempts: result.modelAttempts ?? null, model_attempts: result.modelAttempts ?? null, result: result.text, ...(recovery ? { recovery } : {}) });
    return next;
  });
  if (skill === 'review-code' && observed.latest['code-review']?.status === 'clean') {
    await requireIndependentReview(ctx, task, state, observed.latest['code-review'], step, result.sessionId, acceptanceItems(task, state), sourceHead, selection.model, Boolean(inputs.verify));
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
