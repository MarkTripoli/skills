import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, section } from './artifacts.mjs';
import { parseArtifactText, validateArtifactIndex } from './artifact-index.mjs';

function committed(cwd, relative, git) {
  return git(cwd, ['show', `HEAD:${relative}`], true, true);
}

function committedBlob(cwd, relative, git, label) {
  const entry = git(cwd, ['ls-tree', 'HEAD', '--', relative], true);
  if (entry === null || entry === '') return null;
  const tab = entry.indexOf('\t');
  const [mode, type] = entry.slice(0, tab).split(' ');
  if (!['100644', '100755'].includes(mode) || type !== 'blob') throw new Error(`${label} is not a committed regular file`);
  return committed(cwd, relative, git);
}

export function committedChildCompletion(cwd, child, git) {
  const childRelative = path.relative(cwd, child.taskDir).split(path.sep).join('/');
  if (!childRelative || childRelative === '..' || childRelative.startsWith('../')) {
    throw new Error(`Child task ${child.slug} is outside its repository`);
  }
  const indexText = committedBlob(cwd, `${childRelative}/index.json`, git, `Committed child index for ${child.slug}`);
  if (indexText === null) {
    const legacy = committed(cwd, `${childRelative}/pr-description.md`, git);
    return Boolean(legacy && section(legacy, 'Purpose') && section(legacy, 'Change outline'));
  }

  let value;
  try { value = JSON.parse(indexText); }
  catch (error) { throw new Error(`Committed child index for ${child.slug} is invalid JSON`, { cause: error }); }
  const index = validateArtifactIndex(value, child.slug);
  for (const series of Object.values(index.artifactSeries)) for (const record of series.iterations) {
    const relative = `${childRelative}/${record.path}`;
    const artifact = committedBlob(cwd, relative, git, `Committed indexed artifact ${record.id}`);
    if (artifact === null) throw new Error(`Committed indexed artifact ${record.id} is missing ${record.path}`);
    if (digest(artifact) !== record.sha256) throw new Error(`Committed indexed artifact ${record.id} has a SHA-256 digest mismatch`);
    const metadata = parseArtifactText(artifact, record.type, `Committed indexed artifact ${record.id}`);
    if (metadata.type !== record.type || metadata.status !== record.status || metadata.summary !== record.summary) throw new Error(`Committed indexed artifact ${record.id} has mismatched type, status, or summary`);
  }
  const series = index.artifactSeries['pull-request.description'];
  if (!series) return false;
  const record = series.iterations.find(iteration => iteration.id === series.current);
  if (!record || record.type !== 'pr-description') throw new Error(`Committed indexed PR evidence for ${child.slug} has an invalid current record`);
  const artifact = committedBlob(cwd, `${childRelative}/${record.path}`, git, `Committed indexed PR evidence for ${child.slug}`);
  if (!section(artifact, 'Purpose') || !section(artifact, 'Change outline')) throw new Error(`Committed indexed PR evidence for ${child.slug} is incomplete`);
  return true;
}

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
}
