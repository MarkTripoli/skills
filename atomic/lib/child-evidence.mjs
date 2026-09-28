import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


// GitHub's merged PR is the durable, reviewer-visible integration record when
// task directories are local-only. A moved branch or retargeted PR is not proof.
export function hostedChildPRs(cwd, parentBranch) {
  if (!parentBranch) throw new Error('Epic parent branch is required for hosted child proof');
  const output = execFileSync('gh', [
    'pr', 'list', '--state', 'merged', '--base', parentBranch,
    '--limit', '1000', '--json', 'number,headRefName,headRefOid,baseRefName,mergeCommit,mergedAt,url',
  ], { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  const rows = JSON.parse(output);
  if (!Array.isArray(rows)) throw new Error('Hosted child PR lookup returned invalid results');
  return rows;
}
export function hostedChildCompletion(cwd, child, parentBranch, git, expectedHead = null, rows = null) {
  const matches = (rows ?? hostedChildPRs(cwd, parentBranch))
    .filter(pr => pr.headRefName === child.slug && pr.baseRefName === parentBranch);
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error(`Ambiguous merged child PR for ${child.slug}`);
  const pr = matches[0];
  const merge = pr.mergeCommit?.oid;
  if (!Number.isSafeInteger(pr.number) || pr.number < 1 || !pr.mergedAt ||
      !/^[a-f0-9]{40}$/.test(pr.headRefOid ?? '') || !/^[a-f0-9]{40}$/.test(merge ?? '') ||
      (expectedHead && pr.headRefOid !== expectedHead) ||
      git(cwd, ['merge-base', '--is-ancestor', merge, 'HEAD'], true) === null) {
    throw new Error(`Merged child PR for ${child.slug} does not match its head or parent integration`);
  }
  const fork = git(cwd, ['merge-base', merge, pr.headRefOid], true);
  if (!fork) throw new Error(`Merged child PR for ${child.slug} has no common source history`);
  if (fork !== pr.headRefOid) {
    const taskRoot = path.relative(cwd, path.dirname(child.taskDir)).split(path.sep).join('/');
    const changed = git(cwd, ['diff', '--name-only', '-z', `${fork}..${pr.headRefOid}`], true, true)
      .split('\0').filter(file => file && !file.startsWith(`${taskRoot}/`));
    if (!changed.length || changed.some(file =>
      git(cwd, ['rev-parse', `${merge}:${file}`], true) !== git(cwd, ['rev-parse', `${pr.headRefOid}:${file}`], true))) {
      throw new Error(`Merged child PR for ${child.slug} has no matching source at its integration commit`);
    }
  }
  return pr;
}

export function hostedChildPublication(childCwd, childDir, number) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const paths = [
    path.resolve(here, '../shared/publication-proof.mjs'),
    path.resolve(here, '../../shared/publication-proof.mjs'),
  ];
  const script = paths.find(file => fs.existsSync(file));
  if (!script) throw new Error('Installed publication proof helper is unavailable');
  const result = spawnSync(process.execPath, [script, childDir, childCwd, String(number)], {
    cwd: childCwd, encoding: 'utf8', timeout: 45_000, maxBuffer: 8 * 1024 * 1024,
  });
  let decision;
  try { decision = JSON.parse(result.stdout); } catch { /* fail closed below */ }
  if (result.status !== 0 || decision?.status !== 'pass' || decision.ready !== true) {
    throw new Error('Hosted child PR lacks current review, capture, comment or body proof');
  }
  return decision;
}
