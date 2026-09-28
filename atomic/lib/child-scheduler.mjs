import fs from 'node:fs';
import path from 'node:path';
import { observeArtifacts } from './artifacts.mjs';
import { hostedChildCompletion, hostedChildPRs, hostedChildPublication } from './child-evidence.mjs';
import { gated } from './controller.mjs';
import { git, revision } from './workspace.mjs';

const normalizePath = value => String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();

function pathsConflict(left, right) {
  if (!left.length || !right.length) return true;
  return left.some(a => right.some(b => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

export function childBatches(ready, children, limit = 1) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Child concurrency limit must be a positive integer');
  const bySlug = new Map(children.map(child => [child.slug, child]));
  const remaining = [...ready];
  const batches = [];

  while (remaining.length) {
    const batch = [];
    for (let i = 0; i < remaining.length && batch.length < limit;) {
      const slug = remaining[i];
      const child = bySlug.get(slug);
      if (!child) throw new Error(`Unknown ready child ${slug}`);
      const paths = Array.isArray(child.write_paths) ? child.write_paths.map(normalizePath).filter(Boolean) : [];
      const conflicts = batch.some(otherSlug => {
        const other = bySlug.get(otherSlug);
        const depends = child.depends_on?.includes(otherSlug) || other.depends_on?.includes(slug);
        const otherPaths = Array.isArray(other.write_paths) ? other.write_paths.map(normalizePath).filter(Boolean) : [];
        return depends || pathsConflict(paths, otherPaths);
      });
      if (conflicts) { i++; continue; }
      batch.push(slug);
      remaining.splice(i, 1);
    }
    if (!batch.length) batch.push(remaining.shift());
    batches.push(batch);
  }

  return batches;
}

// A native child result is a checkpoint, not evidence that its branch was merged.
// The parent retains one record per child run and rechecks it on every epic-wave
// continuation against the current child worktree and the parent's committed tree.
export function childCompletionSnapshot(state, task, gates) {
  return {
    head: git(task.cwd, ['rev-parse', 'HEAD']),
    revision: state.revision,
    generation: state.generation,
    gates,
    artifacts: Object.fromEntries(Object.entries(state.latest).map(([type, artifact]) => [
      type, { path: path.relative(task.taskDir, artifact.file).split(path.sep).join('/'), hash: artifact.hash },
    ])),
    proofs: state.proofs,
    approvals: state.approvals,
    hosted: state.hosted?.ready ? { pullRequest: state.hosted.pullRequest, head: state.hosted.head, tested: state.hosted.tested } : null,
  };
}

export function latestChildRecord(task, slug) {
  const root = path.join(task.taskDir, '.atomic-delivery');
  if (!fs.existsSync(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(root, entry.name, `child-${slug}.json`))
    .filter(file => fs.existsSync(file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files.length ? JSON.parse(fs.readFileSync(files[0], 'utf8')) : null;
}


function inspectChild(task, child, record, hostedRows) {
  const reasons = [];
  const result = record?.result;
  const output = result?.outputs;
  if (record?.error || result?.exited || result?.status !== 'completed' || output?.status !== 'completed') {
    reasons.push(record?.error ? `native child run failed: ${record.error}` : 'native child run did not complete');
  }
  const proof = output?.completion;
  if (!proof || !record?.childDir) {
    reasons.push('missing native completion and artifact/approval proof');
    return reasons;
  }
  if (!['none', 'all', 'plan', 'pr'].includes(proof.gates) || !proof.head || !proof.revision || !proof.artifacts || Array.isArray(proof.artifacts)) {
    return [...reasons, 'native completion proof is malformed'];
  }
  const childDir = path.resolve(record.childDir);
  const childCwd = git(childDir, ['rev-parse', '--show-toplevel'], true);
  if (!childCwd || git(childDir, ['branch', '--show-current'], true) !== child.slug) {
    return [...reasons, 'owned child worktree or branch is unavailable'];
  }
  const branchHead = git(childCwd, ['rev-parse', 'HEAD']);
  const ancestors = (older, newer) => Boolean(older && newer && git(childCwd, ['merge-base', '--is-ancestor', older, newer], true) !== null);
  if (!ancestors(proof.head, branchHead)) reasons.push('child branch no longer contains the completed run');

  let observation;
  try { observation = observeArtifacts(childDir); }
  catch (error) { return [...reasons, `current child artifacts are invalid: ${error.message}`]; }
  if (revision(childCwd, task.taskRootRelative) !== proof.revision) reasons.push('child code revision differs from completed run');
  const artifacts = proof.artifacts || {};
  if (Object.keys(artifacts).length !== Object.keys(observation.latest).length) reasons.push('current artifact set differs from completed run');
  for (const [type, saved] of Object.entries(artifacts)) {
    const current = observation.latest[type];
    const relative = current && path.relative(childDir, current.file).split(path.sep).join('/');
    if (!current || !saved || current.hash !== saved.hash || relative !== saved.path) reasons.push(`${type} artifact is stale or missing`);
    if (gated(type, proof.gates) && proof.approvals?.[type] !== saved.hash) reasons.push(`${type} approval is missing or stale`);
  }
  if (!proof.hosted || proof.hosted.head !== proof.head || !proof.hosted.tested ||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(proof.hosted.pullRequest ?? '')) {
    reasons.push('native completion lacks current hosted PR proof');
  }
  for (const type of ['verification', 'app-test']) {
    if (!artifacts[type]) continue;
    const current = proof.proofs?.[type];
    if (!current || current.hash !== artifacts[type].hash || current.revision !== proof.revision || current.generation !== proof.generation) reasons.push(`${type} completion proof is missing or stale`);
  }
  if (!/^[a-f0-9]{40,64}$/.test(record.baseHead ?? '')) {
    reasons.push('native child record lacks its fork revision');
    return reasons;
  }
  if (git(childCwd, ['merge-base', '--is-ancestor', record.baseHead, branchHead], true) === null ||
      git(task.cwd, ['merge-base', '--is-ancestor', record.baseHead, 'HEAD'], true) === null) {
    reasons.push('child fork is not an ancestor of its branch and parent');
    return reasons;
  }
  const pr = hostedChildCompletion(task.cwd, child, task.branch, git, branchHead, hostedRows());
  if (!pr) reasons.push('child has no merged PR with hosted completion proof');
  else {
    try {
      const published = hostedChildPublication(childCwd, childDir, pr.number);
      if (proof.hosted?.pullRequest !== pr.url || proof.hosted?.tested !== published.tested ||
          proof.hosted?.head !== published.head) reasons.push('native child completion differs from merged hosted PR proof');
    } catch (error) { reasons.push(error.message); }
  }
  return reasons;
}

export function joinChildren(task, children, records) {
  let hosted = null;
  const hostedRows = () => hosted ??= hostedChildPRs(task.cwd, task.branch);
  const outcomes = children.map(child => {
    let reasons;
    try {
      const record = records?.get(child.slug) ?? latestChildRecord(task, child.slug);
      reasons = inspectChild(task, child, record, hostedRows);
    } catch (error) { reasons = [`child evidence inspection failed: ${error.message}`]; }
    return { slug: child.slug, complete: reasons.length === 0, reasons };
  });
  return { complete: outcomes.every(outcome => outcome.complete), children: outcomes };
}

export function childJoinSummary(join) {
  return join.children.map(({ slug, complete, reasons }) => `${slug}: ${complete
    ? join.complete ? 'native completion, current proof, and merge verified' : 'proof and merge verified; whole wave held'
    : reasons.join('; ')}`).join(' | ');
}
